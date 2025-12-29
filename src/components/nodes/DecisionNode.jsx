import { memo } from 'react';
import { Handle, Position } from 'reactflow';

/**
 * 决策/分支节点组件（菱形）
 */
const DecisionNode = ({ data, selected }) => {
    const layoutDirection = data.layoutDirection || 'TB';

    // 根据布局方向确定主要的 Handle 位置
    const sourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;

    return (
        <div style={{ position: 'relative' }}>
            <Handle type="target" position={targetPosition} style={{ background: '#fff', [layoutDirection === 'LR' ? 'left' : 'top']: '-5px' }} />

            <div
                style={{
                    width: '150px',
                    height: '150px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    border: selected ? '3px solid #fbbf24' : '2px solid #d97706',
                    transform: 'rotate(45deg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: selected
                        ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                        : '0 4px 12px rgba(0,0,0,0.15)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                }}
            >
                <div
                    style={{
                        transform: 'rotate(-45deg)',
                        color: '#fff',
                        textAlign: 'center',
                        padding: '10px',
                    }}
                >
                    <div style={{
                        fontSize: '10px',
                        opacity: 0.9,
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        fontWeight: '600',
                        letterSpacing: '0.5px'
                    }}>
                        {data.taskType}
                    </div>
                    <div style={{
                        fontSize: '13px',
                        fontWeight: 'bold',
                        marginBottom: '4px',
                        lineHeight: '1.2'
                    }}>
                        {data.label}
                    </div>
                    <div style={{
                        fontSize: '10px',
                        opacity: 0.7,
                        fontStyle: 'italic'
                    }}>
                        {data.taskReferenceName}
                    </div>
                </div>
            </div>

            {/* 主输出 Handle */}
            <Handle type="source" position={sourcePosition} style={{ background: '#fff', [layoutDirection === 'LR' ? 'right' : 'bottom']: '-5px' }} />
            {/* 分支输出 Handles - 保持在所有四个方向以支持多分支 */}
            {layoutDirection === 'TB' && (
                <>
                    <Handle type="source" position={Position.Left} id="left" style={{ background: '#fff', left: '-5px' }} />
                    <Handle type="source" position={Position.Right} id="right" style={{ background: '#fff', right: '-5px' }} />
                </>
            )}
            {layoutDirection === 'LR' && (
                <>
                    <Handle type="source" position={Position.Top} id="top" style={{ background: '#fff', top: '-5px' }} />
                    <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: '#fff', bottom: '-5px' }} />
                </>
            )}
        </div>
    );
};

export default memo(DecisionNode);
