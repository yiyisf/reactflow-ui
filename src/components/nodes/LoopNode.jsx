import { memo, useCallback } from 'react';
import { Handle, Position } from 'reactflow';

/**
 * 循环节点组件（DO_WHILE）
 * 在节点内部显示循环体任务的迷你流程图
 */
const LoopNode = ({ data, selected }) => {
    const layoutDirection = data.layoutDirection || 'TB';

    // 根据布局方向确定 Handle 位置
    const sourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;

    // 获取循环体任务信息
    const loopOver = data.loopOver || [];
    const loopTaskCount = loopOver.length;

    // 处理迷你任务节点点击
    const handleMiniTaskClick = useCallback((task, event) => {
        event.stopPropagation(); // 阻止事件冒泡到循环节点

        // 触发自定义事件，让 WorkflowViewer 处理
        const customEvent = new CustomEvent('miniTaskClick', {
            detail: { task },
            bubbles: true
        });
        event.target.dispatchEvent(customEvent);
    }, []);

    // 渲染迷你任务节点
    const renderMiniTask = (task, index) => {
        const taskTypeColors = {
            SIMPLE: '#3b82f6',
            HTTP: '#8b5cf6',
            JSON_JQ_TRANSFORM: '#06b6d4',
            EVENT: '#f59e0b',
            INLINE: '#10b981',
            KAFKA_PUBLISH: '#ec4899',
            LAMBDA: '#6366f1',
            TERMINATE: '#ef4444',
            WAIT: '#64748b',
        };

        const color = taskTypeColors[task.type] || '#3b82f6';
        const isHorizontal = layoutDirection === 'LR';

        return (
            <div key={index} style={{
                position: 'relative',
                marginBottom: !isHorizontal && index < loopTaskCount - 1 ? '8px' : '0',
                marginRight: isHorizontal && index < loopTaskCount - 1 ? '8px' : '0',
                display: isHorizontal ? 'inline-block' : 'block'
            }}>
                <div
                    onClick={(e) => handleMiniTaskClick(task, e)}
                    style={{
                        background: color,
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '10px',
                        color: '#fff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        minWidth: isHorizontal ? '80px' : 'auto',
                        textAlign: 'center'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                    }}
                >
                    <div style={{
                        fontWeight: '600',
                        marginBottom: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}>
                        {task.name || task.taskReferenceName}
                    </div>
                    <div style={{
                        fontSize: '8px',
                        opacity: 0.8,
                        textTransform: 'uppercase'
                    }}>
                        {task.type}
                    </div>
                </div>

                {/* 连接箭头 - 根据布局方向调整 */}
                {index < loopTaskCount - 1 && (
                    isHorizontal ? (
                        // 横向箭头
                        <div style={{
                            position: 'absolute',
                            right: '-8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '8px',
                            height: '2px',
                            background: 'rgba(255,255,255,0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            pointerEvents: 'none'
                        }}>
                            <div style={{
                                width: '0',
                                height: '0',
                                borderTop: '3px solid transparent',
                                borderBottom: '3px solid transparent',
                                borderLeft: '4px solid rgba(255,255,255,0.5)',
                                marginRight: '-2px'
                            }} />
                        </div>
                    ) : (
                        // 纵向箭头
                        <div style={{
                            position: 'absolute',
                            left: '50%',
                            bottom: '-8px',
                            transform: 'translateX(-50%)',
                            width: '2px',
                            height: '8px',
                            background: 'rgba(255,255,255,0.5)',
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                            pointerEvents: 'none'
                        }}>
                            <div style={{
                                width: '0',
                                height: '0',
                                borderLeft: '3px solid transparent',
                                borderRight: '3px solid transparent',
                                borderTop: '4px solid rgba(255,255,255,0.5)',
                                marginBottom: '-2px'
                            }} />
                        </div>
                    )
                )}
            </div>
        );
    };

    // 渲染循环回路箭头
    const renderLoopBackArrow = () => {
        if (loopTaskCount === 0) return null;

        const isHorizontal = layoutDirection === 'LR';

        return (
            <div style={{
                marginTop: isHorizontal ? '8px' : '8px',
                marginLeft: isHorizontal ? '0' : '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                fontSize: '9px',
                opacity: 0.7,
                pointerEvents: 'none',
                width: '100%'
            }}>
                <div style={{
                    flex: 1,
                    height: '1px',
                    background: 'rgba(255,255,255,0.5)',
                    borderTop: '1px dashed rgba(255,255,255,0.5)'
                }} />
                <span>🔄</span>
                <div style={{
                    flex: 1,
                    height: '1px',
                    background: 'rgba(255,255,255,0.5)',
                    borderTop: '1px dashed rgba(255,255,255,0.5)'
                }} />
            </div>
        );
    };

    const isHorizontal = layoutDirection === 'LR';

    return (
        <div
            style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                border: selected ? '3px solid #fbbf24' : '2px solid #d97706',
                borderRadius: '16px',
                padding: '16px',
                minWidth: isHorizontal ? '300px' : '240px',
                maxWidth: isHorizontal ? '600px' : '320px',
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
                {/* 循环节点标题 */}
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
                    fontStyle: 'italic',
                    marginBottom: '12px'
                }}>
                    {data.taskReferenceName}
                </div>

                {/* 循环体迷你流程图 */}
                {loopTaskCount > 0 && (
                    <div style={{
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: '8px',
                        padding: '10px',
                        marginTop: '8px',
                        border: '1px dashed rgba(255,255,255,0.3)'
                    }}>
                        <div style={{
                            fontWeight: '600',
                            marginBottom: '8px',
                            opacity: 0.9,
                            fontSize: '10px',
                            textAlign: 'center',
                            pointerEvents: 'none'
                        }}>
                            循环体 ({loopTaskCount} 个任务)
                        </div>

                        {/* 迷你流程图容器 */}
                        <div style={{
                            maxHeight: isHorizontal ? '150px' : '250px',
                            maxWidth: isHorizontal ? '100%' : 'auto',
                            overflowY: isHorizontal ? 'hidden' : 'auto',
                            overflowX: isHorizontal ? 'auto' : 'hidden',
                            padding: '4px',
                            display: isHorizontal ? 'flex' : 'block',
                            flexDirection: isHorizontal ? 'column' : 'row',
                            alignItems: isHorizontal ? 'flex-start' : 'stretch'
                        }}>
                            <div style={{
                                display: isHorizontal ? 'flex' : 'block',
                                flexDirection: isHorizontal ? 'row' : 'column',
                                alignItems: isHorizontal ? 'center' : 'stretch'
                            }}>
                                {loopOver.map((task, index) => renderMiniTask(task, index))}
                            </div>
                            {renderLoopBackArrow()}
                        </div>
                    </div>
                )}

                {/* 循环条件 */}
                {data.loopCondition && (
                    <div style={{
                        marginTop: '8px',
                        fontSize: '9px',
                        opacity: 0.7,
                        fontStyle: 'italic',
                        background: 'rgba(0,0,0,0.2)',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        pointerEvents: 'none'
                    }}>
                        <div style={{ fontWeight: '600', marginBottom: '2px' }}>条件:</div>
                        <div style={{
                            maxHeight: '40px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            wordBreak: 'break-all'
                        }}>
                            {data.loopCondition.substring(0, 80)}{data.loopCondition.length > 80 ? '...' : ''}
                        </div>
                    </div>
                )}
            </div>

            <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
        </div>
    );
};

export default memo(LoopNode);
