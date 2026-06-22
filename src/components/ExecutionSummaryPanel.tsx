import React, { useMemo } from 'react';
import useWorkflowStore from '../store/workflowStore';
import { analyzeExecution, formatDuration, getCategoryIcon, getCategoryColor, ExecutionSummary } from '../utils/executionAnalyzer';
import { ExecutionStatus } from '../types/workflow';
import './ExecutionSummaryPanel.css';

const STATUS_LABELS: Record<ExecutionStatus, string> = {
    COMPLETED: '完成',
    COMPLETED_WITH_ERRORS: '完成(含错误)',
    FAILED: '失败',
    FAILED_WITH_TERMINAL_ERROR: '终态失败',
    IN_PROGRESS: '执行中',
    SCHEDULED: '等待中',
    TIMED_OUT: '超时',
    SKIPPED: '跳过',
    CANCELED: '已取消',
};

const STATUS_COLORS: Record<string, string> = {
    COMPLETED: 'var(--status-completed)',
    COMPLETED_WITH_ERRORS: 'var(--status-completed)',
    FAILED: 'var(--status-failed)',
    FAILED_WITH_TERMINAL_ERROR: 'var(--status-failed)',
    IN_PROGRESS: 'var(--status-running)',
    SCHEDULED: 'var(--status-scheduled)',
    TIMED_OUT: 'var(--status-failed)',
    SKIPPED: 'var(--status-skipped, #6b7280)',
    CANCELED: 'var(--status-failed)',
};

const ExecutionSummaryPanel: React.FC = () => {
    const {
        executionData,
        workflowInstance,
        showAnalysisPanel,
        setShowAnalysisPanel,
        switchToEditAndFocusParam,
        selectTaskAction,
        taskMap,
    } = useWorkflowStore();

    const summary: ExecutionSummary | null = useMemo(() => {
        if (!executionData) return null;
        return analyzeExecution(executionData, workflowInstance ?? null);
    }, [executionData, workflowInstance]);

    if (!showAnalysisPanel || !summary) return null;

    const { totalTasks, completedTasks, failedTasks, skippedTasks, totalDurationMs, steps } = summary;
    const successRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const wfStatus = workflowInstance?.status;
    const statusColor = wfStatus ? STATUS_COLORS[wfStatus] ?? 'var(--text-secondary)' : 'var(--text-secondary)';

    return (
        <div className="esp-panel glass-panel">
            {/* Header */}
            <div className="esp-header">
                <div className="esp-title">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <rect x="2" y="2" width="12" height="12" rx="2" />
                        <path d="M5 8h6M5 5h3M5 11h4" />
                    </svg>
                    执行分析
                </div>
                {wfStatus && (
                    <span className="esp-wf-status" style={{ color: statusColor }}>
                        {STATUS_LABELS[wfStatus as ExecutionStatus] ?? wfStatus}
                    </span>
                )}
                <button className="esp-close" onClick={() => setShowAnalysisPanel(false)}>✕</button>
            </div>

            <div className="esp-content">
                {/* Overview Cards */}
                <div className="esp-overview">
                    <div className="esp-card">
                        <span className="esp-card-value">{totalTasks}</span>
                        <span className="esp-card-label">总任务数</span>
                    </div>
                    <div className="esp-card esp-card-success">
                        <span className="esp-card-value" style={{ color: 'var(--status-completed)' }}>{completedTasks}</span>
                        <span className="esp-card-label">已完成</span>
                    </div>
                    <div className="esp-card esp-card-failed">
                        <span className="esp-card-value" style={{ color: failedTasks > 0 ? 'var(--status-failed)' : 'var(--text-secondary)' }}>{failedTasks}</span>
                        <span className="esp-card-label">失败</span>
                    </div>
                    <div className="esp-card">
                        <span className="esp-card-value">{formatDuration(totalDurationMs)}</span>
                        <span className="esp-card-label">总耗时</span>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="esp-progress-bar">
                    <div
                        className="esp-progress-fill"
                        style={{ width: `${successRate}%`, background: failedTasks > 0 ? 'var(--status-failed)' : 'var(--status-completed)' }}
                        title={`成功率 ${successRate}%`}
                    />
                </div>
                <div className="esp-progress-label">{successRate}% 成功率{skippedTasks > 0 ? `，${skippedTasks} 个任务已跳过` : ''}</div>

                {/* Failed Diagnostics */}
                {steps.filter(s => s.diagnostics.length > 0).map(step => (
                    <div key={step.taskRef} className="esp-diagnostic-card">
                        <div className="esp-diag-task-ref">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ color: 'var(--status-failed)', flexShrink: 0 }}>
                                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0V5zm.75 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                            {step.taskRef}
                        </div>
                        {step.diagnostics.map((diag, i) => (
                            <div key={i} className="esp-diag-item" style={{ borderLeftColor: getCategoryColor(diag.category) }}>
                                <div className="esp-diag-title">
                                    <span>{getCategoryIcon(diag.category)}</span>
                                    {diag.title}
                                </div>
                                <p className="esp-diag-explanation">{diag.explanation}</p>
                                <button
                                    className="esp-fix-btn"
                                    onClick={() => switchToEditAndFocusParam(step.taskRef, diag.suggestEditParam)}
                                >
                                    去修复
                                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                        <path d="M5 8h6M9 5l3 3-3 3" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                ))}

                {/* Steps Timeline */}
                <div className="esp-section-label">步骤执行时序</div>
                <div className="esp-steps-table">
                    <div className="esp-steps-header">
                        <span>#</span>
                        <span>任务引用名</span>
                        <span>状态</span>
                        <span>耗时</span>
                        <span>重试</span>
                    </div>
                    {steps.map((step, idx) => {
                        const color = STATUS_COLORS[step.status] ?? 'var(--text-secondary)';
                        const task = taskMap[step.taskRef];
                        return (
                            <button
                                key={step.taskRef}
                                className="esp-step-row"
                                onClick={() => task && selectTaskAction(task, true)}
                                title={step.reasonForIncompletion || step.taskRef}
                            >
                                <span className="esp-step-idx">{idx + 1}</span>
                                <span className="esp-step-ref">{step.taskRef}</span>
                                <span className="esp-step-status" style={{ color }}>
                                    <span className="esp-status-dot" style={{ background: color }} />
                                    {STATUS_LABELS[step.status] ?? step.status}
                                </span>
                                <span className="esp-step-duration">{formatDuration(step.durationMs)}</span>
                                <span className="esp-step-retry" style={{ color: step.retryCount > 0 ? 'var(--status-failed)' : 'var(--text-secondary)' }}>
                                    {step.retryCount > 0 ? `${step.retryCount}次` : '-'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ExecutionSummaryPanel;
