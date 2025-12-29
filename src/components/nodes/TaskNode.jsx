import { memo } from 'react';
import { Handle, Position } from 'reactflow';

/**
 * 常规任务节点组件
 */
const TaskNode = ({ data, selected }) => {
    const taskType = data.taskType || 'SIMPLE';
    const layoutDirection = data.layoutDirection || 'TB';

    // 根据布局方向确定 Handle 位置
    const sourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;

    // 根据任务类型设置颜色
    const getTaskColor = (type) => {
        const colors = {
            SIMPLE: { bg: '#3b82f6', border: '#2563eb' },
            HTTP: { bg: '#8b5cf6', border: '#7c3aed' },
            JSON_JQ_TRANSFORM: { bg: '#06b6d4', border: '#0891b2' },
            EVENT: { bg: '#f59e0b', border: '#d97706' },
            INLINE: { bg: '#10b981', border: '#059669' },
            KAFKA_PUBLISH: { bg: '#ec4899', border: '#db2777' },
            LAMBDA: { bg: '#6366f1', border: '#4f46e5' },
            TERMINATE: { bg: '#ef4444', border: '#dc2626' },
            WAIT: { bg: '#64748b', border: '#475569' },
        };
        return colors[type] || colors.SIMPLE;
    };

    const color = getTaskColor(taskType);

    return (
        <div
            style={{
                background: `linear-gradient(135deg, ${color.bg} 0%, ${color.border} 100%)`,
                border: selected ? `3px solid #fbbf24` : `2px solid ${color.border}`,
                borderRadius: '12px',
                padding: '16px',
                minWidth: '180px',
                boxShadow: selected
                    ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                    : '0 4px 12px rgba(0,0,0,0.15)',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
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
                    lineHeight: '1.3'
                }}>
                    {data.label}
                </div>
                <div style={{
                    fontSize: '11px',
                    opacity: 0.7,
                    fontStyle: 'italic'
                }}>
                    {data.taskReferenceName}
                </div>
            </div>

            <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
        </div>
    );
};

export default memo(TaskNode);
