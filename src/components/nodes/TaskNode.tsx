import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import { WorkflowNodeData } from '../../types/workflow';

type TaskNodeProps = NodeProps<WorkflowNodeData>;

/**
 * 常规任务节点组件
 */
const TaskNode = ({ id, data, selected }: TaskNodeProps) => {
    const taskType = data.taskType || 'SIMPLE';
    const layoutDirection = data.layoutDirection || 'TB';

    // 根据布局方向确定 Handle 位置
    const sourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;

    // 根据任务类型设置颜色
    const getTaskColor = (type: string) => {
        const colors: Record<string, { bg: string; border: string }> = {
            SIMPLE: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            HTTP: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            JSON_JQ_TRANSFORM: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            EVENT: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            INLINE: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            KAFKA_PUBLISH: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            LAMBDA: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            TERMINATE: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            WAIT: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
        };
        return colors[type] || colors.SIMPLE;
    };

    const color = getTaskColor(taskType);

    return (
        <NodeWrapper
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
        >
            <div
                style={{
                    background: `linear-gradient(135deg, ${color.bg} 0%, ${color.border} 100%)`,
                    border: selected ? `3px solid #fbbf24` : `2px solid ${color.border}`,
                    borderRadius: '12px',
                    padding: '16px',
                    width: '180px', // 从 minWidth 更改为固定 width，确保布局对齐
                    boxShadow: selected
                        ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                        : '0 4px 12px rgba(0,0,0,0.15)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                    overflow: 'hidden' // 防止内容溢出
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
                        letterSpacing: '0.5px'
                    }}>
                        {taskType}
                    </div>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        marginBottom: '4px',
                        lineHeight: '1.3',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {data.label}
                    </div>
                    <div style={{
                        fontSize: '11px',
                        opacity: 0.7,
                        fontStyle: 'italic',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {data.taskReferenceName}
                    </div>
                </div>

                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
            </div>
        </NodeWrapper>
    );
};

export default memo(TaskNode);
