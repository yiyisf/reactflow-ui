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
    /**
     * load_library_workflow 用：调用方预取的流程库完整定义（通常来自 LibraryCatalog.getVersion）。
     * 只有摘要、取不到定义时为 null / undefined。
     */
    libraryWorkflowDef?: WorkflowDef | null;
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

function describePatchOp(op: PatchOp): string {
    switch (op.op) {
        case 'add_task': {
            const where = op.parentRef ? `parentRef=${op.parentRef}` : op.afterRef ? `afterRef=${op.afterRef}` : '';
            return `add_task(${op.task?.taskReferenceName ?? '?'}${where ? `, ${where}` : ''})`;
        }
        case 'update_task': return `update_task(${op.ref})`;
        case 'remove_task': return `remove_task(${op.ref})`;
        case 'add_switch_branch': return `add_switch_branch(${op.ref}, ${op.caseName})`;
        case 'add_fork_branch': return `add_fork_branch(${op.ref})`;
        default: return String((op as { op?: string }).op ?? 'unknown');
    }
}

export interface PatchReport {
    workflow: WorkflowDef;
    /** 没有生效的操作（目标 ref 不存在、父任务类型不支持等），每条附原因 */
    unmatched: string[];
}

/**
 * 应用 patch 操作并报告没有生效的操作。找不到目标时不再静默跳过或追加到末尾：
 * 调用方（patch_workflow）据此返回失败结果，让模型修正 ref 后重试。
 */
export function applyPatchWithReport(def: WorkflowDef, ops: PatchOp[]): PatchReport {
    let result: WorkflowDef = { ...def, tasks: [...(def.tasks ?? [])] };
    const unmatched: string[] = [];
    const miss = (op: PatchOp, reason: string) => unmatched.push(`${describePatchOp(op)}：${reason}`);

    for (const op of ops) {
        switch (op.op) {
            case 'add_task': {
                const task = op.task;
                if (!task || typeof task !== 'object') {
                    miss(op, '缺少 task 定义');
                    break;
                }
                if (op.parentRef) {
                    let found = false;
                    let supported = true;
                    result.tasks = transformTasksRecursively(
                        result.tasks,
                        t => t.taskReferenceName === op.parentRef,
                        parent => {
                            found = true;
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
                            supported = false;
                            return parent;
                        },
                    );
                    if (!found) miss(op, `找不到父任务 ${op.parentRef}`);
                    else if (!supported) miss(op, `父任务 ${op.parentRef} 不是 SWITCH / FORK_JOIN / DO_WHILE，不能放入子任务`);
                } else if (op.afterRef) {
                    const res = insertTaskAfterRefRecursively(result.tasks, op.afterRef, task);
                    if (res.inserted) result.tasks = res.tasks;
                    else miss(op, `找不到 afterRef 指向的任务 ${op.afterRef}`);
                } else {
                    result.tasks = [...result.tasks, task];
                }
                break;
            }

            case 'update_task': {
                let found = false;
                result.tasks = transformTasksRecursively(
                    result.tasks,
                    t => t.taskReferenceName === op.ref,
                    t => { found = true; return { ...t, ...op.changes }; },
                );
                if (!found) miss(op, `找不到任务 ${op.ref}`);
                break;
            }

            case 'remove_task': {
                let found = false;
                result.tasks = transformTasksRecursively(
                    result.tasks,
                    t => t.taskReferenceName === op.ref,
                    () => { found = true; return null; },
                );
                if (!found) miss(op, `找不到任务 ${op.ref}`);
                break;
            }

            case 'update_props': {
                const { tasks: _tasks, ...propsOnly } = (op.props ?? {}) as Partial<WorkflowDef>;
                void _tasks;
                result = { ...result, ...propsOnly };
                break;
            }

            case 'add_switch_branch': {
                let found = false;
                let supported = true;
                result.tasks = transformTasksRecursively(
                    result.tasks,
                    t => t.taskReferenceName === op.ref,
                    t => {
                        found = true;
                        if (t.type !== 'SWITCH' && t.type !== 'DECISION') {
                            supported = false;
                            return t;
                        }
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
                    },
                );
                if (!found) miss(op, `找不到 SWITCH 任务 ${op.ref}`);
                else if (!supported) miss(op, `任务 ${op.ref} 不是 SWITCH，不能添加分支`);
                break;
            }

            case 'add_fork_branch': {
                let found = false;
                let supported = true;
                result.tasks = transformTasksRecursively(
                    result.tasks,
                    t => t.taskReferenceName === op.ref,
                    t => {
                        found = true;
                        if (t.type !== 'FORK_JOIN') {
                            supported = false;
                            return t;
                        }
                        const forkTasks = (t.forkTasks ?? []) as TaskDef[][];
                        // Use branch count as suffix — deterministic, no timestamp collision
                        const newBranchRef = `${op.ref}_branch_${forkTasks.length + 1}`;
                        return { ...t, forkTasks: [...forkTasks, [{ name: newBranchRef, taskReferenceName: newBranchRef, type: 'SIMPLE' }]] };
                    },
                );
                if (!found) miss(op, `找不到 FORK_JOIN 任务 ${op.ref}`);
                else if (!supported) miss(op, `任务 ${op.ref} 不是 FORK_JOIN，不能添加并行分支`);
                break;
            }

            default:
                miss(op, '不支持的操作类型');
        }
    }

    return { workflow: result, unmatched };
}

/** 应用 patch 操作（没有生效的操作会被忽略；需要知道哪些没生效时用 applyPatchWithReport） */
export function applyPatch(def: WorkflowDef, ops: PatchOp[]): WorkflowDef {
    return applyPatchWithReport(def, ops).workflow;
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

/**
 * 任务的「自身」视图：子任务只保留引用名结构（分支名 / 分支数 / 顺序），
 * 这样嵌套子任务的改动只记在子任务上，不会让外层 SWITCH / FORK 整体显示为"已修改"。
 */
function shallowTask(t: TaskDef): TaskDef {
    const refs = (list: TaskDef[] | undefined) => (list ?? []).map(c => c?.taskReferenceName);
    const out: Record<string, unknown> = { ...t };
    if (t.decisionCases && typeof t.decisionCases === 'object') {
        out.decisionCases = Object.fromEntries(Object.entries(t.decisionCases).map(([k, v]) => [k, refs(v)]));
    }
    if (Array.isArray(t.defaultCase)) out.defaultCase = refs(t.defaultCase);
    if (Array.isArray(t.forkTasks)) out.forkTasks = t.forkTasks.map(b => refs(b));
    if (Array.isArray(t.loopOver)) out.loopOver = refs(t.loopOver);
    return out as unknown as TaskDef;
}

/**
 * 计算两份定义的任务差异。会递归进入 SWITCH 分支、FORK 并行分支和 DO_WHILE 循环体，
 * 嵌套任务的新增 / 修改 / 删除同样会列出（之前只比较顶层任务，分支内的改动被漏掉）。
 */
export function computeDiff(before: WorkflowDef | null, after: WorkflowDef): DiffSummary {
    const afterTasks = after.tasks ?? [];
    const afterAll = collectAllTasksInOrder(afterTasks);
    if (!before) {
        return {
            added: afterAll.map(t => t.taskReferenceName),
            modified: [],
            removed: [],
            propsChanged: false,
        };
    }

    const beforeAll = collectAllTasksInOrder(before.tasks ?? []);
    const beforeMap = new Map(beforeAll.map(t => [t.taskReferenceName, t]));
    const afterMap = new Map(afterAll.map(t => [t.taskReferenceName, t]));

    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];
    const modifiedDetails: TaskFieldChange[] = [];

    for (const [ref, task] of afterMap) {
        if (!beforeMap.has(ref)) {
            added.push(ref);
        } else {
            const beforeTask = shallowTask(beforeMap.get(ref)!);
            const afterTask = shallowTask(task);
            if (JSON.stringify(afterTask) !== JSON.stringify(beforeTask)) {
                modified.push(ref);
                modifiedDetails.push({ ref, changes: describeTaskFieldChanges(beforeTask, afterTask) });
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

    // Detect task reordering: compare the relative order of shared top-level tasks
    // (order inside branches is part of the parent's shallow view above).
    const topAfter = new Set(afterTasks.map(t => t.taskReferenceName));
    const topBefore = new Set((before.tasks ?? []).map(t => t.taskReferenceName));
    const beforeOrder = (before.tasks ?? [])
        .filter(t => topAfter.has(t.taskReferenceName))
        .map(t => t.taskReferenceName);
    const afterOrder = afterTasks
        .filter(t => topBefore.has(t.taskReferenceName))
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
    // 递归收集：分支 / 并行 / 循环里的子流程同样决定层级
    const subWorkflowTasks = collectAllTasksInOrder(proposed.tasks ?? []).filter(t => t.type === 'SUB_WORKFLOW');

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
            }, buildNormalizeOptions(ctx));
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
            const { workflow: patched, unmatched } = applyPatchWithReport(targetBase, ops);
            if (unmatched.length > 0) {
                return {
                    type: 'error',
                    text: `patch_workflow 有 ${unmatched.length} 个操作没有生效，本次变更未提交：\n` +
                        unmatched.map(u => `- ${u}`).join('\n') +
                        `\n请用 get_workflow_state 核对任务引用名（taskReferenceName）后，重新调用 patch_workflow 提交全部操作。`,
                };
            }
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
            // 按空白 / 标点切成多个关键词：任一关键词命中名称、描述或标签即算匹配，按命中数排序
            const tokens = String(args.query ?? '').toLowerCase()
                .split(/[\s,，、;；|/]+/)
                .map(t => t.trim())
                .filter(Boolean);
            const levelFilter = args.level as WorkflowLevel | undefined;
            const domainFilter = typeof args.domain === 'string' && args.domain.trim() ? args.domain.trim() : undefined;

            // 服务端检索命中（预取）优先；否则在本地目录内匹配
            const serverHits = ctx.librarySearchResults;
            if (!serverHits && library.length === 0) {
                return { type: 'info', text: '当前没有配置工作流库，无法搜索。' };
            }
            const score = (item: WorkflowLibraryItem): number => {
                if (tokens.length === 0) return 1;
                const fields = [
                    item.workflowName.toLowerCase(),
                    (item.description ?? '').toLowerCase(),
                    ...(item.tags ?? []).map(t => t.toLowerCase()),
                ];
                return tokens.filter(tok => fields.some(f => f.includes(tok))).length;
            };
            const localHits = () => library
                .filter(item => !levelFilter || item.workflowLevel === levelFilter)
                .filter(item => !domainFilter || item.domain === domainFilter)
                .map(item => ({ item, hits: score(item) }))
                .filter(x => x.hits > 0)
                .sort((a, b) => b.hits - a.hits)
                .map(x => x.item);
            const matched = (serverHits ?? localHits()).filter(item => !domainFilter || item.domain === domainFilter);

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
                    lines.push(`- \`${item.workflowName}\` (v${item.version}): ${item.description ?? ''} [${(item.tags ?? []).join(', ')}]${item.domain ? ` [业务域: ${item.domain}]` : ''}`);
                });
            });
            if (matched.length > shown.length) {
                lines.push(`\n（仅显示前 ${shown.length} 个，请用更具体的关键词或指定层级缩小范围）`);
            }

            return { type: 'info', text: lines.join('\n') };
        }

        case 'load_library_workflow':
            return buildLibraryWorkflowProposal(args, ctx);

        default:
            return { type: 'error', text: `未知工具: ${toolName}` };
    }
}

// ─── Library workflow → proposal ─────────────────────────────────────────────

/** 为新引用生成不与现有任务冲突的引用名 */
function uniqueRef(base: string, existing: Set<string>): string {
    const cleaned = base.replace(/[^a-zA-Z0-9_]/g, '_') || 'sub_workflow';
    let ref = `${cleaned}_ref`;
    let n = 2;
    while (existing.has(ref)) ref = `${cleaned}_ref_${n++}`;
    return ref;
}

/**
 * 把流程库里的一个工作流变成待确认方案（load_library_workflow 与推荐卡片的"直接使用"共用）：
 * - mode=open：流程库提供了完整定义时，以该定义作为方案（相对画布计算差异）
 * - mode=reference：在当前草稿 / 画布末尾追加一个引用它的 SUB_WORKFLOW 步骤（版本固定为库当前版本）
 */
export function buildLibraryWorkflowProposal(args: Record<string, any>, ctx: ToolExecutionContext): ToolCallResult {
    const name = typeof args.name === 'string' ? args.name.trim() : '';
    if (!name) {
        return { type: 'error', text: 'load_library_workflow 缺少 name（流程库中的工作流名称）' };
    }
    const item = ctx.libraryItems.find(i => i.workflowName === name);
    const fullDef = ctx.libraryWorkflowDef && Array.isArray(ctx.libraryWorkflowDef.tasks) && ctx.libraryWorkflowDef.tasks.length > 0
        ? ctx.libraryWorkflowDef
        : null;
    if (!item && !fullDef) {
        return { type: 'error', text: `流程库中没有名为「${name}」的工作流。请先用 search_workflow_library 确认名称后重试。` };
    }
    const mode = args.mode === 'reference' ? 'reference' : 'open';
    const currentDef = ctx.workflowDef;

    if (mode === 'open') {
        if (!fullDef) {
            return {
                type: 'error',
                text: `流程库只提供了「${name}」的摘要，没有完整定义，无法直接打开。可改用 mode=reference 以子流程步骤引用它。`,
            };
        }
        const proposed: WorkflowDef = { ...fullDef, tasks: [...fullDef.tasks] };
        const diff = computeDiff(currentDef, proposed);
        const { inferredLevel } = checkLevelCompliance(proposed, ctx.libraryItems);
        const verification = verifyWorkflowSemantics(proposed);
        return {
            type: 'propose',
            proposed,
            diff,
            inferredLevel: item?.workflowLevel ?? inferredLevel ?? undefined,
            verification,
        };
    }

    const base: WorkflowDef = ctx.workingDraft ?? currentDef ?? { name: 'new_workflow', version: 1, schemaVersion: 2, tasks: [] };
    const existingRefs = new Set(collectAllTasksInOrder(base.tasks ?? []).map(t => t.taskReferenceName));
    const parsedVersion = item ? parseInt(String(item.version), 10) : NaN;
    const version: number | undefined = typeof args.version === 'number'
        ? args.version
        : ctx.resolveLatestVersion?.(name) ?? fullDef?.version ?? (Number.isNaN(parsedVersion) ? undefined : parsedVersion);
    const task: TaskDef = {
        name: item?.description || name,
        taskReferenceName: uniqueRef(name, existingRefs),
        type: 'SUB_WORKFLOW',
        subWorkflowParam: { name, ...(version !== undefined ? { version } : {}) },
    };
    const proposed = applyPatch(base, [{ op: 'add_task', task }]);
    const diff = computeDiff(currentDef, proposed);
    const { inferredLevel } = checkLevelCompliance(proposed, ctx.libraryItems);
    const verification = verifyWorkflowSemantics(proposed);
    return { type: 'propose', proposed, diff, inferredLevel: inferredLevel ?? undefined, verification };
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
    const diffRefs = new Set([...diff.added, ...diff.modified, ...diff.removed]);
    const selectedRefs = new Set([...selection.added, ...selection.modified, ...selection.removed]);

    // Nested changes (inside SWITCH / FORK / DO_WHILE) are applied with their top-level
    // container: the container takes the proposed version when any change inside it is selected.
    const nestedRefs = (t: TaskDef, cur?: TaskDef) => [
        ...collectAllTasksInOrder([t]).slice(1).map(c => c.taskReferenceName),
        ...(cur ? collectAllTasksInOrder([cur]).slice(1).map(c => c.taskReferenceName) : []),
    ];

    // Walk proposedDef task order as basis (handles reordering naturally)
    const newTasks: TaskDef[] = [];

    for (const proposedTask of (proposedDef.tasks ?? [])) {
        const ref = proposedTask.taskReferenceName;
        const cur = currentTaskMap.get(ref);
        const inner = nestedRefs(proposedTask, cur);
        const innerChanged = inner.some(r => diffRefs.has(r));
        if (addedSet.has(ref)) {
            if (selection.added.has(ref)) newTasks.push(proposedTask);
            // else: skip — don't add
        } else if (modifiedSet.has(ref) || innerChanged) {
            // Use proposed if selected, current otherwise.
            // currentTaskMap may not have the ref if the user manually deleted the task
            // after the proposal was computed — fall back to proposedTask to avoid undefined.
            const selected = selection.modified.has(ref) || inner.some(r => diffRefs.has(r) && selectedRefs.has(r));
            newTasks.push(selected ? proposedTask : (cur ?? proposedTask));
        } else {
            // Unchanged: keep current version
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
