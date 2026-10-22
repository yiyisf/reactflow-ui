/**
 * AI Tool Executor — JSON-level workflow manipulation
 *
 * All modifying operations work on WorkflowDef JSON (pure functions).
 * The result is a "proposed" def stored in aiStore for user review.
 * Actual application to the canvas uses setWorkflow(proposedDef).
 *
 * This module has no store dependencies — the caller (AgentRunner) reads live
 * workflowStore/libraryStore state and passes it in via `ToolExecutionContext`.
 * That keeps this file pure, unit-testable without a store, and reusable headless.
 */

import {
    applyBlueprint,
    applyTopologyScaffold,
    applyTaskConfigurations,
    verifyWorkflowSemantics,
    normalizeWorkflowDef,
    pinSubWorkflowVersions,
    collectAllTasksInOrder,
    type NormalizeOptions,
    type SynthesisPhase,
    type VerificationSummary,
} from './workflowSynthesizer';
import type { WorkflowDef, TaskDef } from '../../types/conductor';
import type { WorkflowLibraryItem, WorkflowLevel } from '../../types/workflowLibrary';
import type { ValidationResults } from '../../types/workflow';

// ─── Patch operation types ───────────────────────────────────────────────────

export type PatchOp =
    | { op: 'add_task'; task: TaskDef; afterRef?: string; parentRef?: string; branchName?: string }
    | { op: 'update_task'; ref: string; changes: Partial<TaskDef> }
    | { op: 'remove_task'; ref: string }
    | { op: 'update_props'; props: Partial<WorkflowDef> }
    | { op: 'add_switch_branch'; ref: string; caseName: string }
    | { op: 'add_fork_branch'; ref: string };

/** Human-readable field-level changes for one modified task (M2.2: proposal preview card). */
export interface TaskFieldChange {
    ref: string;
    changes: string[];
}

export interface DiffSummary {
    added: string[];
    modified: string[];
    removed: string[];
    propsChanged: boolean;
    reordered?: boolean;
    /** Field-level change descriptions for each modified task, e.g. "超时: 5 分钟 → 10 分钟" */
    modifiedDetails?: TaskFieldChange[];
}

export interface PartialAcceptSelection {
    added: Set<string>;
    modified: Set<string>;
    removed: Set<string>;
    propsChanged: boolean;
    reordered: boolean;
}

export interface ToolCallResult {
    type: 'propose' | 'stage' | 'info' | 'error';
    /** For 'propose': the new WorkflowDef to show in ReviewBar */
    proposed?: WorkflowDef;
    /** For 'propose': human-readable change summary */
    diff?: DiffSummary;
    /** For 'propose': inferred level based on sub-workflow references (L1/L2/L3) */
    inferredLevel?: WorkflowLevel;
    /** For 'propose' / 'stage': deep semantic verification report */
    verification?: VerificationSummary;
    /** For 'stage': updated working draft in the progressive synthesis pipeline */
    workingDraft?: WorkflowDef;
    /** For 'stage': current progressive synthesis phase */
    phase?: SynthesisPhase;
    /** For 'stage': human-readable timeline entry label */
    timelineLabel?: string;
    /** For 'info'/'error'/'stage': text to return as tool result to the model */
    text?: string;
}

/** Live state the caller (AgentRunner) gathers from workflowStore/libraryStore for each tool call. */
export interface ToolExecutionContext {
    workflowDef: WorkflowDef | null;
    /** In-progress draft accumulated across progressive synthesis stages within the current durable session */
    workingDraft?: WorkflowDef | null;
    validationResults: ValidationResults;
    libraryItems: WorkflowLibraryItem[];
    /**
     * 查询流程库中某个名称的当前最新版本（由调用方注入，本模块保持纯净、不读 store）。
     * 提供后，AI 新建的 SUB_WORKFLOW 缺少版本时固定为库当前版本；已有版本号一律不改。
     */
    resolveLatestVersion?: (name: string) => number | undefined;
    /**
     * 服务端检索命中（由调用方在调用前预取，通常来自 LibraryProvider.search）。
     * 提供时 search_workflow_library 直接展示这些结果，不再在 libraryItems 内本地匹配。
     */
    librarySearchResults?: WorkflowLibraryItem[];
}

/** 工作流库检索结果最多展示的条数（目录可能有上千项，避免一次塞满上下文） */
export const LIBRARY_SEARCH_RESULT_LIMIT = 50;

/** 汇总 SUB_WORKFLOW 固定版本所需的选项：画布上已存在的任务不会被自动补版本 */
function buildNormalizeOptions(ctx: ToolExecutionContext): NormalizeOptions {
    return {
        resolveLatestVersion: ctx.resolveLatestVersion,
        existingRefs: new Set(collectAllTasksInOrder(ctx.workflowDef?.tasks ?? []).map(t => t.taskReferenceName)),
    };
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

/**
 * Inserts `newTask` immediately after `afterRef` anywhere in the task tree (top-level or nested).
 * Returns `{ tasks, inserted }`.
 */
function insertTaskAfterRefRecursively(
    tasks: TaskDef[],
    afterRef: string,
    newTask: TaskDef,
): { tasks: TaskDef[]; inserted: boolean } {
    const idx = tasks.findIndex(t => t.taskReferenceName === afterRef);
    if (idx >= 0) {
        return {
            tasks: [...tasks.slice(0, idx + 1), newTask, ...tasks.slice(idx + 1)],
            inserted: true,
        };
    }

    let inserted = false;
    const nextTasks = tasks.map(t => {
        if (inserted) return t;
        let updated = t;

        if (t.decisionCases && typeof t.decisionCases === 'object') {
            const newCases: Record<string, TaskDef[]> = {};
            for (const [k, branch] of Object.entries(t.decisionCases)) {
                if (!inserted && Array.isArray(branch)) {
                    const res = insertTaskAfterRefRecursively(branch, afterRef, newTask);
                    newCases[k] = res.tasks;
                    if (res.inserted) inserted = true;
                } else {
                    newCases[k] = branch;
                }
            }
            if (inserted) updated = { ...updated, decisionCases: newCases };
        }

        if (!inserted && Array.isArray(t.defaultCase)) {
            const res = insertTaskAfterRefRecursively(t.defaultCase, afterRef, newTask);
            if (res.inserted) {
                inserted = true;
                updated = { ...updated, defaultCase: res.tasks };
            }
        }

        if (!inserted && Array.isArray(t.forkTasks)) {
            const newBranches = t.forkTasks.map(branch => {
                if (inserted || !Array.isArray(branch)) return branch;
                const res = insertTaskAfterRefRecursively(branch, afterRef, newTask);
                if (res.inserted) inserted = true;
                return res.tasks;
            });
            if (inserted) updated = { ...updated, forkTasks: newBranches };
        }

        if (!inserted && Array.isArray(t.loopOver)) {
            const res = insertTaskAfterRefRecursively(t.loopOver, afterRef, newTask);
            if (res.inserted) {
                inserted = true;
                updated = { ...updated, loopOver: res.tasks };
            }
        }

        return updated;
    });

    return { tasks: nextTasks, inserted };
}

// ─── Pure JSON patch function ────────────────────────────────────────────────

export function applyPatch(def: WorkflowDef, ops: PatchOp[]): WorkflowDef {
    let result: WorkflowDef = { ...def, tasks: [...(def.tasks ?? [])] };

    for (const op of ops) {
        switch (op.op) {
            case 'add_task': {
                const task = op.task;
                if (op.parentRef) {
                    result.tasks = transformTasksRecursively(
                        result.tasks,
                        t => t.taskReferenceName === op.parentRef,
                        parent => {
                            if (parent.type === 'SWITCH' || parent.type === 'DECISION') {
                                const branchKey = op.branchName || Object.keys(parent.decisionCases ?? {})[0] || 'default';
                                if (branchKey === 'default') {
                                    return { ...parent, defaultCase: [...(parent.defaultCase ?? []), task] };
                                }
                                const cases = { ...(parent.decisionCases ?? {}) };
                                cases[branchKey] = [...(cases[branchKey] ?? []), task];
                                return { ...parent, decisionCases: cases };
                            }
                            if (parent.type === 'FORK_JOIN') {
                                const forkTasks = [...(parent.forkTasks ?? [])];
                                const branchIdx = op.branchName !== undefined ? parseInt(op.branchName, 10) : 0;
                                const safeIdx = Number.isNaN(branchIdx) ? 0 : Math.max(0, branchIdx);
                                while (forkTasks.length <= safeIdx) forkTasks.push([]);
                                forkTasks[safeIdx] = [...forkTasks[safeIdx], task];
                                return { ...parent, forkTasks };
                            }
                            if (parent.type === 'DO_WHILE') {
                                return { ...parent, loopOver: [...(parent.loopOver ?? []), task] };
                            }
                            return parent;
                        },
                    );
                } else if (op.afterRef) {
                    const res = insertTaskAfterRefRecursively(result.tasks, op.afterRef, task);
                    result.tasks = res.inserted ? res.tasks : [...result.tasks, task];
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

/** Formats seconds as a friendly duration for change descriptions, e.g. 90 → "1 分 30 秒", 300 → "5 分钟". */
function formatDuration(seconds: number | undefined): string {
    if (!seconds) return '未设置';
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest > 0 ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}

/**
 * Describes what changed on a single task in business language, for the proposal
 * preview card (M2.2). Covers the fields users actually care about; anything else
 * that changed (nested params, decision branches, …) falls back to a generic note
 * so the list is never empty for a task `computeDiff` already flagged as modified.
 */
function describeTaskFieldChanges(before: TaskDef, after: TaskDef): string[] {
    const changes: string[] = [];

    if (before.name !== after.name) {
        changes.push(`名称：「${before.name}」→「${after.name}」`);
    }
    if (before.type !== after.type) {
        changes.push(`类型：${before.type} → ${after.type}`);
    }
    if (before.timeoutSeconds !== after.timeoutSeconds) {
        changes.push(`超时：${formatDuration(before.timeoutSeconds)} → ${formatDuration(after.timeoutSeconds)}`);
    }
    if ((before.retryCount ?? 0) !== (after.retryCount ?? 0)) {
        const b = before.retryCount ?? 0;
        const a = after.retryCount ?? 0;
        changes.push(a > b ? `新增失败重试（${a} 次）` : (a === 0 ? '移除了失败重试' : `重试次数：${b} → ${a}`));
    }
    if (JSON.stringify(before.inputParameters ?? {}) !== JSON.stringify(after.inputParameters ?? {})) {
        changes.push('输入参数已调整');
    }
    if (JSON.stringify((before as any).decisionCases) !== JSON.stringify((after as any).decisionCases)) {
        changes.push('分支条件已调整');
    }
    if (JSON.stringify((before as any).forkTasks) !== JSON.stringify((after as any).forkTasks)) {
        changes.push('并行分支已调整');
    }

    if (changes.length === 0) {
        // Something in the raw JSON differs but none of the tracked fields above caught it.
        changes.push('配置已调整');
    }
    return changes;
}

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
    const modifiedDetails: TaskFieldChange[] = [];

    for (const [ref, task] of afterMap) {
        if (!beforeMap.has(ref)) {
            added.push(ref);
        } else {
            const beforeTask = beforeMap.get(ref)!;
            if (JSON.stringify(task) !== JSON.stringify(beforeTask)) {
                modified.push(ref);
                modifiedDetails.push({ ref, changes: describeTaskFieldChanges(beforeTask, task) });
            }
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

    return { added, modified, removed, propsChanged, reordered, modifiedDetails };
}

// ─── Library level compliance check ─────────────────────────────────────────

/**
 * Checks SUB_WORKFLOW references in proposed def against the library.
 * Returns:
 * - inferredLevel: the inferred level of the proposed workflow (based on highest sub-workflow level + 1)
 * - violations: any upward-call rule violations
 */
function checkLevelCompliance(proposed: WorkflowDef, library: WorkflowLibraryItem[]): {
    inferredLevel: WorkflowLevel | null;
    violations: string[];
} {
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
    ctx: ToolExecutionContext,
): ToolCallResult {
    // Sentinel from protocolAdapter when SSE JSON was truncated (output token limit hit).
    if (args.__truncated__) {
        return { type: 'error', text: `工具调用参数被截断（输出超出 token 限制）。请将工作流拆分为更小的步骤，或先创建骨架工作流再通过 patch_workflow 逐步完善。` };
    }

    const currentDef = ctx.workflowDef;
    const activeDraft = ctx.workingDraft ?? currentDef;

    switch (toolName) {
        case 'init_workflow_blueprint': {
            if (!args.name) {
                return { type: 'error', text: 'init_workflow_blueprint 缺少必填的 name 字段' };
            }
            const nextDraft = applyBlueprint(activeDraft, {
                name: args.name,
                description: args.description,
                version: args.version,
                ownerEmail: args.ownerEmail,
                timeoutPolicy: args.timeoutPolicy,
                timeoutSeconds: args.timeoutSeconds,
                failureWorkflow: args.failureWorkflow,
                inputParameters: args.inputParameters,
                outputParameters: args.outputParameters,
            });
            const inputCount = nextDraft.inputParameters?.length ?? 0;
            const inputNote = inputCount > 0 ? `（含 ${inputCount} 项输入契约：${nextDraft.inputParameters!.join(', ')}）` : '';
            return {
                type: 'stage',
                phase: 'blueprint',
                workingDraft: nextDraft,
                timelineLabel: `阶段 1/4：已定义工作流「${nextDraft.name}」元信息${inputNote}`,
                text: `✅ 阶段 1 完成：工作流「${nextDraft.name}」蓝图已初始化${inputNote}。请继续调用 scaffold_workflow_topology 设计整体任务编排拓扑。`,
            };
        }

        case 'scaffold_workflow_topology': {
            if (!Array.isArray(args.tasks) || args.tasks.length === 0) {
                return { type: 'error', text: 'scaffold_workflow_topology 需要提供非空的 tasks 数组' };
            }
            const { workflow: nextDraft, autoFixed } = applyTopologyScaffold(activeDraft, {
                tasks: args.tasks as TaskDef[],
            });
            const allTasks = collectAllTasksInOrder(nextDraft.tasks);
            const refsList = allTasks.map(t => `${t.taskReferenceName}(${t.type})`).join(' → ');
            const autoFixNote = autoFixed.length > 0 ? `\n自动规范化：${autoFixed.join('；')}` : '';
            return {
                type: 'stage',
                phase: 'topology',
                workingDraft: nextDraft,
                timelineLabel: `阶段 2/4：已编排任务拓扑 · 共 ${allTasks.length} 个节点`,
                text: `✅ 阶段 2 完成：已编排 ${allTasks.length} 个任务节点（${refsList}）。${autoFixNote}\n请继续调用 configure_workflow_tasks 为各任务补充详细参数与上下游数据流引用。`,
            };
        }

        case 'configure_workflow_tasks': {
            if (!activeDraft || !activeDraft.tasks || activeDraft.tasks.length === 0) {
                return {
                    type: 'error',
                    text: '当前尚未构建工作流任务拓扑，请先调用 init_workflow_blueprint 和 scaffold_workflow_topology。',
                };
            }
            if (!Array.isArray(args.configurations) || args.configurations.length === 0) {
                return { type: 'error', text: 'configure_workflow_tasks 的 configurations 数组不能为空' };
            }
            const { workflow: nextDraft, configuredRefs, missingRefs, autoFixed } = applyTaskConfigurations(
                activeDraft,
                {
                    configurations: args.configurations,
                    outputParameters: args.outputParameters,
                    inputParameters: args.inputParameters,
                },
                buildNormalizeOptions(ctx),
            );
            const allTasks = collectAllTasksInOrder(nextDraft.tasks);
            const missingNote = missingRefs.length > 0
                ? `\n⚠️ 以下 ref 未在拓扑中找到，请检查拼写：${missingRefs.join(', ')}`
                : '';
            const autoFixNote = autoFixed.length > 0 ? `\n自动规范化：${autoFixed.join('；')}` : '';
            return {
                type: 'stage',
                phase: 'configure',
                workingDraft: nextDraft,
                timelineLabel: `阶段 3/4：已补充 ${configuredRefs.length}/${allTasks.length} 个任务配置与数据流`,
                text: `✅ 阶段 3 进展：已更新 ${configuredRefs.length} 个任务配置（${configuredRefs.join(', ')}）。${missingNote}${autoFixNote}\n若所有关键任务均已配置完毕，请调用 commit_workflow_proposal 执行整体校验并提交方案。`,
            };
        }

        case 'commit_workflow_proposal': {
            if (!activeDraft || !activeDraft.tasks || activeDraft.tasks.length === 0) {
                return {
                    type: 'error',
                    text: '当前没有可提交的工作流草稿，请先编排任务后再提交。',
                };
            }
            const { workflow: normalizedDraft, autoFixed } = normalizeWorkflowDef(activeDraft, buildNormalizeOptions(ctx));
            const verification = verifyWorkflowSemantics(normalizedDraft, autoFixed);
            const diff = computeDiff(currentDef, normalizedDraft);
            const { inferredLevel } = checkLevelCompliance(normalizedDraft, ctx.libraryItems);
            return {
                type: 'propose',
                proposed: normalizedDraft,
                diff,
                inferredLevel: inferredLevel ?? undefined,
                verification,
            };
        }

        case 'replace_workflow': {
            // Auto-fix: model sometimes passes WorkflowDef at the top level instead of under `workflow` key.
            let proposed = args.workflow as WorkflowDef;
            if (!proposed && args.name && Array.isArray(args.tasks)) {
                proposed = args as unknown as WorkflowDef;
            }
            if (!proposed) {
                return { type: 'error', text: '工具调用未包含 workflow 字段。请重新生成并确保参数结构为 { workflow: { name: "...", tasks: [...] } }' };
            }
            if (!proposed.name) {
                return { type: 'error', text: '工作流定义缺少 name 字段，请补充后重新调用' };
            }
            if (!Array.isArray(proposed.tasks)) {
                return { type: 'error', text: '工作流定义缺少 tasks 数组，请提供包含 tasks 字段的完整工作流定义' };
            }
            if (proposed.version === undefined) {
                proposed = { ...proposed, version: 1 };
            }
            const pinned = pinSubWorkflowVersions(proposed, buildNormalizeOptions(ctx));
            proposed = pinned.workflow;
            const diff = computeDiff(currentDef, proposed);
            const { inferredLevel } = checkLevelCompliance(proposed, ctx.libraryItems);
            const verification = verifyWorkflowSemantics(proposed, pinned.autoFixed);
            return { type: 'propose', proposed, diff, inferredLevel: inferredLevel ?? undefined, verification };
        }

        case 'patch_workflow': {
            const ops = args.ops as PatchOp[];
            if (!ops?.length) {
                return { type: 'error', text: '操作列表为空' };
            }
            const targetBase = activeDraft ?? currentDef;
            if (!targetBase) {
                return { type: 'error', text: '当前没有加载工作流，请先创建或加载一个工作流' };
            }
            const patched = applyPatch(targetBase, ops);
            const pinned = pinSubWorkflowVersions(patched, buildNormalizeOptions(ctx));
            const proposed = pinned.workflow;
            const diff = computeDiff(currentDef, proposed);
            const { inferredLevel } = checkLevelCompliance(proposed, ctx.libraryItems);
            const verification = verifyWorkflowSemantics(proposed, pinned.autoFixed);
            return { type: 'propose', proposed, diff, inferredLevel: inferredLevel ?? undefined, verification };
        }

        case 'get_workflow_state': {
            const targetDef = activeDraft ?? currentDef;
            if (!targetDef) {
                return { type: 'info', text: '当前没有加载任何工作流，画布为空。' };
            }
            if (args.includeFull) {
                return {
                    type: 'info',
                    text: `工作流「${targetDef.name}」完整定义：\n\`\`\`json\n${JSON.stringify(targetDef, null, 2)}\n\`\`\``,
                };
            }
            // Return per-task detail (inputParameters, timeoutSeconds, retryCount, etc.)
            // Don't repeat the basic task list — that's already in the system prompt context.
            const taskDetails = targetDef.tasks.map(t => {
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
            const validationSummary = ctx.validationResults.errors.length > 0
                ? `\n\n校验错误：${ctx.validationResults.errors.map(e => e.message).join('；')}`
                : '';
            return {
                type: 'info',
                text: `工作流「${targetDef.name}」各任务详情：\n${taskDetails.join('\n')}${validationSummary}`,
            };
        }

        case 'validate_workflow': {
            const targetDef = activeDraft ?? currentDef;
            if (!targetDef) {
                return { type: 'info', text: '当前没有加载工作流，无法校验。' };
            }
            const results = verifyWorkflowSemantics(targetDef);
            if (results.isValid && results.warnings.length === 0) {
                return {
                    type: 'info',
                    text: `✅ 工作流校验通过（共 ${results.totalTasks} 个任务，${results.configuredTasks} 个已配置参数，${results.dataFlowLinks} 处数据流引用），没有错误或警告。`,
                };
            }
            const lines: string[] = [];
            results.errors.forEach(e => lines.push(`❌ [${e.ref || 'GLOBAL'}] ${e.message}`));
            results.warnings.forEach(w => lines.push(`⚠️ [${w.ref || 'GLOBAL'}] ${w.message}`));
            return { type: 'info', text: `校验结果：\n${lines.join('\n')}` };
        }

        case 'search_workflow_library': {
            const library = ctx.libraryItems;
            const query = (args.query as string || '').toLowerCase();
            const levelFilter = args.level as WorkflowLevel | undefined;

            // 服务端检索命中（预取）优先；否则在本地目录内匹配
            const serverHits = ctx.librarySearchResults;
            if (!serverHits && library.length === 0) {
                return { type: 'info', text: '当前没有配置工作流库，无法搜索。' };
            }
            const matched = serverHits ?? library.filter(item => {
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

            const shown = matched.slice(0, LIBRARY_SEARCH_RESULT_LIMIT);
            const byLevel: Record<string, WorkflowLibraryItem[]> = { L3: [], L2: [], L1: [] };
            shown.forEach(item => byLevel[item.workflowLevel].push(item));

            const lines: string[] = [`找到 ${matched.length} 个相关工作流：`];
            (['L3', 'L2', 'L1'] as WorkflowLevel[]).forEach(lvl => {
                if (byLevel[lvl].length === 0) return;
                lines.push(`\n**${lvl}**`);
                byLevel[lvl].forEach(item => {
                    lines.push(`- \`${item.workflowName}\` (v${item.version}): ${item.description ?? ''} [${(item.tags ?? []).join(', ')}]`);
                });
            });
            if (matched.length > shown.length) {
                lines.push(`\n（仅显示前 ${shown.length} 个，请用更具体的关键词或指定层级缩小范围）`);
            }

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
