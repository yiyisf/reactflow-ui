import React, { useCallback, useMemo } from 'react';
import { useReactFlow } from 'reactflow';
import useWorkflowStore from '../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import { CircleAlert, FolderOpen, Play, Search } from 'lucide-react';
import { getStatusMeta } from '../utils/statusMeta';

/**
 * 运行态状态栏组件
 */
const ExecutionStatusBar = () => {
    const { executionData, loadSampleExecution, importExecutionJSON, workflowInstance, setSelectedTask, nodes, runState, executionError } = useWorkflowStore(useShallow((s) => ({
            runState: s.runState,
            executionError: s.executionError,
            executionData: s.executionData,
            loadSampleExecution: s.loadSampleExecution,
            importExecutionJSON: s.importExecutionJSON,
            workflowInstance: s.workflowInstance,
            setSelectedTask: s.setSelectedTask,
            nodes: s.nodes,
        })));
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

    // 统计状态。All hooks run before the early return below (R1: a hook after it crashed the bar after the first load).
    const { completedCount, failedRefs, inProgressCount } = useMemo(() => {
        const statsArr = Object.values(executionData ?? {});
        return {
            completedCount: statsArr.filter(t => t.status === 'COMPLETED').length,
            failedRefs: statsArr.filter(t => getStatusMeta(t.status).isFailure),
            inProgressCount: statsArr.filter(t => getStatusMeta(t.status).isActive).length,
        };
    }, [executionData]);
    const failedCount = failedRefs.length;

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

    // R2: polling gave up — say so instead of silently showing a stale run.
    const pollError = runState === 'error' && executionError ? (
        <div className="status-item" role="alert" style={{ color: 'var(--cm-status-failed)', display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 420 }} title={executionError}>
            <CircleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{executionError}</span>
        </div>
    ) : null;

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
                    <span className="status-label">{runState === 'polling' ? '已发起运行，正在获取状态…' : '准备就绪'}</span>
                </div>
                {pollError}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={loadSampleExecution}
                        style={{
                            background: 'var(--color-accent)',
                            color: 'var(--color-on-accent)',
                            border: 'none',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                            boxShadow: 'var(--cm-shadow-card)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <Play size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />加载示例运行
                    </button>
                    <button
                        onClick={() => document.getElementById('execution-json-upload')?.click()}
                        title="上传 Conductor 运行态 JSON"
                        style={{
                            background: 'var(--bg-highlight)',
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
                        <FolderOpen size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />导入执行 JSON
                    </button>
                </div>
            </div>
        );
    }

    const wfMeta = getStatusMeta(workflowInstance?.status ?? 'RUNNING');
    const WfIcon = wfMeta.icon;

    return (
        <div className="execution-status-bar">
            {workflowInstance && (
                <>
                    <div className="status-item">
                        <span className="status-label">运行 ID:</span>
                        <span className="status-value highlight" style={{ color: 'var(--text-primary)', opacity: 0.8 }}>{workflowInstance.workflowId}</span>
                    </div>
                    <div className="status-divider" />
                </>
            )}
            <div className="status-item">
                <span className="status-label">状态:</span>
                <span className="status-value highlight" style={{ color: wfMeta.color, display: 'inline-flex', alignItems: 'center', gap: 4 }} title={workflowInstance?.status}>
                    <WfIcon size={14} strokeWidth={1.75} aria-hidden="true" />{wfMeta.label}
                </span>
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
                    ...(failedCount > 0 ? { background: 'color-mix(in srgb, var(--cm-status-failed) 10%, transparent)' } : {})
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
            {pollError}
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
                        background: 'var(--bg-highlight)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-primary)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '600'
                    }}
                >
                    <Search size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />全局 I/O
                </button>
            </div>
        </div>
    );
};

export default ExecutionStatusBar;
