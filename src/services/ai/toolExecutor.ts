/**
 * AI Tool Executor — JSON-level workflow manipulation
 *
 * All modifying operations work on WorkflowDef JSON (pure functions).
 * The result is a "proposed" def stored in aiStore for user review.
 * Actual application to the canvas uses setWorkflow(proposedDef).
 */

import useWorkflowStore from '../../store/workflowStore';
import { validateWorkflow } from '../../utils/validator';
import type { WorkflowDef, TaskDef } from '../../types/conductor';

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
}

export interface ToolCallResult {
    type: 'propose' | 'info' | 'error';
    /** For 'propose': the new WorkflowDef to show in ReviewBar */
    proposed?: WorkflowDef;
    /** For 'propose': human-readable change summary */
    diff?: DiffSummary;
    /** For 'info'/'error': text to append to chat */
    text?: string;
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
                result.tasks = result.tasks.map(t =>
                    t.taskReferenceName === op.ref ? { ...t, ...op.changes } : t
                );
                break;

            case 'remove_task':
                result.tasks = result.tasks.filter(t => t.taskReferenceName !== op.ref);
                break;

            case 'update_props': {
                const { tasks: _tasks, ...propsOnly } = op.props as any;
                result = { ...result, ...propsOnly };
                break;
            }

            case 'add_switch_branch': {
                result.tasks = result.tasks.map(t => {
                    if (t.taskReferenceName !== op.ref) return t;
                    const decisionCases = { ...(t.decisionCases ?? {}) };
                    if (op.caseName === 'default') {
                        return { ...t, defaultCase: [] };
                    }
                    decisionCases[op.caseName] = [];
                    return { ...t, decisionCases };
                });
                break;
            }

            case 'add_fork_branch': {
                result.tasks = result.tasks.map(t => {
                    if (t.taskReferenceName !== op.ref) return t;
                    const newBranchRef = `branch_${Date.now()}`;
                    const forkTasks = (t.forkTasks ?? []) as TaskDef[][];
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
    if (!before) {
        return {
            added: after.tasks.map(t => t.taskReferenceName),
            modified: [],
            removed: [],
            propsChanged: false,
        };
    }

    const beforeMap = new Map(before.tasks.map(t => [t.taskReferenceName, t]));
    const afterMap = new Map(after.tasks.map(t => [t.taskReferenceName, t]));

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
        before.timeoutSeconds !== after.timeoutSeconds;

    return { added, modified, removed, propsChanged };
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
            const diff = computeDiff(currentDef, proposed);
            return { type: 'propose', proposed, diff };
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
            return { type: 'propose', proposed, diff };
        }

        case 'get_workflow_state': {
            if (!currentDef) {
                return { type: 'info', text: '当前没有加载任何工作流，画布为空。' };
            }
            const tasks = currentDef.tasks.map(t => ({
                ref: t.taskReferenceName,
                name: t.name,
                type: t.type,
            }));
            const summary = {
                name: currentDef.name,
                description: currentDef.description,
                taskCount: currentDef.tasks.length,
                tasks,
                validation: state.validationResults,
            };
            if (args.includeFull) {
                (summary as any).fullDef = currentDef;
            }
            return {
                type: 'info',
                text: `当前工作流「${currentDef.name}」包含 ${currentDef.tasks.length} 个任务。\n\n` +
                    `任务列表：\n${tasks.map(t => `• ${t.ref} (${t.type}): ${t.name}`).join('\n')}`,
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

        default:
            return { type: 'error', text: `未知工具: ${toolName}` };
    }
}

// ─── Describe diff for chat display ─────────────────────────────────────────

export function describeDiff(diff: DiffSummary): string {
    const parts: string[] = [];
    if (diff.added.length > 0) parts.push(`新增 ${diff.added.length} 个任务（${diff.added.join(', ')}）`);
    if (diff.modified.length > 0) parts.push(`修改 ${diff.modified.length} 个任务（${diff.modified.join(', ')}）`);
    if (diff.removed.length > 0) parts.push(`删除 ${diff.removed.length} 个任务（${diff.removed.join(', ')}）`);
    if (diff.propsChanged) parts.push('修改了工作流属性');
    return parts.length > 0 ? parts.join('，') : '无实质性变更';
}
