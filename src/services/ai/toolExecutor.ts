/**
 * AI Tool Executor — JSON-level workflow manipulation
 *
 * All modifying operations work on WorkflowDef JSON (pure functions).
 * The result is a "proposed" def stored in aiStore for user review.
 * Actual application to the canvas uses setWorkflow(proposedDef).
 */

import useWorkflowStore from '../../store/workflowStore';
import useLibraryStore from '../../store/libraryStore';
import { validateWorkflow } from '../../utils/validator';
import type { WorkflowDef, TaskDef } from '../../types/conductor';
import type { WorkflowLibraryItem, WorkflowLevel } from '../../types/workflowLibrary';

// ─── Patch operation types ───────────────────────────────────────────────────

export type PatchOp =
    | { op: 'add_task'; task: TaskDef; afterRef?: string }
    | { op: 'update_task'; ref: string; changes: Partial<TaskDef> }
    | { op: 'remove_task'; ref: string }
    | { op: 'update_props'; props: Partial<WorkflowDef> }
    | { op: 'add_switch_branch'; ref: string; caseName: string }
    | { op: 'add_fork_branch'; ref: string };

export interface DiffSummary {
    added: string[];
    modified: string[];
    removed: string[];
    propsChanged: boolean;
    reordered?: boolean;
}

export interface PartialAcceptSelection {
    added: Set<string>;
    modified: Set<string>;
    removed: Set<string>;
    propsChanged: boolean;
    reordered: boolean;
}

export interface ToolCallResult {
    type: 'propose' | 'info' | 'error';
    /** For 'propose': the new WorkflowDef to show in ReviewBar */
    proposed?: WorkflowDef;
    /** For 'propose': human-readable change summary */
    diff?: DiffSummary;
    /** For 'propose': inferred level based on sub-workflow references (L1/L2/L3) */
    inferredLevel?: WorkflowLevel;
    /** For 'info'/'error': text to append to chat */
    text?: string;
}

// ─── Recursive task search/transform ────────────────────────────────────────

/**
 * Recursively transforms tasks matching the predicate.
 * Returning null from the transform removes the task.
 * Searches top-level tasks AND nested forkTasks/decisionCases/defaultCase/loopOver.
 */
function transformTasksRecursively(
    tasks: TaskDef[],
    predicate: (t: TaskDef) => boolean,
    transform: (t: TaskDef) => TaskDef | null,
): TaskDef[] {
    const result: TaskDef[] = [];
    for (const t of tasks) {
        if (predicate(t)) {
            const transformed = transform(t);
            if (transformed !== null) result.push(transformed);
        } else {
            let updated: TaskDef = t;
            if (t.forkTasks && Array.isArray(t.forkTasks)) {
                updated = {
                    ...updated,
                    forkTasks: (t.forkTasks as TaskDef[][]).map(branch =>
                        transformTasksRecursively(branch, predicate, transform)
                    ),
                };
            }
            if (t.decisionCases && typeof t.decisionCases === 'object') {
                const newCases: Record<string, TaskDef[]> = {};
                for (const [k, v] of Object.entries(t.decisionCases as Record<string, TaskDef[]>)) {
                    newCases[k] = transformTasksRecursively(v, predicate, transform);
                }
                updated = { ...updated, decisionCases: newCases };
            }
            if (t.defaultCase && Array.isArray(t.defaultCase)) {
                updated = {
                    ...updated,
                    defaultCase: transformTasksRecursively(t.defaultCase as TaskDef[], predicate, transform),
                };
            }
            if (t.loopOver && Array.isArray(t.loopOver)) {
                updated = {
                    ...updated,
                    loopOver: transformTasksRecursively(t.loopOver as TaskDef[], predicate, transform),
                };
            }
            result.push(updated);
        }
    }
    return result;
}

// ─── Pure JSON patch function ────────────────────────────────────────────────

export function applyPatch(def: WorkflowDef, ops: PatchOp[]): WorkflowDef {
    let result: WorkflowDef = { ...def, tasks: [...(def.tasks ?? [])] };

    for (const op of ops) {
        switch (op.op) {
            case 'add_task': {
                const task = op.task;
                if (op.afterRef) {
                    const idx = result.tasks.findIndex(t => t.taskReferenceName === op.afterRef);
                    if (idx >= 0) {
                        result.tasks = [
                            ...result.tasks.slice(0, idx + 1),
                            task,
                            ...result.tasks.slice(idx + 1),
                        ];
                    } else {
                        result.tasks = [...result.tasks, task];
                    }
                } else {
                    result.tasks = [...result.tasks, task];
                }
                break;
            }

            case 'update_task':
                result.tasks = transformTasksRecursively(
                    result.tasks,
                    t => t.taskReferenceName === op.ref,
                    t => ({ ...t, ...op.changes }),
                );
                break;

            case 'remove_task':
                result.tasks = transformTasksRecursively(
                    result.tasks,
                    t => t.taskReferenceName === op.ref,
                    () => null,
                );
                break;

            case 'update_props': {
                const { tasks: _tasks, ...propsOnly } = op.props as any;
                result = { ...result, ...propsOnly };
                break;
            }

            case 'add_switch_branch': {
                result.tasks = result.tasks.map(t => {
                    if (t.taskReferenceName !== op.ref) return t;
                    if (op.caseName === 'default') {
                        // Guard: don't overwrite existing defaultCase
                        if (t.defaultCase) return t;
                        return { ...t, defaultCase: [] };
                    }
                    const decisionCases = { ...(t.decisionCases ?? {}) };
                    // Guard: don't overwrite existing branch
                    if (decisionCases[op.caseName]) return t;
                    decisionCases[op.caseName] = [];
                    return { ...t, decisionCases };
                });
                break;
            }

            case 'add_fork_branch': {
                result.tasks = result.tasks.map(t => {
                    if (t.taskReferenceName !== op.ref) return t;
                    const forkTasks = (t.forkTasks ?? []) as TaskDef[][];
                    // Use branch count as suffix — deterministic, no timestamp collision
                    const newBranchRef = `${op.ref}_branch_${forkTasks.length + 1}`;
                    return { ...t, forkTasks: [...forkTasks, [{ name: newBranchRef, taskReferenceName: newBranchRef, type: 'SIMPLE' }]] };
                });
                break;
            }
        }
    }

    return result;
}

// ─── Diff computation ────────────────────────────────────────────────────────

export function computeDiff(before: WorkflowDef | null, after: WorkflowDef): DiffSummary {
    const afterTasks = after.tasks ?? [];
    if (!before) {
        return {
            added: afterTasks.map(t => t.taskReferenceName),
            modified: [],
            removed: [],
            propsChanged: false,
        };
    }

    const beforeMap = new Map((before.tasks ?? []).map(t => [t.taskReferenceName, t]));
    const afterMap = new Map(afterTasks.map(t => [t.taskReferenceName, t]));

    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];

    for (const [ref, task] of afterMap) {
        if (!beforeMap.has(ref)) {
            added.push(ref);
        } else if (JSON.stringify(task) !== JSON.stringify(beforeMap.get(ref))) {
            modified.push(ref);
        }
    }

    for (const ref of beforeMap.keys()) {
        if (!afterMap.has(ref)) removed.push(ref);
    }

    const propsChanged =
        before.name !== after.name ||
        before.description !== after.description ||
        before.timeoutSeconds !== after.timeoutSeconds ||
        before.version !== after.version ||
        before.ownerEmail !== after.ownerEmail ||
        before.failureWorkflow !== after.failureWorkflow ||
        JSON.stringify(before.inputParameters) !== JSON.stringify(after.inputParameters) ||
        JSON.stringify(before.outputParameters) !== JSON.stringify(after.outputParameters);

    // Detect task reordering: compare the relative order of shared tasks
    const beforeOrder = (before.tasks ?? [])
        .filter(t => afterMap.has(t.taskReferenceName))
        .map(t => t.taskReferenceName);
    const afterOrder = afterTasks
        .filter(t => beforeMap.has(t.taskReferenceName))
        .map(t => t.taskReferenceName);
    const reordered = beforeOrder.join(',') !== afterOrder.join(',');

    return { added, modified, removed, propsChanged, reordered };
}

// ─── Library level compliance check ─────────────────────────────────────────

/**
 * Checks SUB_WORKFLOW references in proposed def against the library.
 * Returns:
 * - inferredLevel: the inferred level of the proposed workflow (based on highest sub-workflow level + 1)
 * - violations: any upward-call rule violations
 */
function checkLevelCompliance(proposed: WorkflowDef): {
    inferredLevel: WorkflowLevel | null;
    violations: string[];
} {
    const library = useLibraryStore.getState().items;
    if (library.length === 0) return { inferredLevel: null, violations: [] };

    const libraryMap = new Map(library.map(w => [w.workflowName, w]));
    const subWorkflowTasks = (proposed.tasks ?? []).filter(t => t.type === 'SUB_WORKFLOW');

    if (subWorkflowTasks.length === 0) return { inferredLevel: 'L1', violations: [] };

    const referencedLevels: WorkflowLevel[] = [];
    subWorkflowTasks.forEach(t => {
        const name = (t as any).subWorkflowParam?.name ?? (t as any).workflowName;
        if (!name) return;
        const ref = libraryMap.get(name);
        if (ref) referencedLevels.push(ref.workflowLevel);
    });

    if (referencedLevels.length === 0) return { inferredLevel: null, violations: [] };

    const levelRank: Record<WorkflowLevel, number> = { L1: 1, L2: 2, L3: 3 };
    const maxReferenced = referencedLevels.reduce(
        (max, lvl) => levelRank[lvl] > levelRank[max] ? lvl : max,
        'L1' as WorkflowLevel,
    );

    // Inferred level is one step above highest referenced (or same if L3)
    const inferredLevel: WorkflowLevel =
        maxReferenced === 'L3' ? 'L3' :
        maxReferenced === 'L2' ? 'L3' : 'L2';

    return { inferredLevel, violations: [] };
}

// ─── Main executor ───────────────────────────────────────────────────────────

export function executeToolCall(
    toolName: string,
    args: Record<string, any>,
): ToolCallResult {
    const state = useWorkflowStore.getState();
    const currentDef = state.workflowDef;

    switch (toolName) {
        case 'replace_workflow': {
            const proposed = args.workflow as WorkflowDef;
            if (!proposed?.name) {
                return { type: 'error', text: '工作流定义缺少 name 字段' };
            }
            if (!Array.isArray(proposed.tasks)) {
                return { type: 'error', text: '工作流定义缺少 tasks 数组，请提供包含 tasks 字段的完整工作流定义' };
            }
            const diff = computeDiff(currentDef, proposed);
            const { inferredLevel } = checkLevelCompliance(proposed);
            return { type: 'propose', proposed, diff, inferredLevel: inferredLevel ?? undefined };
        }

        case 'patch_workflow': {
            const ops = args.ops as PatchOp[];
            if (!ops?.length) {
                return { type: 'error', text: '操作列表为空' };
            }
            if (!currentDef) {
                return { type: 'error', text: '当前没有加载工作流，请先创建或加载一个工作流' };
            }
            const proposed = applyPatch(currentDef, ops);
            const diff = computeDiff(currentDef, proposed);
            const { inferredLevel } = checkLevelCompliance(proposed);
            return { type: 'propose', proposed, diff, inferredLevel: inferredLevel ?? undefined };
        }

        case 'get_workflow_state': {
            if (!currentDef) {
                return { type: 'info', text: '当前没有加载任何工作流，画布为空。' };
            }
            if (args.includeFull) {
                return {
                    type: 'info',
                    text: `工作流「${currentDef.name}」完整定义：\n\`\`\`json\n${JSON.stringify(currentDef, null, 2)}\n\`\`\``,
                };
            }
            // Return per-task detail (inputParameters, timeoutSeconds, retryCount, etc.)
            // Don't repeat the basic task list — that's already in the system prompt context.
            const taskDetails = currentDef.tasks.map(t => {
                const detail: string[] = [`**${t.taskReferenceName}** (${t.type})`];
                if (t.timeoutSeconds) detail.push(`超时: ${t.timeoutSeconds}s`);
                if (t.retryCount !== undefined) detail.push(`重试: ${t.retryCount}`);
                if (t.inputParameters && Object.keys(t.inputParameters).length > 0) {
                    detail.push(`inputParameters: ${JSON.stringify(t.inputParameters)}`);
                }
                if (t.type === 'HTTP' && t.httpRequest) {
                    detail.push(`HTTP: ${t.httpRequest.method} ${t.httpRequest.uri}`);
                }
                if (t.type === 'SWITCH') {
                    detail.push(`caseValueParam: ${t.caseValueParam || t.caseExpression}`);
                    detail.push(`分支: ${Object.keys(t.decisionCases ?? {}).join(', ')}`);
                }
                return detail.join(' | ');
            });
            const validationSummary = state.validationResults.errors.length > 0
                ? `\n\n校验错误：${state.validationResults.errors.map(e => e.message).join('；')}`
                : '';
            return {
                type: 'info',
                text: `工作流「${currentDef.name}」各任务详情：\n${taskDetails.join('\n')}${validationSummary}`,
            };
        }

        case 'validate_workflow': {
            if (!currentDef) {
                return { type: 'info', text: '当前没有加载工作流，无法校验。' };
            }
            const results = validateWorkflow(currentDef);
            if (results.isValid && results.warnings.length === 0) {
                return { type: 'info', text: '✅ 工作流校验通过，没有错误或警告。' };
            }
            const lines: string[] = [];
            results.errors.forEach(e => lines.push(`❌ ${e.message}`));
            results.warnings.forEach(w => lines.push(`⚠️ ${w.message}`));
            return { type: 'info', text: `校验结果：\n${lines.join('\n')}` };
        }

        case 'search_workflow_library': {
            const library = useLibraryStore.getState().items;
            if (library.length === 0) {
                return { type: 'info', text: '当前没有配置工作流库，无法搜索。' };
            }
            const query = (args.query as string || '').toLowerCase();
            const levelFilter = args.level as WorkflowLevel | undefined;

            const matched = library.filter(item => {
                if (levelFilter && item.workflowLevel !== levelFilter) return false;
                return (
                    item.workflowName.toLowerCase().includes(query) ||
                    (item.description ?? '').toLowerCase().includes(query) ||
                    (item.tags ?? []).some(t => t.toLowerCase().includes(query))
                );
            });

            if (matched.length === 0) {
                return { type: 'info', text: `未找到与「${args.query}」相关的子工作流。` };
            }

            const byLevel: Record<string, WorkflowLibraryItem[]> = { L3: [], L2: [], L1: [] };
            matched.forEach(item => byLevel[item.workflowLevel].push(item));

            const lines: string[] = [`找到 ${matched.length} 个相关工作流：`];
            (['L3', 'L2', 'L1'] as WorkflowLevel[]).forEach(lvl => {
                if (byLevel[lvl].length === 0) return;
                lines.push(`\n**${lvl}**`);
                byLevel[lvl].forEach(item => {
                    lines.push(`- \`${item.workflowName}\` (v${item.version}): ${item.description ?? ''} [${(item.tags ?? []).join(', ')}]`);
                });
            });

            return { type: 'info', text: lines.join('\n') };
        }

        default:
            return { type: 'error', text: `未知工具: ${toolName}` };
    }
}

// ─── Partial proposal apply ──────────────────────────────────────────────────

/**
 * Applies only the user-selected subset of changes from a proposal.
 * Used when the user accepts some changes but rejects others in ReviewBar.
 */
export function applyPartialProposal(
    currentDef: WorkflowDef,
    proposedDef: WorkflowDef,
    diff: DiffSummary,
    selection: PartialAcceptSelection,
): WorkflowDef {
    const currentTaskMap = new Map<string, TaskDef>(
        (currentDef.tasks ?? []).map(t => [t.taskReferenceName, t])
    );

    const addedSet = new Set(diff.added);
    const modifiedSet = new Set(diff.modified);

    // Walk proposedDef task order as basis (handles reordering naturally)
    const newTasks: TaskDef[] = [];

    for (const proposedTask of (proposedDef.tasks ?? [])) {
        const ref = proposedTask.taskReferenceName;
        if (addedSet.has(ref)) {
            if (selection.added.has(ref)) newTasks.push(proposedTask);
            // else: skip — don't add
        } else if (modifiedSet.has(ref)) {
            // Use proposed if selected, current otherwise.
            // currentTaskMap may not have the ref if the user manually deleted the task
            // after the proposal was computed — fall back to proposedTask to avoid undefined.
            const cur = currentTaskMap.get(ref);
            newTasks.push(selection.modified.has(ref) ? proposedTask : (cur ?? proposedTask));
        } else {
            // Unchanged: keep current version
            const cur = currentTaskMap.get(ref);
            if (cur) newTasks.push(cur);
        }
    }

    // Re-insert removed tasks that the user chose NOT to remove at their original positions.
    // Appending at the end breaks Conductor's execution order; use the original index to
    // find the correct splice point.
    const origOrder = new Map((currentDef.tasks ?? []).map((t, i) => [t.taskReferenceName, i]));
    for (const ref of diff.removed) {
        if (!selection.removed.has(ref)) {
            const cur = currentTaskMap.get(ref);
            if (!cur) continue;
            const origIdx = origOrder.get(ref) ?? 0;
            // Insert after the rightmost task in newTasks whose original index < origIdx
            let insertAt = 0;
            for (let i = 0; i < newTasks.length; i++) {
                const taskOrigIdx = origOrder.get(newTasks[i].taskReferenceName);
                if (taskOrigIdx !== undefined && taskOrigIdx <= origIdx) {
                    insertAt = i + 1;
                }
            }
            newTasks.splice(insertAt, 0, cur);
        }
    }

    // If reorder not selected but diff has reorder, restore original task order for existing tasks
    if (!selection.reordered && diff.reordered) {
        const currentRefs = new Set((currentDef.tasks ?? []).map(t => t.taskReferenceName));
        const existing = newTasks.filter(t => currentRefs.has(t.taskReferenceName));
        const brandNew = newTasks.filter(t => !currentRefs.has(t.taskReferenceName));
        const origOrder = new Map((currentDef.tasks ?? []).map((t, i) => [t.taskReferenceName, i]));
        existing.sort((a, b) => (origOrder.get(a.taskReferenceName) ?? 999) - (origOrder.get(b.taskReferenceName) ?? 999));
        newTasks.length = 0;
        newTasks.push(...existing, ...brandNew);
    }

    // Merge workflow-level props if propsChanged is selected
    let merged: WorkflowDef = { ...currentDef, tasks: newTasks };
    if (selection.propsChanged && diff.propsChanged) {
        const propKeys: Array<keyof WorkflowDef> = [
            'name', 'description', 'timeoutSeconds', 'version',
            'ownerEmail', 'failureWorkflow', 'inputParameters', 'outputParameters',
        ];
        const propChanges: Partial<WorkflowDef> = {};
        for (const k of propKeys) {
            if (JSON.stringify(proposedDef[k]) !== JSON.stringify(currentDef[k])) {
                (propChanges as any)[k] = (proposedDef as any)[k];
            }
        }
        merged = { ...merged, ...propChanges };
    }

    return merged;
}

// ─── Describe diff for chat display ─────────────────────────────────────────

export function describeDiff(diff: DiffSummary): string {
    const parts: string[] = [];
    if (diff.added.length > 0) parts.push(`新增 ${diff.added.length} 个任务（${diff.added.join(', ')}）`);
    if (diff.modified.length > 0) parts.push(`修改 ${diff.modified.length} 个任务（${diff.modified.join(', ')}）`);
    if (diff.removed.length > 0) parts.push(`删除 ${diff.removed.length} 个任务（${diff.removed.join(', ')}）`);
    if (diff.reordered) parts.push('调整了任务顺序');
    if (diff.propsChanged) parts.push('修改了工作流属性');
    return parts.length > 0 ? parts.join('，') : '无实质性变更';
}
