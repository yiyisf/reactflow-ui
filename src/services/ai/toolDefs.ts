/**
 * AI Tool Definitions — Function Calling Schema
 *
 * 定义 AI 可调用的工具集，每个工具映射到 workflowStore 的 action。
 * 同时兼容 OpenAI tools 格式和 Anthropic tools 格式（通过 protocolAdapter 转换）。
 */

import type { ToolDef } from './protocolAdapter';

export const TOOL_DEFINITIONS: ToolDef[] = [
    {
        type: 'function',
        function: {
            name: 'create_workflow',
            description: '创建一个新的空白工作流。通常在用户需要从零开始时调用。',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: '工作流名称（英文下划线风格，如 order_processing）' },
                    description: { type: 'string', description: '工作流描述' },
                },
                required: ['name'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'add_task',
            description: '在工作流中添加一个新任务节点。会自动插入到指定位置并创建连线。',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: '任务显示名称' },
                    taskReferenceName: { type: 'string', description: '任务唯一引用名（英文下划线风格）' },
                    type: {
                        type: 'string',
                        enum: [
                            'SIMPLE', 'HTTP', 'SWITCH', 'FORK_JOIN', 'FORK_JOIN_DYNAMIC',
                            'DO_WHILE', 'SUB_WORKFLOW', 'EVENT', 'WAIT', 'HUMAN',
                            'INLINE', 'TERMINATE', 'SET_VARIABLE', 'KAFKA_PUBLISH',
                            'JSON_JQ_TRANSFORM', 'START_WORKFLOW', 'DYNAMIC', 'NOOP',
                        ],
                        description: '任务类型',
                    },
                    afterRef: {
                        type: 'string',
                        description: '插入到哪个任务之后（taskReferenceName）。空或不传则追加到末尾。',
                    },
                    inputParameters: {
                        type: 'object',
                        description: '输入参数映射，支持 ${workflow.input.xxx} 等 JSONPath 表达式',
                    },
                    description: { type: 'string', description: '任务描述' },
                    // HTTP 特有
                    httpMethod: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
                    httpUri: { type: 'string', description: 'HTTP 请求 URI' },
                    httpHeaders: { type: 'object', description: 'HTTP 请求头' },
                    httpBody: { type: ['object', 'string'], description: 'HTTP 请求体' },
                    // SubWorkflow 特有
                    subWorkflowName: { type: 'string' },
                    subWorkflowVersion: { type: 'number' },
                    // Switch 特有
                    caseValueParam: { type: 'string' },
                    caseExpression: { type: 'string' },
                    // Event 特有
                    sink: { type: 'string' },
                    // Wait 特有
                    duration: { type: 'string', description: '等待时长，如 30s, 10m' },
                    // Terminate 特有
                    terminationStatus: { type: 'string', enum: ['COMPLETED', 'FAILED'] },
                    // Retry
                    retryCount: { type: 'number' },
                    timeoutSeconds: { type: 'number' },
                    optional: { type: 'boolean' },
                },
                required: ['name', 'type'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'modify_task',
            description: '修改已有任务的属性。只需传入要修改的字段。',
            parameters: {
                type: 'object',
                properties: {
                    ref: { type: 'string', description: '目标任务的 taskReferenceName' },
                    changes: {
                        type: 'object',
                        description: '要修改的字段及新值（如 { retryCount: 3, timeoutSeconds: 60 }）',
                    },
                },
                required: ['ref', 'changes'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'remove_task',
            description: '从工作流中删除一个任务节点。关联的连线会自动处理。',
            parameters: {
                type: 'object',
                properties: {
                    ref: { type: 'string', description: '要删除的任务的 taskReferenceName' },
                },
                required: ['ref'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'add_decision_branch',
            description: '为 SWITCH/DECISION 任务添加一个新的条件分支。',
            parameters: {
                type: 'object',
                properties: {
                    ref: { type: 'string', description: 'SWITCH/DECISION 任务的 taskReferenceName' },
                    caseName: { type: 'string', description: '分支名称（如 "approved", "rejected"）。用 "default" 表示默认分支。' },
                },
                required: ['ref', 'caseName'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'add_fork_branch',
            description: '为 FORK_JOIN 任务添加一个新的并行分支。',
            parameters: {
                type: 'object',
                properties: {
                    ref: { type: 'string', description: 'FORK_JOIN 任务的 taskReferenceName' },
                },
                required: ['ref'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'set_workflow_props',
            description: '修改工作流级别的属性（如名称、描述、超时等）。',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    version: { type: 'number' },
                    timeoutSeconds: { type: 'number' },
                    timeoutPolicy: { type: 'string', enum: ['TIME_OUT_WF', 'ALERT_ONLY'] },
                    failureWorkflow: { type: 'string' },
                    ownerEmail: { type: 'string' },
                    restartable: { type: 'boolean' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'replace_workflow',
            description: '用一个完整的工作流定义替换当前画布。仅在用户要求从零生成完整流程时使用。',
            parameters: {
                type: 'object',
                properties: {
                    workflow: {
                        type: 'object',
                        description: '完整的 Conductor 工作流定义 JSON（包含 name, tasks 等字段）',
                    },
                },
                required: ['workflow'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'validate_workflow',
            description: '校验当前工作流的合法性，返回错误和警告列表。',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_workflow_context',
            description: '获取当前工作流的详细上下文信息，包括全部任务列表、拓扑关系、校验结果等。在需要了解当前流程状态时调用。',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
];
