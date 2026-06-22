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

    const isEditMode = data?.mode === 'edit';
    // Branch labels are always visible in non-edit modes; in edit mode, show on hover
    const showLabel = !!data?.label && (!isEditMode || isHovered);
    // "+" add button only in edit mode on hover
    const showAddButton = isEditMode && isHovered;

    return (
        <>
            {/* 实际显示的边 */}
            <BaseEdge
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    ...style,
                    strokeWidth: isHovered ? 4 : 2,
                    stroke: isHovered ? '#fbbf24' : style?.stroke,
                    transition: 'stroke 0.2s, stroke-width 0.2s',
                    pointerEvents: 'none'
                }}
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

            {(showLabel || showAddButton) && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            fontSize: 12,
                            pointerEvents: showAddButton ? 'all' : 'none',
                            zIndex: 2000,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                        }}
                        className="nodrag nopan"
                        onMouseEnter={showAddButton ? handleMouseEnter : undefined}
                        onMouseLeave={showAddButton ? handleMouseLeave : undefined}
                    >
                        {/* 显示连线标签 (如 Case 键名)：非编辑模式始终可见，编辑模式悬停可见 */}
                        {showLabel && (
                            <div style={{
                                background: isEditMode ? 'var(--glass-bg-accent)' : 'var(--glass-surface)',
                                backdropFilter: 'var(--glass-blur)',
                                color: isEditMode ? 'var(--color-accent)' : 'var(--text-secondary)',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '700',
                                marginBottom: showAddButton ? '8px' : 0,
                                border: `1px solid ${isEditMode ? 'var(--color-accent)' : 'var(--glass-border)'}`,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                whiteSpace: 'nowrap',
                                letterSpacing: '0.5px',
                                opacity: isEditMode ? 1 : 0.85,
                            }}>
                                {data.label}
                            </div>
                        )}

                        {showAddButton && (
                            <button
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    backgroundColor: 'var(--color-accent)',
                                    color: '#fff',
                                    border: '2px solid rgba(255,255,255,0.8)',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '700',
                                    fontSize: '20px',
                                    boxShadow: '0 4px 15px rgba(var(--color-accent-rgb), 0.5)',
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
