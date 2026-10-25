/**
 * Conductor 校验规则配置
 */

const hasText = (v: any) => typeof v === 'string' && v.trim() !== '';

export const WORKFLOW_RULES = [
    { field: 'name', type: 'required', message: '工作流名称 (name) 必填' },
    // version 缺省时 Conductor 按 1 处理，不再报错（E21）
    { field: 'tasks', type: 'min_length', value: 1, message: '工作流必须包含至少一个任务' }
];

export const TASK_RULES = {
    // 所有任务通用的校验规则
    common: [
        { field: 'name', type: 'required', message: '任务类型名称 (name) 必填' },
        { field: 'taskReferenceName', type: 'required', message: '引用名 (taskReferenceName) 必填' },
        { field: 'taskReferenceName', type: 'pattern', value: /^[a-zA-Z0-9_]+$/, message: '引用名仅允许字母、数字和下划线' },
        { field: 'taskReferenceName', type: 'unique', message: '引用名在工作流中必须唯一' }
    ],

    // 按任务类型定义的专项校验规则
    types: {
        'HTTP': [
            { field: 'inputParameters.http_request.uri', type: 'required', message: 'HTTP 任务缺少请求地址 (uri) 配置' },
            { field: 'inputParameters.http_request.method', type: 'required', level: 'warning', message: 'HTTP 任务未指定 Method，建议配置' }
        ],
        'INLINE': [
            {
                field: 'inputParameters.expression', type: 'custom',
                validate: (_val: any, task: any) => !!(task?.inputParameters?.expression || task?.inputParameters?.scriptExpression),
                message: 'INLINE 任务缺少脚本表达式 (expression)'
            },
            {
                field: 'inputParameters.evaluatorType', type: 'required', level: 'warning',
                message: 'INLINE 任务未在 inputParameters 中指定 evaluatorType：Conductor 需要它来选择脚本引擎，建议填 graaljs'
            }
        ],
        'LAMBDA': [
            { field: 'inputParameters.scriptExpression', type: 'required', message: 'LAMBDA 任务缺少脚本表达式 (scriptExpression)' }
        ],
        'JSON_JQ_TRANSFORM': [
            { field: 'inputParameters.queryExpression', type: 'required', message: 'JQ 任务缺少查询表达式 (queryExpression)' }
        ],
        'SUB_WORKFLOW': [
            { field: 'subWorkflowParam.name', type: 'required', message: '子工作流任务缺少子流程名称 (name)' }
        ],
        'START_WORKFLOW': [
            {
                field: 'inputParameters.startWorkflow.name', type: 'custom',
                validate: (_val: any, task: any) => !!(task?.inputParameters?.startWorkflow?.name),
                message: 'START_WORKFLOW 任务缺少目标工作流名称'
            }
        ],
        'DYNAMIC': [
            { field: 'dynamicTaskNameParam', type: 'required', message: 'DYNAMIC 任务缺少 dynamicTaskNameParam 配置' }
        ],
        'TERMINATE': [
            { field: 'inputParameters.terminationStatus', type: 'required', level: 'warning', message: '终止任务未指定状态 (terminationStatus)' },
            { field: 'inputParameters.terminationStatus', type: 'enum', value: ['COMPLETED', 'FAILED', 'TERMINATED'], message: '终止状态必须为 COMPLETED、FAILED 或 TERMINATED' }
        ],
        'DO_WHILE': [
            {
                field: 'loopCondition', type: 'custom',
                validate: (_val: any, task: any) => !!(task?.loopCondition || task?.inputParameters?.items),
                message: '循环任务需要配置退出条件 (loopCondition) 或列表 (items)'
            }
        ],
        'DECISION': [
            { field: 'decisionCases', type: 'custom', validate: (val: any) => Object.keys(val || {}).length > 0, message: '决策任务必须至少包含一个分支 (decisionCases)' },
            {
                field: 'decisionCases', type: 'custom', validate: (val: any) => {
                    const keys = Object.keys(val || {});
                    return new Set(keys).size === keys.length;
                }, message: '决策分支条件不能重复'
            }
        ],
        'SWITCH': [
            { field: 'decisionCases', type: 'custom', validate: (val: any) => Object.keys(val || {}).length > 0, message: 'Switch 任务必须至少包含一个分支' },
            {
                field: 'expression', type: 'custom',
                validate: (val: any, task: any) => hasText(val) || hasText(task?.caseValueParam) || hasText(task?.caseExpression),
                message: 'SWITCH 任务缺少条件表达式 (expression)：value-param 模式填 inputParameters 中的参数名，脚本模式填返回分支名的脚本'
            },
            {
                field: 'evaluatorType', type: 'custom',
                validate: (val: any, task: any) => hasText(val) || !hasText(task?.expression),
                message: 'SWITCH 任务缺少评估模式 (evaluatorType)：请选择 value-param、javascript 或 graaljs'
            },
            {
                // 旧数据 / AI 生成的 SWITCH 只写了 DECISION 的字段：Conductor 的 SWITCH 不读它们
                field: 'expression', type: 'custom', level: 'warning',
                validate: (val: any, task: any) => hasText(val) || !(hasText(task?.caseValueParam) || hasText(task?.caseExpression)),
                message: 'SWITCH 任务只配置了 caseValueParam / caseExpression（DECISION 字段），Conductor 会忽略：请在面板中设置评估模式和 expression'
            }
        ],
        'FORK_JOIN_DYNAMIC': [
            {
                field: 'dynamicForkTasksParam', type: 'custom',
                validate: (_val: any, task: any) => !!(
                    task?.dynamicForkTasksParam ||
                    task?.inputParameters?.forkTaskType ||
                    task?.inputParameters?.forkTaskName ||
                    task?.inputParameters?.forkTaskWorkflow ||
                    (task as any)?.forkTaskType ||
                    (task as any)?.forkTaskWorkflow
                ),
                message: 'FORK_JOIN_DYNAMIC 任务需要配置 dynamicForkTasksParam 或 forkTaskType 或 forkTaskWorkflow',
                level: 'warning'
            }
        ]
    }
};
