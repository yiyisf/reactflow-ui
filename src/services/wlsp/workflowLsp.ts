/**
 * Workflow Language Server (W-LSP)
 *
 * 提供工业级工作流静态分析、DAG 上游作用域推导、多源 Schema 自动推断、
 * 零延迟确定性变量补全（Intellisense）、数据血缘图（DFG）构建与全图引用重构（Auto-Refactor）。
 */

import { WorkflowDef, TaskDef, parseWorkflowInputParams } from '../../types/conductor';
import { TaskExecutionData } from '../../types/workflow';
import { schemaRegistry } from '../ai/schemaRegistry';

export type ValueType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

export interface InferredField {
    /** 字段相对路径，如 "response.body.id" 或 "result" */
    path: string;
    /** 完整 Conductor 引用表达式，如 "${http_get.output.response.body.id}" */
    expression: string;
    /** 推导出的字段类型 */
    valueType: ValueType;
    /** 运行态真实样本值预览（若存在） */
    sampleValue?: string;
    /** 描述说明 */
    description?: string;
    /** Schema 来源 */
    source: 'runtime_sample' | 'schema_registry' | 'task_type_contract';
}

export interface WlspCompletionItem {
    /** 展示名称 */
    label: string;
    /** 插入的完整表达式，如 "${fetch_user.output.userId}" */
    value: string;
    /** 分类 */
    category: 'upstream' | 'workflow_input' | 'variable' | 'system';
    /** 数据类型 */
    valueType: ValueType;
    /** 来源任务引用名或分组名 */
    sourceRef: string;
    /** 来源任务显示名称 */
    sourceLabel: string;
    /** 详细描述 */
    description: string;
    /** 运行态或默认值样本预览 */
    sampleValue?: string;
    /** 是否来自条件分支（可能未执行） */
    isConditional?: boolean;
}

export interface DataFlowEdge {
    id: string;
    sourceRef: string;
    targetRef: string;
    fieldPath: string;
    expression: string;
    sourceType: 'task_output' | 'workflow_variable';
    isValidUpstream: boolean;
    issue?: 'undefined_ref' | 'forward_ref' | 'sibling_branch_ref';
}

export interface DataFlowGraph {
    edges: DataFlowEdge[];
    diagnostics: Array<{
        taskRef: string;
        expression: string;
        issue: 'undefined_ref' | 'forward_ref' | 'sibling_branch_ref';
        message: string;
    }>;
}

export interface UpstreamTaskInfo {
    task: TaskDef;
    /** 是否位于条件分支内部（非必经路径） */
    isConditional: boolean;
}

/**
 * 收集某个任务及其所有嵌套子任务（例如当该任务整体位于目标节点上游时）
 */
function collectAllNestedTasks(
    task: TaskDef,
    acc: UpstreamTaskInfo[],
    insideConditional: boolean
): void {
    acc.push({ task, isConditional: insideConditional });

    if (task.decisionCases) {
        for (const branch of Object.values(task.decisionCases)) {
            for (const sub of branch || []) {
                collectAllNestedTasks(sub, acc, true);
            }
        }
    }
    if (task.defaultCase) {
        for (const sub of task.defaultCase) {
            collectAllNestedTasks(sub, acc, true);
        }
    }
    if (task.forkTasks) {
        for (const branch of task.forkTasks) {
            for (const sub of branch || []) {
                collectAllNestedTasks(sub, acc, insideConditional);
            }
        }
    }
    if (task.loopOver) {
        for (const sub of task.loopOver) {
            collectAllNestedTasks(sub, acc, insideConditional);
        }
    }
}

/**
 * 精确计算在 targetTaskRef 执行前所有合法的上游祖先节点
 */
export function getUpstreamAncestorsWithMeta(
    workflowDef: WorkflowDef | null | undefined,
    targetTaskRef: string
): UpstreamTaskInfo[] {
    if (!workflowDef || !Array.isArray(workflowDef.tasks)) return [];

    const result: UpstreamTaskInfo[] = [];

    function searchSequence(tasks: TaskDef[], isCond: boolean): boolean {
        for (let i = 0; i < tasks.length; i++) {
            const current = tasks[i];
            if (current.taskReferenceName === targetTaskRef) {
                // 找到目标节点：同一序列中它前面的所有任务（及其内部子任务）均为合法上游
                return true;
            }

            // 检查目标节点是否嵌套在 current 内部
            if (current.decisionCases || current.defaultCase) {
                for (const branch of Object.values(current.decisionCases || {})) {
                    const branchAncestors: UpstreamTaskInfo[] = [];
                    if (searchBranch(branch || [], true, branchAncestors)) {
                        result.push({ task: current, isConditional: isCond });
                        result.push(...branchAncestors);
                        return true;
                    }
                }
                if (current.defaultCase) {
                    const branchAncestors: UpstreamTaskInfo[] = [];
                    if (searchBranch(current.defaultCase, true, branchAncestors)) {
                        result.push({ task: current, isConditional: isCond });
                        result.push(...branchAncestors);
                        return true;
                    }
                }
            }

            if (current.forkTasks) {
                for (const branch of current.forkTasks) {
                    const branchAncestors: UpstreamTaskInfo[] = [];
                    if (searchBranch(branch || [], isCond, branchAncestors)) {
                        result.push({ task: current, isConditional: isCond });
                        result.push(...branchAncestors);
                        return true;
                    }
                }
            }

            if (current.loopOver) {
                const branchAncestors: UpstreamTaskInfo[] = [];
                if (searchBranch(current.loopOver, isCond, branchAncestors)) {
                    // 循环容器本身可提供 ${loopRef.output.iteration}
                    result.push({ task: current, isConditional: isCond });
                    result.push(...branchAncestors);
                    return true;
                }
            }

            // 若目标不在 current 内部，则 current 及其所有子任务都是后续节点的上游
            collectAllNestedTasks(current, result, isCond);
        }
        return false;
    }

    function searchBranch(
        branchTasks: TaskDef[],
        isCond: boolean,
        localAcc: UpstreamTaskInfo[]
    ): boolean {
        for (let i = 0; i < branchTasks.length; i++) {
            const current = branchTasks[i];
            if (current.taskReferenceName === targetTaskRef) {
                return true;
            }

            // 递归检查嵌套容器
            if (current.decisionCases || current.defaultCase) {
                for (const subBranch of Object.values(current.decisionCases || {})) {
                    const nestedAcc: UpstreamTaskInfo[] = [];
                    if (searchBranch(subBranch || [], true, nestedAcc)) {
                        localAcc.push({ task: current, isConditional: isCond });
                        localAcc.push(...nestedAcc);
                        return true;
                    }
                }
                if (current.defaultCase) {
                    const nestedAcc: UpstreamTaskInfo[] = [];
                    if (searchBranch(current.defaultCase, true, nestedAcc)) {
                        localAcc.push({ task: current, isConditional: isCond });
                        localAcc.push(...nestedAcc);
                        return true;
                    }
                }
            }

            if (current.forkTasks) {
                for (const subBranch of current.forkTasks) {
                    const nestedAcc: UpstreamTaskInfo[] = [];
                    if (searchBranch(subBranch || [], isCond, nestedAcc)) {
                        localAcc.push({ task: current, isConditional: isCond });
                        localAcc.push(...nestedAcc);
                        return true;
                    }
                }
            }

            if (current.loopOver) {
                const nestedAcc: UpstreamTaskInfo[] = [];
                if (searchBranch(current.loopOver, isCond, nestedAcc)) {
                    localAcc.push({ task: current, isConditional: isCond });
                    localAcc.push(...nestedAcc);
                    return true;
                }
            }

            collectAllNestedTasks(current, localAcc, isCond);
        }
        return false;
    }

    searchSequence(workflowDef.tasks, false);
    return result;
}

export function getUpstreamAncestors(
    workflowDef: WorkflowDef | null | undefined,
    targetTaskRef: string
): TaskDef[] {
    return getUpstreamAncestorsWithMeta(workflowDef, targetTaskRef).map(item => item.task);
}

/**
 * 格式化运行态样本值为紧凑可读预览字符串
 */
function formatSamplePreview(val: any): string {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'string') {
        return val.length > 32 ? `"${val.slice(0, 32)}..."` : `"${val}"`;
    }
    if (typeof val === 'number' || typeof val === 'boolean') {
        return String(val);
    }
    if (Array.isArray(val)) {
        return `Array(${val.length})`;
    }
    if (typeof val === 'object') {
        const keys = Object.keys(val);
        return `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''} }`;
    }
    return String(val);
}

function detectValueType(val: any): ValueType {
    if (val === null || val === undefined) return 'any';
    if (Array.isArray(val)) return 'array';
    const t = typeof val;
    if (t === 'string' || t === 'number' || t === 'boolean' || t === 'object') return t;
    return 'any';
}

/**
 * 递归从真实 JSON 对象推导字段路径与样本值
 */
function extractFieldsFromSampleObject(
    obj: Record<string, any>,
    taskRef: string,
    prefix = '',
    depth = 0,
    maxDepth = 3,
    acc: InferredField[] = []
): InferredField[] {
    if (!obj || typeof obj !== 'object' || depth > maxDepth) return acc;

    for (const [key, val] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        const vType = detectValueType(val);
        acc.push({
            path,
            expression: `\${${taskRef}.output.${path}}`,
            valueType: vType,
            sampleValue: formatSamplePreview(val),
            source: 'runtime_sample',
        });

        if (vType === 'object' && val !== null && Object.keys(val).length > 0 && depth < maxDepth) {
            extractFieldsFromSampleObject(val, taskRef, path, depth + 1, maxDepth, acc);
        } else if (vType === 'array' && Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && depth < maxDepth) {
            extractFieldsFromSampleObject(val[0], taskRef, `${path}[0]`, depth + 1, maxDepth, acc);
        }
    }
    return acc;
}

/**
 * 推导单个任务的输出 Schema 字段列表
 */
export function inferTaskOutputSchema(
    task: TaskDef,
    executionData?: Record<string, TaskExecutionData> | null
): InferredField[] {
    const ref = task.taskReferenceName;
    const fieldsMap = new Map<string, InferredField>();

    // 1. 优先从运行态真实 output 样本逆向推导
    const runtimeOut = executionData?.[ref]?.output;
    if (runtimeOut && typeof runtimeOut === 'object') {
        const runtimeFields = extractFieldsFromSampleObject(runtimeOut, ref);
        for (const f of runtimeFields) {
            fieldsMap.set(f.path, f);
        }
    }

    // 2. 从 SchemaRegistry 注册表补充
    const registered = schemaRegistry.get(task.name);
    if (registered?.outputSchema) {
        for (const [fieldPath, typeDesc] of Object.entries(registered.outputSchema)) {
            if (!fieldsMap.has(fieldPath)) {
                const lower = typeDesc.toLowerCase();
                const valueType: ValueType =
                    lower.includes('number') || lower.includes('int') ? 'number'
                        : lower.includes('bool') ? 'boolean'
                            : lower.includes('array') || lower.includes('[]') ? 'array'
                                : lower.includes('object') ? 'object'
                                    : 'string';
                fieldsMap.set(fieldPath, {
                    path: fieldPath,
                    expression: `\${${ref}.output.${fieldPath}}`,
                    valueType,
                    description: typeDesc,
                    source: 'schema_registry',
                });
            }
        }
    }

    // 3. 任务类型标准契约兜底
    const addContractField = (path: string, valueType: ValueType, description: string) => {
        if (!fieldsMap.has(path)) {
            fieldsMap.set(path, {
                path,
                expression: `\${${ref}.output.${path}}`,
                valueType,
                description,
                source: 'task_type_contract',
            });
        }
    };

    switch (task.type) {
        case 'HTTP':
            addContractField('response.body', 'object', 'HTTP 响应体 JSON 数据');
            addContractField('response.statusCode', 'number', 'HTTP 状态码 (如 200)');
            addContractField('response.headers', 'object', 'HTTP 响应头');
            break;
        case 'JSON_JQ_TRANSFORM':
            addContractField('result', 'any', 'JQ 表达式单值计算结果');
            addContractField('resultList', 'array', 'JQ 表达式列表计算结果');
            break;
        case 'DO_WHILE':
            addContractField('iteration', 'number', '当前循环迭代轮次 (从 1 开始)');
            break;
        case 'SUB_WORKFLOW':
            addContractField('workflowId', 'string', '子工作流实例 ID');
            addContractField('result', 'object', '子工作流返回输出');
            break;
        case 'HUMAN':
            addContractField('approved', 'boolean', '人工审批结果');
            addContractField('comment', 'string', '审批意见备注');
            addContractField('assignee', 'string', '实际审批人');
            break;
        case 'SIMPLE':
        default:
            if (fieldsMap.size === 0) {
                addContractField('result', 'any', `${task.name || ref} 默认执行结果`);
                addContractField('data', 'object', `${task.name || ref} 业务输出对象`);
            }
            break;
    }

    return Array.from(fieldsMap.values());
}

/**
 * 为指定目标任务生成零延迟确定性上下文补全项列表
 */
export function getCompletionItems(
    workflowDef: WorkflowDef | null | undefined,
    targetTaskRef: string,
    executionData?: Record<string, TaskExecutionData> | null,
    workflowInputSample?: Record<string, any> | null
): WlspCompletionItem[] {
    if (!workflowDef) return [];

    const items: WlspCompletionItem[] = [];

    // 1. 工作流输入参数 (${workflow.input.*})
    const parsedInputs = parseWorkflowInputParams(workflowDef.inputParameters);
    if (parsedInputs.length > 0) {
        for (const param of parsedInputs) {
            const sample = workflowInputSample?.[param.name] ?? param.defaultValue;
            items.push({
                label: `workflow.input.${param.name}`,
                value: `\${workflow.input.${param.name}}`,
                category: 'workflow_input',
                valueType: param.type === 'number' ? 'number' : param.type === 'boolean' ? 'boolean' : param.type === 'object' ? 'object' : param.type === 'array' ? 'array' : 'string',
                sourceRef: 'workflow.input',
                sourceLabel: '工作流输入',
                description: param.description || `工作流启动参数 ${param.name}`,
                sampleValue: sample !== undefined && sample !== '' ? formatSamplePreview(sample) : undefined,
            });
        }
    } else if (workflowInputSample && typeof workflowInputSample === 'object') {
        for (const [k, v] of Object.entries(workflowInputSample)) {
            items.push({
                label: `workflow.input.${k}`,
                value: `\${workflow.input.${k}}`,
                category: 'workflow_input',
                valueType: detectValueType(v),
                sourceRef: 'workflow.input',
                sourceLabel: '工作流输入',
                description: `工作流运行态输入字段 ${k}`,
                sampleValue: formatSamplePreview(v),
            });
        }
    } else {
        items.push({
            label: 'workflow.input.data',
            value: '${workflow.input.data}',
            category: 'workflow_input',
            valueType: 'any',
            sourceRef: 'workflow.input',
            sourceLabel: '工作流输入',
            description: '引用工作流启动时传入的参数（可在全局设置中定义 inputParameters）',
        });
    }

    // 2. 上游祖先任务输出 & SET_VARIABLE 变量
    const upstreamList = getUpstreamAncestorsWithMeta(workflowDef, targetTaskRef);
    const seenVariables = new Set<string>();

    // 逆序遍历上游（距离当前任务最近的上游排在最前面，体验最佳）
    for (let i = upstreamList.length - 1; i >= 0; i--) {
        const { task, isConditional } = upstreamList[i];

        if (task.type === 'SET_VARIABLE' && task.inputParameters) {
            for (const [varName, varVal] of Object.entries(task.inputParameters)) {
                if (!seenVariables.has(varName)) {
                    seenVariables.add(varName);
                    items.push({
                        label: `workflow.variables.${varName}`,
                        value: `\${workflow.variables.${varName}}`,
                        category: 'variable',
                        valueType: detectValueType(varVal),
                        sourceRef: task.taskReferenceName,
                        sourceLabel: `变量 (${task.name || task.taskReferenceName})`,
                        description: `由上游 SET_VARIABLE 节点 [${task.taskReferenceName}] 设置的全局变量`,
                        sampleValue: formatSamplePreview(varVal),
                        isConditional,
                    });
                }
            }
            continue;
        }

        // 跳过纯控制汇合节点
        if (task.type === 'JOIN' || task.type === 'TERMINATE') continue;

        const fields = inferTaskOutputSchema(task, executionData);
        for (const f of fields) {
            items.push({
                label: `${task.taskReferenceName}.output.${f.path}`,
                value: f.expression,
                category: 'upstream',
                valueType: f.valueType,
                sourceRef: task.taskReferenceName,
                sourceLabel: `${task.name || task.taskReferenceName} (${task.type})`,
                description: f.description || `来自上游任务 [${task.name || task.taskReferenceName}] 的输出字段`,
                sampleValue: f.sampleValue,
                isConditional,
            });
        }
    }

    // 3. 系统内置变量
    const systemVars: Array<{ key: string; desc: string }> = [
        { key: 'workflow.workflowId', desc: '当前工作流执行实例唯一 ID' },
        { key: 'workflow.correlationId', desc: '外部业务关联 ID (Correlation ID)' },
        { key: 'workflow.status', desc: '当前工作流状态' },
        { key: 'workflow.version', desc: '当前工作流定义版本号' },
    ];
    for (const sys of systemVars) {
        items.push({
            label: sys.key,
            value: `\${${sys.key}}`,
            category: 'system',
            valueType: 'string',
            sourceRef: 'workflow',
            sourceLabel: '系统元数据',
            description: sys.desc,
        });
    }

    return items;
}

/**
 * 扁平化获取工作流中的所有任务列表
 */
export function getAllTasksFlat(tasks: TaskDef[] | undefined, acc: TaskDef[] = []): TaskDef[] {
    if (!tasks) return acc;
    for (const t of tasks) {
        acc.push(t);
        if (t.decisionCases) {
            for (const branch of Object.values(t.decisionCases)) {
                getAllTasksFlat(branch, acc);
            }
        }
        if (t.defaultCase) getAllTasksFlat(t.defaultCase, acc);
        if (t.forkTasks) {
            for (const branch of t.forkTasks) {
                getAllTasksFlat(branch, acc);
            }
        }
        if (t.loopOver) getAllTasksFlat(t.loopOver, acc);
    }
    return acc;
}

/**
 * 从任意值中提取所有 ${...} 表达式
 */
function extractExpressionsFromValue(val: any, acc: string[] = []): string[] {
    if (typeof val === 'string') {
        const regex = /\$\{([^}]+)\}/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(val)) !== null) {
            acc.push(match[1].trim());
        }
    } else if (Array.isArray(val)) {
        for (const item of val) extractExpressionsFromValue(item, acc);
    } else if (val && typeof val === 'object') {
        for (const v of Object.values(val)) extractExpressionsFromValue(v, acc);
    }
    return acc;
}

/**
 * 构建全图数据血缘依赖图 (DFG) 与编译期静态数据流诊断
 */
export function buildDataFlowGraph(workflowDef: WorkflowDef | null | undefined): DataFlowGraph {
    if (!workflowDef || !Array.isArray(workflowDef.tasks)) {
        return { edges: [], diagnostics: [] };
    }

    const allTasks = getAllTasksFlat(workflowDef.tasks);
    const taskByRef = new Map<string, TaskDef>();
    const variableSetterMap = new Map<string, string>(); // varName -> taskRef

    for (const t of allTasks) {
        taskByRef.set(t.taskReferenceName, t);
        if (t.type === 'SET_VARIABLE' && t.inputParameters) {
            for (const varName of Object.keys(t.inputParameters)) {
                variableSetterMap.set(varName, t.taskReferenceName);
            }
        }
    }

    const edges: DataFlowEdge[] = [];
    const diagnostics: DataFlowGraph['diagnostics'] = [];
    const seenEdgeIds = new Set<string>();

    for (const task of allTasks) {
        const targetRef = task.taskReferenceName;
        const upstreamSet = new Set(
            getUpstreamAncestors(workflowDef, targetRef).map(u => u.taskReferenceName)
        );

        const rawExprs: string[] = [];
        extractExpressionsFromValue(task.inputParameters, rawExprs);
        extractExpressionsFromValue(task.httpRequest, rawExprs);
        if (task.loopCondition) extractExpressionsFromValue(task.loopCondition, rawExprs);
        if (task.expression) extractExpressionsFromValue(task.expression, rawExprs);

        for (const expr of rawExprs) {
            if (expr.startsWith('workflow.input.') || expr === 'workflow.input') {
                continue;
            }
            if (expr.startsWith('workflow.variables.')) {
                const varName = expr.slice('workflow.variables.'.length).split('.')[0];
                const sourceRef = variableSetterMap.get(varName);
                if (sourceRef && sourceRef !== targetRef) {
                    const isValid = upstreamSet.has(sourceRef);
                    const id = `dfg-${sourceRef}->${targetRef}-var:${varName}`;
                    if (!seenEdgeIds.has(id)) {
                        seenEdgeIds.add(id);
                        edges.push({
                            id,
                            sourceRef,
                            targetRef,
                            fieldPath: `variables.${varName}`,
                            expression: `\${${expr}}`,
                            sourceType: 'workflow_variable',
                            isValidUpstream: isValid,
                            issue: isValid ? undefined : 'forward_ref',
                        });
                    }
                }
                continue;
            }
            if (expr.startsWith('workflow.')) {
                continue;
            }

            // 解析 <taskRef>.output.<fieldPath> 或 <taskRef>.input.<fieldPath>
            const parts = expr.split('.');
            if (parts.length >= 2 && (parts[1] === 'output' || parts[1] === 'input')) {
                const sourceRef = parts[0];
                const fieldPath = parts.slice(2).join('.') || parts[1];
                if (sourceRef === targetRef) continue;

                const exists = taskByRef.has(sourceRef);
                const isUpstream = upstreamSet.has(sourceRef);

                let issue: DataFlowEdge['issue'] | undefined;
                if (!exists) {
                    issue = 'undefined_ref';
                    diagnostics.push({
                        taskRef: targetRef,
                        expression: `\${${expr}}`,
                        issue: 'undefined_ref',
                        message: `任务 [${targetRef}] 引用了不存在的任务 "${sourceRef}"`,
                    });
                } else if (!isUpstream) {
                    issue = 'forward_ref';
                    diagnostics.push({
                        taskRef: targetRef,
                        expression: `\${${expr}}`,
                        issue: 'forward_ref',
                        message: `任务 [${targetRef}] 引用了非上游或互斥分支任务 "${sourceRef}" 的输出`,
                    });
                }

                const edgeId = `dfg-${sourceRef}->${targetRef}-${fieldPath}`;
                if (!seenEdgeIds.has(edgeId)) {
                    seenEdgeIds.add(edgeId);
                    edges.push({
                        id: edgeId,
                        sourceRef,
                        targetRef,
                        fieldPath,
                        expression: `\${${expr}}`,
                        sourceType: 'task_output',
                        isValidUpstream: exists && isUpstream,
                        issue,
                    });
                }
            }
        }
    }

    return { edges, diagnostics };
}

/**
 * 全图级联重构任务引用名 (Auto-Refactor TaskReferenceName)
 *
 * 当用户在属性面板修改某个节点的 taskReferenceName 时，自动扫描并更新：
 * 1. 所有任务的 inputParameters / httpRequest / expression / loopCondition 中的 ${oldRef.xxx} 和 $.oldRef
 * 2. 所有 JOIN 节点的 joinOn / defaultExclusiveJoinTask 列表
 * 3. 工作流级别的 outputParameters
 */
export function refactorTaskReferenceName(
    workflowDef: WorkflowDef,
    oldRef: string,
    newRef: string
): {
    updatedDef: WorkflowDef;
    replacedCount: number;
    affectedTaskRefs: string[];
} {
    const cleanOld = oldRef.trim();
    const cleanNew = newRef.trim();
    if (!cleanOld || !cleanNew || cleanOld === cleanNew) {
        return { updatedDef: workflowDef, replacedCount: 0, affectedTaskRefs: [] };
    }

    const cloned = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;
    let replacedCount = 0;
    const affectedSet = new Set<string>();

    const escapedOld = cleanOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 匹配 ${oldRef.xxx} 或 ${oldRef}
    const exprRegex = new RegExp(`\\$\\{\\s*${escapedOld}(\\.|\\s*\\})`, 'g');
    // 匹配 loopCondition / javascript 脚本中的 $.oldRef. 或 $.oldRef
    const scriptRefRegex = new RegExp(`\\$\\.\\b${escapedOld}\\b`, 'g');

    function rewriteValue(val: any, ownerRef: string): any {
        if (typeof val === 'string') {
            let next = val;
            exprRegex.lastIndex = 0;
            if (exprRegex.test(next)) {
                next = next.replace(exprRegex, (_m, suffix) => {
                    replacedCount++;
                    affectedSet.add(ownerRef);
                    return `\${${cleanNew}${suffix}`;
                });
            }
            scriptRefRegex.lastIndex = 0;
            if (scriptRefRegex.test(next)) {
                next = next.replace(scriptRefRegex, () => {
                    replacedCount++;
                    affectedSet.add(ownerRef);
                    return `$.${cleanNew}`;
                });
            }
            return next;
        }
        if (Array.isArray(val)) {
            return val.map(item => rewriteValue(item, ownerRef));
        }
        if (val && typeof val === 'object') {
            const out: Record<string, any> = {};
            for (const [k, v] of Object.entries(val)) {
                out[k] = rewriteValue(v, ownerRef);
            }
            return out;
        }
        return val;
    }

    const allTasks = getAllTasksFlat(cloned.tasks);
    for (const t of allTasks) {
        const currentOwner = t.taskReferenceName === cleanOld ? cleanNew : t.taskReferenceName;
        if (t.taskReferenceName === cleanOld) {
            t.taskReferenceName = cleanNew;
        }
        if (t.inputParameters) {
            t.inputParameters = rewriteValue(t.inputParameters, currentOwner);
        }
        if (t.httpRequest) {
            t.httpRequest = rewriteValue(t.httpRequest, currentOwner);
        }
        if (t.loopCondition) {
            t.loopCondition = rewriteValue(t.loopCondition, currentOwner);
        }
        if (t.expression) {
            t.expression = rewriteValue(t.expression, currentOwner);
        }
        if (Array.isArray(t.joinOn)) {
            t.joinOn = t.joinOn.map(ref => {
                if (ref === cleanOld) {
                    replacedCount++;
                    affectedSet.add(currentOwner);
                    return cleanNew;
                }
                return ref;
            });
        }
        if (Array.isArray(t.defaultExclusiveJoinTask)) {
            t.defaultExclusiveJoinTask = t.defaultExclusiveJoinTask.map(ref => {
                if (ref === cleanOld) {
                    replacedCount++;
                    affectedSet.add(currentOwner);
                    return cleanNew;
                }
                return ref;
            });
        }
    }

    if (cloned.outputParameters) {
        cloned.outputParameters = rewriteValue(cloned.outputParameters, '__workflow_output__');
    }

    affectedSet.delete(cleanNew);
    return {
        updatedDef: cloned,
        replacedCount,
        affectedTaskRefs: Array.from(affectedSet),
    };
}
