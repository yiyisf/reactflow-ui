/**
 * AgentRunner — the AI agentic loop, extracted from AiCommandCenter (M2.1)
 *
 * Owns the entire multi-step tool-calling loop that used to live inline in a
 * 300-line useCallback: streaming the model, dispatching tool calls, self-healing
 * invalid proposals, and committing results (messages/proposal/plan/repair/
 * clarification/recommendation) to aiStore. This makes the orchestration logic
 * testable headlessly (see agentRunner.test.ts) and keeps AiCommandCenter as a
 * thin renderer of store state.
 *
 * Store access: this is the ONE place in the AI stack allowed to read
 * workflowStore/libraryStore/aiStore directly (via getState()) and call aiStore
 * actions to commit results — everything it calls into (toolExecutor,
 * systemPrompt, contextEngine) is a pure function that receives that state
 * explicitly, so those modules stay unit-testable without a store.
 *
 * Instancing (M3.2): `aiStore`/`libraryStore`/`toolRegistry` are injected via the
 * constructor rather than imported as module singletons, so each `<AiWorkflowIDE>`
 * mount gets its own isolated runner talking to its own store/registry instances
 * (see store/ideStoresContext.tsx). `workflowStore` remains a shared singleton for
 * now — see the architecture review's M3.2 note on that being a larger follow-up.
 */

import useWorkflowStore from '../../store/workflowStore';
import type { AiStore } from '../../store/aiStore';
import type { LibraryStore } from '../../store/libraryStore';
import type { ToolRegistry } from './toolRegistry';
import { streamChat } from './protocolAdapter';
import type { Message } from './protocolAdapter';
import { TOOL_DEFINITIONS } from './toolDefs';
import { executeToolCall, describeDiff } from './toolExecutor';
import type { DiffSummary, ToolExecutionContext } from './toolExecutor';
import { buildSystemPrompt } from './systemPrompt';
import type { WorkflowSnapshot } from './contextEngine';
import { validateWorkflow } from '../../utils/validator';
import { humanizeAiError } from './errorMessages';
import type { WorkflowDef } from '../../types/conductor';
import type { WorkflowLevel } from '../../types/workflowLibrary';
import type { AiEvent } from '../../types/aiEvents';
import type { UseBoundStore, StoreApi } from 'zustand';

// Run-mode tools: read-only + repair proposer (no workflow-modifying tools)
const RUN_MODE_TOOL_DEFINITIONS = TOOL_DEFINITIONS.filter(t =>
    ['get_workflow_state', 'validate_workflow', 'search_workflow_library', 'propose_repair'].includes(t.function.name)
);

const MAX_AGENT_STEPS = 6;
const MAX_SELF_HEAL = 2;

const TOOL_STATUS_LABELS: Record<string, string> = {
    get_workflow_state: '正在读取工作流状态…',
    search_workflow_library: '正在搜索工作流库…',
    validate_workflow: '正在校验工作流…',
    replace_workflow: '正在生成新工作流…',
    patch_workflow: '正在应用变更…',
    propose_plan: '正在生成执行计划…',
};

/** Past-tense labels for AgentTimeline entries once a read-only tool call completes. */
const TOOL_DONE_LABELS: Record<string, string> = {
    get_workflow_state: '已读取工作流状态',
    search_workflow_library: '已搜索工作流库',
    validate_workflow: '已校验工作流',
};

export interface AgentRunnerOptions {
    systemPrompt?: string;
    systemPromptExtra?: string;
    aiPermissions?: {
        canEdit?: boolean;
        canRepair?: boolean;
    };
    onAiEvent?: (event: AiEvent) => void;
}

export interface AgentRunnerStores {
    aiStore: UseBoundStore<StoreApi<AiStore>>;
    libraryStore: UseBoundStore<StoreApi<LibraryStore>>;
    toolRegistry: ToolRegistry;
}

function snapshotWorkflow(): WorkflowSnapshot {
    const s = useWorkflowStore.getState();
    return {
        workflowDef: s.workflowDef,
        edges: s.edges,
        selectedTask: s.selectedTask,
        executionData: s.executionData,
        mode: s.mode,
        workflowInstance: s.workflowInstance,
        taskMap: s.taskMap,
        validationResults: s.validationResults,
    };
}

export class AgentRunner {
    private controller: AbortController | null = null;

    constructor(
        private getOptions: () => AgentRunnerOptions,
        private stores: AgentRunnerStores,
    ) {}

    abort(): void {
        this.controller?.abort();
    }

    private toolExecutionContext(): ToolExecutionContext {
        const s = useWorkflowStore.getState();
        return {
            workflowDef: s.workflowDef,
            validationResults: s.validationResults,
            libraryItems: this.stores.libraryStore.getState().items,
        };
    }

    private buildHistory(userInput: string, priorMessages: AiStore['messages']): Message[] {
        const { systemPrompt, systemPromptExtra } = this.getOptions();
        const viewMode = useWorkflowStore.getState().viewMode;
        const pendingProposalDef = this.stores.aiStore.getState().pendingProposal?.proposedDef;
        const systemContent = buildSystemPrompt(
            userInput,
            snapshotWorkflow(),
            this.stores.libraryStore.getState().items,
            { systemPrompt, systemPromptExtra, viewMode, pendingProposalDef },
        );
        const history: Message[] = [{ role: 'system', content: systemContent }];
        const recent = priorMessages.slice(-20);
        for (const msg of recent) {
            if (msg.id === 'welcome') continue;
            history.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
        }
        history.push({ role: 'user', content: userInput });
        return history;
    }

    async send(text: string): Promise<void> {
        const ai = this.stores.aiStore;
        const toolRegistry = this.stores.toolRegistry;
        const store = ai.getState();
        if (!text.trim() || store.isStreaming) return;

        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        const { signal } = controller;

        // Snapshot messages BEFORE adding the new user turn — buildHistory appends
        // userInput itself, so using the pre-add list avoids double-counting it.
        const priorMessages = store.messages;
        store.addMessage({ role: 'user', content: text });
        store.setRetryInput(null);
        store.clearFollowUpChips();
        store.setStreaming(true);
        store.setStreamingText('');
        store.setToolStatus('');
        store.clearTimeline();

        const { aiPermissions, onAiEvent } = this.getOptions();
        const config = ai.getState().config;

        // apiKey is only required in direct mode — endpoint/custom transports don't need one.
        if (!config.apiKey && !config.transport) {
            store.addMessage({ role: 'assistant', content: '⚠️ 未配置 API Key。请点击上方 ⚙️ 按钮配置 AI 服务后重试。' });
            store.setStreaming(false);
            return;
        }

        const assistantMsgId = store.addMessage({ role: 'assistant', content: '' });

        try {
            const agentHistory: Message[] = this.buildHistory(text, priorMessages);
            const customDefs = toolRegistry.getDefinitions();
            const mode = useWorkflowStore.getState().mode;
            const editAllowed = aiPermissions?.canEdit !== false;
            const repairAllowed = aiPermissions?.canRepair !== false;
            let activeDefs = mode === 'run' || !editAllowed
                ? RUN_MODE_TOOL_DEFINITIONS
                : [...TOOL_DEFINITIONS, ...customDefs];
            if (!repairAllowed) {
                activeDefs = activeDefs.filter(d => d.function.name !== 'propose_repair');
            }

            let fullAssistantText = '';
            let selfHealCount = 0;

            // ─── Agentic loop ───────────────────────────────────────────────
            for (let step = 0; step < MAX_AGENT_STEPS; step++) {
                if (signal.aborted) break;

                ai.getState().setStreamingText('');
                if (step > 0) ai.getState().setToolStatus(`🔄 步骤 ${step + 1}…`);

                const stepToolCalls: Array<{ id: string; name: string; args: Record<string, any> }> = [];
                let stepText = '';

                for await (const event of streamChat(agentHistory, activeDefs, config, signal)) {
                    if (signal.aborted) break;
                    switch (event.type) {
                        case 'text':
                            stepText += event.content;
                            ai.getState().appendStreamingText(event.content);
                            break;
                        case 'tool_call':
                            stepToolCalls.push({ id: event.id, name: event.name, args: event.args });
                            break;
                        case 'error': {
                            const humanized = humanizeAiError(event.message);
                            stepText += `\n\n❌ ${humanized.display}`;
                            onAiEvent?.({ type: 'ai:error', timestamp: Date.now(), rawMessage: humanized.raw });
                            break;
                        }
                        case 'usage':
                            ai.getState().recordUsage({ promptTokens: event.promptTokens, completionTokens: event.completionTokens });
                            break;
                    }
                }

                if (stepText) {
                    fullAssistantText += (fullAssistantText ? '\n\n' : '') + stepText;
                }

                if (!stepToolCalls.length || signal.aborted) break;

                agentHistory.push({ role: 'assistant', content: stepText, tool_calls: stepToolCalls });

                // ─── Execute tool calls ─────────────────────────────────────
                const toolResultMsgs: Message[] = [];
                let pendingProposalResult: {
                    proposed: WorkflowDef;
                    diff: DiffSummary;
                    inferredLevel?: WorkflowLevel;
                } | null = null;
                let pendingPlanResult: { title: string; steps: any[]; summary?: string } | null = null;

                for (const tc of stepToolCalls) {
                    if (signal.aborted) break;
                    ai.getState().setToolStatus(TOOL_STATUS_LABELS[tc.name] ?? `执行 ${tc.name}…`);
                    onAiEvent?.({ type: 'tool:called', timestamp: Date.now(), tool: tc.name });

                    if (tc.name === 'propose_repair') {
                        toolResultMsgs.push({ role: 'tool', content: '修复方案已展示给用户，等待用户执行操作。', tool_call_id: tc.id });
                        ai.getState().setRepair({
                            diagnosis: tc.args.diagnosis ?? '未提供诊断信息',
                            actions: tc.args.actions ?? [],
                            messageId: assistantMsgId,
                        });
                        ai.getState().addTimelineEntry('已生成修复方案');
                        onAiEvent?.({ type: 'repair:proposed', timestamp: Date.now() });
                        break;
                    }

                    if (tc.name === 'ask_clarification') {
                        toolResultMsgs.push({ role: 'tool', content: '澄清问题已展示给用户，等待用户回复。', tool_call_id: tc.id });
                        ai.getState().setClarification({
                            question: tc.args.question ?? '请告诉我更多详情',
                            context: tc.args.context,
                            options: tc.args.options ?? [],
                            messageId: assistantMsgId,
                        });
                        ai.getState().addTimelineEntry('准备澄清问题');
                        break;
                    }

                    if (tc.name === 'recommend_workflow') {
                        toolResultMsgs.push({ role: 'tool', content: '已向用户展示相似工作流推荐，等待用户选择。', tool_call_id: tc.id });
                        ai.getState().setRecommendation({
                            userIntent: tc.args.userIntent ?? '',
                            recommendations: tc.args.recommendations ?? [],
                            messageId: assistantMsgId,
                        });
                        ai.getState().addTimelineEntry('已匹配推荐工作流');
                        break;
                    }

                    if (tc.name === 'propose_plan') {
                        pendingPlanResult = {
                            title: tc.args.title ?? '执行计划',
                            steps: tc.args.steps ?? [],
                            summary: tc.args.summary,
                        };
                        toolResultMsgs.push({ role: 'tool', content: '计划已展示给用户，等待确认后执行。', tool_call_id: tc.id });
                        ai.getState().addTimelineEntry('已生成执行计划');
                        break;
                    }

                    const customTool = toolRegistry.get(tc.name);
                    if (customTool) {
                        let resultContent: string;
                        try {
                            resultContent = await Promise.resolve(customTool.execute(tc.args));
                            ai.getState().addTimelineEntry(`已执行 ${tc.name}`);
                        } catch (err: any) {
                            resultContent = `工具执行失败：${err.message ?? '未知错误'}`;
                            ai.getState().addTimelineEntry(`${tc.name} 执行失败`, 'warning');
                        }
                        toolResultMsgs.push({ role: 'tool', content: resultContent, tool_call_id: tc.id });
                        continue;
                    }

                    let result: ReturnType<typeof executeToolCall>;
                    try {
                        result = executeToolCall(tc.name, tc.args, this.toolExecutionContext());
                    } catch (err: any) {
                        toolResultMsgs.push({ role: 'tool', content: `工具执行出错：${err?.message ?? '未知错误'}`, tool_call_id: tc.id });
                        ai.getState().addTimelineEntry(`${tc.name} 执行出错`, 'warning');
                        continue;
                    }
                    let resultContent: string;

                    if (result.type === 'propose' && result.proposed && result.diff) {
                        const validation = validateWorkflow(result.proposed);
                        if (validation.errors.length > 0 && selfHealCount < MAX_SELF_HEAL) {
                            selfHealCount++;
                            const errList = validation.errors.map(e => `• ${e.message}`).join('\n');
                            resultContent = `工作流已生成，但存在 ${validation.errors.length} 个校验错误，请修复后重新生成：\n${errList}`;
                            // Self-heal made visible as its own timeline entry rather than a silent retry.
                            ai.getState().addTimelineEntry(
                                `发现 ${validation.errors.length} 处校验问题，正在自动修正…`, 'warning',
                            );
                        } else {
                            pendingProposalResult = { proposed: result.proposed, diff: result.diff, inferredLevel: result.inferredLevel };
                            const desc = describeDiff(result.diff);
                            const warnNote = validation.errors.length > 0 ? ` ⚠️ 含 ${validation.errors.length} 个校验错误` : '';
                            resultContent = `变更方案已生成${warnNote}：${desc}。等待用户确认。`;
                            const stepCount = result.proposed.tasks?.length ?? 0;
                            ai.getState().addTimelineEntry(
                                `已生成方案 · 共 ${stepCount} 个步骤`, validation.errors.length > 0 ? 'warning' : 'done',
                            );
                        }
                    } else if (result.type === 'info') {
                        resultContent = result.text ?? '';
                        ai.getState().addTimelineEntry(TOOL_DONE_LABELS[tc.name] ?? `已执行 ${tc.name}`);
                    } else {
                        resultContent = `错误：${result.text ?? '未知错误'}`;
                        ai.getState().addTimelineEntry(`${tc.name} 执行出错`, 'warning');
                    }

                    toolResultMsgs.push({ role: 'tool', content: resultContent, tool_call_id: tc.id });
                }

                // Ensure every tool call in this step has a matching tool result message.
                // propose_repair / propose_plan break the inner loop early, leaving
                // any sibling tools without results — Anthropic rejects mismatched history.
                const coveredIds = new Set(toolResultMsgs.map(m => (m as any).tool_call_id));
                for (const tc of stepToolCalls) {
                    if (!coveredIds.has(tc.id)) {
                        toolResultMsgs.push({ role: 'tool', content: '操作已中止，等待用户确认后继续。', tool_call_id: tc.id });
                    }
                }

                agentHistory.push(...toolResultMsgs);

                if (ai.getState().pendingRepair?.messageId === assistantMsgId) {
                    fullAssistantText += (fullAssistantText ? '\n\n' : '') + '🔧 我已诊断出故障原因并准备了修复方案，请查看下方修复卡片。';
                    break;
                }
                if (ai.getState().pendingClarification?.messageId === assistantMsgId) break;
                if (ai.getState().pendingRecommendation?.messageId === assistantMsgId) break;

                if (pendingPlanResult) {
                    ai.getState().setPlan({
                        title: pendingPlanResult.title,
                        steps: pendingPlanResult.steps,
                        summary: pendingPlanResult.summary,
                        messageId: assistantMsgId,
                    });
                    onAiEvent?.({ type: 'plan:created', timestamp: Date.now() });
                    fullAssistantText += (fullAssistantText ? '\n\n' : '') + '📋 我已为你准备了一个执行计划，请查看下方方案并确认是否执行。';
                    break;
                }

                if (pendingProposalResult) {
                    ai.getState().setProposal({
                        proposedDef: pendingProposalResult.proposed,
                        diff: pendingProposalResult.diff,
                        inferredLevel: pendingProposalResult.inferredLevel,
                        messageId: assistantMsgId,
                    });
                    onAiEvent?.({
                        type: 'proposal:created', timestamp: Date.now(),
                        diff: { added: pendingProposalResult.diff.added.length, modified: pendingProposalResult.diff.modified.length, removed: pendingProposalResult.diff.removed.length },
                        inferredLevel: pendingProposalResult.inferredLevel,
                    });
                    const desc = describeDiff(pendingProposalResult.diff);
                    const levelNote = pendingProposalResult.inferredLevel ? ` · ${pendingProposalResult.inferredLevel}` : '';
                    fullAssistantText += `\n\n---\n✅ **已生成变更方案${levelNote}**：${desc}\n请在下方确认或拒绝此变更。`;
                    break;
                }

                // No proposal yet: continue loop to get model's response to tool results
            }

            ai.getState().setToolStatus('');
            ai.getState().updateMessage(assistantMsgId, fullAssistantText.trim() || '收到，已处理。');
        } catch (err: any) {
            ai.getState().setToolStatus('');
            if (err.name !== 'AbortError') {
                const humanized = humanizeAiError(err?.message);
                ai.getState().updateMessage(assistantMsgId, `❌ ${humanized.display}`);
                onAiEvent?.({ type: 'ai:error', timestamp: Date.now(), rawMessage: humanized.raw });
                ai.getState().setRetryInput(text);
            } else {
                const cur = ai.getState().messages.find(m => m.id === assistantMsgId);
                if (!cur?.content) ai.getState().updateMessage(assistantMsgId, '（已中止）');
            }
        } finally {
            ai.getState().setStreaming(false);
            ai.getState().setStreamingText('');
            ai.getState().setToolStatus('');
        }
    }
}
