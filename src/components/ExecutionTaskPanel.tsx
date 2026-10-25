import { useState, useRef, useEffect } from 'react';
import useWorkflowStore from '../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import { ExecutionActions } from '../types/workflow';
import { getStatusMeta } from '../utils/statusMeta';
import { countIterations, countRetries } from '../utils/executionImport';

interface ExecutionTaskPanelProps {
    executionActions?: ExecutionActions;
}

const getStatusColor = (status?: string) =>
    status ? getStatusMeta(status).color : 'var(--text-secondary)';

/** `color-mix` tint of a status colour (a hex alpha suffix does not work on `var(...)`). */
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

const formatDuration = (start?: number, end?: number) => {
    if (!start) return '-';
    const ms = (end ?? Date.now()) - start;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
};

const formatTime = (ts?: number) =>
    ts ? new Date(ts).toLocaleTimeString() : '-';

/**
 * 运行态任务详情面板 — 与定义态 TaskDetailPanel 样式对齐，全高侧边布局
 */
const ExecutionTaskPanel: React.FC<ExecutionTaskPanelProps> = ({ executionActions }) => {
    const { selectedTask, selectedTaskInstance, setSelectedTask, setSelectedTaskInstance, executionData, workflowInstance } = useWorkflowStore(useShallow((s) => ({
            selectedTask: s.selectedTask,
            selectedTaskInstance: s.selectedTaskInstance,
            setSelectedTask: s.setSelectedTask,
            setSelectedTaskInstance: s.setSelectedTaskInstance,
            executionData: s.executionData,
            workflowInstance: s.workflowInstance,
        })));

    const [activeTab, setActiveTab] = useState<'summary' | 'input' | 'output'>('summary');
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        contentRef.current?.scrollTo({ top: 0 });
    }, [activeTab, selectedTask?.taskReferenceName]);

    // Reset tab to summary when task changes
    useEffect(() => {
        setActiveTab('summary');
    }, [selectedTask?.taskReferenceName]);

    const isGlobal = selectedTask?.taskReferenceName === '__workflow_global__';
    const taskExecution = selectedTask ? executionData?.[selectedTask.taskReferenceName] : null;

    if (!selectedTask || (!taskExecution && !isGlobal)) return null;

    const attempts = taskExecution?.attempts ?? [];
    // R4: only honour the selected attempt when it belongs to this task.
    const currentInstance = (selectedTaskInstance && attempts.some(a => a.taskId === selectedTaskInstance.taskId)
        ? selectedTaskInstance
        : undefined) ?? attempts[attempts.length - 1];
    // R5: iterations and retries are counted separately.
    const retryTotal = countRetries(attempts);
    const iterationTotal = countIterations(attempts);

    const wfId = workflowInstance?.workflowId ?? '';
    const wfStatus = workflowInstance?.status;
    const taskStatus = taskExecution?.status;

    const displayStatus = isGlobal ? wfStatus : (currentInstance?.status ?? taskStatus);
    const statusMeta = displayStatus ? getStatusMeta(displayStatus) : null;
    const StatusIcon = statusMeta?.icon;
    const displayStart = isGlobal ? workflowInstance?.startTime : currentInstance?.startTime;
    const displayEnd = isGlobal ? workflowInstance?.endTime : currentInstance?.endTime;
    const displayError = isGlobal
        ? workflowInstance?.reasonForIncompletion
        : currentInstance?.reasonForIncompletion;
    const displayId = isGlobal ? workflowInstance?.workflowId : currentInstance?.taskId;
    const displayInput = isGlobal ? workflowInstance?.input : currentInstance?.inputData;
    const displayOutput = isGlobal ? workflowInstance?.output : currentInstance?.outputData;

    const canSkip = !isGlobal
        && executionActions?.onSkipTask
        && (taskStatus === 'SCHEDULED' || taskStatus === 'IN_PROGRESS')
        && (wfStatus === 'RUNNING' || wfStatus === 'PAUSED');

    const canRerunFromTask = !isGlobal
        && executionActions?.onRerunFromTask
        && (wfStatus === 'FAILED' || wfStatus === 'TERMINATED' || wfStatus === 'COMPLETED' || wfStatus === 'TIMED_OUT');

    const hasTaskOps = canSkip || canRerunFromTask;

    // 操作权限：allowOperations 未设置或为 true 时允许，false 时禁用所有操作
    const allowOperations = executionActions?.allowOperations !== false;

    const handleClose = () => {
        setSelectedTask(null);
        setSelectedTaskInstance(null);
    };

    const borderColor = 'var(--glass-border)';
    const secondaryText = 'var(--text-secondary)';
    const inputBg = 'var(--bg-tertiary)';

    return (
        <div
            className="detail-panel-container panel-enter-active"
            style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 450,
                zIndex: 1200,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-primary)',
                borderLeft: `1px solid ${borderColor}`,
                boxShadow: 'var(--cm-shadow-float)',
                overflow: 'hidden',
            }}
        >
            {/* ── Header ── */}
            <div style={{
                padding: '20px 24px',
                borderBottom: `1px solid ${borderColor}`,
                background: 'var(--bg-secondary)',
                flexShrink: 0,
            }}>
                {/* Top row: type badge + status badge + close */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{
                        background: 'var(--color-accent)',
                        color: 'var(--color-on-accent)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 'bold',
                        letterSpacing: '1px',
                        flexShrink: 0,
                    }}>
                        {isGlobal ? 'WORKFLOW' : (selectedTask.type || 'TASK')}
                    </div>

                    {displayStatus && statusMeta && StatusIcon && (
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            background: tint(getStatusColor(displayStatus), 10),
                            color: getStatusColor(displayStatus),
                            letterSpacing: '0.5px',
                            flexShrink: 0,
                        }}>
                            <StatusIcon size={12} strokeWidth={1.75} aria-hidden="true" />
                            <span title={displayStatus}>{statusMeta?.label}</span>
                        </div>
                    )}

                    <div style={{ flex: 1 }} />

                    <button
                        onClick={handleClose}
                        style={{ background: 'none', border: 'none', color: secondaryText, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}
                    ><X size={14} strokeWidth={1.75} aria-hidden="true" /></button>
                </div>

                {/* Task name */}
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    {isGlobal ? '工作流全局数据' : selectedTask.name}
                </div>

                {/* Ref name */}
                <div style={{ fontSize: 12, color: secondaryText, marginTop: 6, fontFamily: 'monospace', opacity: 0.8 }}>
                    REF: {selectedTask.taskReferenceName}
                </div>
            </div>

            {/* ── Attempt Selector ── */}
            {attempts.length > 1 && (
                <div style={{
                    padding: '12px 24px',
                    borderBottom: `1px solid ${borderColor}`,
                    background: 'var(--bg-secondary)',
                    flexShrink: 0,
                }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: secondaryText, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        执行记录（{attempts.length} 次{iterationTotal > 0 ? `，${iterationTotal} 轮迭代` : '尝试'}{retryTotal > 0 ? `，重试 ${retryTotal} 次` : ''}）
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {attempts.map((inst, idx) => {
                            const isActive = currentInstance?.taskId === inst.taskId;
                            return (
                                <button
                                    key={inst.taskId}
                                    onClick={() => setSelectedTaskInstance(inst)}
                                    style={{
                                        padding: '4px 12px',
                                        borderRadius: 20,
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        border: `1px solid ${isActive ? 'var(--color-accent)' : borderColor}`,
                                        background: isActive ? 'var(--color-accent)' : 'var(--bg-tertiary)',
                                        color: isActive ? 'var(--color-on-accent)' : 'var(--text-primary)',
                                        fontFamily: 'inherit',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {inst.iteration
                                        ? `迭代 ${inst.iteration}${inst.retryCount ? ` · 重试 ${inst.retryCount}` : ''}`
                                        : `尝试 ${idx + 1}`}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Tabs ── */}
            <div style={{
                display: 'flex',
                borderBottom: `1px solid ${borderColor}`,
                background: 'var(--bg-secondary)',
                flexShrink: 0,
            }}>
                {(['summary', 'input', 'output'] as const).map(tab => {
                    const labels = { summary: '概览', input: '输入 JSON', output: '输出 JSON' };
                    const isActive = activeTab === tab;
                    return (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '10px 20px',
                                background: 'none',
                                border: 'none',
                                borderBottom: `2px solid ${isActive ? 'var(--color-accent)' : 'transparent'}`,
                                color: isActive ? 'var(--color-accent)' : secondaryText,
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: isActive ? 600 : 400,
                                fontFamily: 'inherit',
                                transition: 'all 0.15s',
                            }}
                        >
                            {labels[tab]}
                        </button>
                    );
                })}
            </div>

            {/* ── Content ── */}
            <div ref={contentRef} style={{ flex: 1, overflowY: 'auto', padding: 24, background: 'var(--bg-primary)' }}>

                {activeTab === 'summary' && (
                    <>
                        {/* 时间统计卡片 */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 16,
                            marginBottom: 24,
                        }}>
                            {[
                                { label: '总耗时', value: formatDuration(displayStart, displayEnd) },
                                { label: '开始时间', value: formatTime(displayStart) },
                                { label: '结束时间', value: formatTime(displayEnd) },
                                {
                                    label: isGlobal ? 'Workflow ID' : 'Task ID',
                                    value: (
                                        <span style={{ fontSize: 10, fontFamily: 'monospace', opacity: 0.7, wordBreak: 'break-all' }}>
                                            {displayId ?? '-'}
                                        </span>
                                    ),
                                },
                            ].map(({ label, value }) => (
                                <div key={label} style={{
                                    padding: '12px 14px',
                                    background: inputBg,
                                    borderRadius: 10,
                                    border: `1px solid ${borderColor}`,
                                }}>
                                    <div style={{ fontSize: 10, color: secondaryText, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, fontWeight: 600 }}>
                                        {label}
                                    </div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
                                        {value}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 重试次数（仅多次尝试时） */}
                        {retryTotal > 0 && (
                            <div style={{
                                marginBottom: 20,
                                padding: '10px 14px',
                                background: tint(getStatusColor(taskStatus), 6),
                                border: `1px solid ${tint(getStatusColor(taskStatus), 20)}`,
                                borderRadius: 8,
                                fontSize: 12,
                                color: getStatusColor(taskStatus),
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}>
                                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                    <path d="M13 2v4h-4" /><path d="M13 6A7 7 0 1 1 9.5 2.5" />
                                </svg>
                                已重试 {retryTotal} 次，共 {attempts.length} 次尝试{iterationTotal > 0 ? `（${iterationTotal} 轮迭代）` : ''}
                            </div>
                        )}

                        {/* Worker ID */}
                        {!isGlobal && currentInstance?.workerId && (
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 10, color: secondaryText, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, fontWeight: 600 }}>Worker</div>
                                <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-primary)', opacity: 0.8 }}>{currentInstance.workerId}</div>
                            </div>
                        )}

                        {/* 错误信息 */}
                        {displayError && (
                            <div style={{
                                padding: 14,
                                background: 'color-mix(in srgb, var(--cm-status-failed) 8%, transparent)',
                                borderLeft: '3px solid var(--status-failed)',
                                borderRadius: '0 8px 8px 0',
                                fontSize: 12,
                                color: 'var(--status-failed)',
                                lineHeight: 1.6,
                            }}>
                                <strong>异常信息</strong>
                                <div style={{ marginTop: 6, opacity: 0.9 }}>{displayError}</div>
                            </div>
                        )}

                        {/* 任务级别操作区 */}
                        {hasTaskOps && (
                            <div style={{
                                marginTop: 24,
                                paddingTop: 20,
                                borderTop: `1px solid ${borderColor}`,
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginBottom: 12,
                                }}>
                                    <div style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: secondaryText,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                    }}>
                                        任务操作
                                    </div>
                                    {/* 权限受限提示 */}
                                    {!allowOperations && (
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            padding: '2px 7px',
                                            borderRadius: 4,
                                            background: 'color-mix(in srgb, var(--cm-status-failed) 8%, transparent)',
                                            border: '1px solid color-mix(in srgb, var(--cm-status-failed) 25%, transparent)',
                                            color: 'var(--status-failed)',
                                            fontSize: 10,
                                            fontWeight: 600,
                                        }}>
                                            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                <circle cx="8" cy="8" r="6" />
                                                <path d="M8 5v3M8 11v.5" />
                                            </svg>
                                            操作权限受限
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {canRerunFromTask && (
                                        <button
                                            disabled={!allowOperations}
                                            onClick={() => allowOperations && executionActions!.onRerunFromTask!(
                                                wfId,
                                                selectedTask.taskReferenceName,
                                                currentInstance?.taskId
                                            )}
                                            title={!allowOperations ? '操作权限受限' : `从任务 ${selectedTask.taskReferenceName} 处重新运行工作流`}
                                            style={!allowOperations ? taskOpBtnDisabled : taskOpBtnStyle}
                                            onMouseEnter={e => !allowOperations || Object.assign(e.currentTarget.style, taskOpBtnHover)}
                                            onMouseLeave={e => !allowOperations || Object.assign(e.currentTarget.style, taskOpBtnStyle)}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                                <path d="M3 14v-4h4" /><path d="M3 10A7 7 0 1 1 6.5 13.5" />
                                            </svg>
                                            从此处重新运行
                                        </button>
                                    )}
                                    {canSkip && (
                                        <button
                                            disabled={!allowOperations}
                                            onClick={() => allowOperations && executionActions!.onSkipTask!(
                                                wfId,
                                                selectedTask.taskReferenceName,
                                                currentInstance?.taskId
                                            )}
                                            title={!allowOperations ? '操作权限受限' : `跳过任务 ${selectedTask.taskReferenceName}`}
                                            style={!allowOperations ? taskOpBtnDisabled : taskOpBtnStyle}
                                            onMouseEnter={e => !allowOperations || Object.assign(e.currentTarget.style, taskOpBtnDangerHover)}
                                            onMouseLeave={e => !allowOperations || Object.assign(e.currentTarget.style, taskOpBtnStyle)}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                                <path d="M4 4l8 8M12 4l-8 8" />
                                            </svg>
                                            跳过此任务
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'input' && (
                    <StructuredJsonViewer
                        data={displayInput}
                        taskReferenceName={isGlobal ? undefined : selectedTask.taskReferenceName}
                        expressionScope={isGlobal ? 'workflow.input' : 'input'}
                        maxHeight="calc(100vh - 280px)"
                    />
                )}

                {activeTab === 'output' && (
                    <StructuredJsonViewer
                        data={displayOutput}
                        taskReferenceName={isGlobal ? undefined : selectedTask.taskReferenceName}
                        expressionScope="output"
                        maxHeight="calc(100vh - 280px)"
                    />
                )}
            </div>
        </div>
    );
};

/* ── Helpers ── */
import StructuredJsonViewer from './StructuredJsonViewer';
import { X } from 'lucide-react';

const taskOpBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid var(--border-primary)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
};

const taskOpBtnHover: React.CSSProperties = {
    ...taskOpBtnStyle,
    borderColor: 'var(--color-accent)',
    color: 'var(--color-accent)',
    background: 'var(--bg-primary)',
};

const taskOpBtnDangerHover: React.CSSProperties = {
    ...taskOpBtnStyle,
    borderColor: 'var(--status-failed)',
    color: 'var(--status-failed)',
    background: 'color-mix(in srgb, var(--cm-status-failed) 8%, transparent)',
};

/** 操作权限受限时按钮的禁用样式 */
const taskOpBtnDisabled: React.CSSProperties = {
    ...taskOpBtnStyle,
    opacity: 0.45,
    cursor: 'not-allowed',
    border: '1px solid var(--border-primary)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
};

export default ExecutionTaskPanel;
