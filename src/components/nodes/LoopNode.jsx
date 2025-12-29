import { memo } from 'react';
import { Handle, Position } from 'reactflow';

/**
 * 循环节点组件（DO_WHILE）
 */
const LoopNode = ({ data, selected }) => {
    const layoutDirection = data.layoutDirection || 'TB';

    // 根据布局方向确定 Handle 位置
    const sourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;
    const loopBackTargetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;
    const exitSourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;

    return (
        <div
            style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                border: selected ? '3px solid #fbbf24' : '2px solid #d97706',
                borderRadius: '16px',
                padding: '16px',
                minWidth: '160px',
                boxShadow: selected
                    ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                    : '0 4px 12px rgba(0,0,0,0.15)',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
                position: 'relative',
            }}
        >
            <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />
            <Handle type="target" position={loopBackTargetPosition} id="loop-back" style={{ background: '#fff' }} />

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
                    <span>🔄</span>
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
                    fontStyle: 'italic'
                }}>
                    {data.taskReferenceName}
                </div>
            </div>

            <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
            <Handle type="source" position={exitSourcePosition} id="exit" style={{ background: '#fff' }} />
        </div>
    );
};

export default memo(LoopNode);
