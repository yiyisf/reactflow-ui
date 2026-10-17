/**
 * Workflow Synthesizer & Deep Semantic Verifier
 *
 * Implements the 4-phase progressive workflow generation strategy:
 *   Phase 1 (blueprint):  init_workflow_blueprint   — Define workflow metadata, input/output contracts, timeout & resilience policy
 *   Phase 2 (topology):   scaffold_workflow_topology — Design overall task orchestration topology & control flow (SWITCH/FORK_JOIN/DO_WHILE)
 *   Phase 3 (configure):  configure_workflow_tasks   — Enrich individual tasks with detailed parameters, HTTP/SubWorkflow configs & data-flow wiring
 *   Phase 4 (verify):     commit_workflow_proposal   — Holistic semantic, control-flow, and data-flow verification before committing proposal
 */

import { validateWorkflow } from '../../utils/validator';
import type { WorkflowDef, TaskDef } from '../../types/conductor';
import type { ValidationItem } from '../../types/workflow';

export type SynthesisPhase = 'idle' | 'blueprint' | 'topology' | 'configure' | 'verify' | 'completed';

export interface BlueprintArgs {
    name: string;
    description?: string;
    version?: number;
    ownerEmail?: string;
    timeoutPolicy?: 'TIME_OUT_WF' | 'ALERT_ONLY';
    timeoutSeconds?: number;
    failureWorkflow?: string;
    inputParameters?: string[];
    outputParameters?: Record<string, any>;
}

export interface TopologyArgs {
    tasks: TaskDef[];
}

export interface TaskConfigurationItem {
    /** Target taskReferenceName */
    ref: string;
    name?: string;
    description?: string;
    inputParameters?: Record<string, any>;
    httpRequest?: Record<string, any>;
    subWorkflowParam?: {
        name: string;
        version?: number;
        taskToDomain?: Record<string, string>;
    };
    timeoutSeconds?: number;
    retryCount?: number;
    retryLogic?: 'FIXED' | 'EXPONENTIAL_BACKOFF' | 'LINEAR_BACKOFF';
    retryDelaySeconds?: number;
    optional?: boolean;
    caseValueParam?: string;
    caseExpression?: string;
    loopCondition?: string;
    joinOn?: string[];
    dynamicForkTasksParam?: string;
    dynamicForkTasksInputParamName?: string;
}

export interface ConfigureTasksArgs {
    configurations: TaskConfigurationItem[];
    outputParameters?: Record<string, any>;
    inputParameters?: string[];
}

export interface VerificationSummary {
    isValid: boolean;
    totalTasks: number;
    configuredTasks: number;
    dataFlowLinks: number;
    autoFixed: string[];
    errors: ValidationItem[];
    warnings: ValidationItem[];
}

// ─── Recursive Task Helpers ──────────────────────────────────────────────────

/**
 * Collects all tasks in execution order (pre-order traversal of top-level and nested tasks).
 */
export function collectAllTasksInOrder(tasks: TaskDef[] = []): TaskDef[] {
    const result: TaskDef[] = [];
    const walk = (list: TaskDef[]) => {
        for (const t of list) {
            if (!t) continue;
            result.push(t);
            if (t.decisionCases && typeof t.decisionCases === 'object') {
                for (const branch of Object.values(t.decisionCases)) {
                    if (Array.isArray(branch)) walk(branch);
                }
            }
            if (Array.isArray(t.defaultCase)) {
                walk(t.defaultCase);
            }
            if (Array.isArray(t.forkTasks)) {
                for (const branch of t.forkTasks) {
                    if (Array.isArray(branch)) walk(branch);
                }
            }
            if (Array.isArray(t.loopOver)) {
                walk(t.loopOver);
            }
        }
    };
    walk(tasks);
    return result;
}

/**
 * Normalizes a single task's structure to prevent common LLM schema mismatches:
 * - Ensures `name` and `taskReferenceName` and `type` exist
 * - Normalizes `HTTP` task `httpRequest` / `inputParameters.uri` into `inputParameters.http_request`
 * - Normalizes `SUB_WORKFLOW` `workflowName` into `subWorkflowParam.name`
 * - Normalizes `TERMINATE` `terminationStatus` into `inputParameters.terminationStatus`
 */
export function normalizeTaskDef(task: TaskDef, autoFixed: string[] = []): TaskDef {
    const t: any = { ...task };
    const ref = t.taskReferenceName || t.name || 'unnamed_task';
    if (!t.taskReferenceName) {
        t.taskReferenceName = String(ref).replace(/[^a-zA-Z0-9_]/g, '_');
        autoFixed.push(`为任务「${t.name || ref}」自动生成引用名 ${t.taskReferenceName}`);
    }
    if (!t.name) {
        t.name = t.taskReferenceName;
    }
    if (!t.type) {
        t.type = 'SIMPLE';
    }

    // Normalize HTTP task config: LLMs often place `httpRequest` at top-level or `uri`/`method` directly in `inputParameters`
    if (t.type === 'HTTP') {
        const inputParams = { ...(t.inputParameters ?? {}) };
        if (!inputParams.http_request) {
            if (t.httpRequest && typeof t.httpRequest === 'object') {
                inputParams.http_request = {
                    method: 'GET',
                    ...t.httpRequest,
                };
                autoFixed.push(`将 HTTP 任务「${t.taskReferenceName}」的 httpRequest 规范化至 inputParameters.http_request`);
            } else if (inputParams.uri || inputParams.url) {
                const { uri, url, method, headers, body, ...rest } = inputParams;
                inputParams.http_request = {
                    uri: uri || url,
                    method: method || 'GET',
                    ...(headers ? { headers } : {}),
                    ...(body !== undefined ? { body } : {}),
                };
                for (const k of ['uri', 'url', 'method', 'headers', 'body']) {
                    delete rest[k];
                }
                Object.assign(inputParams, rest);
                autoFixed.push(`将 HTTP 任务「${t.taskReferenceName}」的请求参数规范化至 inputParameters.http_request`);
            }
        } else if (!inputParams.http_request.method) {
            inputParams.http_request = {
                ...inputParams.http_request,
                method: 'GET',
            };
        }
        t.inputParameters = inputParams;
    }

    // Normalize SUB_WORKFLOW task config
    if (t.type === 'SUB_WORKFLOW') {
        if (!t.subWorkflowParam?.name) {
            const fallbackName = t.workflowName || t.inputParameters?.workflowName || t.inputParameters?.subWorkflowName;
            if (fallbackName) {
                t.subWorkflowParam = {
                    name: fallbackName,
                    version: t.subWorkflowParam?.version ?? t.version ?? 1,
                    ...(t.subWorkflowParam ?? {}),
                };
                autoFixed.push(`将子工作流任务「${t.taskReferenceName}」的流程名规范化至 subWorkflowParam.name`);
            }
        }
    }

    // Normalize TERMINATE task config
    if (t.type === 'TERMINATE') {
        const inputParams = { ...(t.inputParameters ?? {}) };
        if (!inputParams.terminationStatus) {
            inputParams.terminationStatus = t.terminationStatus || 'COMPLETED';
            t.inputParameters = inputParams;
        }
    }

    // Normalize SWITCH / DECISION task config
    if (t.type === 'SWITCH' || t.type === 'DECISION') {
        if (!t.decisionCases || typeof t.decisionCases !== 'object') {
            t.decisionCases = { default_branch: [] };
        }
        const newCases: Record<string, TaskDef[]> = {};
        for (const [k, branch] of Object.entries(t.decisionCases)) {
            newCases[k] = Array.isArray(branch) ? branch.map(b => normalizeTaskDef(b, autoFixed)) : [];
        }
        t.decisionCases = newCases;
        if (Array.isArray(t.defaultCase)) {
            t.defaultCase = t.defaultCase.map((b: TaskDef) => normalizeTaskDef(b, autoFixed));
        }
        if (t.type === 'SWITCH' && !t.evaluatorType) {
            t.evaluatorType = t.caseExpression ? 'javascript' : 'value-param';
        }
        if (!t.caseValueParam && !t.caseExpression && !t.expression) {
            const paramKey = t.inputParameters ? Object.keys(t.inputParameters)[0] : undefined;
            t.caseValueParam = paramKey || 'switchCaseValue';
            if (!t.inputParameters || Object.keys(t.inputParameters).length === 0) {
                t.inputParameters = { [t.caseValueParam]: `\${workflow.input.${t.caseValueParam}}` };
            }
        }
    }

    // Normalize FORK_JOIN branches recursively
    if (t.type === 'FORK_JOIN' && Array.isArray(t.forkTasks)) {
        t.forkTasks = t.forkTasks.map((branch: TaskDef[]) =>
            Array.isArray(branch) ? branch.map(b => normalizeTaskDef(b, autoFixed)) : []
        );
    }

    // Normalize DO_WHILE loopOver recursively
    if (t.type === 'DO_WHILE' && Array.isArray(t.loopOver)) {
        t.loopOver = t.loopOver.map((b: TaskDef) => normalizeTaskDef(b, autoFixed));
        if (!t.loopCondition) {
            t.loopCondition = `if ($.${t.taskReferenceName}['iteration'] < 3) { true; } else { false; }`;
            autoFixed.push(`为循环任务「${t.taskReferenceName}」补充默认退出条件 loopCondition`);
        }
    }

    return t as TaskDef;
}

/**
 * Normalizes a task list, ensuring every FORK_JOIN has a paired JOIN with complete `joinOn` references.
 */
function normalizeTaskList(tasks: TaskDef[], autoFixed: string[]): TaskDef[] {
    const normalized: TaskDef[] = [];

    for (let i = 0; i < tasks.length; i++) {
        const current = normalizeTaskDef(tasks[i], autoFixed);

        // Recursively normalize nested branch lists so nested FORK_JOINs also get paired
        if (current.decisionCases) {
            const updatedCases: Record<string, TaskDef[]> = {};
            for (const [k, branch] of Object.entries(current.decisionCases)) {
                updatedCases[k] = normalizeTaskList(branch, autoFixed);
            }
            current.decisionCases = updatedCases;
        }
        if (current.defaultCase) {
            current.defaultCase = normalizeTaskList(current.defaultCase, autoFixed);
        }
        if (current.forkTasks) {
            current.forkTasks = current.forkTasks.map(branch => normalizeTaskList(branch, autoFixed));
        }
        if (current.loopOver) {
            current.loopOver = normalizeTaskList(current.loopOver, autoFixed);
        }

        normalized.push(current);

        // Ensure FORK_JOIN is followed by a JOIN task with accurate joinOn
        if (current.type === 'FORK_JOIN' && Array.isArray(current.forkTasks)) {
            const expectedJoinRefs = current.forkTasks
                .filter(branch => Array.isArray(branch) && branch.length > 0)
                .map(branch => branch[branch.length - 1].taskReferenceName);

            const nextTask = tasks[i + 1];
            if (nextTask && (nextTask.type === 'JOIN' || nextTask.type === 'EXCLUSIVE_JOIN')) {
                const existingJoinOn = Array.isArray(nextTask.joinOn) ? nextTask.joinOn : [];
                if (existingJoinOn.length === 0 && expectedJoinRefs.length > 0) {
                    tasks[i + 1] = { ...nextTask, joinOn: expectedJoinRefs };
                    autoFixed.push(`为汇合节点「${nextTask.taskReferenceName}」自动补全 joinOn: [${expectedJoinRefs.join(', ')}]`);
                }
            } else if (expectedJoinRefs.length > 0) {
                const joinRef = `${current.taskReferenceName}_join`;
                normalized.push({
                    name: joinRef,
                    taskReferenceName: joinRef,
                    type: 'JOIN',
                    joinOn: expectedJoinRefs,
                } as TaskDef);
                autoFixed.push(`为并行节点「${current.taskReferenceName}」自动补充配对的 JOIN 节点「${joinRef}」`);
            }
        }
    }

    return normalized;
}

/**
 * Extracts all `${...}` expressions from an arbitrary JSON value.
 */
export function extractExpressions(value: any): string[] {
    const found: string[] = [];
    const re = /\$\{([^}]+)\}/g;

    const visit = (val: any) => {
        if (typeof val === 'string') {
            let match: RegExpExecArray | null;
            re.lastIndex = 0;
            while ((match = re.exec(val)) !== null) {
                found.push(match[1].trim());
            }
        } else if (Array.isArray(val)) {
            val.forEach(visit);
        } else if (val && typeof val === 'object') {
            Object.values(val).forEach(visit);
        }
    };

    visit(value);
    return found;
}

/**
 * Normalizes an entire WorkflowDef:
 * - Ensures `version: 1`, `schemaVersion: 2`, `timeoutPolicy`
 * - Normalizes all tasks and FORK_JOIN <-> JOIN pairings
 * - Auto-collects `${workflow.input.xxx}` into `workflow.inputParameters` if missing
 */
export function normalizeWorkflowDef(def: WorkflowDef): { workflow: WorkflowDef; autoFixed: string[] } {
    const autoFixed: string[] = [];
    const tasks = normalizeTaskList(def.tasks ?? [], autoFixed);

    // Collect referenced workflow.input.* parameters across all tasks & outputParameters
    const rawInputs = Array.isArray(def.inputParameters) ? def.inputParameters : [];
    const existingInputs = new Set<string>(
        rawInputs.map(p => (typeof p === 'string' ? p : p.name)).filter(Boolean),
    );
    const allTasks = collectAllTasksInOrder(tasks);
    for (const t of allTasks) {
        const exprs = extractExpressions(t.inputParameters);
        for (const expr of exprs) {
            if (expr.startsWith('workflow.input.')) {
                const topKey = expr.slice('workflow.input.'.length).split('.')[0];
                if (topKey && !existingInputs.has(topKey)) {
                    existingInputs.add(topKey);
                }
            }
        }
    }

    const workflow: WorkflowDef = {
        ...def,
        name: def.name || 'untitled_workflow',
        version: def.version ?? 1,
        schemaVersion: def.schemaVersion ?? 2,
        timeoutPolicy: def.timeoutPolicy ?? 'ALERT_ONLY',
        tasks,
        inputParameters: Array.from(existingInputs),
    };

    return { workflow, autoFixed };
}

// ─── Progressive Phase Executors ─────────────────────────────────────────────

/**
 * Phase 1: Initializes the workflow blueprint (metadata + input/output contract).
 */
export function applyBlueprint(currentDraft: WorkflowDef | null, args: BlueprintArgs): WorkflowDef {
    return {
        name: args.name || currentDraft?.name || 'new_workflow',
        description: args.description ?? currentDraft?.description ?? '',
        version: args.version ?? currentDraft?.version ?? 1,
        schemaVersion: 2,
        ownerEmail: args.ownerEmail ?? currentDraft?.ownerEmail,
        timeoutPolicy: args.timeoutPolicy ?? currentDraft?.timeoutPolicy ?? 'ALERT_ONLY',
        timeoutSeconds: args.timeoutSeconds ?? currentDraft?.timeoutSeconds ?? 3600,
        failureWorkflow: args.failureWorkflow ?? currentDraft?.failureWorkflow,
        inputParameters: args.inputParameters ?? currentDraft?.inputParameters ?? [],
        outputParameters: args.outputParameters ?? currentDraft?.outputParameters ?? {},
        tasks: currentDraft?.tasks ?? [],
    };
}

/**
 * Phase 2: Scaffolds the task orchestration topology on top of the blueprint.
 */
export function applyTopologyScaffold(currentDraft: WorkflowDef | null, args: TopologyArgs): {
    workflow: WorkflowDef;
    autoFixed: string[];
} {
    const base: WorkflowDef = currentDraft ?? {
        name: 'new_workflow',
        version: 1,
        schemaVersion: 2,
        tasks: [],
    };
    return normalizeWorkflowDef({
        ...base,
        tasks: args.tasks ?? [],
    });
}

/**
 * Phase 3: Enriches individual tasks in the working draft with detailed configurations.
 */
export function applyTaskConfigurations(
    currentDraft: WorkflowDef,
    args: ConfigureTasksArgs,
): {
    workflow: WorkflowDef;
    configuredRefs: string[];
    missingRefs: string[];
    autoFixed: string[];
} {
    const configMap = new Map<string, TaskConfigurationItem>();
    for (const item of args.configurations ?? []) {
        const targetRef = item?.ref || (item as any)?.taskReferenceName;
        if (targetRef) configMap.set(targetRef, { ...item, ref: targetRef });
    }

    const configuredRefs: string[] = [];
    const autoFixed: string[] = [];

    const enrichRecursive = (tasks: TaskDef[]): TaskDef[] => {
        return tasks.map(task => {
            let updated: TaskDef = { ...task };
            const cfg = configMap.get(task.taskReferenceName);

            if (cfg) {
                configuredRefs.push(task.taskReferenceName);
                if (cfg.name !== undefined) updated.name = cfg.name;
                if (cfg.description !== undefined) updated.description = cfg.description;
                if (cfg.inputParameters !== undefined) {
                    updated.inputParameters = {
                        ...(updated.inputParameters ?? {}),
                        ...cfg.inputParameters,
                    };
                }
                if (cfg.httpRequest !== undefined) {
                    (updated as any).httpRequest = cfg.httpRequest;
                }
                if (cfg.subWorkflowParam !== undefined) {
                    updated.subWorkflowParam = {
                        ...(updated.subWorkflowParam ?? { name: '' }),
                        ...cfg.subWorkflowParam,
                    };
                }
                if (cfg.timeoutSeconds !== undefined) updated.timeoutSeconds = cfg.timeoutSeconds;
                if (cfg.retryCount !== undefined) updated.retryCount = cfg.retryCount;
                if (cfg.retryLogic !== undefined) updated.retryLogic = cfg.retryLogic;
                if (cfg.retryDelaySeconds !== undefined) updated.retryDelaySeconds = cfg.retryDelaySeconds;
                if (cfg.optional !== undefined) updated.optional = cfg.optional;
                if (cfg.caseValueParam !== undefined) updated.caseValueParam = cfg.caseValueParam;
                if (cfg.caseExpression !== undefined) updated.caseExpression = cfg.caseExpression;
                if (cfg.loopCondition !== undefined) updated.loopCondition = cfg.loopCondition;
                if (cfg.joinOn !== undefined) updated.joinOn = cfg.joinOn;
                if (cfg.dynamicForkTasksParam !== undefined) updated.dynamicForkTasksParam = cfg.dynamicForkTasksParam;
                if (cfg.dynamicForkTasksInputParamName !== undefined) {
                    updated.dynamicForkTasksInputParamName = cfg.dynamicForkTasksInputParamName;
                }
                updated = normalizeTaskDef(updated, autoFixed);
            }

            if (updated.decisionCases) {
                const newCases: Record<string, TaskDef[]> = {};
                for (const [k, branch] of Object.entries(updated.decisionCases)) {
                    newCases[k] = enrichRecursive(branch);
                }
                updated.decisionCases = newCases;
            }
            if (updated.defaultCase) {
                updated.defaultCase = enrichRecursive(updated.defaultCase);
            }
            if (updated.forkTasks) {
                updated.forkTasks = updated.forkTasks.map(branch => enrichRecursive(branch));
            }
            if (updated.loopOver) {
                updated.loopOver = enrichRecursive(updated.loopOver);
            }

            return updated;
        });
    };

    const enrichedTasks = enrichRecursive(currentDraft.tasks ?? []);
    const missingRefs = Array.from(configMap.keys()).filter(r => !configuredRefs.includes(r));

    const currentInputNames = (currentDraft.inputParameters ?? []).map(p =>
        typeof p === 'string' ? p : p.name,
    );
    const mergedDraft: WorkflowDef = {
        ...currentDraft,
        tasks: enrichedTasks,
        ...(args.outputParameters
            ? { outputParameters: { ...(currentDraft.outputParameters ?? {}), ...args.outputParameters } }
            : {}),
        ...(args.inputParameters
            ? { inputParameters: Array.from(new Set([...currentInputNames, ...args.inputParameters])) }
            : {}),
    };

    const normalized = normalizeWorkflowDef(mergedDraft);
    return {
        workflow: normalized.workflow,
        configuredRefs,
        missingRefs,
        autoFixed: [...autoFixed, ...normalized.autoFixed],
    };
}

// ─── Phase 4: Deep Semantic & Data-Flow Verification ─────────────────────────

/**
 * Performs comprehensive verification of a workflow definition:
 * 1. Built-in structural & task-type rules (`validateWorkflow`)
 * 2. Data-flow reference integrity (`${taskRef.output.*}` must reference an existing upstream task)
 * 3. Control-flow completeness (FORK_JOIN <-> JOIN joinOn validity, non-empty branches)
 * 4. Task configuration completeness metrics
 */
export function verifyWorkflowSemantics(
    def: WorkflowDef,
    autoFixedPrior: string[] = [],
): VerificationSummary {
    const baseValidation = validateWorkflow(def);
    const errors: ValidationItem[] = [...baseValidation.errors];
    const warnings: ValidationItem[] = [...baseValidation.warnings];

    const allTasks = collectAllTasksInOrder(def.tasks ?? []);
    const allRefs = new Set(allTasks.map(t => t.taskReferenceName));
    const seenUpstreamRefs = new Set<string>();

    let configuredTasks = 0;
    let dataFlowLinks = 0;

    for (const task of allTasks) {
        const ref = task.taskReferenceName;

        // Check if task has meaningful configuration
        const hasInput = task.inputParameters && Object.keys(task.inputParameters).length > 0;
        const isControl =
            task.type === 'JOIN' ||
            task.type === 'EXCLUSIVE_JOIN' ||
            task.type === 'FORK_JOIN' ||
            task.type === 'SWITCH' ||
            task.type === 'DECISION' ||
            task.type === 'DO_WHILE' ||
            task.type === 'SUB_WORKFLOW';
        if (hasInput || isControl || task.timeoutSeconds || task.retryCount !== undefined) {
            configuredTasks++;
        }

        // Check data-flow expressions in inputParameters
        const exprs = extractExpressions(task.inputParameters);
        for (const expr of exprs) {
            dataFlowLinks++;
            if (expr.startsWith('workflow.input.') || expr.startsWith('workflow.')) {
                continue;
            }
            const refPart = expr.split('.')[0];
            if (!refPart) continue;

            if (!allRefs.has(refPart)) {
                errors.push({
                    type: 'TASK',
                    ref,
                    message: `任务「${ref}」的参数引用了不存在的任务 "${refPart}"（表达式: \${${expr}}）`,
                });
            } else if (refPart === ref) {
                errors.push({
                    type: 'TASK',
                    ref,
                    message: `任务「${ref}」的参数不能自引用自身输出（表达式: \${${expr}}）`,
                });
            } else if (!seenUpstreamRefs.has(refPart)) {
                errors.push({
                    type: 'TASK',
                    ref,
                    message: `任务「${ref}」引用了下游尚未执行的任务 "${refPart}"（表达式: \${${expr}}）`,
                });
            }
        }

        // Check JOIN joinOn references
        if ((task.type === 'JOIN' || task.type === 'EXCLUSIVE_JOIN') && Array.isArray(task.joinOn)) {
            if (task.joinOn.length === 0) {
                warnings.push({
                    type: 'TASK',
                    ref,
                    message: `汇合节点「${ref}」未配置 joinOn 等待列表`,
                });
            }
            for (const joinRef of task.joinOn) {
                if (!allRefs.has(joinRef)) {
                    errors.push({
                        type: 'TASK',
                        ref,
                        message: `汇合节点「${ref}」的 joinOn 引用了不存在的任务 "${joinRef}"`,
                    });
                }
            }
        }

        seenUpstreamRefs.add(ref);
    }

    // Check workflow-level outputParameters references
    if (def.outputParameters) {
        const outExprs = extractExpressions(def.outputParameters);
        for (const expr of outExprs) {
            dataFlowLinks++;
            if (expr.startsWith('workflow.')) continue;
            const refPart = expr.split('.')[0];
            if (refPart && !allRefs.has(refPart)) {
                errors.push({
                    type: 'GLOBAL',
                    ref: 'GLOBAL',
                    message: `工作流 outputParameters 引用了不存在的任务 "${refPart}"（表达式: \${${expr}}）`,
                });
            }
        }
    }

    return {
        isValid: errors.length === 0,
        totalTasks: allTasks.length,
        configuredTasks,
        dataFlowLinks,
        autoFixed: autoFixedPrior,
        errors,
        warnings,
    };
}
