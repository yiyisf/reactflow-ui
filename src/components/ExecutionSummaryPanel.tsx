import React, { useMemo, useState } from 'react';
import useWorkflowStore from '../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import { CmIcon } from './icons/CmIcon';
import { analyzeExecution, formatDuration, getCategoryIcon, getCategoryColor, ExecutionSummary } from '../utils/executionAnalyzer';
import { getStatusMeta } from '../utils/statusMeta';
import { TemplateExtractor } from './template/TemplateExtractor';
import './ExecutionSummaryPanel.css';
import { Hammer, X } from 'lucide-react';

/** Sandbox dry runs use this id prefix; they are not real runs, so they cannot become templates (R17). */
const isSandboxInstance = (workflowId?: string) => !!workflowId && workflowId.startsWith('sandbox-dryrun-');

const ExecutionSummaryPanel: React.FC = () => {
    const [showExtractor, setShowExtractor] = useState(false);
    const { executionData, workflowInstance, showAnalysisPanel, setShowAnalysisPanel, switchToEditAndFocusParam, selectTaskAction, taskMap } = useWorkflowStore(useShallow((s) => ({
            executionData: s.executionData,
            workflowInstance: s.workflowInstance,
            showAnalysisPanel: s.showAnalysisPanel,
            setShowAnalysisPanel: s.setShowAnalysisPanel,
            switchToEditAndFocusParam: s.switchToEditAndFocusParam,
            selectTaskAction: s.selectTaskAction,
            taskMap: s.taskMap,
        })));

    const summary: ExecutionSummary | null = useMemo(() => {
        if (!executionData) return null;
        return analyzeExecution(executionData, workflowInstance ?? null);
    }, [executionData, workflowInstance]);

    if (!showAnalysisPanel || !summary) return null;

    const { totalTasks, completedTasks, failedTasks, skippedTasks, totalDurationMs, steps } = summary;
    const successRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const wfStatus = workflowInstance?.status;
    const wfMeta = wfStatus ? getStatusMeta(wfStatus) : null;
    const WfIcon = wfMeta?.icon;

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
                {wfMeta && WfIcon && (
                    <span className="esp-wf-status" style={{ color: wfMeta.color, display: 'inline-flex', alignItems: 'center', gap: 4 }} title={wfStatus}>
                        <WfIcon size={12} strokeWidth={1.75} aria-hidden="true" />
                        {wfMeta.label}
                    </span>
                )}
                {workflowInstance && !isSandboxInstance(workflowInstance.workflowId) && (
                    <button
                        onClick={() => setShowExtractor(true)}
                        style={{
                            padding: '3px 8px',
                            borderRadius: 5,
                            background: 'color-mix(in srgb, var(--color-brand-blue) 18%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--color-brand-blue) 40%, transparent)',
                            color: 'var(--color-brand-blue)',
                            fontSize: 11,
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            marginLeft: 'auto',
                            marginRight: 6,
                        }}
                        title="将本次执行实例脱敏并提炼为公共标准化模板"
                    >
                        <span><Hammer size={14} strokeWidth={1.75} aria-hidden="true" /></span>
                        <span>提取为模板</span>
                    </button>
                )}
                <button className="esp-close" onClick={() => setShowAnalysisPanel(false)}><X size={14} strokeWidth={1.75} aria-hidden="true" /></button>
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
                                    <span style={{ display: 'inline-flex' }}><CmIcon name={getCategoryIcon(diag.category)} size={14} /></span>
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
                        const meta = getStatusMeta(step.status);
                        const StepIcon = meta.icon;
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
                                <span className="esp-step-status" style={{ color: meta.color }} title={step.status}>
                                    <StepIcon size={12} strokeWidth={1.75} aria-hidden="true" />
                                    {meta.label}
                                </span>
                                <span className="esp-step-duration">{formatDuration(step.durationMs)}</span>
                                <span className="esp-step-retry" style={{ color: step.retryCount > 0 ? 'var(--status-failed)' : 'var(--text-secondary)' }}
                                    title={step.iterationCount > 0 ? `${step.iterationCount} 轮迭代` : undefined}>
                                    {step.retryCount > 0 ? `${step.retryCount} 次` : '-'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 管理员模板提炼工作台弹窗 */}
            {showExtractor && workflowInstance && (
                <TemplateExtractor
                    isOpen={showExtractor}
                    instance={workflowInstance}
                    onClose={() => setShowExtractor(false)}
                    onPublished={() => {
                        console.log('[ExecutionSummaryPanel] 模板已发布到本页模板中心');
                    }}
                />
            )}
        </div>
    );
};

export default ExecutionSummaryPanel;
