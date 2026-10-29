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
import type { LibraryCatalog } from '../../library/catalog';
import { entriesToLibraryItems } from '../../library/projections';
import type { ToolRegistry } from './toolRegistry';
import { streamChat } from './protocolAdapter';
import type { Message } from './protocolAdapter';
import { TOOL_DEFINITIONS } from './toolDefs';
import { executeToolCall, describeDiff, LIBRARY_SEARCH_RESULT_LIMIT } from './toolExecutor';
import type { DiffSummary, ToolExecutionContext } from './toolExecutor';
import { buildSystemPrompt } from './systemPrompt';
import type { WorkflowSnapshot } from './contextEngine';
import { verifyWorkflowSemantics, type SynthesisPhase, type VerificationSummary } from './workflowSynthesizer';
import { humanizeAiError, type AiTransportMode } from './errorMessages';
import type { WorkflowDef } from '../../types/conductor';
import type { WorkflowLevel, WorkflowLibraryItem } from '../../types/workflowLibrary';
import type { AiEvent } from '../../types/aiEvents';
import type { UseBoundStore, StoreApi } from 'zustand';

// Run-mode tools: read-only + repair proposer (no workflow-modifying tools)
const RUN_MODE_TOOL_DEFINITIONS = TOOL_DEFINITIONS.filter(t =>
    ['get_workflow_state', 'validate_workflow', 'search_workflow_library', 'propose_repair'].includes(t.function.name)
);

/** 编辑模式不提供 propose_repair（修复动作只对运行中的实例有意义） */
const EDIT_MODE_EXCLUDED_TOOLS = new Set(['propose_repair']);

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
    load_library_workflow: '正在加载流程库中的工作流…',
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
    /** 流程库目录注入系统提示词的条数上限（缺省 50）；超出部分提示 AI 改用 search_workflow_library */
    promptCatalogLimit?: number;
    /** 任务 Schema 注入系统提示词的条数上限（缺省不限制） */
    promptSchemaLimit?: number;
}

export interface AgentRunnerStores {
    aiStore: UseBoundStore<StoreApi<AiStore>>;
    libraryStore: UseBoundStore<StoreApi<LibraryStore>>;
    toolRegistry: ToolRegistry;
    /** 本 IDE 实例的流程库目录；提供后用于固定子工作流版本与服务端检索 */
    libraryCatalog?: LibraryCatalog;
}

/** 模型返回的流错误（HTTP 401 / 429 / 5xx 等）：与抛出的异常走同一条失败路径 */
class AiStreamError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AiStreamError';
    }
}

/** 校验错误的去重键：用于区分"画布原有的错误"与"本次方案新引入的错误" */
const errorKey = (e: { ref?: string; message: string }) => `${e.ref ?? ''}|${e.message}`;

export interface SendOptions {
    /**
     * 发给模型的文本（缺省等于展示文本）。用于把聊天里看不到的上下文一起带给模型，
     * 例如"执行方案"要附上计划步骤、澄清选项要附上原问题。
     */
    modelText?: string;
    /**
     * A18：有未完成的断点时，默认先不发送，交给界面让用户选择；传 true 表示用户已确认放弃断点。
     */
    discardCheckpoint?: boolean;
}

/** 把待执行计划整理成随"执行方案"一起发给模型的文本（计划卡片的步骤不在聊天记录里） */
export function formatPlanForModel(plan: { title: string; steps: Array<{ step: number; action: string; tool?: string }>; summary?: string }): string {
    const lines = [`请按照下面这份已确认的计划执行，完成后生成变更方案：`, `计划：${plan.title}`];
    for (const st of plan.steps ?? []) {
        lines.push(`${st.step}. ${st.action}${st.tool ? `（${st.tool}）` : ''}`);
    }
    if (plan.summary) lines.push(`预期效果：${plan.summary}`);
    return lines.join('\n');
}

/** 把用户选择的澄清选项连同原问题一起整理给模型（只发标签时模型不知道在回答什么） */
export function formatClarificationAnswer(
    clarification: { question: string; context?: string },
    option: { label: string; description?: string },
): string {
    const desc = option.description ? `（${option.description}）` : '';
    const ctx = clarification.context ? `\n你之前的理解：${clarification.context}` : '';
    return `关于你的问题「${clarification.question}」，我的选择是：${option.label}${desc}${ctx}\n请按这个选择继续。`;
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
    /** reset() 之后，仍在收尾的旧会话不能再写断点 / 消息（否则"清空对话"后断点卡片又回来了） */
    private generation = 0;

    constructor(
        private getOptions: () => AgentRunnerOptions,
        private stores: AgentRunnerStores,
    ) {}

    abort(): void {
        this.controller?.abort();
    }

    /** 中止当前会话并丢弃它的收尾写入（断点、消息、流式状态）。用于"清空对话"。 */
    reset(): void {
        this.generation++;
        this.controller?.abort();
        this.controller = null;
    }

    private transportMode(): AiTransportMode {
        return this.stores.aiStore.getState().config.transport?.type ?? 'direct';
    }

    private toolExecutionContext(workingDraft?: WorkflowDef | null): ToolExecutionContext {
        const s = useWorkflowStore.getState();
        return {
            workflowDef: s.workflowDef,
            workingDraft: workingDraft ?? this.stores.aiStore.getState().workingDraft,
            validationResults: s.validationResults,
            libraryItems: this.stores.libraryStore.getState().items,
            resolveLatestVersion: this.latestVersionResolver(),
        };
    }

    /** 子工作流版本固定：把目录里的「当前最新版本」以查询函数的形式注入纯函数的工具执行层 */
    private latestVersionResolver(): ToolExecutionContext['resolveLatestVersion'] {
        const catalog = this.stores.libraryCatalog;
        if (!catalog) return undefined;
        return (name: string) => catalog.latest(name)?.version;
    }

    private buildHistory(userInput: string, priorMessages: AiStore['messages']): Message[] {
        const { systemPrompt, systemPromptExtra, promptCatalogLimit, promptSchemaLimit } = this.getOptions();
        const viewMode = useWorkflowStore.getState().viewMode;
        const pendingProposalDef = this.stores.aiStore.getState().pendingProposal?.proposedDef;
        const systemContent = buildSystemPrompt(
            userInput,
            snapshotWorkflow(),
            this.stores.libraryStore.getState().items,
            { systemPrompt, systemPromptExtra, viewMode, pendingProposalDef, promptCatalogLimit, promptSchemaLimit },
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

    /** 服务端检索：Provider 没有 search、或检索失败时返回 undefined（调用方退回本地匹配） */
    private async serverLibrarySearch(args: Record<string, any>): Promise<WorkflowLibraryItem[] | undefined> {
        const catalog = this.stores.libraryCatalog;
        if (!catalog?.hasServerSearch()) return undefined;
        try {
            const hits = await catalog.search(
                String(args.query ?? ''),
                {
                    level: args.level as WorkflowLevel | undefined,
                    domain: typeof args.domain === 'string' && args.domain.trim() ? args.domain.trim() : undefined,
                    limit: LIBRARY_SEARCH_RESULT_LIMIT,
                },
                this.controller?.signal,
            );
            if (!hits) return undefined;
            return entriesToLibraryItems(hits);
        } catch {
            if (this.controller?.signal.aborted) return undefined;
            this.stores.aiStore.getState().addTimelineEntry('服务端检索失败，已改用本地目录匹配', 'warning');
            return undefined;
        }
    }

    /** 取流程库中某个工作流的完整定义（目录未提供 / 取不到时返回 null） */
    private async fetchLibraryDefinition(name: string, version?: number, signal?: AbortSignal): Promise<WorkflowDef | null> {
        const catalog = this.stores.libraryCatalog;
        if (!catalog || !name) return null;
        const v = version ?? catalog.latest(name)?.version;
        if (v === undefined) return null;
        try {
            const record = await catalog.getVersion(name, v, signal);
            return record?.def ?? null;
        } catch {
            return null;
        }
    }

    private publishProposal(
        result: { proposed: WorkflowDef; diff: DiffSummary; inferredLevel?: WorkflowLevel; verification?: VerificationSummary },
        messageId: string,
    ): void {
        this.stores.aiStore.getState().setProposal({
            proposedDef: result.proposed,
            diff: result.diff,
            inferredLevel: result.inferredLevel,
            verification: result.verification,
            messageId,
        });
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
    }

    /**
     * 推荐卡片"直接使用"：不经过模型，直接把流程库中的工作流变成待确认方案。
     * 流程库提供完整定义时打开该定义；只有摘要时以 SUB_WORKFLOW 步骤引用它。
     * 返回是否生成了方案。
     */
    async useLibraryWorkflow(name: string): Promise<boolean> {
        const ai = this.stores.aiStore;
        if (ai.getState().isStreaming) return false;
        const { aiPermissions } = this.getOptions();
        if (aiPermissions?.canEdit === false) {
            ai.getState().addMessage({ role: 'assistant', content: 'AI 当前处于只读模式，不能把流程库中的工作流加入画布。' });
            return false;
        }
        ai.getState().addMessage({ role: 'user', content: `直接使用流程库中的「${name}」` });
        const def = await this.fetchLibraryDefinition(name);
        const ctx = { ...this.toolExecutionContext(ai.getState().pendingProposal?.proposedDef ?? null), libraryWorkflowDef: def };
        let result = executeToolCall('load_library_workflow', { name, mode: 'open' }, ctx);
        let mode: 'open' | 'reference' = 'open';
        if (result.type !== 'propose') {
            result = executeToolCall('load_library_workflow', { name, mode: 'reference' }, ctx);
            mode = 'reference';
        }
        if (result.type === 'propose' && result.proposed && result.diff) {
            const intro = mode === 'open'
                ? `已打开流程库中的「${name}」作为变更方案：${describeDiff(result.diff)}。`
                : `流程库只提供了「${name}」的摘要，已在流程末尾以子流程步骤引用它：${describeDiff(result.diff)}。`;
            const messageId = ai.getState().addMessage({ role: 'assistant', content: `${intro}\n请在下方应用或拒绝此变更。` });
            this.publishProposal({ proposed: result.proposed, diff: result.diff, inferredLevel: result.inferredLevel, verification: result.verification }, messageId);
            return true;
        }
        ai.getState().addMessage({ role: 'assistant', content: result.text ?? `无法加载「${name}」。请在工作流库标签页确认它是否存在。` });
        return false;
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
            this.publishProposal({ proposed: result.proposed, diff: result.diff, inferredLevel: result.inferredLevel, verification: result.verification }, messageId);
            ai.getState().saveCheckpoint(null);
            ai.getState().setSynthesisStage('completed', null);
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
        store.setRetryInput(null);
        store.setPendingSend(null);

        await this.runDurableLoop({
            sessionId: checkpoint.sessionId,
            userPrompt: checkpoint.userPrompt,
            assistantMsgId,
            agentHistory: history,
            initialDraft: checkpoint.workingDraft,
            baseDraft: ai.getState().pendingProposal?.proposedDef ?? null,
            initialPhase: checkpoint.phase,
            startStep: checkpoint.stepIndex,
            initialSelfHealCount: checkpoint.selfHealCount,
        });
    }

    async send(text: string, options: SendOptions = {}): Promise<void> {
        const ai = this.stores.aiStore;
        const store = ai.getState();
        if (!text.trim() || store.isStreaming) return;
        const modelText = options.modelText?.trim() ? options.modelText : text;

        // A18：先检查配置。原来先清断点再检查，没配 API Key 时发一条消息，上次暂停的会话断点就没了
        const config = ai.getState().config;
        // apiKey is only required in direct mode — endpoint/custom transports don't need one.
        if (!config.apiKey && !config.transport) {
            store.addMessage({ role: 'user', content: text });
            store.addMessage({ role: 'assistant', content: '未配置 API Key。请点击对话面板右上角的设置按钮配置 AI 服务后重试。' });
            return;
        }

        // A18：有未完成的断点时先不发送，由界面让用户选「继续上次」还是「放弃断点并发送」
        const checkpoint = store.durableCheckpoint;
        if (checkpoint && checkpoint.status !== 'completed' && !options.discardCheckpoint) {
            store.setPendingSend({ text, ...(options.modelText ? { modelText: options.modelText } : {}) });
            return;
        }
        store.setPendingSend(null);

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

        const assistantMsgId = store.addMessage({ role: 'assistant', content: '' });
        const agentHistory = this.buildHistory(modelText, priorMessages);

        await this.runDurableLoop({
            sessionId: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userPrompt: modelText,
            assistantMsgId,
            agentHistory,
            initialDraft: null,
            // A follow-up while a proposal is pending continues from that proposal (diffs stay
            // against the canvas), instead of starting over from the canvas and dropping it.
            baseDraft: ai.getState().pendingProposal?.proposedDef ?? null,
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
        /** 断点续跑：checkpoint 里的半成品草稿（视为本会话已有进展） */
        initialDraft: WorkflowDef | null;
        /** 新会话的起点草稿（待确认方案）：工具在它之上修改，但它本身不算本会话的进展 */
        baseDraft: WorkflowDef | null;
        initialPhase: SynthesisPhase;
        startStep: number;
        initialSelfHealCount: number;
    }): Promise<void> {
        const ai = this.stores.aiStore;
        const toolRegistry = this.stores.toolRegistry;
        const { aiPermissions, onAiEvent } = this.getOptions();
        const config = ai.getState().config;
        const transportMode = this.transportMode();

        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        const { signal } = controller;
        const generation = this.generation;
        /** reset() 之后旧会话的收尾写入一律丢弃 */
        const isCurrent = () => generation === this.generation;

        ai.getState().setStreaming(true);
        ai.getState().setStreamingText('');
        ai.getState().setToolStatus('');

        const {
            sessionId,
            userPrompt,
            assistantMsgId,
            agentHistory,
        } = params;

        let workingDraft: WorkflowDef | null = params.initialDraft ?? params.baseDraft;
        let currentPhase: SynthesisPhase = params.initialPhase;
        let selfHealCount = params.initialSelfHealCount;
        let currentStep = params.startStep;
        /** 本会话（含续跑前）是否已经改动过草稿：决定兜底提交与失败时是否保存断点 */
        let draftTouched = params.initialDraft !== null;
        let proposalCreated = false;
        let hitStepLimit = false;
        let liveStepText = '';
        let fullAssistantText = '';

        // 画布上原有的校验错误：自愈只针对本次方案新引入的错误
        const canvasDef = useWorkflowStore.getState().workflowDef;
        const baselineErrors = new Set(
            canvasDef && Array.isArray(canvasDef.tasks) && canvasDef.tasks.length > 0
                ? verifyWorkflowSemantics(canvasDef).errors.map(errorKey)
                : [],
        );

        if (params.initialDraft || currentPhase !== 'idle') {
            ai.getState().setSynthesisStage(currentPhase, workingDraft);
        }

        const persistCheckpoint = (status: DurableSessionCheckpoint['status'], lastError?: string) => {
            if (!isCurrent()) return;
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
                workingDraft: draftTouched ? workingDraft : null,
                agentHistory: [...agentHistory],
                stepIndex: currentStep,
                selfHealCount,
                status,
                lastError,
                updatedAt: Date.now(),
            });
        };
        const hasProgress = () => draftTouched || currentStep > params.startStep || params.startStep > 0;
        const appendText = (text: string) => {
            fullAssistantText += (fullAssistantText ? '\n\n' : '') + text;
        };

        try {
            const customDefs = toolRegistry.getDefinitions();
            const editAllowed = aiPermissions?.canEdit !== false;
            const repairAllowed = aiPermissions?.canRepair !== false;
            // A17：按当前模式和权限决定发给模型、也允许执行的工具。模式每步重新读取：
            // 会话进行中切到运行态时，编辑工具从下一次调用起就失效
            const resolveToolAccess = () => {
                const mode = useWorkflowStore.getState().mode;
                let defs = mode === 'run' || !editAllowed
                    ? RUN_MODE_TOOL_DEFINITIONS
                    : [...TOOL_DEFINITIONS.filter(d => !EDIT_MODE_EXCLUDED_TOOLS.has(d.function.name)), ...customDefs];
                if (!repairAllowed) {
                    defs = defs.filter(d => d.function.name !== 'propose_repair');
                }
                return { mode, activeDefs: defs, allowedToolNames: new Set(defs.map(d => d.function.name)) };
            };
            const proposalsAllowed = () => useWorkflowStore.getState().mode !== 'run' && editAllowed;

            const existingMsg = ai.getState().messages.find(m => m.id === assistantMsgId);
            fullAssistantText = existingMsg?.content ?? '';

            // ─── Durable Agentic Loop ───────────────────────────────────────
            for (let step = params.startStep; ; step++) {
                const maxSteps = (draftTouched || currentPhase !== 'idle')
                    ? MAX_SYNTHESIS_STEPS
                    : MAX_AGENT_STEPS;
                if (signal.aborted) break;
                // 每次 send / resume 都有完整的步数预算
                if (step - params.startStep >= maxSteps) {
                    hitStepLimit = true;
                    break;
                }
                currentStep = step;

                ai.getState().setStreamingText('');
                if (step > 0 && currentPhase === 'idle') {
                    ai.getState().setToolStatus(`步骤 ${step + 1}…`);
                }

                const stepToolCalls: Array<{ id: string; name: string; args: Record<string, any> }> = [];
                liveStepText = '';
                const offered = resolveToolAccess();

                for await (const event of streamChat(agentHistory, offered.activeDefs, config, signal)) {
                    if (signal.aborted) break;
                    switch (event.type) {
                        case 'text':
                            liveStepText += event.content;
                            ai.getState().appendStreamingText(event.content);
                            break;
                        case 'tool_call':
                            stepToolCalls.push({ id: event.id, name: event.name, args: event.args });
                            break;
                        case 'error':
                            // HTTP 401 / 429 / 5xx etc. arrive as events from direct/endpoint
                            // transports — treat them exactly like a thrown error (failed checkpoint
                            // or retry), never as a finished turn.
                            throw new AiStreamError(event.message);
                        case 'usage':
                            ai.getState().recordUsage({ promptTokens: event.promptTokens, completionTokens: event.completionTokens });
                            break;
                    }
                }

                const stepText = liveStepText;
                liveStepText = '';
                if (stepText) appendText(stepText);

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

                // A17：执行前校验——既要在本步发给模型的列表里，也要在执行时的模式下仍然允许（流式输出期间可能切到了运行态）
                const current = resolveToolAccess();
                for (const tc of stepToolCalls) {
                    if (signal.aborted) break;
                    if (!offered.allowedToolNames.has(tc.name) || !current.allowedToolNames.has(tc.name)) {
                        const why = current.mode === 'run'
                            ? '运行态只能查看和诊断'
                            : !editAllowed ? '当前没有编辑权限' : '本轮没有提供这个工具';
                        toolResultMsgs.push({
                            role: 'tool',
                            content: `调用被拒绝：工具 ${tc.name} 不在本轮可用的工具列表里（${why}）。不要再调用它，改用可用的工具，或直接回复用户。`,
                            tool_call_id: tc.id,
                        });
                        ai.getState().addTimelineEntry(`已拒绝调用 ${tc.name}：${why}`, 'warning');
                        continue;
                    }
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
                        const toolCtx = this.toolExecutionContext(workingDraft);
                        if (tc.name === 'search_workflow_library') {
                            // Provider 支持服务端检索时走服务端（大目录），失败则退回本地匹配
                            toolCtx.librarySearchResults = await this.serverLibrarySearch(tc.args);
                        }
                        if (tc.name === 'load_library_workflow') {
                            toolCtx.libraryWorkflowDef = await this.fetchLibraryDefinition(
                                String(tc.args.name ?? ''),
                                typeof tc.args.version === 'number' ? tc.args.version : undefined,
                                signal,
                            );
                        }
                        result = executeToolCall(tc.name, tc.args, toolCtx);
                    } catch (err: any) {
                        toolResultMsgs.push({ role: 'tool', content: `工具执行出错：${err?.message ?? '未知错误'}`, tool_call_id: tc.id });
                        ai.getState().addTimelineEntry(`${tc.name} 执行出错`, 'warning');
                        continue;
                    }
                    let resultContent: string;

                    if (result.type === 'stage') {
                        if (result.workingDraft) {
                            workingDraft = result.workingDraft;
                            draftTouched = true;
                        }
                        if (result.phase) currentPhase = result.phase;
                        ai.getState().setSynthesisStage(currentPhase, workingDraft);
                        if (result.timelineLabel) {
                            ai.getState().addTimelineEntry(result.timelineLabel, 'done');
                        }
                        onAiEvent?.({ type: 'stage:completed', timestamp: Date.now(), phase: currentPhase });
                        resultContent = result.text ?? '阶段已完成。';
                    } else if (result.type === 'propose' && result.proposed && result.diff) {
                        const verification = result.verification ?? verifyWorkflowSemantics(result.proposed);
                        // Errors the canvas already had are not this proposal's fault — self-heal
                        // only spends rounds on errors the proposal introduced.
                        const newErrors = verification.errors.filter(e => !baselineErrors.has(errorKey(e)));
                        if (newErrors.length > 0 && selfHealCount < MAX_SELF_HEAL) {
                            selfHealCount++;
                            workingDraft = result.proposed;
                            draftTouched = true;
                            currentPhase = 'verify';
                            ai.getState().setSynthesisStage('verify', workingDraft);
                            const errList = newErrors.map(e => `• [${e.ref || 'GLOBAL'}] ${e.message}`).join('\n');
                            resultContent = `工作流已生成，但整体校验发现 ${newErrors.length} 个新引入的错误，请通过 configure_workflow_tasks、patch_workflow 或 replace_workflow 修复后重新提交：\n${errList}`;
                            ai.getState().addTimelineEntry(
                                `发现 ${newErrors.length} 处校验问题，正在自动修正…`, 'warning',
                            );
                        } else {
                            workingDraft = result.proposed;
                            draftTouched = true;
                            currentPhase = 'completed';
                            ai.getState().setSynthesisStage('completed', workingDraft);
                            pendingProposalResult = {
                                proposed: result.proposed,
                                diff: result.diff,
                                inferredLevel: result.inferredLevel,
                                verification,
                            };
                            const desc = describeDiff(result.diff);
                            const warnNote = verification.errors.length > 0 ? `（含 ${verification.errors.length} 个校验错误）` : '';
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
                const coveredIds = new Set(toolResultMsgs.map(m => m.tool_call_id));
                for (const tc of stepToolCalls) {
                    if (!coveredIds.has(tc.id)) {
                        toolResultMsgs.push({ role: 'tool', content: '操作已中止，等待用户确认后继续。', tool_call_id: tc.id });
                    }
                }

                agentHistory.push(...toolResultMsgs);
                currentStep = step + 1;
                persistCheckpoint('running');

                if (ai.getState().pendingRepair?.messageId === assistantMsgId) {
                    appendText('我已诊断出故障原因并准备了修复方案，请查看下方修复卡片。');
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
                    appendText('我已为你准备了一个执行计划，请查看下方方案并决定是否执行。');
                    break;
                }

                if (pendingProposalResult) {
                    this.publishProposal(pendingProposalResult, assistantMsgId);
                    proposalCreated = true;
                    const desc = describeDiff(pendingProposalResult.diff);
                    const levelNote = pendingProposalResult.inferredLevel ? ` · ${pendingProposalResult.inferredLevel}` : '';
                    fullAssistantText += `\n\n---\n**已生成变更方案${levelNote}**：${desc}\n请在下方应用或拒绝此变更。`;
                    break;
                }

                // Continue loop to next stage / model response
            }

            // The loop paused for the user (clarification / plan / recommendation / repair) —
            // those cards are the answer; never auto-commit a half-built draft over them.
            const s = ai.getState();
            const pausedForUser =
                s.pendingClarification?.messageId === assistantMsgId ||
                s.pendingPlan?.messageId === assistantMsgId ||
                s.pendingRecommendation?.messageId === assistantMsgId ||
                s.pendingRepair?.messageId === assistantMsgId;

            // Safety Net: If progressive synthesis built a non-empty workingDraft
            // and the model finished speaking without calling commit_workflow_proposal
            // (and wasn't aborted), automatically verify & commit the draft as a proposal!
            if (
                isCurrent() &&
                // A17：只读或运行态下不生成方案（含从旧断点续跑时带回来的草稿；按结束时的模式判断）
                proposalsAllowed() &&
                !signal.aborted &&
                !hitStepLimit &&
                !pausedForUser &&
                !proposalCreated &&
                draftTouched &&
                workingDraft &&
                Array.isArray(workingDraft.tasks) &&
                workingDraft.tasks.length > 0
            ) {
                const autoCommit = executeToolCall('commit_workflow_proposal', {}, this.toolExecutionContext(workingDraft));
                if (autoCommit.type === 'propose' && autoCommit.proposed && autoCommit.diff) {
                    currentPhase = 'completed';
                    ai.getState().setSynthesisStage('completed', autoCommit.proposed);
                    ai.getState().addTimelineEntry(
                        `阶段 4/4：已完成整体校验并生成方案 · 共 ${autoCommit.verification?.totalTasks ?? autoCommit.proposed.tasks.length} 个步骤`,
                        autoCommit.verification && !autoCommit.verification.isValid ? 'warning' : 'done',
                    );
                    this.publishProposal({
                        proposed: autoCommit.proposed,
                        diff: autoCommit.diff,
                        inferredLevel: autoCommit.inferredLevel,
                        verification: autoCommit.verification,
                    }, assistantMsgId);
                    proposalCreated = true;
                    const desc = describeDiff(autoCommit.diff);
                    const levelNote = autoCommit.inferredLevel ? ` · ${autoCommit.inferredLevel}` : '';
                    fullAssistantText += `\n\n---\n**已生成变更方案${levelNote}**：${desc}\n请在下方应用或拒绝此变更。`;
                }
            }

            if (!isCurrent()) return;

            if (signal.aborted) {
                if (hasProgress()) {
                    persistCheckpoint('paused');
                }
                ai.getState().updateMessage(assistantMsgId, this.abortedText(fullAssistantText, liveStepText));
            } else if (hitStepLimit && !proposalCreated) {
                const maxSteps = (draftTouched || currentPhase !== 'idle') ? MAX_SYNTHESIS_STEPS : MAX_AGENT_STEPS;
                persistCheckpoint('paused', `已达到单轮 ${maxSteps} 步上限`);
                ai.getState().setToolStatus('');
                appendText(
                    `**已暂停**：本轮已用完 ${maxSteps} 步的上限，AI 停在这里，还没有生成变更方案。` +
                    '点击下方"从断点继续生成"让 AI 接着完成；或把需求拆成更小的步骤重新发送。',
                );
                ai.getState().updateMessage(assistantMsgId, fullAssistantText.trim());
            } else {
                persistCheckpoint('completed');
                ai.getState().setToolStatus('');
                ai.getState().updateMessage(
                    assistantMsgId,
                    fullAssistantText.trim() || (pausedForUser || proposalCreated
                        ? '请查看下方卡片。'
                        : 'AI 没有返回任何内容。请换个说法重新发送；如持续出现，请在 AI 设置中检查模型配置。'),
                );
            }
        } catch (err: any) {
            if (!isCurrent()) return;
            ai.getState().setToolStatus('');
            if (err?.name !== 'AbortError') {
                const humanized = humanizeAiError(err?.message, { mode: transportMode });
                const partial = [fullAssistantText, liveStepText].filter(t => t && t.trim()).join('\n\n').trim();
                ai.getState().updateMessage(
                    assistantMsgId,
                    `${partial ? `${partial}\n\n` : ''}**出错了**：${humanized.display}`,
                );
                onAiEvent?.({ type: 'ai:error', timestamp: Date.now(), rawMessage: humanized.raw });
                if (hasProgress()) {
                    persistCheckpoint('failed', humanized.display);
                } else {
                    ai.getState().setRetryInput(userPrompt);
                }
            } else {
                if (hasProgress()) {
                    persistCheckpoint('paused');
                }
                ai.getState().updateMessage(assistantMsgId, this.abortedText(fullAssistantText, liveStepText));
            }
        } finally {
            if (isCurrent()) {
                ai.getState().setStreaming(false);
                ai.getState().setStreamingText('');
                ai.getState().setToolStatus('');
            }
        }
    }

    /** 停止生成：保留已经流式输出的文字，只在末尾注明已中止 */
    private abortedText(fullText: string, liveText: string): string {
        const kept = [fullText, liveText].filter(t => t && t.trim()).join('\n\n').trim();
        return kept ? `${kept}\n\n（已中止）` : '（已中止）';
    }
}
