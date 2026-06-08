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
