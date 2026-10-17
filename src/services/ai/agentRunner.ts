/**
 * AgentRunner — PI-Style Durable Agent Runtime & Progressive Workflow Synthesizer
 *
 * Capabilities:
 * 1. Multi-step tool-calling loop with adaptive step budget (6 for standard turns,
 *    expanded to 10 when progressive 4-phase workflow synthesis is active).
 * 2. Progressive 4-phase workflow synthesis (`init_workflow_blueprint` ->
 *    `scaffold_workflow_topology` -> `configure_workflow_tasks` -> `commit_workflow_proposal`)
 *    over an in-session `workingDraft`.
 * 3. Deep semantic & data-flow verification with targeted self-healing.
 * 4. Durable step-level checkpointing (`DurableSessionCheckpoint`): preserves
 *    `agentHistory`, `workingDraft`, `phase`, and `stepIndex` across mid-run
 *    network failures or user pauses so execution can be resumed (`resume()`)
 *    or committed immediately (`commitDraftNow()`) without losing completed stages.
 */

import useWorkflowStore from '../../store/workflowStore';
import type { AiStore, DurableSessionCheckpoint } from '../../store/aiStore';
import type { LibraryStore } from '../../store/libraryStore';
import type { ToolRegistry } from './toolRegistry';
import { streamChat } from './protocolAdapter';
import type { Message } from './protocolAdapter';
import { TOOL_DEFINITIONS } from './toolDefs';
import { executeToolCall, describeDiff } from './toolExecutor';
import type { DiffSummary, ToolExecutionContext } from './toolExecutor';
import { buildSystemPrompt } from './systemPrompt';
import type { WorkflowSnapshot } from './contextEngine';
import { verifyWorkflowSemantics, type SynthesisPhase, type VerificationSummary } from './workflowSynthesizer';
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
const MAX_SYNTHESIS_STEPS = 10;
const MAX_SELF_HEAL = 2;

const TOOL_STATUS_LABELS: Record<string, string> = {
    init_workflow_blueprint: '阶段 1/4：正在定义工作流元信息与参数契约…',
    scaffold_workflow_topology: '阶段 2/4：正在编排整体任务拓扑与控制流…',
    configure_workflow_tasks: '阶段 3/4：正在补充任务参数与上下游数据流…',
    commit_workflow_proposal: '阶段 4/4：正在执行整体语义与数据流校验…',
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

    private toolExecutionContext(workingDraft?: WorkflowDef | null): ToolExecutionContext {
        const s = useWorkflowStore.getState();
        return {
            workflowDef: s.workflowDef,
            workingDraft: workingDraft ?? this.stores.aiStore.getState().workingDraft,
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

    /**
     * Immediately promotes the current in-progress `workingDraft` (from an interrupted or paused
     * multi-phase session) into a reviewable `pendingProposal`.
     */
    commitDraftNow(): boolean {
        const ai = this.stores.aiStore;
        const draft = ai.getState().workingDraft ?? ai.getState().durableCheckpoint?.workingDraft;
        if (!draft || !Array.isArray(draft.tasks) || draft.tasks.length === 0) {
            return false;
        }
        const result = executeToolCall('commit_workflow_proposal', {}, this.toolExecutionContext(draft));
        if (result.type === 'propose' && result.proposed && result.diff) {
            const lastAssistant = [...ai.getState().messages].reverse().find(m => m.role === 'assistant' && m.id !== 'welcome');
            const messageId = lastAssistant?.id ?? ai.getState().addMessage({ role: 'assistant', content: '已采用当前阶段的工作流草稿。' });
            ai.getState().setProposal({
                proposedDef: result.proposed,
                diff: result.diff,
                inferredLevel: result.inferredLevel,
                verification: result.verification,
                messageId,
            });
            ai.getState().saveCheckpoint(null);
            ai.getState().setSynthesisStage('completed', null);
            this.getOptions().onAiEvent?.({
                type: 'proposal:created',
                timestamp: Date.now(),
                diff: {
                    added: result.diff.added.length,
                    modified: result.diff.modified.length,
                    removed: result.diff.removed.length,
                },
                inferredLevel: result.inferredLevel,
            });
            return true;
        }
        return false;
    }

    /**
     * Resumes an interrupted or paused durable session from its last saved checkpoint.
     * Optionally accepts a `steerInput` instruction from the user to guide the remaining phases.
     */
    async resume(steerInput?: string): Promise<void> {
        const ai = this.stores.aiStore;
        const store = ai.getState();
        const checkpoint = store.durableCheckpoint;
        if (!checkpoint || store.isStreaming) return;

        const { onAiEvent } = this.getOptions();
        onAiEvent?.({ type: 'session:resumed', timestamp: Date.now(), phase: checkpoint.phase });

        const history = [...checkpoint.agentHistory];
        let assistantMsgId = checkpoint.assistantMsgId;

        if (steerInput && steerInput.trim()) {
            store.addMessage({ role: 'user', content: steerInput.trim() });
            history.push({ role: 'user', content: steerInput.trim() });
            assistantMsgId = store.addMessage({ role: 'assistant', content: '' });
        } else if (!store.messages.some(m => m.id === assistantMsgId)) {
            assistantMsgId = store.addMessage({ role: 'assistant', content: '' });
        }

        await this.runDurableLoop({
            sessionId: checkpoint.sessionId,
            userPrompt: checkpoint.userPrompt,
            assistantMsgId,
            agentHistory: history,
            initialDraft: checkpoint.workingDraft,
            initialPhase: checkpoint.phase,
            startStep: checkpoint.stepIndex,
            initialSelfHealCount: checkpoint.selfHealCount,
        });
    }

    async send(text: string): Promise<void> {
        const ai = this.stores.aiStore;
        const store = ai.getState();
        if (!text.trim() || store.isStreaming) return;

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
        store.setSynthesisStage('idle', null);
        store.saveCheckpoint(null);

        const config = ai.getState().config;

        // apiKey is only required in direct mode — endpoint/custom transports don't need one.
        if (!config.apiKey && !config.transport) {
            store.addMessage({ role: 'assistant', content: '⚠️ 未配置 API Key。请点击上方 ⚙️ 按钮配置 AI 服务后重试。' });
            store.setStreaming(false);
            return;
        }

        const assistantMsgId = store.addMessage({ role: 'assistant', content: '' });
        const agentHistory = this.buildHistory(text, priorMessages);

        await this.runDurableLoop({
            sessionId: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userPrompt: text,
            assistantMsgId,
            agentHistory,
            initialDraft: null,
            initialPhase: 'idle',
            startStep: 0,
            initialSelfHealCount: 0,
        });
    }

    private async runDurableLoop(params: {
        sessionId: string;
        userPrompt: string;
        assistantMsgId: string;
        agentHistory: Message[];
        initialDraft: WorkflowDef | null;
        initialPhase: SynthesisPhase;
        startStep: number;
        initialSelfHealCount: number;
    }): Promise<void> {
        const ai = this.stores.aiStore;
        const toolRegistry = this.stores.toolRegistry;
        const { aiPermissions, onAiEvent } = this.getOptions();
        const config = ai.getState().config;

        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        const { signal } = controller;

        ai.getState().setStreaming(true);
        ai.getState().setStreamingText('');
        ai.getState().setToolStatus('');

        const {
            sessionId,
            userPrompt,
            assistantMsgId,
            agentHistory,
        } = params;

        let workingDraft: WorkflowDef | null = params.initialDraft;
        let currentPhase: SynthesisPhase = params.initialPhase;
        let selfHealCount = params.initialSelfHealCount;
        let currentStep = params.startStep;

        if (workingDraft || currentPhase !== 'idle') {
            ai.getState().setSynthesisStage(currentPhase, workingDraft);
        }

        const persistCheckpoint = (status: DurableSessionCheckpoint['status'], lastError?: string) => {
            // Only keep a resumable checkpoint on pause/failure if we have meaningful progress
            // (either a workingDraft or at least 1 completed tool step).
            if (status === 'completed') {
                ai.getState().saveCheckpoint(null);
                return;
            }
            ai.getState().saveCheckpoint({
                sessionId,
                userPrompt,
                assistantMsgId,
                phase: currentPhase,
                workingDraft,
                agentHistory: [...agentHistory],
                stepIndex: currentStep,
                selfHealCount,
                status,
                lastError,
                updatedAt: Date.now(),
            });
        };

        try {
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

            const existingMsg = ai.getState().messages.find(m => m.id === assistantMsgId);
            let fullAssistantText = existingMsg?.content ?? '';

            // ─── Durable Agentic Loop ───────────────────────────────────────
            for (let step = params.startStep; ; step++) {
                const maxSteps = (workingDraft !== null || currentPhase !== 'idle')
                    ? MAX_SYNTHESIS_STEPS
                    : MAX_AGENT_STEPS;
                if (step >= maxSteps || signal.aborted) break;
                currentStep = step;

                ai.getState().setStreamingText('');
                if (step > 0 && currentPhase === 'idle') {
                    ai.getState().setToolStatus(`🔄 步骤 ${step + 1}…`);
                }

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
                    verification?: VerificationSummary;
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
                        result = executeToolCall(tc.name, tc.args, this.toolExecutionContext(workingDraft));
                    } catch (err: any) {
                        toolResultMsgs.push({ role: 'tool', content: `工具执行出错：${err?.message ?? '未知错误'}`, tool_call_id: tc.id });
                        ai.getState().addTimelineEntry(`${tc.name} 执行出错`, 'warning');
                        continue;
                    }
                    let resultContent: string;

                    if (result.type === 'stage') {
                        if (result.workingDraft) workingDraft = result.workingDraft;
                        if (result.phase) currentPhase = result.phase;
                        ai.getState().setSynthesisStage(currentPhase, workingDraft);
                        if (result.timelineLabel) {
                            ai.getState().addTimelineEntry(result.timelineLabel, 'done');
                        }
                        onAiEvent?.({ type: 'stage:completed', timestamp: Date.now(), phase: currentPhase });
                        resultContent = result.text ?? '阶段已完成。';
                    } else if (result.type === 'propose' && result.proposed && result.diff) {
                        const verification = result.verification ?? verifyWorkflowSemantics(result.proposed);
                        if (verification.errors.length > 0 && selfHealCount < MAX_SELF_HEAL) {
                            selfHealCount++;
                            workingDraft = result.proposed;
                            currentPhase = 'verify';
                            ai.getState().setSynthesisStage('verify', workingDraft);
                            const errList = verification.errors.map(e => `• [${e.ref || 'GLOBAL'}] ${e.message}`).join('\n');
                            resultContent = `工作流已生成，但整体校验发现 ${verification.errors.length} 个错误，请通过 configure_workflow_tasks 或 replace_workflow 修复后重新提交：\n${errList}`;
                            ai.getState().addTimelineEntry(
                                `发现 ${verification.errors.length} 处校验问题，正在自动修正…`, 'warning',
                            );
                        } else {
                            workingDraft = result.proposed;
                            currentPhase = 'completed';
                            ai.getState().setSynthesisStage('completed', workingDraft);
                            pendingProposalResult = {
                                proposed: result.proposed,
                                diff: result.diff,
                                inferredLevel: result.inferredLevel,
                                verification,
                            };
                            const desc = describeDiff(result.diff);
                            const warnNote = verification.errors.length > 0 ? ` ⚠️ 含 ${verification.errors.length} 个校验错误` : '';
                            resultContent = `变更方案已生成${warnNote}：${desc}。等待用户确认。`;
                            const stepCount = verification.totalTasks || (result.proposed.tasks?.length ?? 0);
                            ai.getState().addTimelineEntry(
                                `已生成方案 · 共 ${stepCount} 个步骤`, verification.errors.length > 0 ? 'warning' : 'done',
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
                const coveredIds = new Set(toolResultMsgs.map(m => (m as any).tool_call_id));
                for (const tc of stepToolCalls) {
                    if (!coveredIds.has(tc.id)) {
                        toolResultMsgs.push({ role: 'tool', content: '操作已中止，等待用户确认后继续。', tool_call_id: tc.id });
                    }
                }

                agentHistory.push(...toolResultMsgs);
                currentStep = step + 1;
                persistCheckpoint('running');

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
                        verification: pendingProposalResult.verification,
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

                // Continue loop to next stage / model response
            }

            // Safety Net: If progressive synthesis built a non-empty workingDraft
            // and the model finished speaking without calling commit_workflow_proposal
            // (and wasn't aborted), automatically verify & commit the draft as a proposal!
            if (
                !signal.aborted &&
                workingDraft &&
                Array.isArray(workingDraft.tasks) &&
                workingDraft.tasks.length > 0 &&
                !ai.getState().pendingProposal
            ) {
                const autoCommit = executeToolCall('commit_workflow_proposal', {}, this.toolExecutionContext(workingDraft));
                if (autoCommit.type === 'propose' && autoCommit.proposed && autoCommit.diff) {
                    currentPhase = 'completed';
                    ai.getState().setSynthesisStage('completed', autoCommit.proposed);
                    ai.getState().addTimelineEntry(
                        `阶段 4/4：已完成整体校验并生成方案 · 共 ${autoCommit.verification?.totalTasks ?? autoCommit.proposed.tasks.length} 个步骤`,
                        autoCommit.verification && !autoCommit.verification.isValid ? 'warning' : 'done',
                    );
                    ai.getState().setProposal({
                        proposedDef: autoCommit.proposed,
                        diff: autoCommit.diff,
                        inferredLevel: autoCommit.inferredLevel,
                        verification: autoCommit.verification,
                        messageId: assistantMsgId,
                    });
                    onAiEvent?.({
                        type: 'proposal:created', timestamp: Date.now(),
                        diff: {
                            added: autoCommit.diff.added.length,
                            modified: autoCommit.diff.modified.length,
                            removed: autoCommit.diff.removed.length,
                        },
                        inferredLevel: autoCommit.inferredLevel,
                    });
                    const desc = describeDiff(autoCommit.diff);
                    const levelNote = autoCommit.inferredLevel ? ` · ${autoCommit.inferredLevel}` : '';
                    fullAssistantText += `\n\n---\n✅ **已生成变更方案${levelNote}**：${desc}\n请在下方确认或拒绝此变更。`;
                }
            }

            if (signal.aborted) {
                if (workingDraft || currentStep > 0) {
                    persistCheckpoint('paused');
                }
                const cur = ai.getState().messages.find(m => m.id === assistantMsgId);
                if (!cur?.content && !fullAssistantText.trim()) {
                    ai.getState().updateMessage(assistantMsgId, '（已中止）');
                } else if (fullAssistantText.trim()) {
                    ai.getState().updateMessage(assistantMsgId, fullAssistantText.trim());
                }
            } else {
                persistCheckpoint('completed');
                ai.getState().setToolStatus('');
                ai.getState().updateMessage(assistantMsgId, fullAssistantText.trim() || '收到，已处理。');
            }
        } catch (err: any) {
            ai.getState().setToolStatus('');
            if (err.name !== 'AbortError') {
                const humanized = humanizeAiError(err?.message);
                ai.getState().updateMessage(assistantMsgId, `❌ ${humanized.display}`);
                onAiEvent?.({ type: 'ai:error', timestamp: Date.now(), rawMessage: humanized.raw });
                if (workingDraft || currentStep > 0) {
                    persistCheckpoint('failed', humanized.display);
                } else {
                    ai.getState().setRetryInput(userPrompt);
                }
            } else {
                if (workingDraft || currentStep > 0) {
                    persistCheckpoint('paused');
                }
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
