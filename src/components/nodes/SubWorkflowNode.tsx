import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import { WorkflowNodeData } from '../../types/workflow';

type SubWorkflowNodeProps = NodeProps<WorkflowNodeData>;

/**
 * 子工作流节点组件
 */
const SubWorkflowNode = ({ id, data, selected }: SubWorkflowNodeProps) => {
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
                    background: 'var(--color-accent)',
                    border: 'var(--color-accent-hover)',
                    borderRadius: '12px',
                    padding: '16px',
                    minWidth: '180px',
                    boxShadow: selected
                        ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                        : '0 4px 12px rgba(0,0,0,0.15)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                    position: 'relative',
                }}
            >
                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />

                <div style={{ color: '#fff' }}>
                    <div style={{
                        fontSize: '10px',
                        opacity: 0.8,
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        fontWeight: '600',
                        letterSpacing: '0.5px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        <span>📋</span>
                        {data.taskType}
                    </div>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        marginBottom: '4px',
                        lineHeight: '1.3'
                    }}>
                        {data.label}
                    </div>
                    <div style={{
                        fontSize: '11px',
                        opacity: 0.7,
                        fontStyle: 'italic',
                        marginBottom: '6px'
                    }}>
                        {data.taskReferenceName}
                    </div>
                    {data.subWorkflowName && (
                        <div style={{
                            fontSize: '10px',
                            background: 'rgba(255,255,255,0.2)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            marginTop: '6px'
                        }}>
                            ➜ {data.subWorkflowName}
                        </div>
                    )}
                </div>

                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
            </div>
        </NodeWrapper>
    );
};

export default memo(SubWorkflowNode);
