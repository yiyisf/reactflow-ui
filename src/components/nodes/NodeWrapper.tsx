import React, { useState } from 'react';
import useWorkflowStore from '../../store/workflowStore';
import ConfirmDialog from '../ConfirmDialog';

interface NodeWrapperProps {
    children: React.ReactNode;
    nodeId: string;
    selected?: boolean;
    isStartOrEnd?: boolean;
    isError?: boolean;
    hasWarning?: boolean;
    isDecision?: boolean;
    isHighlighted?: boolean;
}

const NodeWrapper = ({
    children,
    nodeId,
    selected = false,
    isStartOrEnd = false,
    isError = false,
    hasWarning = false,
    isDecision = false,
    isHighlighted = false
}: NodeWrapperProps) => {
    const { mode, removeNode } = useWorkflowStore();
    const [showConfirm, setShowConfirm] = useState(false);

    const onDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowConfirm(true);
    };

    const showDelete = mode === 'edit' && !isStartOrEnd;

    const wrapperClass = isDecision
        ? `decision-node-wrapper ${selected ? 'node-wrapper-selected' : ''} ${isHighlighted ? 'node-wrapper-highlighted' : ''}`
        : `node-wrapper-glass ${selected ? 'node-wrapper-selected' : ''} ${isHighlighted ? 'node-wrapper-highlighted' : ''}`;

    return (
        <div className={wrapperClass} style={{ position: 'relative' }}>
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
