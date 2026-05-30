/**
 * AiWorkflowIDE — AI-First workflow designer
 *
 * Layout: left AI chat panel (collapsible) + right canvas + ReviewBar
 * Shares workflowStore with WorkflowIDE for canvas rendering.
 */

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { ReactFlowProvider } from 'reactflow';
import useWorkflowStore from './store/workflowStore';
import useAiStore from './store/aiStore';
import AiCommandCenter from './components/AiNative/AiCommandCenter';
import CanvasPreview from './components/AiNative/CanvasPreview';
import ReviewBar from './components/AiNative/ReviewBar';
import AiConfigPanel from './components/AiNative/AiConfigPanel';
import type { WorkflowDef } from './types/conductor';
import type { AiConfig } from './services/ai/protocolAdapter';
import type { ExecutionActions, ThemeMode, ThemeColor, LayoutDirection } from './types/workflow';

import './components/AiNative/AiNative.css';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AiWorkflowIDEProps {
    workflowDef?: WorkflowDef;
    workflowExecution?: any;
    aiConfig?: Partial<AiConfig>;
    theme?: ThemeMode;
    themeColor?: ThemeColor;
    layoutDirection?: LayoutDirection;
    height?: string | number;
    onSave?: (def: WorkflowDef) => void;
    onWorkflowChange?: (def: WorkflowDef) => void;
    onRequestImport?: () => void;
    executionActions?: ExecutionActions;
    systemPromptExtra?: string;
    onAiMetrics?: (metrics: any) => void;
}

export interface AiWorkflowIDERef {
    getWorkflowDef: () => WorkflowDef | null;
    setWorkflow: (def: WorkflowDef) => void;
    getAiMetrics: () => any;
}

// ─── Inner component (needs ReactFlowProvider above it) ──────────────────────

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

    // Apply props to stores on mount
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        if (theme) workflowStore.setTheme(theme);
        if (themeColor) workflowStore.setThemeColor(themeColor);
        if (layoutDirection) workflowStore.setLayoutDirection(layoutDirection);
        if (propAiConfig) aiStore.setConfig(propAiConfig);
    }, []);

    useEffect(() => {
        if (propDef) {
            workflowStore.setWorkflow(propDef);
            workflowStore.setMode('edit');
        }
    }, [propDef]);

    useEffect(() => {
        if (workflowExecution) {
            workflowStore.importExecutionJSON(workflowExecution);
        }
    }, [workflowExecution]);

    useEffect(() => {
        if (onWorkflowChange && workflowStore.workflowDef) {
            onWorkflowChange(workflowStore.workflowDef);
        }
    }, [workflowStore.workflowDef, onWorkflowChange]);

    useImperativeHandle(ref, () => ({
        getWorkflowDef: () => workflowStore.workflowDef,
        setWorkflow: (def: WorkflowDef) => workflowStore.setWorkflow(def),
        getAiMetrics: () => aiStore.getMetrics(),
    }), []);

    // Accept: apply proposed def to canvas
    const handleAccept = useCallback(() => {
        const proposal = aiStore.pendingProposal;
        if (!proposal) return;
        workflowStore.setWorkflow(proposal.proposedDef);
        workflowStore.setMode('edit');
        aiStore.recordAccept();
        if (onAiMetrics) onAiMetrics(aiStore.getMetrics());
    }, [aiStore.pendingProposal, onAiMetrics]);

    // Reject: discard proposal
    const handleReject = useCallback(() => {
        aiStore.recordReject();
        if (onAiMetrics) onAiMetrics(aiStore.getMetrics());
    }, [onAiMetrics]);

    const currentTheme = workflowStore.theme || theme || 'dark';
    const currentColor = workflowStore.themeColor || themeColor || 'blue';

    return (
        <div
            className="ai-workflow-ide"
            data-mode={currentTheme}
            data-brand={currentColor}
            style={{ height }}
        >
            {/* Left: AI Chat (collapsible) */}
            <div className={`ai-chat-side ${aiStore.chatPanelOpen ? '' : 'collapsed'}`}>
                <AiCommandCenter
                    systemPromptExtra={systemPromptExtra}
                    onShowConfig={() => setShowConfig(true)}
                />
            </div>

            {/* Toggle button */}
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
