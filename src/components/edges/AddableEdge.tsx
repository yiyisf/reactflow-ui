import { useState, useRef } from 'react';
import {
    getBezierPath,
    getSmoothStepPath,
    getStraightPath,
    EdgeLabelRenderer,
    BaseEdge,
    EdgeProps
} from 'reactflow';

/**
 * 可添加节点的自定义边
 * 优化了悬停稳定性，防止因动画和组件切换导致的闪烁
 * 支持动态切换连线样式 (曲线、阶梯、直线等)
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
    data
}: EdgeProps) => {
    const [isHovered, setIsHovered] = useState(false);
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 根据全局设置选择路径计算函数
    const getPath = () => {
        const edgeType = data?.edgeType || 'default';
        const params = {
            sourceX,
            sourceY,
            sourcePosition,
            targetX,
            targetY,
            targetPosition,
        };

        switch (edgeType) {
            case 'step':
            case 'smoothstep':
                return getSmoothStepPath(params);
            case 'straight':
                return getStraightPath(params);
            case 'default':
            default:
                return getBezierPath(params);
        }
    };

    const [edgePath, labelX, labelY] = getPath();

    const onAddClick = (evt: React.MouseEvent) => {
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

    const isAddable = Boolean(data?.isAddable ?? (data?.mode === 'edit'));
    const hasLabel = Boolean(data?.label);
    const baseStrokeWidth = typeof style?.strokeWidth === 'number' ? style.strokeWidth : 2.2;
    const edgeOpacity = typeof style?.opacity === 'number' ? style.opacity : 1;

    return (
        <>
            {/* 实际显示的边 */}
            <BaseEdge
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    ...style,
                    strokeWidth: isAddable && isHovered ? baseStrokeWidth + 1.4 : baseStrokeWidth,
                    stroke: isAddable && isHovered ? 'var(--color-accent)' : style?.stroke,
                    transition: 'stroke 0.2s ease, stroke-width 0.2s ease, opacity 0.25s ease',
                    pointerEvents: 'none'
                }}
            />

            {/* 交互感知层（仅在可添加节点时启用悬停感知） */}
            {isAddable && (
                <path
                    d={edgePath}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={22}
                    style={{ cursor: 'pointer', pointerEvents: 'all' }}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                />
            )}

            {(hasLabel || (isAddable && isHovered)) && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            fontSize: 12,
                            pointerEvents: isAddable ? 'all' : 'none',
                            zIndex: isHovered ? 2000 : 10,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '6px',
                            opacity: isHovered ? 1 : edgeOpacity,
                            transition: 'opacity 0.2s ease',
                        }}
                        className="nodrag nopan"
                        onMouseEnter={isAddable ? handleMouseEnter : undefined}
                        onMouseLeave={isAddable ? handleMouseLeave : undefined}
                    >
                        {/* 始终显示连线标签 (如 Decision Case / default / 分支名) */}
                        {hasLabel && (
                            <div style={{
                                background: 'var(--glass-bg-accent)',
                                backdropFilter: 'var(--glass-blur)',
                                WebkitBackdropFilter: 'var(--glass-blur)',
                                color: 'var(--text-primary)',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                fontSize: '11px',
                                fontWeight: 600,
                                border: `1px solid ${isHovered ? 'var(--color-accent)' : 'var(--border-secondary)'}`,
                                boxShadow: 'var(--cm-shadow-card)',
                                whiteSpace: 'nowrap',
                                letterSpacing: '0.3px',
                                lineHeight: 1.4,
                            }}>
                                {data.label}
                            </div>
                        )}

                        {isAddable && isHovered && (
                            <button
                                style={{
                                    width: '28px',
                                    height: '28px',
                                    backgroundColor: 'var(--color-accent)',
                                    color: 'var(--color-on-accent)',
                                    border: '2px solid var(--border-primary)',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: '18px',
                                    lineHeight: 1,
                                    boxShadow: '0 4px 14px rgba(var(--color-accent-rgb), 0.5)',
                                    transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                    padding: 0
                                }}
                                className="edge-add-button"
                                onClick={onAddClick}
                                onMouseDown={(e) => e.stopPropagation()}
                                title="在此处添加任务"
                            >
                                +
                            </button>
                        )}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};

export default AddableEdge;
