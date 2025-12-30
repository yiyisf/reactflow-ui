import { memo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import useWorkflowStore from '../../store/workflowStore';

/**
 * FORK 节点组件
 */
export const ForkNode = memo(({ id, data, selected }) => {
    const layoutDirection = data.layoutDirection || 'TB';
    const { mode, addForkBranch } = useWorkflowStore();

    // 根据布局方向确定 Handle 位置
    const sourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;

    return (
        <NodeWrapper nodeId={id} selected={selected}>
            <div
                style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: selected ? '3px solid #fbbf24' : '2px solid #059669',
                    borderRadius: '8px',
                    padding: '12px 20px',
                    minWidth: '120px',
                    boxShadow: selected
                        ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                        : '0 4px 12px rgba(0,0,0,0.15)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                }}
                onClick={() => mode === 'edit' && addForkBranch(id)}
            >
                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />

                <div style={{ color: '#fff', textAlign: 'center' }}>
                    <div style={{
                        fontSize: '10px',
                        opacity: 0.8,
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        fontWeight: '600',
                        letterSpacing: '0.5px'
                    }}>
                        {data.taskType}
                    </div>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        marginBottom: '4px'
                    }}>
                        {data.label}
                    </div>
                    {mode === 'edit' && (
                        <div style={{ fontSize: '11px', opacity: 0.9 }}>
                            点击添加并行分支 +
                        </div>
                    )}
                </div>

                {/* 主输出 Handle */}
                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
                {/* 分支输出 Handles */}
                {layoutDirection === 'TB' && (
                    <>
                        <Handle type="source" position={Position.Left} id="left" style={{ background: '#fff' }} />
                        <Handle type="source" position={Position.Right} id="right" style={{ background: '#fff' }} />
                    </>
                )}
                {layoutDirection === 'LR' && (
                    <>
                        <Handle type="source" position={Position.Top} id="top" style={{ background: '#fff' }} />
                        <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: '#fff' }} />
                    </>
                )}
            </div>
        </NodeWrapper>
    );
});

ForkNode.displayName = 'ForkNode';

/**
 * JOIN 节点组件
 */
export const JoinNode = memo(({ id, data, selected }) => {
    const layoutDirection = data.layoutDirection || 'TB';

    // 根据布局方向确定 Handle 位置
    const sourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;

    return (
        <NodeWrapper nodeId={id} selected={selected}>
            <div
                style={{
                    background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
                    border: selected ? '3px solid #fbbf24' : '2px solid #8b5cf6',
                    borderRadius: '8px',
                    padding: '12px 20px',
                    minWidth: '120px',
                    boxShadow: selected
                        ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                        : '0 4px 12px rgba(0,0,0,0.15)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                }}
            >
                {/* 主输入 Handle */}
                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />
                {/* 分支输入 Handles */}
                {layoutDirection === 'TB' && (
                    <>
                        <Handle type="target" position={Position.Left} id="left" style={{ background: '#fff' }} />
                        <Handle type="target" position={Position.Right} id="right" style={{ background: '#fff' }} />
                    </>
                )}
                {layoutDirection === 'LR' && (
                    <>
                        <Handle type="target" position={Position.Top} id="top" style={{ background: '#fff' }} />
                        <Handle type="target" position={Position.Bottom} id="bottom" style={{ background: '#fff' }} />
                    </>
                )}

                <div style={{ color: '#fff', textAlign: 'center' }}>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold'
                    }}>
                        {data.label}
                    </div>
                </div>

                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
            </div>
        </NodeWrapper>
    );
});

JoinNode.displayName = 'JoinNode';
