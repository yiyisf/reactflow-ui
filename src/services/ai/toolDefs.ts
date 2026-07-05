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
            name: 'replace_workflow',
            description: '用完整的工作流 JSON 替换当前画布。适用于：从零创建工作流、大范围结构重构。',
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
                                    description: '[add_task] 插入到哪个任务之后（taskReferenceName）。不传则追加到末尾',
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
