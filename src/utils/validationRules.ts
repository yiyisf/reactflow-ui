/**
 * Conductor 校验规则配置
 */

/**
 * P5.4.2: 轻量括号/引号配平检查（不做完整 JS 解析）
 */
function isBalanced(expr: string): boolean {
    const stack: string[] = [];
    let inStr: string | null = null;
    for (let i = 0; i < expr.length; i++) {
        const ch = expr[i];
        if (inStr) {
            if (ch === inStr && expr[i - 1] !== '\\') inStr = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') { stack.push(ch); continue; }
        if (ch === ')') { if (stack.pop() !== '(') return false; continue; }
        if (ch === ']') { if (stack.pop() !== '[') return false; continue; }
        if (ch === '}') { if (stack.pop() !== '{') return false; continue; }
    }
    return stack.length === 0 && inStr === null;
}

export const WORKFLOW_RULES = [
    { field: 'name', type: 'required', message: '工作流名称 (name) 必填' },
    { field: 'version', type: 'required', message: '工作流版本 (version) 必填' },
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
            // P5.4.2: 表达式括号/引号配平
            {
                field: 'inputParameters.expression', type: 'custom', level: 'warning',
                validate: (_val: any, task: any) => {
                    const expr: string = task?.inputParameters?.expression || task?.inputParameters?.scriptExpression || '';
                    if (!expr) return true;
                    return isBalanced(expr);
                },
                message: 'INLINE 表达式括号或引号可能不匹配'
            }
        ],
        'LAMBDA': [
            { field: 'inputParameters.scriptExpression', type: 'required', message: 'LAMBDA 任务缺少脚本表达式 (scriptExpression)' },
            // P5.4.2
            {
                field: 'inputParameters.scriptExpression', type: 'custom', level: 'warning',
                validate: (_val: any, task: any) => {
                    const expr: string = task?.inputParameters?.scriptExpression || '';
                    if (!expr) return true;
                    return isBalanced(expr);
                },
                message: 'LAMBDA 表达式括号或引号可能不匹配'
            }
        ],
        'JSON_JQ_TRANSFORM': [
            { field: 'inputParameters.queryExpression', type: 'required', message: 'JQ 任务缺少查询表达式 (queryExpression)' },
            // P5.4.2: JQ 表达式首字符合法性
            {
                field: 'inputParameters.queryExpression', type: 'custom', level: 'warning',
                validate: (_val: any, task: any) => {
                    const expr: string = task?.inputParameters?.queryExpression || '';
                    if (!expr) return true;
                    return /^[.\[{("'a-zA-Z$@]/.test(expr.trim());
                },
                message: 'JQ 查询表达式首字符可疑，通常以 . 或 [ 开头'
            }
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
            { field: 'inputParameters.terminationStatus', type: 'enum', value: ['COMPLETED', 'FAILED'], message: '终止状态必须为 COMPLETED 或 FAILED' }
        ],
        'DO_WHILE': [
            {
                field: 'loopCondition', type: 'custom',
                validate: (_val: any, task: any) => !!(task?.loopCondition || task?.inputParameters?.items),
                message: '循环任务需要配置退出条件 (loopCondition) 或列表 (items)'
            },
            // P5.4.2: 括号/引号配平轻量预检
            {
                field: 'loopCondition', type: 'custom', level: 'warning',
                validate: (_val: any, task: any) => {
                    const expr: string = task?.loopCondition || '';
                    if (!expr) return true;
                    return isBalanced(expr);
                },
                message: 'loopCondition 表达式括号或引号可能不匹配'
            }
        ],
        'DECISION': [
            { field: 'decisionCases', type: 'custom', validate: (val: any) => Object.keys(val || {}).length > 0, message: '决策任务必须至少包含一个分支 (decisionCases)' },
            {
                field: 'decisionCases', type: 'custom', validate: (val: any) => {
                    const keys = Object.keys(val || {});
                    return new Set(keys).size === keys.length;
                }, message: '决策分支条件不能重复'
            },
            // P5.4.2: caseExpression 轻量预检
            {
                field: 'caseExpression', type: 'custom', level: 'warning',
                validate: (_val: any, task: any) => {
                    const expr: string = task?.caseExpression || '';
                    if (!expr || task?.evaluatorType !== 'javascript') return true;
                    return isBalanced(expr);
                },
                message: 'caseExpression 表达式括号或引号可能不匹配'
            }
        ],
        'SWITCH': [
            { field: 'decisionCases', type: 'custom', validate: (val: any) => Object.keys(val || {}).length > 0, message: 'Switch 任务必须至少包含一个分支' }
        ],
        'FORK_JOIN_DYNAMIC': [
            {
                field: 'dynamicForkTasksParam', type: 'custom',
                validate: (_val: any, task: any) => !!(
                    task?.dynamicForkTasksParam ||
                    (task as any)?.forkTaskType ||
                    (task as any)?.forkTaskWorkflow
                ),
                message: 'FORK_JOIN_DYNAMIC 任务需要配置 dynamicForkTasksParam 或 forkTaskType 或 forkTaskWorkflow',
                level: 'warning'
            }
        ]
    }
};
