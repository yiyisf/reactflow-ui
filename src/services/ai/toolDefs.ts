/**
 * AI Tool Definitions — simplified 4-tool approach
 *
 * All workflow-modifying tools work at WorkflowDef JSON level.
 * The executor applies changes as pure functions and stores a
 * proposed WorkflowDef in aiStore for user review.
 */

import type { ToolDef } from './protocolAdapter';

export const TOOL_DEFINITIONS: ToolDef[] = [
    {
        type: 'function',
        function: {
            name: 'init_workflow_blueprint',
            description: '【阶段 1/4：定义工作流蓝图与元信息】在创建或大范围重构复杂工作流时，首先调用此工具定义工作流名称、描述、版本、超时策略及工作流级输入/输出参数契约。调用后请继续调用 scaffold_workflow_topology 编排任务拓扑。',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: '工作流唯一英文标识名（如 order_fulfillment_flow）',
                    },
                    description: {
                        type: 'string',
                        description: '工作流业务目标与场景描述（中文）',
                    },
                    version: {
                        type: 'number',
                        description: '版本号，默认 1',
                    },
                    ownerEmail: {
                        type: 'string',
                        description: '负责人邮箱（如 team@example.com）',
                    },
                    timeoutPolicy: {
                        type: 'string',
                        enum: ['TIME_OUT_WF', 'ALERT_ONLY'],
                        description: '超时策略（默认 ALERT_ONLY）',
                    },
                    timeoutSeconds: {
                        type: 'number',
                        description: '工作流整体超时时间（秒，默认 3600）',
                    },
                    failureWorkflow: {
                        type: 'string',
                        description: '失败补偿子工作流名称（可选）',
                    },
                    inputParameters: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '工作流期望接收的输入参数字段名列表（如 ["orderId", "userId", "amount"]）',
                    },
                    outputParameters: {
                        type: 'object',
                        description: '工作流输出参数映射（可选，也可在阶段 3 补充）',
                    },
                },
                required: ['name', 'description'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'scaffold_workflow_topology',
            description: '【阶段 2/4：设计整体任务编排拓扑】在定义工作流蓝图后调用，构建完整的任务节点拓扑骨架（包含顺序节点、SWITCH 条件分支、FORK_JOIN 并行与 JOIN 汇合、DO_WHILE 循环等结构）。此阶段专注任务划分、唯一 taskReferenceName 和控制流拓扑正确性；详细参数可在阶段 3 补充。',
            parameters: {
                type: 'object',
                properties: {
                    tasks: {
                        type: 'array',
                        description: '按执行顺序排列的顶层 TaskDef 数组（可包含嵌套的 decisionCases / defaultCase / forkTasks / loopOver）',
                        items: {
                            type: 'object',
                        },
                    },
                },
                required: ['tasks'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'configure_workflow_tasks',
            description: '【阶段 3/4：逐项或分批补充任务配置与数据流】对已编排好拓扑的任务补充具体配置（inputParameters 数据流引用 ${workflow.input.x} / ${upstream_ref.output.y}、HTTP 请求配置、SUB_WORKFLOW 引用、timeoutSeconds、retryCount 等）。支持一次配置全部或分多次按模块配置，完成后调用 commit_workflow_proposal 整体验证。',
            parameters: {
                type: 'object',
                properties: {
                    configurations: {
                        type: 'array',
                        description: '每个任务的详细配置项列表',
                        items: {
                            type: 'object',
                            properties: {
                                ref: {
                                    type: 'string',
                                    description: '目标任务的 taskReferenceName（支持顶层或分支/循环内嵌套任务）',
                                },
                                name: {
                                    type: 'string',
                                    description: '任务显示名称（可选更新）',
                                },
                                description: {
                                    type: 'string',
                                    description: '任务业务说明',
                                },
                                inputParameters: {
                                    type: 'object',
                                    description: '任务输入参数及上下游数据流引用（如 { "orderId": "${workflow.input.orderId}" }）',
                                },
                                httpRequest: {
                                    type: 'object',
                                    description: '[HTTP 任务] 请求配置 { uri, method, headers, body }，会自动规范化到 inputParameters.http_request',
                                },
                                subWorkflowParam: {
                                    type: 'object',
                                    description: '[SUB_WORKFLOW 任务] 子工作流配置 { name, version }',
                                },
                                timeoutSeconds: {
                                    type: 'number',
                                    description: '任务超时秒数',
                                },
                                retryCount: {
                                    type: 'number',
                                    description: '失败重试次数',
                                },
                                retryLogic: {
                                    type: 'string',
                                    enum: ['FIXED', 'EXPONENTIAL_BACKOFF', 'LINEAR_BACKOFF'],
                                    description: '重试退避策略',
                                },
                                optional: {
                                    type: 'boolean',
                                    description: '是否为可选任务（失败不中断主流程）',
                                },
                                caseValueParam: {
                                    type: 'string',
                                    description: '[SWITCH/DECISION] 分支判断参数名',
                                },
                                caseExpression: {
                                    type: 'string',
                                    description: '[SWITCH] 分支评估表达式',
                                },
                                loopCondition: {
                                    type: 'string',
                                    description: '[DO_WHILE] 循环继续条件表达式',
                                },
                                joinOn: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: '[JOIN] 等待汇合的分支末尾 taskReferenceName 列表',
                                },
                            },
                            required: ['ref'],
                        },
                    },
                    outputParameters: {
                        type: 'object',
                        description: '工作流最终输出参数映射（如 { "result": "${final_task.output.data}" }）',
                    },
                },
                required: ['configurations'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'commit_workflow_proposal',
            description: '【阶段 4/4：整体验证配置并提交方案】对当前工作流草稿执行全量语义、控制流与上下游数据流引用校验。校验通过后正式生成变更方案展示给用户；若发现问题将返回精确诊断供你修正。',
            parameters: {
                type: 'object',
                properties: {
                    summary: {
                        type: 'string',
                        description: '本次工作流设计或重构的架构摘要说明（可选）',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'replace_workflow',
            description: '用完整的工作流 JSON 替换当前画布。适用于：极简工作流（1-2 个节点）快速创建，或直接提交完整 WorkflowDef。对于 3 个及以上节点或含分支/并行的复杂流程，请优先使用四阶段渐进工具（init_workflow_blueprint -> scaffold_workflow_topology -> configure_workflow_tasks -> commit_workflow_proposal）。',
            parameters: {
                type: 'object',
                properties: {
                    workflow: {
                        type: 'object',
                        description: '完整的 Conductor 工作流定义（包含 name, tasks[] 等字段）',
                    },
                },
                required: ['workflow'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'patch_workflow',
            description: '对当前工作流进行局部修改（增/改/删任务，修改工作流属性）。适用于小范围变更，比 replace_workflow 更精准。',
            parameters: {
                type: 'object',
                properties: {
                    ops: {
                        type: 'array',
                        description: '操作列表，按顺序执行',
                        items: {
                            type: 'object',
                            properties: {
                                op: {
                                    type: 'string',
                                    enum: ['add_task', 'update_task', 'remove_task', 'update_props', 'add_switch_branch', 'add_fork_branch'],
                                    description: '操作类型',
                                },
                                // add_task
                                task: {
                                    type: 'object',
                                    description: '[add_task] 完整的 TaskDef 对象（必须有 name, taskReferenceName, type）',
                                },
                                afterRef: {
                                    type: 'string',
                                    description: '[add_task] 插入到哪个任务之后（支持顶层或嵌套分支内的 taskReferenceName）。不传则追加到末尾',
                                },
                                parentRef: {
                                    type: 'string',
                                    description: '[add_task] 可选：插入到指定容器节点内部（SWITCH / FORK_JOIN / DO_WHILE 的 taskReferenceName）',
                                },
                                branchName: {
                                    type: 'string',
                                    description: '[add_task] 可选：当 parentRef 为 SWITCH 时指定分支名（或 "default"）；当为 FORK_JOIN 时指定分支索引（如 "0", "1"）',
                                },
                                // update_task / remove_task
                                ref: {
                                    type: 'string',
                                    description: '[update_task / remove_task / add_switch_branch / add_fork_branch] 目标任务的 taskReferenceName',
                                },
                                changes: {
                                    type: 'object',
                                    description: '[update_task] 要修改的字段（仅传入需要变更的字段）',
                                },
                                // update_props
                                props: {
                                    type: 'object',
                                    description: '[update_props] 工作流级别属性（name, description, timeoutSeconds, ownerEmail 等）',
                                },
                                // add_switch_branch
                                caseName: {
                                    type: 'string',
                                    description: '[add_switch_branch] 新分支名称（如 "approved", "rejected", "default"）',
                                },
                            },
                            required: ['op'],
                        },
                    },
                },
                required: ['ops'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_workflow_state',
            description: '获取当前工作流的完整状态（任务列表、拓扑、校验结果）。在需要了解当前流程再做决策时调用。',
            parameters: {
                type: 'object',
                properties: {
                    includeFull: {
                        type: 'boolean',
                        description: '是否包含完整 JSON（默认 false，仅返回摘要）',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'validate_workflow',
            description: '校验当前工作流的合法性，返回错误和警告详情。在提交前或排查问题时调用。',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'ask_clarification',
            description: '当用户意图模糊时，向用户提出澄清问题。提供 2-4 个可选选项帮助用户表达真实意图。调用后停止等待用户回复，不要继续执行其他操作。',
            parameters: {
                type: 'object',
                properties: {
                    question: {
                        type: 'string',
                        description: '澄清问题，简洁明了（不超过 30 字）',
                    },
                    context: {
                        type: 'string',
                        description: '你对用户需求的初步理解（1句话）',
                    },
                    options: {
                        type: 'array',
                        description: '2-4 个选项',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                label: { type: 'string', description: '简短标签（≤12字）' },
                                description: { type: 'string', description: '一句话说明这个选项的含义' },
                                icon: { type: 'string', description: 'emoji icon' },
                            },
                            required: ['id', 'label', 'description'],
                        },
                        minItems: 2,
                        maxItems: 4,
                    },
                },
                required: ['question', 'options'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'recommend_workflow',
            description: '在创建新工作流之前，向用户推荐库中已有的相似工作流。调用后等待用户选择，不要直接创建。只在库中有相关工作流时使用。',
            parameters: {
                type: 'object',
                properties: {
                    userIntent: {
                        type: 'string',
                        description: '用户意图摘要',
                    },
                    recommendations: {
                        type: 'array',
                        description: '推荐的工作流列表（1-3个）',
                        items: {
                            type: 'object',
                            properties: {
                                workflowName: { type: 'string' },
                                matchReason: { type: 'string', description: '为什么推荐这个' },
                                matchScore: { type: 'string', enum: ['exact', 'partial', 'similar'] },
                            },
                            required: ['workflowName', 'matchReason', 'matchScore'],
                        },
                        minItems: 1,
                        maxItems: 3,
                    },
                },
                required: ['userIntent', 'recommendations'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'propose_repair',
            description: '为运行态失败的任务提出修复方案（仅在运行模式下可用）。分析失败原因后，提供可直接执行的修复操作列表供用户选择。',
            parameters: {
                type: 'object',
                properties: {
                    diagnosis: {
                        type: 'string',
                        description: '根本原因分析：用 2-3 句话说明为什么失败、数据问题还是配置问题还是依赖问题',
                    },
                    actions: {
                        type: 'array',
                        description: '修复操作列表（按推荐优先级排序）',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: '操作唯一 ID（如 "rerun_1"）' },
                                label: { type: 'string', description: '操作名称（如"从 send_email 重新运行"）' },
                                type: {
                                    type: 'string',
                                    enum: ['rerun_from', 'skip', 'retry_workflow', 'modify_def'],
                                    description: 'rerun_from=从某任务重新运行，skip=跳过该任务，retry_workflow=重试整个工作流，modify_def=修改工作流定义',
                                },
                                taskRef: { type: 'string', description: '[rerun_from/skip] 目标任务的 taskReferenceName' },
                                risk: {
                                    type: 'string',
                                    enum: ['low', 'medium', 'high'],
                                    description: '操作风险等级',
                                },
                                description: { type: 'string', description: '操作详细说明及预期结果' },
                            },
                            required: ['id', 'label', 'type'],
                        },
                    },
                },
                required: ['diagnosis', 'actions'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'propose_plan',
            description: '向用户展示即将执行的多步操作计划，在执行前获得确认。适用于：大范围重构、多工具联动操作、复杂拓扑变更。调用此工具后停止，等待用户点击"执行方案"再继续。',
            parameters: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: '计划标题，简洁描述目标（如"将串行流程重构为并行执行"）',
                    },
                    steps: {
                        type: 'array',
                        description: '执行步骤列表（按顺序），每步说明将调用的工具和操作内容',
                        items: {
                            type: 'object',
                            properties: {
                                step: { type: 'number', description: '步骤序号（从 1 开始）' },
                                action: { type: 'string', description: '该步骤的操作描述' },
                                tool: { type: 'string', description: '将使用的工具名称（如 patch_workflow、replace_workflow）' },
                            },
                            required: ['step', 'action'],
                        },
                    },
                    summary: {
                        type: 'string',
                        description: '方案摘要，描述最终效果（可选）',
                    },
                },
                required: ['title', 'steps'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_workflow_library',
            description: '搜索已有的 L1/L2/L3 子工作流库。当 system prompt 中的库列表不完整，或需要根据业务描述精确匹配子工作流时调用。',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: '搜索关键词（业务描述、功能名称、标签等），支持模糊匹配',
                    },
                    level: {
                        type: 'string',
                        enum: ['L1', 'L2', 'L3'],
                        description: '按层级过滤（不传则搜索全部层级）',
                    },
                },
                required: ['query'],
            },
        },
    },
];
