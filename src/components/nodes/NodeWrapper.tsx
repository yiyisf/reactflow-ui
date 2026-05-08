import React, { useState, useMemo } from 'react';
import useWorkflowStore from '../../store/workflowStore';
import ConfirmDialog from '../ConfirmDialog';
import { ExecutionStatus } from '../../types/workflow';

interface NodeWrapperProps {
    children: React.ReactNode;
    nodeId: string;
    selected?: boolean;
    isStartOrEnd?: boolean;
    isError?: boolean;
    hasWarning?: boolean;
    isDecision?: boolean;
    isHighlighted?: boolean;
    executionStatus?: ExecutionStatus;
    simRunning?: boolean;
    simDone?: boolean;
}

const NodeWrapper = ({
    children,
    nodeId,
    selected = false,
    isStartOrEnd = false,
    isError = false,
    hasWarning = false,
    isDecision = false,
    isHighlighted = false,
    executionStatus,
    simRunning = false,
    simDone = false,
}: NodeWrapperProps) => {
    const { mode, removeNode } = useWorkflowStore();
    const [showConfirm, setShowConfirm] = useState(false);

    const onDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowConfirm(true);
    };

    const showDelete = mode === 'edit' && !isStartOrEnd;

    const baseClass = isDecision ? 'decision-node-wrapper' : 'node-wrapper-glass';
    const wrapperClass = [
        baseClass,
        selected ? 'node-wrapper-selected' : '',
        isHighlighted ? 'node-wrapper-highlighted' : '',
        simRunning ? 'node-sim-running' : '',
        simDone ? 'node-sim-done' : '',
    ].filter(Boolean).join(' ');

    // 运行态执行状态边框样式
    const executionStyle = useMemo<React.CSSProperties>(() => {
        if (mode !== 'run') return {};

        // 未到达的节点（无执行数据）
        if (!executionStatus) {
            return { opacity: 0.4 };
        }

        switch (executionStatus) {
            case 'FAILED':
            case 'FAILED_WITH_TERMINAL_ERROR':
                return {
                    borderColor: 'var(--status-failed)',
                    boxShadow: '0 0 12px rgba(239, 68, 68, 0.5), 0 0 24px rgba(239, 68, 68, 0.2)',
                };
            case 'TIMED_OUT':
                return {
                    borderColor: 'var(--status-timed-out)',
                    boxShadow: '0 0 8px rgba(249, 115, 22, 0.4)',
                };
            case 'IN_PROGRESS':
            case 'SCHEDULED':
                return {
                    borderColor: 'var(--status-in-progress)',
                    animation: 'status-pulse 1.5s ease-in-out infinite',
                };
            case 'COMPLETED':
                return {
                    borderColor: 'var(--status-completed)',
                    opacity: 0.85,
                };
            case 'COMPLETED_WITH_ERRORS':
                return {
                    borderColor: 'var(--status-completed-with-errors)',
                };
            case 'SKIPPED':
            case 'CANCELED':
                return { opacity: 0.5 };
            default:
                return {};
        }
    }, [mode, executionStatus]);

    return (
        <div className={wrapperClass} style={{ position: 'relative', ...executionStyle }}>
            {showDelete && (
                <button
                    onClick={onDelete}
                    aria-label="删除任务"
                    style={{
                        position: 'absolute',
                        top: '-10px',
                        right: '-10px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: '2px solid white',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        zIndex: 100,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        padding: 0
                    }}
                    title="删除任务"
                >
                    ×
                </button>
            )}

            {isError && (
                <div
                    style={{
                        position: 'absolute',
                        top: '-10px',
                        left: '-10px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: '2px solid white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        zIndex: 101,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}
                    title="此节点配置有误"
                >
                    ❗
                </div>
            )}

            {!isError && hasWarning && (
                <div
                    style={{
                        position: 'absolute',
                        top: '-10px',
                        left: '-10px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: '#f59e0b',
                        color: 'white',
                        border: '2px solid white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        zIndex: 101,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}
                    title="此节点有警告信息"
                >
                    ⚠️
                </div>
            )}
            {children}

            {showConfirm && (
                <ConfirmDialog
                    message="确定要删除此任务吗？"
                    onConfirm={() => {
                        removeNode(nodeId);
                        setShowConfirm(false);
                    }}
                    onCancel={() => setShowConfirm(false)}
                />
            )}
        </div>
    );
};

export default NodeWrapper;
