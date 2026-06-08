/**
 * AiWorkflowIDE — AI-First workflow designer (component-ready)
 *
 * 设计目标：可被任何前端项目直接引用，仅需传入 aiConfig 即可使用。
 *
 * 布局：左侧 AI 对话面板（可收起） + 右侧画布 + ReviewBar
 * 与 WorkflowIDE 共享底层 workflowStore 和组件基础设施。
 */

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { ReactFlowProvider } from 'reactflow';
import useWorkflowStore from './store/workflowStore';
import useAiStore from './store/aiStore';
import useLibraryStore from './store/libraryStore';
import AiCommandCenter from './components/AiNative/AiCommandCenter';
import CanvasPreview from './components/AiNative/CanvasPreview';
import ReviewBar from './components/AiNative/ReviewBar';
import AiConfigPanel from './components/AiNative/AiConfigPanel';
import type { WorkflowDef } from './types/conductor';
import type { AiConfig } from './services/ai/protocolAdapter';
import type { WorkflowLibraryItem } from './types/workflowLibrary';
import type { ExecutionActions, ThemeMode, ThemeColor, LayoutDirection, ViewMode } from './types/workflow';

import './components/AiNative/AiNative.css';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AiWorkflowIDEProps {
    // ── Workflow data ──────────────────────────────────────────────────────
    /** 初始工作流定义（编辑态） */
    workflowDef?: WorkflowDef;
    /** 运行态执行实例数据 */
    workflowExecution?: any;

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

    // ── Callbacks ──────────────────────────────────────────────────────────
    onSave?: (def: WorkflowDef) => void;
    onWorkflowChange?: (def: WorkflowDef) => void;
    onRequestImport?: () => void;
    executionActions?: ExecutionActions;
    /** AI 操作指标回调（accept/reject 次数等） */
    onAiMetrics?: (metrics: any) => void;
}

export interface AiWorkflowIDERef {
    /** 获取当前工作流定义 */
    getWorkflowDef: () => WorkflowDef | null;
    /** 程序化设置工作流 */
    setWorkflow: (def: WorkflowDef) => void;
    /** 新建空白工作流 */
    createBlankWorkflow: (name?: string) => void;
    /** 获取 AI 使用指标 */
    getAiMetrics: () => any;
}

// ─── Inner component (needs ReactFlowProvider above it) ──────────────────────

const AiWorkflowIDEInner = forwardRef<AiWorkflowIDERef, AiWorkflowIDEProps>((props, ref) => {
    const {
        workflowDef: propDef,
        workflowExecution,
        aiConfig: propAiConfig,
        workflowLibrary: propLibrary,
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
        onAiMetrics,
    } = props;

    const workflowStore = useWorkflowStore();
    const aiStore = useAiStore();
    const libraryStore = useLibraryStore();
    const [showConfig, setShowConfig] = useState(false);

    // ── Appearance: apply once on mount ────────────────────────────────────
    const initRef = useRef(false);
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        if (theme) workflowStore.setTheme(theme);
        if (themeColor) workflowStore.setThemeColor(themeColor);
        if (layoutDirection) workflowStore.setLayoutDirection(layoutDirection);
        workflowStore.setViewMode(propViewMode ?? 'business');
    }, []);

    // ── AI config: sync on every prop change ───────────────────────────────
    // Unlike appearance, aiConfig can change (e.g. user rotates API key).
    const prevAiConfigRef = useRef<string>('');
    useEffect(() => {
        if (!propAiConfig) return;
        const serialized = JSON.stringify(propAiConfig);
        if (serialized === prevAiConfigRef.current) return;
        prevAiConfigRef.current = serialized;
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

    // ── Workflow def ────────────────────────────────────────────────────────
    useEffect(() => {
        if (propDef) {
            workflowStore.setWorkflow(propDef);
            workflowStore.setMode('edit');
        }
    }, [propDef]);

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

    // ── Ref API ─────────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        getWorkflowDef: () => workflowStore.workflowDef,
        setWorkflow: (def: WorkflowDef) => {
            workflowStore.setWorkflow(def);
            workflowStore.setMode('edit');
        },
        createBlankWorkflow: (name?: string) => workflowStore.createBlankWorkflow(name),
        getAiMetrics: () => aiStore.getMetrics(),
    }), []);

    // ── ReviewBar handlers ──────────────────────────────────────────────────
    const handleAccept = useCallback(() => {
        const proposal = aiStore.pendingProposal;
        if (!proposal) return;
        workflowStore.setWorkflow(proposal.proposedDef);
        workflowStore.setMode('edit');
        aiStore.recordAccept();

        // Flash added + modified nodes so the user can immediately spot the changes.
        // Use rAF to let setWorkflow's layout pass complete first.
        const flashRefs = [...proposal.diff.added, ...proposal.diff.modified];
        if (flashRefs.length > 0) {
            requestAnimationFrame(() => workflowStore.flashNodes(flashRefs));
        }

        // Anchor the conversation history to the new workflow state.
        const def = proposal.proposedDef;
        const taskSummary = (def.tasks ?? []).map(t => `${t.taskReferenceName}(${t.type})`).join(', ');
        aiStore.addMessage({
            role: 'assistant',
            content: `📌 工作流已更新：「${def.name}」现包含 ${(def.tasks ?? []).length} 个任务：${taskSummary}。`,
        });
        if (onAiMetrics) onAiMetrics(aiStore.getMetrics());
    }, [aiStore.pendingProposal, onAiMetrics]);

    const handleReject = useCallback(() => {
        aiStore.recordReject();
        if (onAiMetrics) onAiMetrics(aiStore.getMetrics());
    }, [onAiMetrics]);

    // ── Config button visibility ────────────────────────────────────────────
    // Hide in-app config when the integrator has already provided an apiKey via prop.
    // In that case, the integrator fully controls the AI config.
    const showConfigButton = !propAiConfig?.apiKey;

    const currentTheme = workflowStore.theme || theme || 'dark';
    const currentColor = workflowStore.themeColor || themeColor || 'blue';

    return (
        <div
            className="ai-workflow-ide"
            data-mode={currentTheme}
            data-brand={currentColor}
            style={{ height }}
        >
            {/* Left: AI Chat panel (collapsible) */}
            <div className={`ai-chat-side ${aiStore.chatPanelOpen ? '' : 'collapsed'}`}>
                <AiCommandCenter
                    systemPrompt={systemPrompt}
                    systemPromptExtra={systemPromptExtra}
                    showConfigButton={showConfigButton}
                    onShowConfig={() => setShowConfig(true)}
                />
            </div>

            {/* Collapse/expand toggle */}
            <button
                className="ai-toggle-btn"
                style={{ left: aiStore.chatPanelOpen ? '420px' : '0px' }}
                onClick={() => aiStore.toggleChatPanel()}
                title={aiStore.chatPanelOpen ? '收起 AI 面板' : '展开 AI 面板'}
            >
                {aiStore.chatPanelOpen ? '◀' : '▶'}
            </button>

            {/* Right: Canvas + ReviewBar */}
            <div className="ai-canvas-side">
                <CanvasPreview
                    onSave={onSave}
                    onRequestImport={onRequestImport}
                    executionActions={executionActions}
                />
                <ReviewBar
                    proposal={aiStore.pendingProposal}
                    onAccept={handleAccept}
                    onReject={handleReject}
                />
            </div>

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
