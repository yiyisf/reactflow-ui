/**
 * 专业模式编辑器的纯函数助手：新建任务默认值、引用名 / 分支名校验、删除影响说明、粘贴改名。
 * 只依赖定义数据，不依赖 React / store，方便单测（v1.3.1 E1–E4、E7、E13–E15、E19、E20）。
 */
import type { TaskDef, WorkflowDef } from '../types/conductor';
import {
    collectTaskRefs,
    findContainerList,
    findForkForJoin,
    findJoinForFork,
    findTaskByRef,
} from '../parser/conductorGenerator';
import { refactorTaskReferenceName } from '../services/wlsp/workflowLsp';

/** Conductor 引用名允许的字符 */
export const TASK_REF_PATTERN = /^[a-zA-Z0-9_]+$/;

/** 不能作为引用名的保留字：`${workflow.input.x}` 等表达式以它开头 */
const RESERVED_TASK_REFS = new Set(['workflow']);

/**
 * 按任务类型生成 Conductor 能直接接受的新任务（字段位置以 Conductor OSS WorkflowTask / 各 TaskMapper 为准）。
 * FORK_JOIN / FORK_JOIN_DYNAMIC 的配对 JOIN 用 {@link createJoinTaskFor} 生成。
 */
export function createDefaultTask(type: string, name: string, taskReferenceName: string): TaskDef {
    const task: TaskDef = {
        name,
        taskReferenceName,
        type: (type || 'SIMPLE') as TaskDef['type'],
        inputParameters: {},
    };

    switch (task.type) {
        case 'HTTP':
            // Conductor HttpTask 只读 inputParameters.http_request
            task.inputParameters = {
                http_request: {
                    uri: 'https://example.com/api',
                    method: 'GET',
                    accept: 'application/json',
                    contentType: 'application/json',
                    headers: {},
                },
            };
            break;
        case 'KAFKA_PUBLISH':
            // Conductor KafkaPublishTask 只读 inputParameters.kafka_request
            task.inputParameters = {
                kafka_request: {
                    bootStrapServers: 'localhost:9092',
                    topic: 'my_topic',
                    key: 'msg_key',
                    value: '${workflow.input.value}',
                    headers: {},
                },
            };
            break;
        case 'JSON_JQ_TRANSFORM':
            task.inputParameters = { queryExpression: '.name', input: {} };
            break;
        case 'SET_VARIABLE':
            task.inputParameters = { variableName: 'variableValue' };
            break;
        case 'SUB_WORKFLOW':
            task.subWorkflowParam = { name: 'execution_workflow', version: 1 };
            break;
        case 'EVENT':
            task.sink = 'conductor';
            break;
        case 'WAIT':
            task.inputParameters = { duration: '30s' };
            break;
        case 'TERMINATE':
            task.inputParameters = { terminationStatus: 'COMPLETED', workflowOutput: {} };
            break;
        case 'SWITCH':
            // SWITCH 必须有 evaluatorType + expression；value-param 模式下 expression 是 inputParameters 里的键名
            task.evaluatorType = 'value-param';
            task.expression = 'switchCaseValue';
            task.inputParameters = { switchCaseValue: '${workflow.input.case}' };
            task.decisionCases = { case1: [] };
            task.defaultCase = [];
            break;
        case 'DECISION':
            // 旧版 DECISION 仍使用 caseValueParam / caseExpression
            task.caseValueParam = 'case_param';
            task.inputParameters = { case_param: '${workflow.input.case}' };
            task.decisionCases = { case1: [] };
            task.defaultCase = [];
            break;
        case 'DO_WHILE':
            task.loopCondition = `if ($.${taskReferenceName}['iteration'] < 3) { true; } else { false; }`;
            task.loopOver = [];
            break;
        case 'INLINE':
            // Conductor InlineTask 从 inputParameters 读取 evaluatorType 与 expression
            task.inputParameters = {
                evaluatorType: 'graaljs',
                expression: 'function execute(input) {\n  return { result: input };\n}\nexecute($.input);',
            };
            break;
        case 'DYNAMIC':
            task.dynamicTaskNameParam = 'taskToExecute';
            task.inputParameters = { taskToExecute: '${workflow.input.taskName}' };
            break;
        case 'HUMAN':
            task.humanTaskDef = { userFormTemplate: '', assignmentCompletionStrategy: 'LEAVE_OPEN' };
            break;
        case 'START_WORKFLOW':
            task.inputParameters = { startWorkflow: { name: '', version: 1, input: {}, correlationId: '' } };
            break;
        case 'FORK_JOIN':
            task.forkTasks = [[], []];
            break;
        case 'FORK_JOIN_DYNAMIC':
            // 经典模式：dynamicForkTasksParam / dynamicForkTasksInputParamName 指向 inputParameters 中的键
            task.dynamicForkTasksParam = 'dynamicTasks';
            task.dynamicForkTasksInputParamName = 'dynamicTasksInput';
            task.inputParameters = {
                dynamicTasks: '${workflow.input.dynamicTasks}',
                dynamicTasksInput: '${workflow.input.dynamicTasksInput}',
            };
            break;
        default:
            break;
    }
    return task;
}

/** 为 FORK_JOIN / FORK_JOIN_DYNAMIC 生成紧随其后的 JOIN；引用名与 `takenRefs` 不冲突 */
export function createJoinTaskFor(fork: TaskDef, takenRefs?: Set<string>): TaskDef {
    let ref = `${fork.taskReferenceName}_join`;
    if (takenRefs) {
        let n = 2;
        while (takenRefs.has(ref)) ref = `${fork.taskReferenceName}_join_${n++}`;
    }
    const joinOn = fork.type === 'FORK_JOIN'
        ? (fork.forkTasks || [])
            .filter(b => Array.isArray(b) && b.length > 0)
            .map(b => b[b.length - 1].taskReferenceName)
        : [];
    return { name: `${fork.name}_join`, taskReferenceName: ref, type: 'JOIN', joinOn };
}

/**
 * 校验引用名改名（E7）。返回 null 表示可以提交，否则返回给用户看的中文原因（说明发生了什么、怎么改）。
 */
export function validateTaskRefName(
    def: Pick<WorkflowDef, 'tasks'> | null | undefined,
    newRef: string,
    currentRef: string
): string | null {
    const ref = (newRef ?? '').trim();
    if (!ref) return '引用名不能为空：请输入由字母、数字或下划线组成的名称';
    if (ref === currentRef) return null;
    if (!TASK_REF_PATTERN.test(ref)) return `引用名 "${ref}" 含有不支持的字符：只能使用字母、数字和下划线`;
    if (RESERVED_TASK_REFS.has(ref)) return `"${ref}" 是表达式保留字，不能作为引用名：请换一个名称`;
    if (ref.startsWith('__')) return '引用名不能以两个下划线开头（编辑器内部保留）：请换一个名称';
    const refs = collectTaskRefs(def?.tasks);
    if (refs.has(ref)) return `引用名 "${ref}" 已被其他任务使用：请换一个名称`;
    return null;
}

/**
 * 校验 SWITCH / DECISION 的分支名（E14）。`oldName` 为空表示新增分支。
 */
export function validateBranchName(task: TaskDef | null | undefined, newName: string, oldName?: string): string | null {
    const name = (newName ?? '').trim();
    if (!name) return '分支名不能为空：请输入分支条件值';
    if (oldName !== undefined && name === oldName) return null;
    if (name === 'default') return '"default" 是默认分支的保留名：请换一个分支名';
    if (task?.decisionCases && Object.prototype.hasOwnProperty.call(task.decisionCases, name)) {
        return `分支 "${name}" 已存在：请换一个分支名`;
    }
    return null;
}

const countNested = (task: TaskDef): number => {
    const inner: TaskDef[] = [];
    if (task.decisionCases) Object.values(task.decisionCases).forEach(b => inner.push(...(b || [])));
    if (task.defaultCase) inner.push(...task.defaultCase);
    if (task.forkTasks) task.forkTasks.forEach(b => inner.push(...(b || [])));
    if (task.loopOver) inner.push(...task.loopOver);
    return collectTaskRefs(inner).size;
};

/**
 * 删除任务前的影响说明（E13）：FORK 与 JOIN 成对删除，容器任务连带删除内部任务，确认文案要讲清楚。
 */
export function describeTaskRemoval(
    def: Pick<WorkflowDef, 'tasks'> | null | undefined,
    taskRef: string
): { message: string; removedRefs: string[] } {
    const tasks = def?.tasks;
    const task = findTaskByRef(tasks, taskRef);
    if (!task) return { message: `删除任务 "${taskRef}"？可以用 ⌘Z 撤销。`, removedRefs: [taskRef] };

    const container = findContainerList(tasks, taskRef) || [];
    const undoHint = '可以用 ⌘Z 撤销。';

    if (task.type === 'FORK_JOIN' || task.type === 'FORK_JOIN_DYNAMIC') {
        const joinRef = findJoinForFork(container, taskRef);
        const n = countNested(task);
        const removedRefs = [taskRef, ...(joinRef ? [joinRef] : []), ...collectTaskRefs((task.forkTasks || []).flat())];
        const parts = [`删除并行任务 "${taskRef}"`];
        if (joinRef) parts.push(`会同时删除配对的汇合任务 "${joinRef}"`);
        if (n > 0) parts.push(`${joinRef ? '和' : '会同时删除'}分支中的 ${n} 个任务`);
        return { message: `${parts.join('')}。${undoHint}`, removedRefs };
    }

    if (task.type === 'JOIN' || task.type === 'EXCLUSIVE_JOIN') {
        const forkRef = findForkForJoin(container, taskRef);
        const fork = forkRef ? findTaskByRef(tasks, forkRef) : null;
        if (fork) {
            const n = countNested(fork);
            const removedRefs = [taskRef, fork.taskReferenceName, ...collectTaskRefs((fork.forkTasks || []).flat())];
            const branchPart = n > 0 ? `和分支中的 ${n} 个任务` : '';
            return {
                message: `删除汇合任务 "${taskRef}" 会同时删除配对的并行任务 "${fork.taskReferenceName}"${branchPart}。${undoHint}`,
                removedRefs,
            };
        }
    }

    const n = countNested(task);
    if (n > 0) {
        const where = task.type === 'DO_WHILE' ? '循环体' : '分支';
        const kind = task.type === 'DO_WHILE' ? '循环' : (task.type === 'SWITCH' || task.type === 'DECISION') ? '条件分支' : '任务';
        return {
            message: `删除${kind} "${taskRef}" 会同时删除${where}中的 ${n} 个任务。${undoHint}`,
            removedRefs: Array.from(collectTaskRefs([task])),
        };
    }
    return { message: `删除任务 "${taskRef}"？${undoHint}`, removedRefs: [taskRef] };
}

/**
 * 准备粘贴的任务副本（E15）：子树内所有引用名加后缀并保证全局唯一，
 * 子树内部的引用（`${ref.output.x}`、loopCondition 里的 `$.ref`、joinOn 等）同步改名；
 * 指向子树外部任务的引用保持不变。FORK_JOIN / FORK_JOIN_DYNAMIC 同时返回配对 JOIN。
 */
export function prepareTaskForPaste(
    task: TaskDef,
    existingRefs: Set<string>,
    suffix: string
): { task: TaskDef; join: TaskDef | null } {
    const taken = new Set(existingRefs);
    const subtreeRefs = Array.from(collectTaskRefs([task]));
    // 先算出全部新名字，再统一改名，避免改名链互相影响
    const mapping: Array<[string, string]> = [];
    subtreeRefs.forEach(oldRef => {
        let candidate = `${oldRef}${suffix}`;
        let n = 2;
        while (taken.has(candidate) || subtreeRefs.includes(candidate)) candidate = `${oldRef}${suffix}_${n++}`;
        taken.add(candidate);
        mapping.push([oldRef, candidate]);
    });

    let scratch: WorkflowDef = { name: '__paste__', tasks: [JSON.parse(JSON.stringify(task)) as TaskDef] };
    // 长名字优先，避免 a 先改名时误伤 a_b（正则已有词边界，这里再多一层保险）
    mapping
        .sort((x, y) => y[0].length - x[0].length)
        .forEach(([oldRef, newRef]) => {
            scratch = refactorTaskReferenceName(scratch, oldRef, newRef).updatedDef;
        });
    const pasted = scratch.tasks[0];

    let join: TaskDef | null = null;
    if (pasted.type === 'FORK_JOIN' || pasted.type === 'FORK_JOIN_DYNAMIC') {
        if (pasted.type === 'FORK_JOIN' && !pasted.forkTasks) pasted.forkTasks = [[], []];
        join = createJoinTaskFor(pasted, taken);
    }
    return { task: pasted, join };
}

// ── 执行控制字段（E19）：Conductor 只从 TaskDef（可内嵌在 WorkflowTask.taskDefinition）读取 ─────────

export const TASK_DEFINITION_FIELDS = ['timeoutSeconds', 'retryLogic', 'retryDelaySeconds', 'timeoutPolicy'] as const;
export type TaskDefinitionField = typeof TASK_DEFINITION_FIELDS[number];

/** 读取执行控制字段：优先 taskDefinition，回退到旧版写在顶层的值 */
export function readTaskDefinitionField(task: TaskDef, field: TaskDefinitionField): any {
    const embedded = (task as any).taskDefinition;
    if (embedded && embedded[field] !== undefined) return embedded[field];
    return (task as any)[field];
}

/**
 * 写入执行控制字段，返回要交给 updateTask 的补丁：
 * 写到 `taskDefinition`，并删除旧版的顶层同名字段；保证 Conductor TaskDef 校验要求的 name 与
 * responseTimeoutSeconds ≤ timeoutSeconds。
 */
export function patchTaskDefinitionField(
    task: TaskDef,
    field: TaskDefinitionField,
    value: any,
    ownerEmail?: string
): Record<string, any> {
    const embedded: Record<string, any> = { ...((task as any).taskDefinition || {}) };
    if (!embedded.name) embedded.name = task.name;
    if (!embedded.ownerEmail && ownerEmail) embedded.ownerEmail = ownerEmail;
    // 把旧版顶层值一并迁入
    TASK_DEFINITION_FIELDS.forEach(f => {
        if (embedded[f] === undefined && (task as any)[f] !== undefined) embedded[f] = (task as any)[f];
    });
    if (value === undefined || value === '') delete embedded[field];
    else embedded[field] = value;

    const timeout = embedded.timeoutSeconds;
    if (typeof timeout === 'number' && timeout > 0) {
        if (typeof embedded.responseTimeoutSeconds !== 'number' || embedded.responseTimeoutSeconds > timeout) {
            embedded.responseTimeoutSeconds = timeout;
        }
    }

    const patch: Record<string, any> = { taskDefinition: embedded };
    TASK_DEFINITION_FIELDS.forEach(f => {
        if ((task as any)[f] !== undefined) patch[f] = undefined;
    });
    return patch;
}

/** 把 JSON 文本解析为对象；失败时返回给用户看的原因 */
export function parseJsonDraft(text: string, opts: { allowEmpty?: boolean; requireObject?: boolean } = {}):
    { ok: true; value: any } | { ok: false; error: string } {
    const trimmed = text.trim();
    if (!trimmed) {
        if (opts.allowEmpty) return { ok: true, value: {} };
        return { ok: false, error: '内容为空：请填写 JSON，例如 {}' };
    }
    try {
        const value = JSON.parse(trimmed);
        if (opts.requireObject && (value === null || typeof value !== 'object' || Array.isArray(value))) {
            return { ok: false, error: '这里需要一个 JSON 对象：请用 { } 包起来，例如 {"key": "value"}' };
        }
        return { ok: true, value };
    } catch (err) {
        return { ok: false, error: `JSON 格式有误（${(err as Error)?.message || '无法解析'}）：修正后点击输入框外即可保存，未保存前画布保持原值` };
    }
}
