/**
 * AiWorkflowIDE — AI-First 工作流设计器主入口
 *
 * 左右分栏布局：
 * - 左侧：AI CommandCenter（可收起）
 * - 右侧：Canvas Preview + ReviewBar
 *
 * 与 WorkflowIDE 平行共存，共享 workflowStore 和底层基础设施。
 */

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { ReactFlowProvider } from 'reactflow';
import useWorkflowStore from './store/workflowStore';
import useAiStore from './store/aiStore';
import AiCommandCenter from './components/AiNative/AiCommandCenter';
import CanvasPreview from './components/AiNative/CanvasPreview';
import ReviewBar from './components/AiNative/ReviewBar';
import AiConfigPanel from './components/AiNative/AiConfigPanel';
import { executeToolCall } from './services/ai/toolExecutor';
import type { WorkflowDef } from './types/conductor';
import type { AiConfig } from './services/ai/protocolAdapter';
import type { ExecutionActions, ThemeMode, ThemeColor, LayoutDirection } from './types/workflow';

import './components/AiNative/AiNative.css';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface AiWorkflowIDEProps {
    /** 初始工作流定义 */
    workflowDef?: WorkflowDef;
    /** 运行态数据 */
    workflowExecution?: any;

    /** AI 配置（优先级高于 store 中的持久化配置） */
    aiConfig?: Partial<AiConfig>;

    /** 外观 */
    theme?: ThemeMode;
    themeColor?: ThemeColor;
    layoutDirection?: LayoutDirection;
    height?: string | number;

    /** 回调 */
    onSave?: (def: WorkflowDef) => void;
    onWorkflowChange?: (def: WorkflowDef) => void;
    onRequestImport?: () => void;
    executionActions?: ExecutionActions;

    /** AI 扩展 */
    systemPromptExtra?: string;
    onAiMetrics?: (metrics: any) => void;
}

export interface AiWorkflowIDERef {
    getWorkflowDef: () => WorkflowDef | null;
    setWorkflow: (def: WorkflowDef) => void;
    getAiMetrics: () => any;
}

// ─── Component ──────────────────────────────────────────────────────────────

const AiWorkflowIDEInner = forwardRef<AiWorkflowIDERef, AiWorkflowIDEProps>((props, ref) => {
    const {
        workflowDef: propDef,
        workflowExecution,
        aiConfig: propAiConfig,
        theme,
        themeColor,
        layoutDirection,
        height = '100vh',
        onSave,
        onWorkflowChange,
        onRequestImport,
        executionActions,
        systemPromptExtra,
        onAiMetrics,
    } = props;

    const workflowStore = useWorkflowStore();
    const aiStore = useAiStore();
    const [showConfig, setShowConfig] = useState(false);
    const initRef = useRef(false);

    // ─── Init: apply props to stores ───
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;

        if (theme) workflowStore.setTheme(theme);
        if (themeColor) workflowStore.setThemeColor(themeColor);
        if (layoutDirection) workflowStore.setLayoutDirection(layoutDirection);
        if (propAiConfig) aiStore.setConfig(propAiConfig);
    }, []);

    // Load workflow def from props
    useEffect(() => {
        if (propDef) {
            workflowStore.setWorkflow(propDef);
            workflowStore.setMode('edit');
        }
    }, [propDef]);

    // Load execution data from props
    useEffect(() => {
        if (workflowExecution) {
            workflowStore.importExecutionJSON(workflowExecution);
        }
    }, [workflowExecution]);

    // Notify parent on workflow change
    useEffect(() => {
        if (onWorkflowChange && workflowStore.workflowDef) {
            onWorkflowChange(workflowStore.workflowDef);
        }
    }, [workflowStore.workflowDef, onWorkflowChange]);

    // ─── Expose ref ───
    useImperativeHandle(ref, () => ({
        getWorkflowDef: () => workflowStore.workflowDef,
        setWorkflow: (def: WorkflowDef) => workflowStore.setWorkflow(def),
        getAiMetrics: () => aiStore.getMetrics(),
    }), []);

    // ─── ReviewBar handlers ───
    const handleAcceptAll = useCallback(() => {
        const ops = aiStore.pendingOps.filter(op => op.status === 'pending');
        aiStore.acceptAllOps();

        // Execute all pending operations
        for (const op of ops) {
            executeToolCall(op);
        }

        aiStore.recordAccept(ops.length);

        // Clear after execution
        setTimeout(() => aiStore.clearPendingOps(), 500);

        // Report metrics
        if (onAiMetrics) onAiMetrics(aiStore.getMetrics());
    }, [aiStore.pendingOps, onAiMetrics]);

    const handleRejectAll = useCallback(() => {
        const count = aiStore.pendingOps.filter(op => op.status === 'pending').length;
        aiStore.rejectAllOps();
        aiStore.recordReject(count);

        setTimeout(() => aiStore.clearPendingOps(), 500);

        if (onAiMetrics) onAiMetrics(aiStore.getMetrics());
    }, [aiStore.pendingOps, onAiMetrics]);

    const handleToggleOp = useCallback((id: string) => {
        const op = aiStore.pendingOps.find(o => o.id === id);
        if (!op) return;

        if (op.status === 'pending' || op.status === 'rejected') {
            aiStore.acceptOp(id);
        } else {
            aiStore.rejectOp(id);
        }
    }, [aiStore.pendingOps]);

    // ─── Theme class ───
    const currentTheme = workflowStore.theme || 'dark';
    const currentColor = workflowStore.themeColor || 'blue';

    const pendingOps = aiStore.pendingOps;

    return (
        <div
            className="ai-workflow-ide"
            data-theme={currentTheme}
            data-color={currentColor}
            style={{ height }}
        >
            {/* Left: AI Chat Panel (collapsible) */}
            <div className={`ai-chat-side ${aiStore.chatPanelOpen ? '' : 'collapsed'}`}>
                <AiCommandCenter
                    systemPromptExtra={systemPromptExtra}
                    onShowConfig={() => setShowConfig(true)}
                />
            </div>

            {/* Toggle button */}
            <div
                className="ai-toggle-btn"
                style={{ left: aiStore.chatPanelOpen ? '420px' : '0px' }}
                onClick={() => aiStore.toggleChatPanel()}
                title={aiStore.chatPanelOpen ? '收起 AI 面板' : '展开 AI 面板'}
            >
                {aiStore.chatPanelOpen ? '◀' : '▶'}
            </div>

            {/* Right: Canvas + ReviewBar */}
            <div className="ai-canvas-side">
                <CanvasPreview
                    onSave={onSave}
                    onRequestImport={onRequestImport}
                    executionActions={executionActions}
                />

                {/* ReviewBar: only show when there are pending ops */}
                <ReviewBar
                    pendingOps={pendingOps}
                    onAcceptAll={handleAcceptAll}
                    onRejectAll={handleRejectAll}
                    onToggleOp={handleToggleOp}
                />
            </div>

            {/* Config Dialog */}
            {showConfig && <AiConfigPanel onClose={() => setShowConfig(false)} />}
        </div>
    );
});

AiWorkflowIDEInner.displayName = 'AiWorkflowIDEInner';

// ─── Wrap with ReactFlowProvider ────────────────────────────────────────────

export const AiWorkflowIDE = forwardRef<AiWorkflowIDERef, AiWorkflowIDEProps>((props, ref) => (
    <ReactFlowProvider>
        <AiWorkflowIDEInner {...props} ref={ref} />
    </ReactFlowProvider>
));

AiWorkflowIDE.displayName = 'AiWorkflowIDE';
