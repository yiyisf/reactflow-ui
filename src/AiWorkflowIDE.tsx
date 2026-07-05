/**
 * AiWorkflowIDE — AI-First workflow designer (component-ready)
 *
 * 设计目标：可被任何前端项目直接引用，仅需传入 aiConfig 即可使用。
 *
 * 布局：左侧 AI 对话面板（可收起） + 右侧画布 + ReviewBar
 * 与 WorkflowIDE 共享底层 workflowStore 和组件基础设施。
 */

import { useState, useEffect, useCallback, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { ReactFlowProvider } from 'reactflow';
import useWorkflowStore from './store/workflowStore';
import useAiStore from './store/aiStore';
import useLibraryStore from './store/libraryStore';
import AiCommandCenter from './components/AiNative/AiCommandCenter';
import CanvasPreview from './components/AiNative/CanvasPreview';
import ReviewBar from './components/AiNative/ReviewBar';
import BusinessCanvas from './components/AiNative/BusinessCanvas';
import AiConfigPanel from './components/AiNative/AiConfigPanel';
import { workflowToMermaid } from './utils/workflowToMermaid';
import type { WorkflowDef, WorkflowInstance } from './types/conductor';
import type { AiConfig } from './services/ai/protocolAdapter';
import type { AiMetrics } from './store/aiStore';
import type { WorkflowLibraryItem } from './types/workflowLibrary';
import type { ExecutionActions, ThemeMode, ThemeColor, LayoutDirection, ViewMode, TaskExecutionData, WorkflowExecutionInput } from './types/workflow';
import type { CustomTool } from './services/ai/toolRegistry';
import type { CustomValidationRule } from './services/ai/ruleEngine';
import type { TaskSchema } from './services/ai/schemaRegistry';
import type { PartialAcceptSelection } from './services/ai/toolExecutor';
import { applyPartialProposal } from './services/ai/toolExecutor';
import type { AiEvent } from './types/aiEvents';
import { toolRegistry } from './services/ai/toolRegistry';
import { ruleEngine } from './services/ai/ruleEngine';
import { schemaRegistry } from './services/ai/schemaRegistry';
import type { IdeDraft } from './services/ai/draftPersistence';
import { isMeaningfulDraft, loadDraft, saveDraft, clearDraft } from './services/ai/draftPersistence';

import './components/AiNative/AiNative.css';

/** 恢复横幅文案，如"已恢复刚刚的编辑" / "已恢复 3 分钟前的编辑" */
function formatRestoredBannerText(savedAt: number): string {
    const minutes = Math.floor((Date.now() - savedAt) / 60000);
    if (minutes < 1) return '已恢复刚刚的编辑';
    if (minutes < 60) return `已恢复 ${minutes} 分钟前的编辑`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `已恢复 ${hours} 小时前的编辑`;
    return `已恢复 ${Math.floor(hours / 24)} 天前的编辑`;
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AiWorkflowIDEProps {
    // ── Workflow data ──────────────────────────────────────────────────────
    /** 初始工作流定义（编辑态） */
    workflowDef?: WorkflowDef;
    /** 运行态执行实例数据（完整 Conductor Workflow 实例，或裸的任务实例数组） */
    workflowExecution?: WorkflowExecutionInput;

    // ── Sub-workflow library ───────────────────────────────────────────────
    /**
     * L1/L2/L3 子工作流库元数据列表（集成方提供）。
     *
     * AI 会优先从库中识别可复用的子工作流，而非从零生成。
     * 遵循分层调用规范：L3→L2/L1，L2→L1，L1同层，禁止反向跨层调用。
     *
     * ```tsx
     * <AiWorkflowIDE
     *   workflowLibrary={[
     *     { workflowName: 'create_vm', workflowLevel: 'L1', version: '1.0',
     *       description: '创建虚机实例', tags: ['云服务器', '计算'] },
     *     { workflowName: 'cloud_server_apply', workflowLevel: 'L2', version: '2.1',
     *       description: '云服务器申请完整流程', tags: ['申请'] },
     *   ]}
     * />
     * ```
     */
    workflowLibrary?: WorkflowLibraryItem[];

    // ── AI configuration ───────────────────────────────────────────────────
    /**
     * AI 模型配置（集成方提供）。
     *
     * 最简用法：仅传 apiKey，其余使用默认值（OpenAI gpt-4o）。
     * ```tsx
     * <AiWorkflowIDE aiConfig={{ apiKey: 'sk-xxx' }} />
     * ```
     *
     * 使用 Anthropic：
     * ```tsx
     * <AiWorkflowIDE aiConfig={{ provider: 'anthropic', apiKey: 'sk-ant-xxx', model: 'claude-sonnet-4-6' }} />
     * ```
     *
     * 当此 prop 提供有效 apiKey 时，组件内建的 AI 配置按钮将自动隐藏，
     * 由集成方完全掌控 AI 配置。
     */
    aiConfig?: Partial<AiConfig>;

    // ── System prompt customization ────────────────────────────────────────
    /**
     * 完全替换内置基础提示词（高级定制）。
     * 工作流上下文仍会自动注入，无需手动处理。
     *
     * 可从 'reactflow-ui' 导入 BASE_SYSTEM_PROMPT 在此基础上修改：
     * ```tsx
     * import { BASE_SYSTEM_PROMPT } from 'reactflow-ui';
     * <AiWorkflowIDE systemPrompt={BASE_SYSTEM_PROMPT + '\n\n额外规则...'} />
     * ```
     */
    systemPrompt?: string;
    /**
     * 追加到内置提示词之后的补充内容（轻量定制）。
     * 适合注入公司规范、业务背景等上下文，无需理解内置提示词结构。
     */
    systemPromptExtra?: string;

    // ── Appearance ─────────────────────────────────────────────────────────
    theme?: ThemeMode;
    themeColor?: ThemeColor;
    layoutDirection?: LayoutDirection;
    /** 初始视图模式。默认 'business'（节点类型标签使用中文业务词汇）。 */
    viewMode?: ViewMode;
    /** 组件高度，默认 '100vh' */
    height?: string | number;

    // ── Extensibility ──────────────────────────────────────────────────────
    /**
     * Custom tools the AI can call alongside built-in tools (Tool Registry v1).
     *
     * Each tool must provide an OpenAI-compatible function definition and an
     * async `execute` function. The return value is sent back to the model as
     * the tool result.
     *
     * ```tsx
     * <AiWorkflowIDE
     *   customTools={[{
     *     definition: { type: 'function', function: { name: 'query_cmdb',
     *       description: '查询 CMDB 资源', parameters: { ... } } },
     *     execute: async (args) => JSON.stringify(await fetchCmdb(args)),
     *   }]}
     * />
     * ```
     */
    customTools?: CustomTool[];

    /**
     * Custom validation rules applied after built-in Conductor validation (Rules Engine v1).
     *
     * Rule `description` strings are injected into the AI system prompt so
     * generated workflows satisfy these constraints from the start.
     *
     * ```tsx
     * <AiWorkflowIDE
     *   validationRules={[{
     *     id: 'require-owner-email',
     *     level: 'error',
     *     description: '所有工作流必须设置 ownerEmail（格式：xxx@company.com）',
     *     validate: (def) =>
     *       def.ownerEmail ? [] : [{ type: 'GLOBAL', ref: '', message: 'ownerEmail 不能为空' }],
     *   }]}
     * />
     * ```
     */
    validationRules?: CustomValidationRule[];

    /**
     * Task input/output schemas (Schema Registry v1).
     *
     * Registered schemas are injected into the AI system prompt so the model
     * generates correct inputParameters references for known task types.
     *
     * ```tsx
     * <AiWorkflowIDE
     *   taskSchemas={[{
     *     taskName: 'send_notification',
     *     taskType: 'SIMPLE',
     *     description: '发送通知',
     *     inputSchema:  { userId: 'string', message: 'string' },
     *     outputSchema: { messageId: 'string', status: 'sent|failed' },
     *   }]}
     * />
     * ```
     */
    taskSchemas?: TaskSchema[];

    // ── Callbacks ──────────────────────────────────────────────────────────
    onSave?: (def: WorkflowDef) => void;
    onWorkflowChange?: (def: WorkflowDef) => void;
    onRequestImport?: () => void;
    executionActions?: ExecutionActions;
    /**
     * 触发执行当前工作流。若提供此回调，AI 对话中将出现"执行工作流"快捷操作。
     *
     * 签名与 `WorkflowIDE` 的 `onTriggerExecution` 完全一致——同一个后端适配器可同时用于两个组件。
     */
    onTriggerExecution?: (workflowName: string, version: number, input: Record<string, any>) => Promise<{ workflowId: string }>;
    /**
     * 轮询执行状态，由 workflowId 查询。需与 onTriggerExecution 一起提供。
     * 返回 `null` 表示暂未获取到结果（继续轮询），返回 `WorkflowInstance` 则视为当前/终态数据。
     *
     * 签名与 `WorkflowIDE` 的 `onPollExecution` 完全一致。
     */
    onPollExecution?: (workflowId: string) => Promise<WorkflowInstance | null>;
    /** AI 操作指标回调（accept/reject 次数等） */
    onAiMetrics?: (metrics: AiMetrics) => void;
    /**
     * AI 生命周期事件回调（审计日志 v1）。
     *
     * 接收提案创建/接受/拒绝、计划创建/执行、修复提案/执行、工具调用、撤销等所有 AI 操作事件。
     *
     * ```tsx
     * <AiWorkflowIDE
     *   onAiEvent={(e) => console.log(e.type, e.timestamp, e.diff)}
     * />
     * ```
     */
    onAiEvent?: (event: AiEvent) => void;
    /**
     * AI 操作权限配置。
     *
     * - `canEdit`（默认 true）：false 时 AI 只能读取，不能修改工作流
     * - `canRepair`（默认 true）：false 时运行态修复功能不可用
     * - `restrictionMessage`：权限受限时显示的提示文字
     *
     * ```tsx
     * <AiWorkflowIDE aiPermissions={{ canEdit: false, restrictionMessage: '只读演示模式' }} />
     * ```
     */
    aiPermissions?: {
        canEdit?: boolean;
        canRepair?: boolean;
        restrictionMessage?: string;
    };

    // ── Draft persistence（M1.4：刷新不丢工作）─────────────────────────────
    /**
     * 开启 localStorage 草稿自动保存（workflowDef + 对话 + 待确认提案）。
     * 默认 `false`（不写宿主页面的 localStorage）。挂载时若检测到草稿会自动恢复现场，
     * 并展示可放弃恢复的横幅。**仅在未传入 `workflowDef` 时生效**——显式加载指定工作流
     * 的场景视为明确意图，不应被本地草稿覆盖。
     *
     * ```tsx
     * <AiWorkflowIDE draftPersist={{ key: 'my-app-ai-workflow-draft' }} />
     * ```
     */
    draftPersist?: { key: string } | false;
    /**
     * 草稿变化时的回调（与 `draftPersist` 独立，二者可同时使用）。
     * 集成方可用它把草稿存到自己的后端，而非（或除了）localStorage。
     */
    onDraftChange?: (draft: IdeDraft) => void;
}

export interface AiWorkflowIDERef {
    /** 获取当前工作流定义 */
    getWorkflowDef: () => WorkflowDef | null;
    /** 程序化设置工作流 */
    setWorkflow: (def: WorkflowDef) => void;
    /** 新建空白工作流 */
    createBlankWorkflow: (name?: string) => void;
    /** 获取 AI 使用指标 */
    getAiMetrics: () => AiMetrics;
}

// ─── Inner component (needs ReactFlowProvider above it) ──────────────────────

const AiWorkflowIDEInner = forwardRef<AiWorkflowIDERef, AiWorkflowIDEProps>((props, ref) => {
    const {
        workflowDef: propDef,
        workflowExecution,
        aiConfig: propAiConfig,
        workflowLibrary: propLibrary,
        customTools: propCustomTools,
        validationRules: propValidationRules,
        taskSchemas: propTaskSchemas,
        systemPrompt,
        systemPromptExtra,
        theme,
        themeColor,
        layoutDirection,
        viewMode: propViewMode,
        height = '100%',
        onSave,
        onWorkflowChange,
        onRequestImport,
        executionActions,
        onTriggerExecution,
        onPollExecution,
        onAiMetrics,
        onAiEvent,
        aiPermissions,
        draftPersist = false,
        onDraftChange,
    } = props;

    const workflowStore = useWorkflowStore();
    const aiStore = useAiStore();
    const libraryStore = useLibraryStore();
    const [showConfig, setShowConfig] = useState(false);

    // ── Responsive layout state ─────────────────────────────────────────────
    const [layoutMode, setLayoutMode] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
    const [canvasVisible, setCanvasVisible] = useState(false);
    const [chatWidth, setChatWidth] = useState(420);
    const [showBusinessView, setShowBusinessView] = useState(false);
    // Canvas drawer starts hidden — conversation is the primary view
    const [canvasDrawerOpen, setCanvasDrawerOpen] = useState(false);

    // ── Appearance: apply once on mount ────────────────────────────────────
    const initRef = useRef(false);
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        if (theme) workflowStore.setTheme(theme);
        if (themeColor) workflowStore.setThemeColor(themeColor);
        if (layoutDirection) workflowStore.setLayoutDirection(layoutDirection);
        if (propViewMode) workflowStore.setViewMode(propViewMode);
    }, []);

    // ── AI config: sync on every prop change ───────────────────────────────
    // Unlike appearance, aiConfig can change (e.g. user rotates API key).
    // `transport.stream` (custom mode) is a function and JSON.stringify silently drops it,
    // so the direct-mode fields and the transport reference are tracked separately —
    // otherwise swapping a custom transport's closure without touching other fields
    // would go undetected.
    const prevAiConfigRef = useRef<{ rest: string; transport: AiConfig['transport'] }>({ rest: '', transport: undefined });
    useEffect(() => {
        if (!propAiConfig) return;
        const { transport, ...rest } = propAiConfig;
        const serializedRest = JSON.stringify(rest);
        if (serializedRest === prevAiConfigRef.current.rest && transport === prevAiConfigRef.current.transport) return;
        prevAiConfigRef.current = { rest: serializedRest, transport };
        aiStore.setConfig(propAiConfig);
    }, [propAiConfig]);

    // ── Workflow library: sync on every prop change ─────────────────────────
    const prevLibraryRef = useRef<string>('');
    useEffect(() => {
        const serialized = JSON.stringify(propLibrary ?? []);
        if (serialized === prevLibraryRef.current) return;
        prevLibraryRef.current = serialized;
        libraryStore.setLibrary(propLibrary ?? []);
    }, [propLibrary]);

    // ── Custom tools: sync on every prop change ─────────────────────────────
    const prevCustomToolsRef = useRef<string>('');
    useEffect(() => {
        const serialized = JSON.stringify((propCustomTools ?? []).map(t => t.definition.function.name));
        if (serialized === prevCustomToolsRef.current) return;
        prevCustomToolsRef.current = serialized;
        toolRegistry.setTools(propCustomTools ?? []);
    }, [propCustomTools]);

    // ── Validation rules: sync on every prop change ─────────────────────────
    const prevRulesRef = useRef<string>('');
    useEffect(() => {
        const serialized = JSON.stringify((propValidationRules ?? []).map(r => r.id));
        if (serialized === prevRulesRef.current) return;
        prevRulesRef.current = serialized;
        ruleEngine.setRules(propValidationRules ?? []);
    }, [propValidationRules]);

    // ── Task schemas: sync on every prop change ─────────────────────────────
    const prevSchemasRef = useRef<string>('');
    useEffect(() => {
        const serialized = JSON.stringify((propTaskSchemas ?? []).map(s => s.taskName));
        if (serialized === prevSchemasRef.current) return;
        prevSchemasRef.current = serialized;
        schemaRegistry.setSchemas(propTaskSchemas ?? []);
    }, [propTaskSchemas]);

    // ── Workflow def ────────────────────────────────────────────────────────
    useEffect(() => {
        if (propDef) {
            workflowStore.setWorkflow(propDef);
            workflowStore.setMode('edit');
        }
    }, [propDef]);

    // ── Draft persistence（M1.4：刷新不丢工作）───────────────────────────────
    const draftKey = draftPersist ? draftPersist.key : null;
    const [restoredDraft, setRestoredDraft] = useState<{ savedAt: number } | null>(null);

    // Restore on mount only. Skipped entirely when a `workflowDef` prop is given —
    // loading a specific workflow by prop is an explicit intent that a stale local
    // draft must never silently override.
    useEffect(() => {
        if (!draftKey || propDef) return;
        const draft = loadDraft(draftKey);
        if (!draft) return;
        if (draft.workflowDef) {
            useWorkflowStore.getState().setWorkflow(draft.workflowDef);
            useWorkflowStore.getState().setMode('edit');
        }
        useAiStore.getState().hydrateFromDraft(draft.messages ?? [], draft.pendingProposal ?? null);
        setRestoredDraft({ savedAt: draft.savedAt });
        // Intentionally mount-only: whether to restore is decided once from the
        // props this instance was created with, not re-evaluated on every change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced auto-save: workflowDef / messages / pendingProposal → localStorage + onDraftChange.
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!draftKey && !onDraftChange) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            const def = useWorkflowStore.getState().workflowDef;
            const msgs = useAiStore.getState().messages;
            const proposal = useAiStore.getState().pendingProposal;
            if (!isMeaningfulDraft(def, msgs, proposal)) return;
            const draft: IdeDraft = { workflowDef: def, messages: msgs, pendingProposal: proposal, savedAt: Date.now() };
            if (draftKey) saveDraft(draftKey, draft);
            onDraftChange?.(draft);
        }, 500);
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [workflowStore.workflowDef, aiStore.messages, aiStore.pendingProposal, draftKey, onDraftChange]);

    const handleDiscardRestore = useCallback(() => {
        if (draftKey) clearDraft(draftKey);
        useWorkflowStore.getState().createBlankWorkflow();
        useAiStore.getState().clearMessages();
        useAiStore.getState().clearUndo();
        setRestoredDraft(null);
    }, [draftKey]);

    // ── Execution data ──────────────────────────────────────────────────────
    useEffect(() => {
        if (workflowExecution) {
            workflowStore.importExecutionJSON(workflowExecution);
        }
    }, [workflowExecution]);

    // ── Notify parent on workflow change ────────────────────────────────────
    useEffect(() => {
        if (onWorkflowChange && workflowStore.workflowDef) {
            onWorkflowChange(workflowStore.workflowDef);
        }
    }, [workflowStore.workflowDef, onWorkflowChange]);

    // ── Responsive layout: detect window size ──────────────────────────────
    useEffect(() => {
        const getMode = (): 'mobile' | 'tablet' | 'desktop' => {
            const w = window.innerWidth;
            if (w < 768) return 'mobile';
            if (w < 1024) return 'tablet';
            return 'desktop';
        };
        const applyMode = () => {
            const mode = getMode();
            setLayoutMode(mode);
            document.documentElement.setAttribute('data-layout', mode);
        };
        applyMode();
        let debounceTimer: ReturnType<typeof setTimeout>;
        const handleResize = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(applyMode, 100);
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(debounceTimer);
        };
    }, []);

    // ── Resizable divider drag handler ─────────────────────────────────────
    const handleDividerDrag = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = chatWidth;
        const onMouseMove = (moveEvent: MouseEvent) => {
            const delta = moveEvent.clientX - startX;
            const newWidth = Math.max(320, Math.min(640, startWidth + delta));
            setChatWidth(newWidth);
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [chatWidth]);

    // ── Business view execution status map ─────────────────────────────────
    const executionStatusMap = useMemo<Record<string, string>>(() => {
        if (!workflowStore.executionData) return {};
        return Object.fromEntries(
            Object.entries(workflowStore.executionData).map(
                ([ref, data]: [string, TaskExecutionData]) => [ref, data.status]
            )
        );
    }, [workflowStore.executionData]);

    // ── Ref API ─────────────────────────────────────────────────────────────
    // Use getState() to avoid stale closure — ref callbacks must always reflect latest store state.
    useImperativeHandle(ref, () => ({
        getWorkflowDef: () => useWorkflowStore.getState().workflowDef,
        setWorkflow: (def: WorkflowDef) => {
            useWorkflowStore.getState().setWorkflow(def);
            useWorkflowStore.getState().setMode('edit');
        },
        createBlankWorkflow: (name?: string) => useWorkflowStore.getState().createBlankWorkflow(name),
        getAiMetrics: () => useAiStore.getState().getMetrics(),
    }), []);

    // ── ReviewBar handlers ──────────────────────────────────────────────────
    const handleAccept = useCallback((selection?: PartialAcceptSelection) => {
        const proposal = aiStore.pendingProposal;
        if (!proposal) return;

        // Build the target def: full or partial accept
        let targetDef: WorkflowDef;
        if (!selection) {
            targetDef = proposal.proposedDef;
        } else {
            const currentDef = useWorkflowStore.getState().workflowDef ?? { name: '', tasks: [] };
            targetDef = applyPartialProposal(currentDef, proposal.proposedDef, proposal.diff, selection);
        }

        // Save current def to undo stack before applying
        const prevDef = useWorkflowStore.getState().workflowDef;
        if (prevDef) aiStore.pushUndo(prevDef);

        // Emit audit event
        const diff = proposal.diff;
        if (selection) {
            onAiEvent?.({ type: 'proposal:accepted:partial', timestamp: Date.now(),
                diff: { added: selection.added.size, modified: selection.modified.size, removed: selection.removed.size },
                selectedCount: selection.added.size + selection.modified.size + selection.removed.size,
                totalCount: diff.added.length + diff.modified.length + diff.removed.length,
                inferredLevel: proposal.inferredLevel });
        } else {
            onAiEvent?.({ type: 'proposal:accepted', timestamp: Date.now(),
                diff: { added: diff.added.length, modified: diff.modified.length, removed: diff.removed.length },
                inferredLevel: proposal.inferredLevel });
        }

        // Clear proposal BEFORE setWorkflow so nodes render without diff badges in the new state.
        aiStore.recordAccept();
        workflowStore.setWorkflow(targetDef);
        workflowStore.setMode('edit');

        // Flash added + modified nodes so the user can immediately spot the changes.
        // Use rAF to let setWorkflow's layout pass complete first.
        const flashRefs = selection
            ? [...selection.added, ...selection.modified]
            : [...proposal.diff.added, ...proposal.diff.modified];
        if (flashRefs.length > 0) {
            requestAnimationFrame(() => workflowStore.flashNodes(Array.from(flashRefs)));
        }

        // Append Mermaid flowchart to the last assistant message to avoid consecutive
        // assistant messages, which break Anthropic API role-alternation requirements.
        const def = targetDef;
        const tasks = def.tasks ?? [];
        const confirmationLine = `\n\n📌 工作流「${def.name}」已应用（${tasks.length} 个步骤）。`;
        let mermaidSection = '';
        try {
            const mermaidCode = workflowToMermaid(def);
            mermaidSection = `\n\n以下是业务流程图：\n\n\`\`\`mermaid\n${mermaidCode}\n\`\`\``;
        } catch (err) {
            console.error('[workflowToMermaid]', err);
        }
        const appendText = confirmationLine + mermaidSection;
        const allMsgs = useAiStore.getState().messages;
        const lastAssistant = [...allMsgs].reverse().find(m => m.role === 'assistant' && m.id !== 'welcome');
        if (lastAssistant) {
            aiStore.updateMessage(lastAssistant.id, lastAssistant.content + appendText);
        } else {
            aiStore.addMessage({ role: 'assistant', content: appendText.trimStart() });
        }

        // D1: Generate context-aware follow-up chips to keep the user engaged.
        // Read validation state from store directly to avoid stale hook snapshot.
        const hasHuman = tasks.some(t => t.type === 'HUMAN');
        const hasErrorHandling = tasks.some(t => t.type === 'TERMINATE' || t.type === 'SWITCH');
        const hasFork = tasks.some(t => t.type === 'FORK_JOIN' || t.type === 'FORK_JOIN_DYNAMIC');
        const hasValidationErrors = useWorkflowStore.getState().validationResults.errors.length > 0;
        const chips: string[] = [
            hasValidationErrors
                ? '修复当前工作流中的校验错误'
                : '检查当前工作流是否有潜在问题',
            !hasHuman
                ? '为这个流程加一个人工审批节点'
                : '优化审批节点的超时处理',
            !hasFork && tasks.length >= 3
                ? '把部分步骤改成并行执行以提高效率'
                : hasErrorHandling
                    ? '为关键步骤添加重试机制'
                    : '给这个流程添加异常处理分支',
        ];
        aiStore.setFollowUpChips(chips);

        if (onAiMetrics) onAiMetrics(aiStore.getMetrics());
    }, [aiStore.pendingProposal, onAiMetrics, onAiEvent]);

    const handleReject = useCallback(() => {
        aiStore.recordReject();
        onAiEvent?.({ type: 'proposal:rejected', timestamp: Date.now() });
        if (onAiMetrics) onAiMetrics(aiStore.getMetrics());
    }, [onAiMetrics, onAiEvent]);

    // ── Config button visibility ────────────────────────────────────────────
    // Hide in-app config when the integrator has already provided an apiKey OR a
    // transport (endpoint/custom) via prop. In-app config only manages direct-mode
    // fields, so it has nothing to offer once the integrator controls transport.
    const showConfigButton = !propAiConfig?.apiKey && !propAiConfig?.transport;

    const currentTheme = workflowStore.theme || theme || 'dark';
    const currentColor = workflowStore.themeColor || themeColor || 'blue';

    return (
        <div
            className={`ai-workflow-ide ${layoutMode}-mode${canvasDrawerOpen ? '' : ' canvas-closed'}`}
            data-mode={currentTheme}
            data-brand={currentColor}
            style={{
                height,
                '--chat-width': chatWidth + 'px',
            } as React.CSSProperties}
        >
            {/* Left: AI Chat panel — primary view; CSS class canvas-closed handles wide layout */}
            <div
                className={`ai-chat-side ${aiStore.chatPanelOpen ? '' : 'collapsed'}`}
            >
                {restoredDraft && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 8, padding: '6px 12px', fontSize: 12,
                        background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                        borderBottom: '1px solid var(--border-primary)',
                        color: 'var(--text-secondary)', flexShrink: 0,
                    }}>
                        <span>↺ {formatRestoredBannerText(restoredDraft.savedAt)}</span>
                        <button
                            onClick={handleDiscardRestore}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--color-accent)', fontSize: 12, fontWeight: 600, padding: 0,
                            }}
                        >放弃恢复</button>
                    </div>
                )}
                <AiCommandCenter
                    systemPrompt={systemPrompt}
                    systemPromptExtra={systemPromptExtra}
                    showConfigButton={showConfigButton}
                    onShowConfig={() => setShowConfig(true)}
                    executionActions={executionActions}
                    onAiEvent={onAiEvent}
                    aiPermissions={aiPermissions}
                    canvasOpen={canvasDrawerOpen}
                    onOpenCanvas={() => setCanvasDrawerOpen(true)}
                    onCloseCanvas={() => setCanvasDrawerOpen(false)}
                    onTriggerExecution={onTriggerExecution}
                    onPollExecution={onPollExecution}
                    onAccept={() => handleAccept()}
                    onReject={handleReject}
                />
            </div>

            {/* Resizable divider — only visible when canvas drawer is open */}
            {layoutMode !== 'mobile' && canvasDrawerOpen && (
                <div
                    className="ai-resize-divider"
                    onMouseDown={handleDividerDrag}
                />
            )}

            {/* Chat/canvas collapse toggle — only shown when canvas is open */}
            {canvasDrawerOpen && (
                <button
                    className="ai-toggle-btn"
                    style={{ left: aiStore.chatPanelOpen ? chatWidth + 'px' : '0px' }}
                    onClick={() => aiStore.toggleChatPanel()}
                    title={aiStore.chatPanelOpen ? '收起 AI 面板' : '展开 AI 面板'}
                >
                    {aiStore.chatPanelOpen ? '◀' : '▶'}
                </button>
            )}

            {/* Right: Canvas + ReviewBar — hidden until user opens drawer */}
            <div
                className={`ai-canvas-side${layoutMode === 'mobile' && canvasVisible ? ' canvas-visible' : ''}`}
                style={canvasDrawerOpen ? undefined : { display: 'none' }}
            >
                {/* Canvas toolbar: view toggle */}
                <div className="ai-canvas-toolbar">
                    <div className="biz-view-toggle">
                        <button
                            className={`biz-view-toggle-btn ${!showBusinessView ? 'active' : ''}`}
                            onClick={() => setShowBusinessView(false)}
                            title="技术视图"
                        >
                            🔧 技术
                        </button>
                        <button
                            className={`biz-view-toggle-btn ${showBusinessView ? 'active' : ''}`}
                            onClick={() => setShowBusinessView(true)}
                            title="业务视图"
                        >
                            📋 业务
                        </button>
                    </div>
                </div>

                {/* Canvas area: business view or technical canvas */}
                {showBusinessView ? (
                    <div className="ai-canvas-area">
                        <BusinessCanvas
                            workflowDef={workflowStore.workflowDef}
                            executionStatus={executionStatusMap}
                            onStepClick={(taskRef, taskType) => {
                                aiStore.setChatPanelOpen(true);
                                // Use setPendingAutoSend so this triggers an actual AI request,
                                // not just a store mutation (addMessage alone has no AI effect)
                                aiStore.setPendingAutoSend(`请介绍步骤「${taskRef}」(类型: ${taskType}) 的作用和配置建议`);
                            }}
                        />
                    </div>
                ) : (
                    <CanvasPreview
                        onSave={onSave}
                        onRequestImport={onRequestImport}
                        executionActions={executionActions}
                    />
                )}

                <ReviewBar
                    proposal={aiStore.pendingProposal}
                    onAccept={handleAccept}
                    onReject={handleReject}
                />
            </div>

            {/* Mobile FAB: toggle canvas visibility */}
            {layoutMode === 'mobile' && (
                <button
                    className="ai-mobile-canvas-fab"
                    onClick={() => setCanvasVisible(v => !v)}
                    title={canvasVisible ? '返回对话' : '查看画布'}
                >
                    <span className="ai-mobile-canvas-fab-icon">
                        {canvasVisible ? '💬' : '🗺️'}
                    </span>
                    <span className="ai-mobile-canvas-fab-label">
                        {canvasVisible ? '对话' : '画布'}
                    </span>
                </button>
            )}

            {/* In-app AI config dialog (only shown when no prop apiKey) */}
            {showConfig && <AiConfigPanel onClose={() => setShowConfig(false)} />}
        </div>
    );
});

AiWorkflowIDEInner.displayName = 'AiWorkflowIDEInner';

// ─── Public export (wraps with ReactFlowProvider) ────────────────────────────

export const AiWorkflowIDE = forwardRef<AiWorkflowIDERef, AiWorkflowIDEProps>((props, ref) => (
    <ReactFlowProvider>
        <AiWorkflowIDEInner {...props} ref={ref} />
    </ReactFlowProvider>
));

AiWorkflowIDE.displayName = 'AiWorkflowIDE';
