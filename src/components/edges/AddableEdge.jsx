import React, { useState, useRef } from 'react';
import { getBezierPath, EdgeLabelRenderer, BaseEdge } from 'reactflow';

/**
 * 可添加节点的自定义边
 * 优化了悬停稳定性，防止因动画和组件切换导致的闪烁
 */
const AddableEdge = ({
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data,
    animated
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const hoverTimeoutRef = useRef(null);

    // 计算贝塞尔曲线路径
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const onAddClick = (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
        const event = new CustomEvent('edgeAddNode', {
            detail: { id, source, target, edgeData: data }
        });
        window.dispatchEvent(event);
    };

    // 使用延迟取消悬停，解决按钮闪烁问题
    const handleMouseEnter = () => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        setIsHovered(true);
    };

    const handleMouseLeave = () => {
        // 延迟 100ms 取消，给鼠标移动到按钮上的缓冲时间
        hoverTimeoutRef.current = setTimeout(() => {
            setIsHovered(false);
        }, 100);
    };

    const isEditMode = data?.mode === 'edit';
    // 悬停时暂时禁用边上的动画，提高点击稳定性
    const shouldAnimate = animated && !isHovered;

    return (
        <>
            {/* 实际显示的边 */}
            <BaseEdge
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    ...style,
                    strokeWidth: isHovered ? 4 : 2,
                    stroke: isHovered ? '#fbbf24' : style.stroke,
                    transition: 'stroke 0.2s, stroke-width 0.2s',
                    pointerEvents: 'none'
                }}
                // 虽然设置了 pointerEvents: none，但 React Flow 的 BaseEdge 内部可能处理了动画
                // 我们通过传递控制后的 animated 状态来确保稳定
                animated={shouldAnimate}
            />

            {/* 交互感知层 */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                style={{ cursor: isEditMode ? 'pointer' : 'default', pointerEvents: 'all' }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            />

            {isEditMode && isHovered && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            fontSize: 12,
                            pointerEvents: 'all',
                            zIndex: 2000,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                        }}
                        className="nodrag nopan"
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                    >
                        {/* 显示连线标签 (如 Case 键名) */}
                        {data?.label && (
                            <div style={{
                                background: '#1e293b',
                                color: '#fbbf24',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                marginBottom: '6px',
                                border: '1px solid #fbbf24',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                whiteSpace: 'nowrap'
                            }}>
                                {data.label}
                            </div>
                        )}

                        <button
                            style={{
                                width: '28px',
                                height: '28px',
                                backgroundColor: '#fbbf24',
                                color: '#1e293b',
                                border: '2px solid #fff',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '900',
                                fontSize: '18px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                padding: 0
                            }}
                            onClick={onAddClick}
                            onMouseDown={(e) => e.stopPropagation()}
                            title="在此处添加任务"
                        >
                            +
                        </button>
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};

export default AddableEdge;
