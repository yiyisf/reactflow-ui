import React from 'react';
import useWorkflowStore from '../../store/workflowStore';

interface NodeWrapperProps {
    children: React.ReactNode;
    nodeId: string;
    selected?: boolean;
    isStartOrEnd?: boolean;
    isError?: boolean;
    hasWarning?: boolean;
}

const NodeWrapper = ({ children, nodeId, isStartOrEnd = false, isError = false, hasWarning = false }: NodeWrapperProps) => {
    const { mode, removeNode } = useWorkflowStore();

    const onDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('确定要删除此任务吗？')) {
            removeNode(nodeId);
        }
    };

    const showDelete = mode === 'edit' && !isStartOrEnd;

    return (
        <div style={{ position: 'relative' }}>
            {showDelete && (
                <button
                    onClick={onDelete}
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
        </div>
    );
};

export default NodeWrapper;
