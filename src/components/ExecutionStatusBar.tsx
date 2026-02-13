import React, { useCallback } from 'react';
import { useReactFlow } from 'reactflow';
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
        setSelectedTask,
        nodes
    } = useWorkflowStore();
    const { fitView } = useReactFlow();

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
    const failedRefs = statsArr.filter(t => t.status === 'FAILED' || t.status === 'FAILED_WITH_TERMINAL_ERROR' || t.status === 'TIMED_OUT');
    const failedCount = failedRefs.length;
    const inProgressCount = statsArr.filter(t => t.status === 'IN_PROGRESS' || t.status === 'SCHEDULED').length;

    const handleFocusFailed = useCallback(() => {
        if (failedCount === 0) return;
        const failedRefNames = new Set(failedRefs.map(t => t.taskReferenceName));
        const failedNodeIds = nodes
            .filter(n => failedRefNames.has(n.data?.taskReferenceName))
            .map(n => n.id);
        if (failedNodeIds.length > 0) {
            fitView({ nodes: failedNodeIds.map(id => ({ id })), duration: 500, padding: 0.3 });
        }
    }, [failedRefs, nodes, fitView, failedCount]);

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
            <div
                className="status-item"
                onClick={failedCount > 0 ? handleFocusFailed : undefined}
                style={{
                    cursor: failedCount > 0 ? 'pointer' : 'default',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    transition: 'background 0.2s',
                    ...(failedCount > 0 ? { background: 'rgba(239, 68, 68, 0.1)' } : {})
                }}
                title={failedCount > 0 ? '点击聚焦失败节点' : undefined}
            >
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
