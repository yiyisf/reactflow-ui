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
    const subWorkflowTasks = proposed.tasks.filter(t => t.type === 'SUB_WORKFLOW');

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
                    item.description.toLowerCase().includes(query) ||
                    item.tags.some(t => t.toLowerCase().includes(query))
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
                    lines.push(`- \`${item.workflowName}\` (v${item.version}): ${item.description} [${item.tags.join(', ')}]`);
                });
            });

            return { type: 'info', text: lines.join('\n') };
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
