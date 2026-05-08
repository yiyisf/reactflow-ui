/**
 * AI Tool Executor — 将 AI 的 tool_call 转换为 workflowStore 操作
 *
 * 所有操作先暂存到 pending 队列，由用户审核后才真正执行。
 */

import useWorkflowStore from '../../store/workflowStore';
import { validateWorkflow } from '../../utils/validator';


// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface PendingOperation {
    id: string;
    toolName: string;
    toolCallId: string;
    args: Record<string, any>;
    description: string;
    status: 'pending' | 'accepted' | 'rejected';
}

export interface ToolResult {
    success: boolean;
    message: string;
    data?: any;
}

// ─── 预览执行器（不真正修改 store，仅计算结果） ──────────────────────────────

/**
 * 在给定 workflowDef 的拷贝上模拟执行 tool call，返回新的 def 和人类可读描述。
 * 用于 Ghost 预览和生成 pending 操作描述。
 */
export function previewToolCall(
    toolName: string,
    args: Record<string, any>,
): { description: string; toolResult: string } {
    switch (toolName) {
        case 'create_workflow':
            return {
                description: `创建工作流「${args.name}」${args.description ? ` — ${args.description}` : ''}`,
                toolResult: JSON.stringify({ success: true, message: `Workflow "${args.name}" created.` }),
            };

        case 'add_task': {
            const pos = args.afterRef ? `在 ${args.afterRef} 之后` : '在末尾';
            return {
                description: `${pos}添加 ${args.type} 任务「${args.name}」`,
                toolResult: JSON.stringify({ success: true, message: `Task "${args.name}" (${args.type}) added.` }),
            };
        }

        case 'modify_task':
            return {
                description: `修改任务 ${args.ref} 的属性: ${Object.keys(args.changes || {}).join(', ')}`,
                toolResult: JSON.stringify({ success: true, message: `Task "${args.ref}" modified.` }),
            };

        case 'remove_task':
            return {
                description: `删除任务「${args.ref}」`,
                toolResult: JSON.stringify({ success: true, message: `Task "${args.ref}" removed.` }),
            };

        case 'add_decision_branch':
            return {
                description: `为 ${args.ref} 添加分支「${args.caseName}」`,
                toolResult: JSON.stringify({ success: true, message: `Branch "${args.caseName}" added to "${args.ref}".` }),
            };

        case 'add_fork_branch':
            return {
                description: `为 ${args.ref} 添加并行分支`,
                toolResult: JSON.stringify({ success: true, message: `New parallel branch added to "${args.ref}".` }),
            };

        case 'set_workflow_props':
            return {
                description: `修改工作流属性: ${Object.keys(args).join(', ')}`,
                toolResult: JSON.stringify({ success: true, message: 'Workflow properties updated.' }),
            };

        case 'replace_workflow':
            return {
                description: `全量替换工作流为「${args.workflow?.name || 'AI 生成'}」（${args.workflow?.tasks?.length || 0} 个任务）`,
                toolResult: JSON.stringify({ success: true, message: 'Workflow replaced.' }),
            };

        case 'validate_workflow': {
            const def = useWorkflowStore.getState().workflowDef;
            if (!def) {
                return { description: '校验工作流', toolResult: JSON.stringify({ success: true, message: 'No workflow to validate.' }) };
            }
            const results = validateWorkflow(def);
            return {
                description: '校验工作流',
                toolResult: JSON.stringify({
                    success: true,
                    isValid: results.isValid,
                    errors: results.errors.map(e => e.message),
                    warnings: results.warnings.map(w => w.message),
                }),
            };
        }

        case 'get_workflow_context': {
            const state = useWorkflowStore.getState();
            const def = state.workflowDef;
            if (!def) {
                return { description: '获取上下文', toolResult: JSON.stringify({ success: true, message: 'No workflow loaded.' }) };
            }
            return {
                description: '获取当前工作流上下文',
                toolResult: JSON.stringify({
                    success: true,
                    workflow: {
                        name: def.name,
                        description: def.description,
                        taskCount: def.tasks.length,
                        tasks: def.tasks.map(t => ({
                            ref: t.taskReferenceName,
                            name: t.name,
                            type: t.type,
                        })),
                    },
                    validation: state.validationResults,
                }),
            };
        }

        default:
            return {
                description: `未知操作: ${toolName}`,
                toolResult: JSON.stringify({ success: false, message: `Unknown tool: ${toolName}` }),
            };
    }
}

// ─── 真正执行器（审核通过后调用） ───────────────────────────────────────────

/**
 * 将一个 PendingOperation 真正执行到 workflowStore 中。
 */
export function executeToolCall(op: PendingOperation): ToolResult {
    const store = useWorkflowStore.getState();
    const { toolName, args } = op;

    try {
        switch (toolName) {
            case 'create_workflow':
                store.createBlankWorkflow(args.name);
                if (args.description) {
                    store.updateWorkflowProperties({ description: args.description });
                }
                return { success: true, message: `Workflow "${args.name}" created.` };

            case 'add_task': {
                const taskRef = args.taskReferenceName || `${(args.type || 'simple').toLowerCase()}_${Date.now()}`;
                const sourceRef = args.afterRef || getLastTaskRef();

                // Build task node data
                const nodeData = {
                    data: {
                        label: args.name,
                        taskReferenceName: taskRef,
                        taskType: args.type || 'SIMPLE',
                    },
                };

                // Build edge data
                const edgeData: any = {};

                store.addNode(nodeData, sourceRef, '', '', edgeData);

                // Apply additional properties if provided
                const extraFields: Record<string, any> = {};
                if (args.inputParameters) extraFields.inputParameters = args.inputParameters;
                if (args.description) extraFields.description = args.description;
                if (args.retryCount != null) extraFields.retryCount = args.retryCount;
                if (args.timeoutSeconds != null) extraFields.timeoutSeconds = args.timeoutSeconds;
                if (args.optional != null) extraFields.optional = args.optional;

                // HTTP specific
                if (args.type === 'HTTP') {
                    const httpReq: any = {};
                    if (args.httpMethod) httpReq.method = args.httpMethod;
                    if (args.httpUri) httpReq.uri = args.httpUri;
                    if (args.httpHeaders) httpReq.headers = args.httpHeaders;
                    if (args.httpBody) httpReq.body = args.httpBody;
                    if (Object.keys(httpReq).length > 0) {
                        extraFields.inputParameters = {
                            ...(extraFields.inputParameters || {}),
                            http_request: httpReq,
                        };
                    }
                }

                // SubWorkflow specific
                if (args.type === 'SUB_WORKFLOW' && args.subWorkflowName) {
                    extraFields.subWorkflowParam = { name: args.subWorkflowName, version: args.subWorkflowVersion || 1 };
                }

                // Switch specific
                if ((args.type === 'SWITCH' || args.type === 'DECISION') && args.caseValueParam) {
                    extraFields.caseValueParam = args.caseValueParam;
                }
                if (args.caseExpression) extraFields.caseExpression = args.caseExpression;

                // Event specific
                if (args.type === 'EVENT' && args.sink) extraFields.sink = args.sink;

                // Wait specific
                if (args.type === 'WAIT' && args.duration) {
                    extraFields.inputParameters = { ...(extraFields.inputParameters || {}), duration: args.duration };
                }

                // Terminate specific
                if (args.type === 'TERMINATE' && args.terminationStatus) {
                    extraFields.inputParameters = {
                        ...(extraFields.inputParameters || {}),
                        terminationStatus: args.terminationStatus,
                    };
                }

                if (Object.keys(extraFields).length > 0) {
                    store.updateTask(taskRef, extraFields);
                }

                return { success: true, message: `Task "${args.name}" added.` };
            }

            case 'modify_task':
                if (!args.ref || !args.changes) {
                    return { success: false, message: 'Missing ref or changes.' };
                }
                store.updateTask(args.ref, args.changes);
                return { success: true, message: `Task "${args.ref}" modified.` };

            case 'remove_task':
                store.removeNode(args.ref);
                return { success: true, message: `Task "${args.ref}" removed.` };

            case 'add_decision_branch':
                store.addDecisionBranch(args.ref, args.caseName);
                return { success: true, message: `Branch "${args.caseName}" added.` };

            case 'add_fork_branch':
                store.addForkBranch(args.ref);
                return { success: true, message: `Fork branch added.` };

            case 'set_workflow_props':
                store.updateWorkflowProperties(args);
                return { success: true, message: 'Workflow properties updated.' };

            case 'replace_workflow':
                if (args.workflow) {
                    store.setWorkflow(args.workflow);
                    store.setMode('edit');
                }
                return { success: true, message: 'Workflow replaced.' };

            case 'validate_workflow':
            case 'get_workflow_context':
                // Read-only operations, already handled in preview
                return { success: true, message: 'Done.' };

            default:
                return { success: false, message: `Unknown tool: ${toolName}` };
        }
    } catch (err: any) {
        return { success: false, message: err.message || 'Execution failed.' };
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getLastTaskRef(): string {
    const def = useWorkflowStore.getState().workflowDef;
    if (!def || def.tasks.length === 0) return 'start';
    return def.tasks[def.tasks.length - 1].taskReferenceName;
}
