import type { WorkflowDef, TaskDef } from '../types/conductor';

const SKIP_TYPES = new Set([
    'SET_VARIABLE', 'JSON_JQ_TRANSFORM', 'INLINE', 'LAMBDA', 'NOOP', 'KAFKA_PUBLISH',
]);

const sanitizeId = (ref: string): string =>
    ref.replace(/[^a-zA-Z0-9_]/g, '_');

const sanitizeLabel = (text: string): string => {
    const s = String(text || '').replace(/"/g, "'").replace(/[<>[\]{}]/g, '');
    return s.length > 32 ? s.slice(0, 30) + '…' : s;
};

function nodeShape(task: TaskDef): string {
    const id = sanitizeId(task.taskReferenceName);
    const lbl = sanitizeLabel(task.name || task.taskReferenceName);
    switch (task.type) {
        case 'SWITCH':
        case 'DECISION':
            return `${id}{"${lbl}"}`;
        case 'FORK_JOIN':
        case 'FORK_JOIN_DYNAMIC':
            return `${id}[/"${lbl}"/]`;
        case 'TERMINATE':
            return `${id}(("${lbl}"))`;
        case 'WAIT':
        case 'HUMAN':
            return `${id}["⏳ ${lbl}"]`;
        default:
            return `${id}["${lbl}"]`;
    }
}

interface ProcessResult {
    nodeDefs: string[];
    edges: string[];
    firstId: string | null;
    lastId: string | null;
}

function processTasks(
    tasks: TaskDef[],
    declared: Set<string>,
    skipRefs: Set<string>,
): ProcessResult {
    const nodeDefs: string[] = [];
    const edges: string[] = [];
    let firstId: string | null = null;
    let prevId: string | null = null;

    const declareNode = (task: TaskDef): string => {
        const id = sanitizeId(task.taskReferenceName);
        if (!declared.has(id)) {
            declared.add(id);
            nodeDefs.push(`  ${nodeShape(task)}`);
        }
        return id;
    };

    const link = (from: string, to: string, label?: string) => {
        edges.push(label
            ? `  ${from} -- "${label}" --> ${to}`
            : `  ${from} --> ${to}`);
    };

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (skipRefs.has(task.taskReferenceName)) continue;
        if (SKIP_TYPES.has(task.type)) continue;
        if (task.type === 'JOIN' || task.type === 'EXCLUSIVE_JOIN') continue;

        if (task.type === 'FORK_JOIN' || task.type === 'FORK_JOIN_DYNAMIC') {
            const forkId = declareNode(task);
            if (!firstId) firstId = forkId;
            if (prevId) link(prevId, forkId);

            const joinTask = tasks.slice(i + 1).find(t =>
                t.type === 'JOIN' || t.type === 'EXCLUSIVE_JOIN');
            let joinId: string;
            if (joinTask) {
                joinId = sanitizeId(joinTask.taskReferenceName);
                if (!declared.has(joinId)) {
                    declared.add(joinId);
                    nodeDefs.push(`  ${joinId}["${sanitizeLabel(joinTask.name || joinTask.taskReferenceName)}"]`);
                }
                skipRefs.add(joinTask.taskReferenceName);
            } else {
                joinId = `${forkId}_join`;
                if (!declared.has(joinId)) {
                    declared.add(joinId);
                    nodeDefs.push(`  ${joinId}["汇聚"]`);
                }
            }

            const forkBranches: TaskDef[][] = (task as any).forkTasks ?? [];
            if (forkBranches.length > 0) {
                for (const branch of forkBranches) {
                    const bizBranch = branch.filter(t => !SKIP_TYPES.has(t.type));
                    if (bizBranch.length === 0) {
                        link(forkId, joinId);
                    } else {
                        const sub = processTasks(bizBranch, declared, new Set());
                        nodeDefs.push(...sub.nodeDefs);
                        edges.push(...sub.edges);
                        if (sub.firstId) {
                            link(forkId, sub.firstId);
                            if (sub.lastId) link(sub.lastId, joinId);
                        } else {
                            link(forkId, joinId);
                        }
                    }
                }
            } else {
                link(forkId, joinId);
            }

            prevId = joinId;
            continue;
        }

        if (task.type === 'SWITCH' || task.type === 'DECISION') {
            const switchId = declareNode(task);
            if (!firstId) firstId = switchId;
            if (prevId) link(prevId, switchId);

            const mergeId = `${switchId}_merge`;
            if (!declared.has(mergeId)) {
                declared.add(mergeId);
                nodeDefs.push(`  ${mergeId}((  ))`);
            }

            const cases: Record<string, TaskDef[]> = (task as any).decisionCases ?? {};
            const defaultCase: TaskDef[] = (task as any).defaultCase ?? [];

            let hasBranches = false;
            for (const [caseName, caseTasks] of Object.entries(cases)) {
                hasBranches = true;
                const biz = caseTasks.filter(t => !SKIP_TYPES.has(t.type));
                if (biz.length === 0) {
                    link(switchId, mergeId, caseName);
                } else {
                    const sub = processTasks(biz, declared, new Set());
                    nodeDefs.push(...sub.nodeDefs);
                    edges.push(...sub.edges);
                    if (sub.firstId) {
                        link(switchId, sub.firstId, caseName);
                        if (sub.lastId) link(sub.lastId, mergeId);
                    } else {
                        link(switchId, mergeId, caseName);
                    }
                }
            }

            const bizDefault = defaultCase.filter(t => !SKIP_TYPES.has(t.type));
            if (bizDefault.length > 0) {
                hasBranches = true;
                const sub = processTasks(bizDefault, declared, new Set());
                nodeDefs.push(...sub.nodeDefs);
                edges.push(...sub.edges);
                if (sub.firstId) {
                    link(switchId, sub.firstId, '默认');
                    if (sub.lastId) link(sub.lastId, mergeId);
                } else {
                    link(switchId, mergeId, '默认');
                }
            } else if (!hasBranches) {
                link(switchId, mergeId);
            } else {
                link(switchId, mergeId, '默认');
            }

            prevId = mergeId;
            continue;
        }

        if (task.type === 'DO_WHILE') {
            const loopId = declareNode(task);
            if (!firstId) firstId = loopId;
            if (prevId) link(prevId, loopId);

            const loopBody: TaskDef[] = (task as any).loopOver ?? [];
            const bizBody = loopBody.filter(t => !SKIP_TYPES.has(t.type));
            if (bizBody.length > 0) {
                const sub = processTasks(bizBody, declared, new Set());
                nodeDefs.push(...sub.nodeDefs);
                edges.push(...sub.edges);
                if (sub.firstId) {
                    link(loopId, sub.firstId);
                    if (sub.lastId)
                        edges.push(`  ${sub.lastId} -- "循环" --> ${loopId}`);
                }
            }

            prevId = loopId;
            continue;
        }

        // Regular task
        const taskId = declareNode(task);
        if (!firstId) firstId = taskId;
        if (prevId) link(prevId, taskId);
        prevId = taskId;
    }

    return { nodeDefs, edges, firstId, lastId: prevId };
}

/**
 * Generate a Mermaid flowchart from a WorkflowDef.
 * Technical nodes (SET_VARIABLE, INLINE, etc.) are filtered out.
 * Node labels use the task `name` field; business language is preserved.
 */
export function workflowToMermaid(def: WorkflowDef): string {
    if (!def?.tasks?.length) {
        return 'flowchart TD\n  __start__([开始]) --> __end__([结束])';
    }

    const declared = new Set<string>(['__start__', '__end__']);
    const staticDefs = ['  __start__([开始])', '  __end__([结束])'];

    const { nodeDefs, edges, firstId, lastId } =
        processTasks(def.tasks, declared, new Set());

    const allEdges: string[] = [];
    if (firstId) allEdges.push(`  __start__ --> ${firstId}`);
    allEdges.push(...edges);
    if (lastId && lastId !== '__end__') allEdges.push(`  ${lastId} --> __end__`);
    if (!firstId) allEdges.push('  __start__ --> __end__');

    return ['flowchart TD', ...staticDefs, ...nodeDefs, ...allEdges].join('\n');
}
