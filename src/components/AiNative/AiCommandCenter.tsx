/**
 * AiCommandCenter — AI chat panel (left side of AiWorkflowIDE)
 *
 * Tabs: 对话 | 工作流库
 * Features: welcome chips, API-key onboarding, pending-proposal guard,
 *           streaming messages, tool-call pipeline.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import useWorkflowStore from '../../store/workflowStore';
import { useIdeStores } from '../../store/ideStoresContext';
import { AgentRunner } from '../../services/ai/agentRunner';
import type { AgentRunnerOptions } from '../../services/ai/agentRunner';
import type { WorkflowInstance } from '../../types/conductor';
import PlanCard from './PlanCard';
import RepairCard from './RepairCard';
import ClarificationCard from './ClarificationCard';
import RecommendationCard from './RecommendationCard';
import MermaidBlock from './MermaidBlock';
import ProposalPreviewCard from './ProposalPreviewCard';
import AgentTimeline from './AgentTimeline';
import FailureSummaryCard from './FailureSummaryCard';
import WorkflowRunCard from './WorkflowRunCard';
import type { ExecutionActions } from '../../types/workflow';
import type { AiEvent } from '../../types/aiEvents';
import LibraryPanel from './LibraryPanel';

interface AiCommandCenterProps {
    systemPrompt?: string;
    systemPromptExtra?: string;
    showConfigButton?: boolean;
    onShowConfig: () => void;
    executionActions?: ExecutionActions;
    onAiEvent?: (event: AiEvent) => void;
    aiPermissions?: {
        canEdit?: boolean;
        canRepair?: boolean;
        restrictionMessage?: string;
    };
    /** Whether the canvas drawer is currently open */
    canvasOpen?: boolean;
    onOpenCanvas?: () => void;
    onCloseCanvas?: () => void;
    /** Trigger execution of the current workflow. Signature matches WorkflowIDE's onTriggerExecution. */
    onTriggerExecution?: (workflowName: string, version: number, input: Record<string, any>) => Promise<{ workflowId: string }>;
    /** Poll execution status by workflowId. Signature matches WorkflowIDE's onPollExecution. */
    onPollExecution?: (workflowId: string) => Promise<WorkflowInstance | null>;
    /** Accept the pending proposal (full accept) */
    onAccept?: () => void;
    /** Reject the pending proposal */
    onReject?: () => void;
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

const renderMarkdown = (content: string): React.ReactNode => {
    const parts = content.split(/(```[\s\S]*?```)/);
    return parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
            const inner = part.slice(3, -3);
            const nlIdx = inner.indexOf('\n');
            const lang = nlIdx >= 0 ? inner.slice(0, nlIdx).trim().toLowerCase() : '';
            const code = nlIdx >= 0 ? inner.slice(nlIdx + 1) : inner;
            if (lang === 'mermaid') {
                return <MermaidBlock key={i} code={code} />;
            }
            return <pre key={i} style={{ margin: '8px 0', padding: '8px', background: 'var(--bg-primary)', borderRadius: 6, fontSize: 12, overflow: 'auto', border: '1px solid var(--border-primary)' }}><code>{code}</code></pre>;
        }
        const tokens: React.ReactNode[] = [];
        const re = /(\*\*[^*]+\*\*|`[^`]+`|\n)/g;
        let last = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(part)) !== null) {
            if (match.index > last) tokens.push(part.slice(last, match.index));
            const m = match[0];
            if (m.startsWith('**')) tokens.push(<strong key={`${i}-${match.index}`}>{m.slice(2, -2)}</strong>);
            else if (m.startsWith('`')) tokens.push(<code key={`${i}-${match.index}`} style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3, fontSize: '0.9em' }}>{m.slice(1, -1)}</code>);
            else tokens.push(<br key={`${i}-${match.index}`} />);
            last = match.index + m.length;
        }
        if (last < part.length) tokens.push(part.slice(last));
        return <span key={i}>{tokens}</span>;
    });
};

// ─── Template gallery ─────────────────────────────────────────────────────────

interface WorkflowTemplate {
    icon: string;
    name: string;
    desc: string;
    prompt: string;
}

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
    { icon: '📦', name: '订单处理', desc: '下单→支付→发货', prompt: '创建一个电商订单处理流程：下单确认、支付验证、库存扣减、发货通知' },
    { icon: '👤', name: '员工审批', desc: '申请→审批→执行', prompt: '创建一个员工申请审批流程：提交申请、直属领导审批、HR审批、结果通知' },
    { icon: '🚀', name: 'CI/CD', desc: '构建→测试→发布', prompt: '创建一个CI/CD部署流水线：代码检出、构建镜像、单元测试、推送镜像、部署发布' },
    { icon: '📧', name: '消息通知', desc: '触发→处理→发送', prompt: '创建一个消息通知工作流：接收事件、处理数据、并行发送邮件和短信通知' },
    { icon: '🔄', name: '数据同步', desc: '读取→转换→写入', prompt: '创建一个数据同步流程：从数据库读取数据、JQ转换格式、写入目标系统、发送完成通知' },
    { icon: '🔍', name: 'AI 内容审核', desc: '提交→AI审→人工', prompt: '创建一个AI辅助内容审核流程：提交内容、AI初审打分、条件分支（分数低则人工复核）、发布或拒绝' },
];

// ─── Welcome chips logic ──────────────────────────────────────────────────────

const FALLBACK_EMPTY_CHIPS = [
    '从零创建一个用户注册通知流程',
    '设计一个 CI/CD 部署流水线',
    '创建一个带人工审批的申请流程',
    '帮我设计一个数据处理管道',
];

function buildWelcomeChips(
    hasWorkflow: boolean,
    libraryItems: { workflowLevel: string; description: string }[],
): string[] {
    if (!hasWorkflow) {
        const l2 = libraryItems.filter(i => i.workflowLevel === 'L2').slice(0, 2);
        if (l2.length > 0) {
            return [
                `帮我创建一个使用「${l2[0].description}」的工作流`,
                ...(l2[1] ? [`组合「${l2[1].description}」和审批步骤成一个完整流程`] : []),
                '从零创建一个用户注册通知流程',
                '设计一个 CI/CD 部署流水线',
            ].slice(0, 4);
        }
        // Library present but no L2 items: fall back to generic chips so onboarding is never blank.
        if (libraryItems.length > 0) return FALLBACK_EMPTY_CHIPS;
        return [];  // template gallery replaces chips when canvas is empty and no library
    }
    return [
        '解读一下当前工作流的业务逻辑',
        '检查并修复当前工作流的问题',
        '为当前流程添加失败重试机制',
        '把当前流程改成并行执行',
    ];
}

// ─── Runtime status helpers ───────────────────────────────────────────────────

type RuntimeStatus = 'failed' | 'running' | 'completed' | 'none';

function getRuntimeStatus(
    mode: string,
    instanceStatus?: string,
    executionData?: Record<string, any> | null,
): RuntimeStatus {
    if (mode !== 'run') return 'none';
    if (!instanceStatus && !executionData) return 'none';
    const s = instanceStatus?.toUpperCase();
    if (s === 'FAILED' || s === 'FAILED_WITH_TERMINAL_ERROR' || s === 'TIMED_OUT' || s === 'TERMINATED') return 'failed';
    if (s === 'COMPLETED' || s === 'COMPLETED_WITH_ERRORS') return 'completed';
    if (executionData) {
        const statuses = Object.values(executionData).map((d: any) => d.status);
        if (statuses.some(s => s === 'FAILED' || s === 'FAILED_WITH_TERMINAL_ERROR')) return 'failed';
        if (statuses.some(s => s === 'IN_PROGRESS' || s === 'SCHEDULED')) return 'running';
    }
    return 'running';
}

/** First failed task's ref + failure reason, for FailureSummaryCard (M4.1). Task *type* comes from taskMap, not executionData. */
function getFirstFailedTask(
    executionData?: Record<string, any> | null,
): { ref: string; reason?: string } | null {
    if (!executionData) return null;
    for (const ref of Object.keys(executionData)) {
        const data = executionData[ref];
        if (data.status === 'FAILED' || data.status === 'FAILED_WITH_TERMINAL_ERROR' || data.status === 'TIMED_OUT') {
            return { ref, reason: data.reasonForIncompletion };
        }
    }
    return null;
}

function buildRuntimeChips(
    status: RuntimeStatus,
    workflowName: string,
    executionData?: Record<string, any> | null,
): string[] {
    if (status === 'none') return [];
    const firstFailedRef = executionData
        ? Object.keys(executionData).find(r => {
            const s = executionData[r].status;
            return s === 'FAILED' || s === 'FAILED_WITH_TERMINAL_ERROR' || s === 'TIMED_OUT';
        })
        : undefined;
    if (status === 'failed') {
        return [
            firstFailedRef ? `分析「${firstFailedRef}」的失败原因` : `分析「${workflowName}」的失败原因`,
            '为所有失败的任务生成修复方案',
            '总结本次执行的完整过程',
        ];
    }
    if (status === 'completed') {
        return [
            `生成「${workflowName}」本次执行的摘要报告`,
            '对比工作流设计与实际执行路径',
            '有哪些任务耗时较长，如何优化？',
        ];
    }
    // running
    return [
        `解释「${workflowName}」当前的执行进度`,
        '当前执行路径与预期是否一致？',
    ];
}

// ─── Node context chips ───────────────────────────────────────────────────────

function buildNodeChips(
    taskRef: string,
    taskType: string,
    executionStatus?: string,
): string[] {
    // Run-mode: failure analysis chips take priority
    const isFailed = executionStatus === 'FAILED' || executionStatus === 'FAILED_WITH_TERMINAL_ERROR' || executionStatus === 'TIMED_OUT';
    if (isFailed) {
        return [
            `分析「${taskRef}」失败的根本原因`,
            `查看「${taskRef}」的输入和输出数据`,
            `为「${taskRef}」的失败生成修复建议`,
        ];
    }
    const base = [
        `解释「${taskRef}」节点的作用`,
        `为「${taskRef}」添加失败重试机制`,
    ];
    if (taskType === 'HTTP') return [...base, `修改「${taskRef}」的请求参数和输出映射`];
    if (taskType === 'HUMAN') return [...base, `调整「${taskRef}」的审批超时和通知方式`];
    if (taskType === 'SUB_WORKFLOW') return [...base, `说明「${taskRef}」子工作流的输入输出`];
    if (taskType === 'SWITCH' || taskType === 'DECISION') return [...base, `为「${taskRef}」增加一个分支条件`];
    if (taskType === 'FORK_JOIN' || taskType === 'FORK_JOIN_DYNAMIC') return [...base, `在「${taskRef}」的并行分支中添加新任务`];
    return [...base, `在「${taskRef}」之后插入一个新任务`];
}

// ─── Component ────────────────────────────────────────────────────────────────

const AiCommandCenter: React.FC<AiCommandCenterProps> = ({
    systemPrompt,
    systemPromptExtra,
    showConfigButton = true,
    onShowConfig,
    executionActions,
    onAiEvent,
    aiPermissions,
    canvasOpen,
    onOpenCanvas,
    onCloseCanvas,
    onTriggerExecution,
    onPollExecution,
    onAccept,
    onReject,
}) => {
    const { aiStore, libraryStore, toolRegistry } = useIdeStores();
    const {
        messages,
        isStreaming,
        streamingText,
        config,
        pendingProposal,
        pendingPlan,
        pendingRepair,
        followUpChips,
        undoStack,
        pendingClarification,
        pendingRecommendation,
        pendingAutoSend,
        toolStatus,
        timelineEntries,
        retryInput,
        setRetryInput,
        clearMessages,
        clearPlan,
        clearRepair,
        popUndo,
        clearClarification,
        clearRecommendation,
        setPendingAutoSend,
    } = aiStore();

    const workflowDef = useWorkflowStore(s => s.workflowDef);
    const selectedTask = useWorkflowStore(s => s.selectedTask);
    const selectTaskAction = useWorkflowStore(s => s.selectTaskAction);
    const mode = useWorkflowStore(s => s.mode);
    const workflowInstance = useWorkflowStore(s => s.workflowInstance);
    const executionData = useWorkflowStore(s => s.executionData);
    const validationResults = useWorkflowStore(s => s.validationResults);
    const taskMap = useWorkflowStore(s => s.taskMap);
    const libraryItems = libraryStore(s => s.items);

    const [inputValue, setInputValue] = useState('');
    const [activeTab, setActiveTab] = useState<'chat' | 'library'>('chat');
    // Inline execution run card
    const [showRunCard, setShowRunCard] = useState(false);
    // M4.1: FailureSummaryCard dismissal, reset per execution instance (not per render)
    const [dismissedFailureFor, setDismissedFailureFor] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // AgentRunner owns the agentic loop; options can change every render (props),
    // so a "latest" ref feeds them to the runner without recreating the instance.
    const optionsRef = useRef<AgentRunnerOptions>({ systemPrompt, systemPromptExtra, aiPermissions, onAiEvent });
    optionsRef.current = { systemPrompt, systemPromptExtra, aiPermissions, onAiEvent };
    const [runner] = useState(() => new AgentRunner(() => optionsRef.current, { aiStore, libraryStore, toolRegistry }));

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingText]);

    useEffect(() => {
        return () => { runner.abort(); };
    }, [runner]);

    // Consume pendingAutoSend: triggered by external code (proposal acceptance, canvas click, wizard).
    // Pending proposal/plan/clarification/recommendation cards no longer block sending — the user
    // can always keep talking, and a follow-up message is treated as further input on whatever is
    // currently pending (see buildSystemPrompt's proposal-context injection).
    useEffect(() => {
        if (!pendingAutoSend || isStreaming) return;
        setPendingAutoSend(null);
        runner.send(pendingAutoSend);
    }, [pendingAutoSend, isStreaming, runner]);

    const autoResize = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    };

    const handleSend = useCallback(() => {
        const text = inputValue.trim();
        if (!text) return;
        setInputValue('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        runner.send(text);
    }, [inputValue, runner]);

    const handleChipClick = useCallback((chip: string) => {
        runner.send(chip);
    }, [runner]);

    const handleStop = () => { runner.abort(); };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Execute the pending plan: clear it and re-prompt the AI to proceed
    const handleExecutePlan = useCallback(() => {
        const plan = aiStore.getState().pendingPlan;
        if (!plan) return;
        clearPlan();
        onAiEvent?.({ type: 'plan:executed', timestamp: Date.now() });
        runner.send('请按照上述计划执行');
    }, [clearPlan, runner, onAiEvent]);

    const handleCancelPlan = useCallback(() => {
        clearPlan();
        onAiEvent?.({ type: 'plan:cancelled', timestamp: Date.now() });
    }, [clearPlan, onAiEvent]);

    // M4.1: close the loop on a dispatched repair action — poll the (already-provided)
    // onPollExecution until a terminal status is reached and report the outcome back
    // into the chat, instead of the card just disappearing with no follow-up. Fire-
    // and-forget by design: executionActions callbacks are void (not Promise-returning,
    // a pre-1.0 API contract shared with WorkflowIDE), so completion can only be
    // observed by polling, not by awaiting the dispatch itself.
    const POLL_REPAIR_ATTEMPTS = 5;
    const POLL_REPAIR_INTERVAL_MS = 3000;
    const REPAIR_TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'TIMED_OUT', 'TERMINATED']);
    const pollRepairOutcome = useCallback(async (wfId: string, actionLabel: string) => {
        if (!onPollExecution || !wfId) return;
        for (let i = 0; i < POLL_REPAIR_ATTEMPTS; i++) {
            await new Promise(resolve => setTimeout(resolve, POLL_REPAIR_INTERVAL_MS));
            try {
                const instance = await onPollExecution(wfId);
                if (instance && REPAIR_TERMINAL_STATUSES.has(instance.status)) {
                    const outcome = instance.status === 'COMPLETED'
                        ? `✓ ${actionLabel}成功，工作流已恢复正常执行。`
                        : `✗ ${actionLabel}后仍未成功（状态：${instance.status}），可能需要进一步排查。`;
                    aiStore.getState().addMessage({ role: 'assistant', content: outcome });
                    return;
                }
            } catch {
                // ignore individual poll errors — try again on the next attempt
            }
        }
        // Gave up after POLL_REPAIR_ATTEMPTS without reaching a terminal state — stay
        // silent rather than guessing at an outcome we don't actually know.
    }, [onPollExecution, aiStore]);

    const handleRepairAction = useCallback((action: import('../../store/aiStore').RepairAction) => {
        // RepairCard only calls this after the user's inline second-click confirmation —
        // record that confirmation distinctly from the dispatch below for a complete audit trail.
        onAiEvent?.({ type: 'repair:confirmed', timestamp: Date.now(), repairActionType: action.type });
        const instance = useWorkflowStore.getState().workflowInstance;
        const wfId = instance?.workflowId ?? '';
        switch (action.type) {
            case 'rerun_from':
                executionActions?.onRerunFromTask?.(wfId, action.taskRef ?? '');
                pollRepairOutcome(wfId, `从「${action.taskRef}」重跑`);
                break;
            case 'skip':
                executionActions?.onSkipTask?.(wfId, action.taskRef ?? '');
                pollRepairOutcome(wfId, `跳过「${action.taskRef}」`);
                break;
            case 'retry_workflow':
                executionActions?.onRetry?.(wfId);
                pollRepairOutcome(wfId, '重试整个工作流');
                break;
            default:
                break;
        }
        onAiEvent?.({ type: 'repair:executed', timestamp: Date.now(), repairActionType: action.type });
        clearRepair();
    }, [executionActions, clearRepair, onAiEvent, pollRepairOutcome]);

    const handleDismissRepair = useCallback(() => {
        clearRepair();
        onAiEvent?.({ type: 'repair:dismissed', timestamp: Date.now() });
    }, [clearRepair, onAiEvent]);

    // Undo handler: restores the previous workflow before the last AI accept
    const handleUndo = useCallback(() => {
        const prev = popUndo();
        if (!prev) return;
        useWorkflowStore.getState().setWorkflow(prev);
        useWorkflowStore.getState().setMode('edit');
        onAiEvent?.({ type: 'undo:applied', timestamp: Date.now() });
    }, [popUndo, onAiEvent]);

    const welcomeChips = buildWelcomeChips(!!workflowDef, libraryItems);
    const hasLibrary = libraryItems.length > 0;
    const noApiKey = !config.apiKey && !config.transport && showConfigButton;
    // D3: show template gallery when canvas is empty and only welcome msg exists
    const showTemplates = !workflowDef && messages.length === 1 && messages[0].id === 'welcome' && libraryItems.length === 0;
    // Staleness: proposal was generated against an older version of the workflow
    const isProposalStale = !!(pendingProposal && pendingProposal.baselineHash !== JSON.stringify(workflowDef));

    const handleClarificationSelect = useCallback((optionText: string) => {
        clearClarification();
        runner.send(optionText);
    }, [clearClarification, runner]);

    const handleClarificationCustom = useCallback(() => {
        clearClarification();
        if (textareaRef.current) textareaRef.current.focus();
    }, [clearClarification]);

    const handleUseWorkflow = useCallback((workflowName: string) => {
        clearRecommendation();
        runner.send(`加载并使用工作流：${workflowName}`);
    }, [clearRecommendation, runner]);

    const handleModifyWorkflow = useCallback((workflowName: string) => {
        clearRecommendation();
        runner.send(`以「${workflowName}」为基础，按照我的需求修改`);
    }, [clearRecommendation, runner]);

    const handleCreateNew = useCallback(() => {
        clearRecommendation();
        runner.send('不使用现有工作流，从头创建新工作流');
    }, [clearRecommendation, runner]);

    // Error-node chips: when selected task has validation errors, surface fix chip
    const selectedTaskErrors = selectedTask
        ? validationResults.errors.filter(e => e.ref === selectedTask.taskReferenceName)
        : [];
    const canEdit = aiPermissions?.canEdit !== false;
    const isRestricted = !canEdit;
    const restrictionMessage = aiPermissions?.restrictionMessage ?? 'AI 当前处于只读模式，无法修改工作流';
    // F2: runtime status & chips
    const runtimeStatus = getRuntimeStatus(mode, workflowInstance?.status, executionData);
    const runtimeChips = buildRuntimeChips(runtimeStatus, workflowDef?.name ?? '', executionData);

    // M4.1: proactive failure card — shown wherever the user currently is, not just
    // near the welcome message. Suppressed once a RepairCard already exists for this
    // failure (avoids showing two "please diagnose this" prompts at once) or once the
    // user dismisses it for this specific execution instance.
    const firstFailedTask = runtimeStatus === 'failed' ? getFirstFailedTask(executionData) : null;
    const currentExecutionId = workflowInstance?.workflowId ?? '';
    const showFailureCard = !!firstFailedTask && !pendingRepair && !isStreaming && dismissedFailureFor !== currentExecutionId;

    return (
        <>
            {/* Tab bar */}
            <div className="ai-panel-tabs" role="tablist">
                <button
                    className={`ai-panel-tab ${activeTab === 'chat' ? 'active' : ''}`}
                    onClick={() => setActiveTab('chat')}
                    role="tab"
                    aria-selected={activeTab === 'chat'}
                >
                    💬 对话
                </button>
                {hasLibrary && (
                    <button
                        className={`ai-panel-tab ${activeTab === 'library' ? 'active' : ''}`}
                        onClick={() => setActiveTab('library')}
                        role="tab"
                        aria-selected={activeTab === 'library'}
                    >
                        📚 工作流库
                        <span className="ai-panel-tab-count">{libraryItems.length}</span>
                    </button>
                )}
            </div>

            {/* Library panel */}
            {activeTab === 'library' && <LibraryPanel />}

            {/* Chat panel */}
            {activeTab === 'chat' && (
                <>
                    <div className="ai-cc-header">
                        <div className="ai-cc-title">
                            <span className="ai-cc-title-icon">✨</span>
                            AI 工作流助手
                            {workflowDef && (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
                                    · {workflowDef.name}
                                </span>
                            )}
                        </div>
                        <div className="ai-cc-actions">
                            {/* ▶ Run workflow button — only when workflow loaded and execution wired */}
                            {workflowDef && onTriggerExecution && onPollExecution && !showRunCard && (
                                <button
                                    className="ai-run-header-btn"
                                    onClick={() => setShowRunCard(true)}
                                    disabled={isStreaming}
                                    title="执行当前工作流"
                                >
                                    ▶ 执行
                                </button>
                            )}
                            {(onOpenCanvas || onCloseCanvas) && (
                                <button
                                    onClick={canvasOpen ? onCloseCanvas : onOpenCanvas}
                                    title={canvasOpen ? '关闭画布' : '查看画布'}
                                    aria-label={canvasOpen ? '关闭画布' : '查看画布'}
                                    className={`ai-canvas-toggle-btn${canvasOpen ? ' active' : ''}`}
                                >
                                    🗺️
                                </button>
                            )}
                            {showConfigButton && (
                                <button onClick={onShowConfig} title="配置 AI 服务" aria-label="配置 AI 服务">⚙️</button>
                            )}
                            <button
                                onClick={() => { runner.abort(); clearMessages(); }}
                                title="清空对话"
                                aria-label="清空对话"
                            >🗑️</button>
                        </div>
                    </div>

                    {/* F2: Runtime status banner */}
                    {mode === 'run' && runtimeStatus !== 'none' && (
                        <div className={`ai-runtime-banner ai-runtime-banner-${runtimeStatus}`}>
                            <span className="ai-runtime-banner-icon">
                                {runtimeStatus === 'failed' ? '🔴' : runtimeStatus === 'completed' ? '✅' : '🔵'}
                            </span>
                            <span className="ai-runtime-banner-text">
                                {runtimeStatus === 'failed' && '工作流执行失败 — AI 可协助分析原因'}
                                {runtimeStatus === 'completed' && '工作流执行完成 — AI 可生成摘要报告'}
                                {runtimeStatus === 'running' && '工作流执行中 — AI 可解释当前进度'}
                            </span>
                        </div>
                    )}

                    <div className="ai-cc-messages" role="log" aria-live="polite" aria-relevant="additions">
                        {/* Permission restriction banner */}
                        {isRestricted && (
                            <div className="ai-permission-banner" role="alert">
                                <span className="ai-permission-icon">🔒</span>
                                <span>{restrictionMessage}</span>
                            </div>
                        )}

                        {/* A1: Onboarding card when no API key */}
                        {noApiKey && (
                            <div className="ai-onboarding-card">
                                <div className="ai-onboarding-icon">🤖</div>
                                <div className="ai-onboarding-title">配置 AI 服务，开始使用</div>
                                <div className="ai-onboarding-desc">
                                    只需填写 API Key，即可用自然语言创建和编辑工作流。支持 OpenAI、Anthropic、DeepSeek、Groq 等主流服务。
                                </div>
                                <button className="ai-onboarding-btn" onClick={onShowConfig}>
                                    ⚙️ 立即配置
                                </button>
                            </div>
                        )}

                        {/* Messages */}
                        {messages.map(msg => (
                            <React.Fragment key={msg.id}>
                                <div className={`ai-cc-msg ${msg.role}`}>
                                    {msg.role === 'assistant'
                                        ? renderMarkdown(msg.content)
                                        : msg.content
                                    }
                                </div>
                                {/* A2: Welcome chips / D3: Template gallery below welcome msg */}
                                {msg.id === 'welcome' && (
                                    <>
                                        {/* D3: Template gallery replaces chips when canvas is empty */}
                                        {showTemplates && (
                                            <div className="ai-template-gallery">
                                                <div className="ai-template-gallery-label">快速开始 — 选择一个场景模板</div>
                                                <div className="ai-template-grid">
                                                    {WORKFLOW_TEMPLATES.map(t => (
                                                        <button
                                                            key={t.name}
                                                            className="ai-template-card"
                                                            onClick={() => handleChipClick(t.prompt)}
                                                            disabled={isStreaming}
                                                            title={t.prompt}
                                                        >
                                                            <span className="ai-template-icon">{t.icon}</span>
                                                            <span className="ai-template-name">{t.name}</span>
                                                            <span className="ai-template-desc">{t.desc}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {/* Regular chips (library-driven or has-workflow) */}
                                        {welcomeChips.length > 0 && (
                                            <div className="ai-welcome-chips">
                                                {welcomeChips.map(chip => (
                                                    <button
                                                        key={chip}
                                                        className="ai-welcome-chip"
                                                        onClick={() => handleChipClick(chip)}
                                                        disabled={isStreaming}
                                                    >
                                                        {chip}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {/* F2: Runtime analysis chips */}
                                        {runtimeChips.length > 0 && (
                                            <div className="ai-follow-up-chips">
                                                <div className="ai-follow-up-label">
                                                    {runtimeStatus === 'failed' ? '失败分析' : runtimeStatus === 'completed' ? '执行报告' : '执行洞察'}
                                                </div>
                                                {runtimeChips.map(chip => (
                                                    <button
                                                        key={chip}
                                                        className={`ai-welcome-chip follow-up runtime-${runtimeStatus}`}
                                                        onClick={() => handleChipClick(chip)}
                                                        disabled={isStreaming}
                                                    >
                                                        {chip}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </React.Fragment>
                        ))}

                        {/* Inline execution run card */}
                        {showRunCard && workflowDef && onTriggerExecution && onPollExecution && (
                            <WorkflowRunCard
                                workflowDef={workflowDef}
                                onTriggerExecution={onTriggerExecution}
                                onPollExecution={onPollExecution}
                                onClose={() => setShowRunCard(false)}
                            />
                        )}

                        {/* Proposal preview: business step list, accept / reject without opening canvas */}
                        {pendingProposal && !isStreaming && onAccept && onReject && (
                            <ProposalPreviewCard
                                proposal={pendingProposal}
                                currentDef={workflowDef}
                                isStale={isProposalStale}
                                onAccept={onAccept}
                                onReject={onReject}
                            />
                        )}

                        {/* PlanCard: pending AI plan awaiting user confirmation */}
                        {pendingPlan && !isStreaming && (
                            <PlanCard
                                plan={pendingPlan}
                                onExecute={handleExecutePlan}
                                onCancel={handleCancelPlan}
                            />
                        )}

                        {/* FailureSummaryCard: proactive failure surface (M4.1) */}
                        {showFailureCard && firstFailedTask && (
                            <FailureSummaryCard
                                taskRef={firstFailedTask.ref}
                                taskType={taskMap[firstFailedTask.ref]?.type ?? '未知类型'}
                                reason={firstFailedTask.reason}
                                onDiagnose={() => runner.send(`「${firstFailedTask.ref}」执行失败，请诊断失败原因并生成修复方案`)}
                                onDismiss={() => setDismissedFailureFor(currentExecutionId)}
                            />
                        )}

                        {/* RepairCard: runtime failure diagnosis + repair actions */}
                        {pendingRepair && !isStreaming && (
                            <RepairCard
                                repair={pendingRepair}
                                canExecute={!!(executionActions?.onRerunFromTask || executionActions?.onSkipTask || executionActions?.onRetry)}
                                onExecuteAction={handleRepairAction}
                                onDismiss={handleDismissRepair}
                            />
                        )}

                        {/* ClarificationCard: intent mining — ask user to clarify vague input */}
                        {pendingClarification && !isStreaming && (
                            <ClarificationCard
                                clarification={pendingClarification}
                                onSelect={handleClarificationSelect}
                                onCustom={handleClarificationCustom}
                            />
                        )}

                        {/* RecommendationCard: recommend existing workflows before creating new */}
                        {pendingRecommendation && !isStreaming && (
                            <RecommendationCard
                                recommendation={pendingRecommendation}
                                onUseWorkflow={handleUseWorkflow}
                                onModifyWorkflow={handleModifyWorkflow}
                                onCreateNew={handleCreateNew}
                            />
                        )}

                        {/* Agent timeline: completed steps + current in-flight step */}
                        {isStreaming && (
                            <AgentTimeline entries={timelineEntries} activeLabel={toolStatus} />
                        )}

                        {/* Streaming text */}
                        {isStreaming && streamingText && (
                            <div className="ai-cc-streaming">
                                {renderMarkdown(streamingText)}
                                <span className="ai-streaming-cursor" />
                            </div>
                        )}

                        {/* Thinking skeleton — only before the timeline has anything to show */}
                        {isStreaming && !streamingText && !toolStatus && timelineEntries.length === 0 && (
                            <div className="ai-cc-thinking">
                                <div className="ai-skeleton-line" style={{ width: '80%' }} />
                                <div className="ai-skeleton-line" style={{ width: '60%' }} />
                                <div className="ai-skeleton-line" style={{ width: '70%' }} />
                            </div>
                        )}

                        {/* D1: Follow-up chips after proposal acceptance */}
                        {followUpChips && followUpChips.length > 0 && !isStreaming && (
                            <div className="ai-follow-up-chips">
                                <div className="ai-follow-up-label">继续优化</div>
                                {followUpChips.map(chip => (
                                    <button
                                        key={chip}
                                        className="ai-welcome-chip follow-up"
                                        onClick={() => handleChipClick(chip)}
                                    >
                                        {chip}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* D2: Retry button after AI error */}
                        {retryInput && !isStreaming && (
                            <div className="ai-retry-row">
                                <button
                                    className="ai-retry-btn"
                                    onClick={() => {
                                        const t = retryInput;
                                        setRetryInput(null);
                                        runner.send(t);
                                    }}
                                >
                                    ↺ 重试上一条消息
                                </button>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Undo button: visible when there's an AI change to undo */}
                    {undoStack.length > 0 && !isStreaming && !pendingProposal && (
                        <div className="ai-undo-row">
                            <button className="ai-undo-btn" onClick={handleUndo} title="撤销最近一次 AI 变更，恢复到变更前的状态">
                                ↩ 撤销上次 AI 变更
                                <span className="ai-undo-depth">{undoStack.length}</span>
                            </button>
                        </div>
                    )}

                    {/* E2: Selected node context strip */}
                    {selectedTask && !isStreaming && (
                        <div className="ai-node-context-strip">
                            <div className="ai-node-context-header">
                                <span className="ai-node-context-label">
                                    <span className="ai-node-context-type">{selectedTask.type}</span>
                                    <span className="ai-node-context-ref">{selectedTask.taskReferenceName}</span>
                                </span>
                                <button
                                    className="ai-node-context-dismiss"
                                    onClick={() => selectTaskAction(null)}
                                    title="取消选中"
                                    aria-label="取消选中节点"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="ai-node-context-chips">
                                {/* Error-fix chip: shown first when node has validation errors */}
                                {selectedTaskErrors.length > 0 && canEdit && (
                                    <button
                                        className="ai-node-context-chip error-fix"
                                        onClick={() => handleChipClick(`修复「${selectedTask.taskReferenceName}」的 ${selectedTaskErrors.length} 个校验错误`)}
                                    >
                                        🔧 修复 {selectedTaskErrors.length} 个校验错误
                                    </button>
                                )}
                                {buildNodeChips(
                                    selectedTask.taskReferenceName,
                                    selectedTask.type,
                                    executionData?.[selectedTask.taskReferenceName]?.status,
                                ).map(chip => (
                                    <button
                                        key={chip}
                                        className="ai-node-context-chip"
                                        onClick={() => handleChipClick(chip)}
                                    >
                                        {chip}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="ai-cc-input-area">
                        <div className="ai-cc-input-container">
                            <textarea
                                ref={textareaRef}
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onInput={autoResize}
                                onKeyDown={handleKeyDown}
                                placeholder={
                                    isStreaming ? 'AI 正在思考...'
                                        : pendingProposal ? '继续描述修改意见，或点击上方"应用变更"…'
                                            : '描述你想要的工作流...（Shift+Enter 换行）'
                                }
                                aria-label="向 AI 描述你想要的工作流"
                                disabled={isStreaming}
                                rows={1}
                            />
                            {isStreaming ? (
                                <button className="ai-cc-send-btn stop" onClick={handleStop} title="停止" aria-label="停止生成">⏹</button>
                            ) : (
                                <button className="ai-cc-send-btn" onClick={handleSend} title="发送（Enter）" aria-label="发送消息">🚀</button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </>
    );
};

export default AiCommandCenter;
