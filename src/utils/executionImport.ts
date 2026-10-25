import type { ExecutionStatus, TaskExecutionData } from '../types/workflow';
import type { TaskInstance } from '../types/conductor';

/**
 * Pure helpers behind `importExecutionJSON` and the run view (R3, R5, R9).
 *
 * Conductor names tasks inside a DO_WHILE `<ref>__<iteration>` and gives each retry a new task with a higher
 * `retryCount`. Iterations and retries are different things: an iteration is a new pass through the loop, a retry is
 * another attempt at the same pass.
 */

type DefTask = {
    type?: string;
    taskReferenceName?: string;
    decisionCases?: Record<string, DefTask[]>;
    defaultCase?: DefTask[];
    forkTasks?: DefTask[][];
    loopOver?: DefTask[];
};

const ITER_SUFFIX = /^(.+)__(\d+)$/;

/** Split `step__3` into `{ baseRef: 'step', iteration: 3 }` when `step` is a task of the definition. */
export function splitIterationRef(ref: string, knownRefs: Record<string, unknown>): { baseRef: string; iteration?: number } {
    if (knownRefs[ref]) return { baseRef: ref };
    const m = ref.match(ITER_SUFFIX);
    if (m && knownRefs[m[1]]) return { baseRef: m[1], iteration: parseInt(m[2], 10) };
    return { baseRef: ref };
}

function attemptOrder(a: TaskInstance, b: TaskInstance): number {
    return (a.iteration ?? 0) - (b.iteration ?? 0)
        || (a.retryCount ?? 0) - (b.retryCount ?? 0)
        || (a.seq ?? 0) - (b.seq ?? 0)
        || (a.startTime ?? 0) - (b.startTime ?? 0);
}

/** Number of retries across all attempts: per iteration, the highest retryCount (or extra attempts when absent). */
export function countRetries(attempts: TaskInstance[] | undefined): number {
    if (!attempts || attempts.length === 0) return 0;
    const byIter = new Map<number, TaskInstance[]>();
    for (const a of attempts) {
        const k = a.iteration ?? 0;
        const list = byIter.get(k);
        if (list) list.push(a); else byIter.set(k, [a]);
    }
    let total = 0;
    for (const list of byIter.values()) {
        const maxRetry = list.reduce((m, a) => Math.max(m, a.retryCount ?? 0), 0);
        total += Math.max(maxRetry, list.length - 1);
    }
    return total;
}

/** Number of distinct loop iterations in the attempts (0 when the task is not in a loop). */
export function countIterations(attempts: TaskInstance[] | undefined): number {
    if (!attempts) return 0;
    const iters = new Set(attempts.map(a => a.iteration).filter((i): i is number => typeof i === 'number' && i > 0));
    return iters.size;
}

/** The last attempt (highest retry) of the given iteration, or undefined. */
export function pickAttemptForIteration(attempts: TaskInstance[], iteration: number): TaskInstance | undefined {
    const inIter = attempts.filter(a => a.iteration === iteration);
    if (inIter.length === 0) return undefined;
    return [...inIter].sort(attemptOrder)[inIter.length - 1];
}

/**
 * Innermost DO_WHILE that contains `ref` (at any depth inside its loopOver, including branches), or null.
 */
export function findEnclosingLoopRef(tasks: DefTask[] | undefined, ref: string): string | null {
    const walk = (list: DefTask[] | undefined, loop: string | null): string | null | undefined => {
        if (!Array.isArray(list)) return undefined;
        for (const t of list) {
            if (!t) continue;
            if (t.taskReferenceName === ref) return loop;
            const nested: Array<[DefTask[] | undefined, string | null]> = [];
            if (t.decisionCases) Object.values(t.decisionCases).forEach(b => nested.push([b, loop]));
            if (t.defaultCase) nested.push([t.defaultCase, loop]);
            if (Array.isArray(t.forkTasks)) t.forkTasks.forEach(b => nested.push([b, loop]));
            if (Array.isArray(t.loopOver)) nested.push([t.loopOver, t.taskReferenceName ?? loop]);
            for (const [branch, l] of nested) {
                const found = walk(branch, l);
                if (found !== undefined) return found;
            }
        }
        return undefined;
    };
    return walk(tasks, null) ?? null;
}

/**
 * Execution view of one node with the loop iteration chosen for ITS enclosing loop only (R3).
 * Other loops' choices do not affect it; within the iteration the last attempt (latest retry) wins.
 */
export function selectExecutionForIteration(
    execution: TaskExecutionData,
    loopRef: string | null,
    activeLoopIterations: Record<string, number>,
): TaskExecutionData {
    if (!loopRef) return execution;
    const iter = activeLoopIterations[loopRef];
    if (!iter) return execution;
    const attempt = pickAttemptForIteration(execution.attempts, iter);
    if (!attempt) return execution;
    return {
        ...execution,
        status: attempt.status as ExecutionStatus,
        startTime: attempt.startTime,
        endTime: attempt.endTime,
        input: attempt.inputData,
        output: attempt.outputData,
        reasonForIncompletion: attempt.reasonForIncompletion,
        iteration: attempt.iteration ?? iter,
    };
}

/**
 * Runtime children of each dynamic fork (R9). Inside a loop the fork and join run as `fork__N` / `join__N`; each fork
 * occurrence is paired with the join of the same suffix. The base fork key holds the latest iteration's children;
 * `fork__N` keys hold each iteration's children.
 */
export function collectDynamicForkChildren(
    tasks: TaskInstance[],
    pairs: Array<{ forkRef: string; joinRef: string }>,
    knownRefs: Record<string, unknown>,
): Record<string, TaskInstance[]> {
    const out: Record<string, TaskInstance[]> = {};
    for (const { forkRef, joinRef } of pairs) {
        let latest: { iter: number; children: TaskInstance[] } | null = null;
        tasks.forEach((t, idx) => {
            const r = t?.referenceTaskName;
            if (!r) return;
            let suffix: string;
            if (r === forkRef) suffix = '';
            else if (r.startsWith(`${forkRef}__`) && /^\d+$/.test(r.slice(forkRef.length + 2))) suffix = r.slice(forkRef.length);
            else return;
            const joinName = `${joinRef}${suffix}`;
            let joinIdx = -1;
            for (let j = idx + 1; j < tasks.length; j++) {
                if (tasks[j]?.referenceTaskName === joinName) { joinIdx = j; break; }
            }
            if (joinIdx < 0) return;
            const seen = new Set<string>();
            const children = tasks.slice(idx + 1, joinIdx).filter(c => {
                const cr = c?.referenceTaskName;
                if (!cr || !c.taskId) return false;
                if (knownRefs[cr] || knownRefs[splitIterationRef(cr, knownRefs).baseRef]) return false;
                if (seen.has(cr)) return false;
                seen.add(cr);
                return true;
            });
            const iter = suffix ? parseInt(suffix.slice(2), 10) : (t.iteration ?? 0);
            if (suffix) out[`${forkRef}${suffix}`] = children;
            if (!latest || iter >= latest.iter) latest = { iter, children };
        });
        if (latest) out[forkRef] = (latest as { iter: number; children: TaskInstance[] }).children;
    }
    return out;
}

/**
 * Group runtime tasks by definition ref (R5): a `ref__N` record is registered once, under its base ref, as the
 * attempt for iteration N. Attempts are ordered by iteration, then retry; the node's status is its last attempt.
 */
export function buildExecutionData(tasks: TaskInstance[], knownRefs: Record<string, unknown>): Record<string, TaskExecutionData> {
    const executionData: Record<string, TaskExecutionData> = {};
    for (const task of tasks) {
        const ref = task?.referenceTaskName;
        if (!ref) continue;
        const { baseRef, iteration } = splitIterationRef(ref, knownRefs);
        const attempt: TaskInstance = iteration !== undefined && task.iteration === undefined ? { ...task, iteration } : task;
        if (!executionData[baseRef]) {
            executionData[baseRef] = { taskReferenceName: baseRef, status: attempt.status as ExecutionStatus, attempts: [] };
        }
        executionData[baseRef].attempts.push(attempt);
    }
    for (const data of Object.values(executionData)) {
        data.attempts.sort(attemptOrder);
        const iterations = data.attempts.some(a => a.iteration !== undefined && a.iteration > 0);
        if (iterations) data.totalIterations = data.attempts.reduce((m, a) => Math.max(m, a.iteration ?? 0), 0);
        const first = data.attempts[0];
        const last = data.attempts[data.attempts.length - 1];
        data.startTime = first?.startTime;
        data.status = last.status as ExecutionStatus;
        data.endTime = last.endTime;
        data.output = last.outputData;
        data.input = last.inputData;
        data.reasonForIncompletion = last.reasonForIncompletion;
        data.iteration = last.iteration;
    }
    return executionData;
}
