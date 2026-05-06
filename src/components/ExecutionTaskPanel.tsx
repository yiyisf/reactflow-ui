import { useState, useRef, useEffect } from 'react';
import useWorkflowStore from '../store/workflowStore';
import { ExecutionStatus } from '../types/workflow';

/**
 * 运行态任务详情面板
 */
const ExecutionTaskPanel: React.FC = () => {
    const {
        selectedTask,
        selectedTaskInstance,
        setSelectedTask,
        setSelectedTaskInstance,
        executionData,
        workflowInstance
    } = useWorkflowStore();

    const [activeTab, setActiveTab] = useState<'summary' | 'input' | 'output'>('summary');
    const panelContentRef = useRef<HTMLDivElement>(null);

    const switchTab = (tab: 'summary' | 'input' | 'output') => {
        setActiveTab(tab);
    };

    useEffect(() => {
        panelContentRef.current?.scrollTo({ top: 0 });
    }, [activeTab]);

    // 如果没选中任务或不在运行模式数据中，不显示
    const isGlobal = selectedTask?.taskReferenceName === '__workflow_global__';
    const taskExecution = selectedTask ? executionData?.[selectedTask.taskReferenceName] : null;

    if (!selectedTask || (!taskExecution && !isGlobal)) return null;

    const attempts = taskExecution?.attempts || [];
    // 默认显示最新的一次尝试，除非已经手动选中了某一次
    const currentInstance = selectedTaskInstance || attempts[attempts.length - 1];

    const handleClose = () => {
        setSelectedTask(null);
        setSelectedTaskInstance(null);
    };

    // 格式化耗时
    const formatDuration = (start?: number, end?: number) => {
        if (!start) return '-';
        const endTime = end || Date.now();
        const durationMs = endTime - start;
        if (durationMs < 1000) return `${durationMs}ms`;
        return `${(durationMs / 1000).toFixed(2)}s`;
    };

    // 状态样式映射
    const getStatusColor = (status: ExecutionStatus) => {
        const colors: Record<string, string> = {
            'COMPLETED': 'var(--status-completed)',
            'FAILED': 'var(--status-failed)',
            'IN_PROGRESS': 'var(--status-in-progress)',
            'SCHEDULED': 'var(--status-scheduled)',
            'TIMED_OUT': 'var(--status-timed-out)',
            'CANCELED': 'var(--status-canceled)',
        };
        return colors[status] || 'var(--text-secondary)';
    };

    return (
        <div className="execution-details-panel">
            <style>{`
                .execution-details-panel {
                    position: fixed;
                    right: 20px;
                    top: 80px;
                    width: 400px;
                    max-height: calc(100vh - 120px);
                    background: var(--glass-surface);
                    backdrop-filter: blur(12px);
                    border: 1px solid var(--glass-border);
                    border-radius: 16px;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.3);
                    z-index: 1000;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }

                @keyframes slideInRight {
                    from { transform: translateX(50px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }

                .panel-header {
                    padding: 20px;
                    border-bottom: 1px solid var(--border-primary);
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                }

                .task-title {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 700;
                    color: var(--text-primary);
                }

                .task-ref {
                    font-size: 12px;
                    color: var(--text-secondary);
                    margin-top: 4px;
                    font-family: monospace;
                }

                .close-btn {
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    font-size: 20px;
                    cursor: pointer;
                    padding: 4px;
                }

                .panel-content {
                    flex: 1;
                    min-height: 0;
                    overflow-y: auto;
                    padding: 20px;
                }

                .attempt-selector {
                    margin-bottom: 20px;
                    padding: 12px;
                    background: var(--bg-tertiary);
                    border-radius: 12px;
                }

                .selector-label {
                    font-size: 12px;
                    font-weight: 600;
                    margin-bottom: 8px;
                    color: var(--text-secondary);
                    display: block;
                }

                .attempt-list {
                    display: flex;
                    gap: 8px;
                    overflow-x: auto;
                    padding-bottom: 4px;
                }

                .attempt-pill {
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    cursor: pointer;
                    white-space: nowrap;
                    transition: all 0.2s;
                    border: 1px solid var(--border-primary);
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                }

                .attempt-pill.active {
                    background: var(--color-accent);
                    color: #fff;
                    border-color: var(--color-accent);
                }

                .info-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                    margin-bottom: 24px;
                }

                .info-item label {
                    font-size: 11px;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    display: block;
                    margin-bottom: 4px;
                }

                .info-item span {
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 700;
                }

                .tabs {
                    display: flex;
                    border-bottom: 1px solid var(--border-primary);
                    margin-bottom: 20px;
                }

                .tab-btn {
                    padding: 10px 20px;
                    background: none;
                    border: none;
                    border-bottom: 2px solid transparent;
                    color: var(--text-secondary);
                    cursor: pointer;
                    font-size: 13px;
                    transition: all 0.2s;
                }

                .tab-btn.active {
                    color: var(--color-accent);
                    border-bottom-color: var(--color-accent);
                    font-weight: 600;
                }

                .json-block {
                    background: var(--bg-tertiary);
                    padding: 16px;
                    border-radius: 12px;
                    font-family: 'Fira Code', monospace;
                    font-size: 12px;
                    line-height: 1.5;
                    color: var(--text-primary);
                    word-break: break-all;
                }

                .error-message {
                    margin-top: 16px;
                    padding: 12px;
                    background: rgba(239, 68, 68, 0.1);
                    border-left: 3px solid var(--status-failed);
                    border-radius: 4px;
                    font-size: 12px;
                    color: var(--status-failed);
                }
            `}</style>

            <div className="panel-header">
                <div>
                    <h3 className="task-title">{selectedTask.name}</h3>
                    <div className="task-ref">{selectedTask.taskReferenceName}</div>
                </div>
                <button className="close-btn" onClick={handleClose}>✕</button>
            </div>

            <div className="panel-content" ref={panelContentRef}>
                {/* 尝试次数/迭代选择器 */}
                {attempts.length > 1 && (
                    <div className="attempt-selector">
                        <label className="selector-label">
                            执行记录 ({attempts.length} 次尝试{attempts.some(a => a.iteration) ? ' / 迭代' : ''})
                        </label>
                        <div className="attempt-list">
                            {attempts.map((instance, idx) => (
                                <div
                                    key={instance.taskId}
                                    className={`attempt-pill ${currentInstance?.taskId === instance.taskId ? 'active' : ''}`}
                                    onClick={() => setSelectedTaskInstance(instance)}
                                >
                                    {instance.iteration ? `迭代 ${instance.iteration}` : `尝试 ${idx + 1}`}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="tabs">
                    <button
                        className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
                        onClick={() => switchTab('summary')}
                    >概览</button>
                    <button
                        className={`tab-btn ${activeTab === 'input' ? 'active' : ''}`}
                        onClick={() => switchTab('input')}
                    >输入 (JSON)</button>
                    <button
                        className={`tab-btn ${activeTab === 'output' ? 'active' : ''}`}
                        onClick={() => switchTab('output')}
                    >输出 (JSON)</button>
                </div>

                <div>

                {activeTab === 'summary' && (
                    <>
                        <div className="info-grid">
                            <div className="info-item">
                                <label>执行状态</label>
                                <div className="status-badge" style={{
                                    background: `${getStatusColor(isGlobal ? (workflowInstance?.status as any) : (currentInstance?.status as ExecutionStatus))}20`,
                                    color: getStatusColor(isGlobal ? (workflowInstance?.status as any) : (currentInstance?.status as ExecutionStatus))
                                }}>
                                    ● {isGlobal ? workflowInstance?.status : currentInstance?.status}
                                </div>
                            </div>
                            <div className="info-item">
                                <label>总耗时</label>
                                <span>{isGlobal ? formatDuration(workflowInstance?.startTime, workflowInstance?.endTime) : formatDuration(currentInstance?.startTime, currentInstance?.endTime)}</span>
                            </div>
                            <div className="info-item">
                                <label>开始时间</label>
                                <span style={{ fontSize: '12px' }}>
                                    {(isGlobal ? workflowInstance?.startTime : currentInstance?.startTime) ? new Date((isGlobal ? workflowInstance?.startTime : currentInstance?.startTime) || 0).toLocaleTimeString() : '-'}
                                </span>
                            </div>
                            <div className="info-item">
                                <label>结束时间</label>
                                <span style={{ fontSize: '12px' }}>
                                    {(isGlobal ? workflowInstance?.endTime : currentInstance?.endTime) ? new Date((isGlobal ? workflowInstance?.endTime : currentInstance?.endTime) || 0).toLocaleTimeString() : '-'}
                                </span>
                            </div>
                        </div>

                        {(isGlobal ? workflowInstance?.reasonForIncompletion : currentInstance?.reasonForIncompletion) && (
                            <div className="error-message">
                                <strong>异常信息:</strong>
                                <div style={{ marginTop: '4px' }}>{isGlobal ? workflowInstance?.reasonForIncompletion : currentInstance?.reasonForIncompletion}</div>
                            </div>
                        )}

                        <div className="info-item" style={{ marginTop: '20px' }}>
                            <label>{isGlobal ? 'Workflow ID' : 'Task ID'}</label>
                            <span style={{ fontSize: '11px', fontFamily: 'monospace', opacity: 0.7 }}>{isGlobal ? workflowInstance?.workflowId : currentInstance?.taskId}</span>
                        </div>
                    </>
                )}

                {activeTab === 'input' && (
                    <div className="json-block">
                        <pre>{JSON.stringify(isGlobal ? workflowInstance?.input : currentInstance?.inputData || {}, null, 2)}</pre>
                    </div>
                )}

                {activeTab === 'output' && (
                    <div className="json-block">
                        <pre>{JSON.stringify(isGlobal ? workflowInstance?.output : currentInstance?.outputData || {}, null, 2)}</pre>
                    </div>
                )}

                </div>
            </div>
        </div>
    );
};

export default ExecutionTaskPanel;
