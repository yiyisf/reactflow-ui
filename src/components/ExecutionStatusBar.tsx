import React from 'react';
import useWorkflowStore from '../store/workflowStore';

/**
 * 运行态状态栏组件
 */
const ExecutionStatusBar = () => {
    const {
        executionData,
        loadSampleExecution,
        importExecutionJSON,
        workflowInstance,
        setSelectedTask
    } = useWorkflowStore();

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target?.result as string);
                    importExecutionJSON(json);
                } catch (err) {
                    console.error('Failed to parse execution JSON:', err);
                }
            };
            reader.readAsText(file);
        }
    };

    // 如果没有执行数据，显示启动按钮
    if (!executionData) {
        return (
            <div className="execution-status-bar">
                <input
                    type="file"
                    id="execution-json-upload"
                    accept=".json"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                />
                <div className="status-item">
                    <span className="status-label">准备就绪</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={loadSampleExecution}
                        style={{
                            background: 'var(--color-accent)',
                            color: '#fff',
                            border: 'none',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        🚀 加载示例运行
                    </button>
                    <button
                        onClick={() => document.getElementById('execution-json-upload')?.click()}
                        title="上传 Conductor 运行态 JSON"
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-primary)',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        📁 导入执行 JSON
                    </button>
                </div>
            </div>
        );
    }

    // 统计状态
    const statsArr = Object.values(executionData);
    const completedCount = statsArr.filter(t => t.status === 'COMPLETED').length;
    const failedCount = statsArr.filter(t => t.status === 'FAILED' || t.status === 'FAILED_WITH_TERMINAL_ERROR' || t.status === 'TIMED_OUT').length;
    const inProgressCount = statsArr.filter(t => t.status === 'IN_PROGRESS' || t.status === 'SCHEDULED').length;

    return (
        <div className="execution-status-bar">
            {workflowInstance && (
                <>
                    <div className="status-item">
                        <span className="status-label"> Workflow ID:</span>
                        <span className="status-value highlight" style={{ color: 'var(--text-primary)', opacity: 0.8 }}>{workflowInstance.workflowId}</span>
                    </div>
                    <div className="status-divider" />
                </>
            )}
            <div className="status-item">
                <span className="status-label">状态:</span>
                <span className="status-value highlight" style={{
                    color: workflowInstance?.status === 'COMPLETED' ? 'var(--status-completed)' : 'var(--status-in-progress)'
                }}>{workflowInstance?.status || '运行中'}</span>
            </div>
            <div className="status-divider" />
            <div className="status-item">
                <span className="status-label">已完成:</span>
                <span className="status-value">{completedCount}</span>
            </div>
            <div className="status-item">
                <span className="status-label" style={{ color: 'var(--status-failed)' }}>失败:</span>
                <span className="status-value" style={{ color: 'var(--status-failed)' }}>{failedCount}</span>
            </div>
            <div className="status-item">
                <span className="status-label" style={{ color: 'var(--status-in-progress)' }}>处理中:</span>
                <span className="status-value" style={{ color: 'var(--status-in-progress)' }}>{inProgressCount}</span>
            </div>
            <div className="status-divider" />
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={() => {
                        setSelectedTask({
                            name: 'Workflow Global Data',
                            taskReferenceName: '__workflow_global__',
                            type: 'SIMPLE'
                        } as any);
                    }}
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-primary)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '600'
                    }}
                >
                    🔍 全局 I/O
                </button>
            </div>
        </div>
    );
};

export default ExecutionStatusBar;
