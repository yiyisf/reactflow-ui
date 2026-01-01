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

    const isDynamic = data.isDynamic || data.taskType === 'FORK_JOIN_DYNAMIC';

    return (
        <NodeWrapper
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
        >
            <div
                className={`fork-node ${isDynamic ? 'dynamic' : 'static'}`}
                style={{
                    background: isDynamic
                        ? 'linear-gradient(135deg, #065f46 0%, #064e3b 100%)'
                        : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: selected ? '3px solid #fbbf24' : (isDynamic ? '2px dashed #34d399' : '2px solid #059669'),
                    borderRadius: '8px',
                    padding: '12px 20px',
                    minWidth: '130px',
                    boxShadow: selected
                        ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                        : '0 4px 12px rgba(0,0,0,0.15)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                    position: 'relative'
                }}
                onClick={() => !isDynamic && mode === 'edit' && addForkBranch(id)}
            >
                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />

                <div style={{ color: '#fff', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '4px' }}>
                        {isDynamic && (
                            <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#34d399' }}>λ</span>
                        )}
                        <span style={{
                            fontSize: '10px',
                            opacity: 0.8,
                            textTransform: 'uppercase',
                            fontWeight: '600',
                            letterSpacing: '0.5px'
                        }}>
                            {data.taskType}
                        </span>
                    </div>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        marginBottom: mode === 'edit' && !isDynamic ? '4px' : '0'
                    }}>
                        {data.label}
                    </div>
                    {mode === 'edit' && !isDynamic && (
                        <div style={{
                            marginTop: '8px',
                            width: '24px',
                            height: '24px',
                            fontSize: '16px',
                            background: 'rgba(255,255,255,0.2)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '8px auto 0'
                        }}>
                            +
                        </div>
                    )}
                </div>

                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />

                {/* 增加侧边 Handles 支持多分支连线 (仅对静态 Fork) */}
                {!isDynamic && layoutDirection === 'TB' && (
                    <>
                        <Handle type="source" position={Position.Left} id="left" style={{ background: '#fff' }} />
                        <Handle type="source" position={Position.Right} id="right" style={{ background: '#fff' }} />
                    </>
                )}
                {!isDynamic && layoutDirection === 'LR' && (
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
        <NodeWrapper
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
        >
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
