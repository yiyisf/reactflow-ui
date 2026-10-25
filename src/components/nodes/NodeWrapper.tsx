import React, { useState, useMemo } from 'react';
import useWorkflowStore from '../../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import ConfirmDialog from '../ConfirmDialog';
import { ExecutionStatus } from '../../types/workflow';
import { CircleAlert, TriangleAlert } from 'lucide-react';

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
    proposalStatus?: 'added' | 'modified' | 'removed';
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
    proposalStatus,
}: NodeWrapperProps) => {
    const { mode, removeNode } = useWorkflowStore(useShallow((s) => ({ mode: s.mode, removeNode: s.removeNode })));
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
        proposalStatus ? `node-proposal-${proposalStatus}` : '',
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
                    boxShadow: '0 0 12px color-mix(in srgb, var(--cm-status-failed) 50%, transparent), 0 0 24px color-mix(in srgb, var(--cm-status-failed) 20%, transparent)',
                };
            case 'TIMED_OUT':
                return {
                    borderColor: 'var(--status-timed-out)',
                    boxShadow: '0 0 8px color-mix(in srgb, var(--color-accent) 40%, transparent)',
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
                        backgroundColor: 'var(--cm-status-failed)',
                        color: 'var(--cm-on-danger)',
                        border: '2px solid var(--cm-surface-1)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        zIndex: 100,
                        boxShadow: 'var(--cm-shadow-card)',
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
                        backgroundColor: 'var(--cm-status-failed)',
                        color: 'var(--cm-on-danger)',
                        border: '2px solid var(--cm-surface-1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        zIndex: 101,
                        boxShadow: 'var(--cm-shadow-card)'
                    }}
                    title="此节点配置有误"
                >
                    <CircleAlert size={14} strokeWidth={2} aria-hidden="true" />
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
                        backgroundColor: 'var(--cm-status-warning)',
                        color: 'var(--cm-on-danger)',
                        border: '2px solid var(--cm-surface-1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        zIndex: 101,
                        boxShadow: 'var(--cm-shadow-card)'
                    }}
                    title="此节点有警告信息"
                >
                    <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
                </div>
            )}

            {proposalStatus && (
                <div className={`node-proposal-badge node-proposal-badge-${proposalStatus}`}>
                    {proposalStatus === 'added' ? '+' : proposalStatus === 'modified' ? '~' : '−'}
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
