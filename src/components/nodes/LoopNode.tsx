import { memo, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import useWorkflowStore from '../../store/workflowStore';
import NodeWrapper from './NodeWrapper';
import { WorkflowNodeData } from '../../types/workflow';
import { TaskDef } from '../../types/conductor';
import ExecutionStatusBadge from './ExecutionStatusBadge';

type LoopNodeProps = NodeProps<WorkflowNodeData>;

/**
 * 循环节点组件（DO_WHILE）
 * 在节点内部显示循环体任务的迷你流程图
 */
const LoopNode = ({ id, data, selected }: LoopNodeProps) => {
    const layoutDirection = data.layoutDirection || 'TB';
    const { mode, removeLoopTask, executionData } = useWorkflowStore();

    // 获取运行态信息
    const execution = mode === 'run' ? executionData?.[data.taskReferenceName] : null;
    const isRunning = mode === 'run';

    // 根据布局方向确定 Handle 位置
    const sourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;

    // 获取循环体任务信息
    const loopOver = data.loopOver || data.task?.loopOver || [];
    const loopTaskCount = loopOver.length;

    // 处理迷你任务节点点击
    const handleMiniTaskClick = useCallback((task: TaskDef, event: React.MouseEvent) => {
        event.stopPropagation();
        const customEvent = new CustomEvent('miniTaskClick', {
            detail: { task },
            bubbles: true
        });
        document.dispatchEvent(customEvent);
    }, []);

    // 处理删除循环内任务
    const handleRemoveTask = (e: React.MouseEvent, taskRef: string) => {
        e.stopPropagation();
        if (window.confirm('确定要从循环中删除此任务吗？')) {
            removeLoopTask(id, taskRef);
        }
    };

    // 运行态 CSS 类名映射
    const getExecutionClassName = (status: string | undefined) => {
        if (!status) return '';
        const mapping: Record<string, string> = {
            'SCHEDULED': 'execution-node-scheduled',
            'IN_PROGRESS': 'execution-node-in-progress',
            'COMPLETED': 'execution-node-completed',
            'COMPLETED_WITH_ERRORS': 'execution-node-completed-with-errors',
            'FAILED': 'execution-node-failed',
            'FAILED_WITH_TERMINAL_ERROR': 'execution-node-failed-terminal',
            'TIMED_OUT': 'execution-node-timed-out',
            'SKIPPED': 'execution-node-skipped',
            'CANCELED': 'execution-node-canceled',
        };
        return mapping[status] || '';
    };

    const executionClass = isRunning ? getExecutionClassName(execution?.status) : '';

    // 渲染迷你任务节点
    const renderMiniTask = (task: TaskDef, index: number) => {
        const isHorizontal = layoutDirection === 'LR';
        const bgColor = 'var(--bg-secondary)';
        const borderColor = 'var(--color-accent)';
        const textColor = 'var(--text-primary)';

        return (
            <div key={index} style={{
                position: 'relative',
                marginBottom: !isHorizontal && (index < loopTaskCount - 1 || mode === 'edit') ? '8px' : '0',
                marginRight: isHorizontal && (index < loopTaskCount - 1 || mode === 'edit') ? '8px' : '0',
                display: isHorizontal ? 'inline-block' : 'block'
            }}>
                <div
                    onClick={(e) => handleMiniTaskClick(task, e)}
                    style={{
                        background: bgColor,
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '10px',
                        color: textColor,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        border: `1px solid ${borderColor}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        minWidth: isHorizontal ? '80px' : 'auto',
                        textAlign: 'center',
                        position: 'relative'
                    }}
                >
                    {mode === 'edit' && (
                        <div
                            onClick={(e) => handleRemoveTask(e, task.taskReferenceName)}
                            style={{
                                position: 'absolute',
                                top: '-6px',
                                right: '-6px',
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                backgroundColor: '#ef4444',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                border: '1px solid white'
                            }}
                        >
                            ×
                        </div>
                    )}
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

                {/* 连接箭头 */}
                {index < loopTaskCount - 1 && (
                    isHorizontal ? (
                        <div style={{
                            position: 'absolute',
                            right: '-8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '8px',
                            height: '2px',
                            background: 'var(--border-secondary)',
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
                                borderLeft: '4px solid var(--text-muted)',
                                marginRight: '-2px'
                            }} />
                        </div>
                    ) : (
                        <div style={{
                            position: 'absolute',
                            left: '50%',
                            bottom: '-8px',
                            transform: 'translateX(-50%)',
                            width: '2px',
                            height: '8px',
                            background: 'var(--border-secondary)',
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
                                borderTop: '4px solid var(--text-muted)',
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

        return (
            <div style={{
                marginTop: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                fontSize: '9px',
                opacity: 0.7,
                pointerEvents: 'none',
                width: '100%'
            }}>
                <div style={{ flex: 1, height: '1px', borderTop: '1px dashed var(--border-secondary)' }} />
                <span>🔄</span>
                <div style={{ flex: 1, height: '1px', borderTop: '1px dashed var(--border-secondary)' }} />
            </div>
        );
    };

    const isHorizontal = layoutDirection === 'LR';

    return (
        <NodeWrapper
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
            isHighlighted={data.isHighlighted}
        >
            <div
                className={`loop-container ${executionClass}`}
                style={{
                    border: selected ? '3px solid #fbbf24' : (isRunning && execution?.status ? undefined : '2px dashed var(--color-accent)'),
                    background: isRunning && execution?.status
                        ? undefined
                        : 'var(--color-accent-bg)',
                    borderRadius: '16px',
                    padding: '16px',
                    minWidth: isHorizontal ? '300px' : '240px',
                    transition: 'all 0.3s ease',
                    position: 'relative',
                    overflow: 'visible',
                }}
            >
                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />

                {/* 运行态徽章 */}
                {isRunning && execution?.status && (
                    <ExecutionStatusBadge status={execution.status} />
                )}

                <div style={{ color: isRunning && execution?.status ? '#fff' : 'inherit' }}>
                    <div style={{
                        fontSize: '10px',
                        opacity: 0.8,
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        <span>🔄</span> {data.taskType}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>
                        {data.label}
                    </div>

                    {/* 运行态迭代信息 */}
                    {isRunning && (execution as any)?.iteration !== undefined && (
                        <div style={{ fontSize: '11px', color: '#fbbf24', marginBottom: '8px', fontWeight: 'bold' }}>
                            Iteration: {(execution as any).iteration}
                        </div>
                    )}

                    {/* 循环体迷你流程图 */}
                    {(loopTaskCount > 0 || mode === 'edit') && (
                        <div style={{
                            background: 'var(--bg-tertiary)',
                            borderRadius: '12px',
                            padding: '12px',
                            marginTop: '8px',
                            border: '1px solid var(--border-primary)'
                        }}>
                            <div style={{
                                display: isHorizontal ? 'flex' : 'block',
                                alignItems: isHorizontal ? 'center' : 'stretch'
                            }}>
                                {loopOver.map((task, index) => renderMiniTask(task, index))}

                                {mode === 'edit' && (
                                    <div
                                        onClick={() => {
                                            const event = new CustomEvent('loopAddNodeRequested', {
                                                detail: { loopId: id }
                                            });
                                            document.dispatchEvent(event);
                                        }}
                                        style={{
                                            background: 'var(--color-accent)',
                                            color: '#fff',
                                            border: '2px solid #fff',
                                            borderRadius: '50%',
                                            width: '28px',
                                            height: '28px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            fontSize: '18px',
                                            fontWeight: 'bold',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                            transition: 'all 0.2s ease',
                                            zIndex: 10
                                        }}
                                    >
                                        +
                                    </div>
                                )}
                            </div>
                            {renderLoopBackArrow()}
                        </div>
                    )}

                    {/* 循环条件 */}
                    <div style={{
                        marginTop: '12px',
                        fontSize: '9px',
                        opacity: 0.8,
                        fontStyle: 'italic',
                        color: 'var(--text-muted)',
                        background: 'var(--bg-highlight)',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        borderLeft: '2px solid var(--color-accent)',
                        wordBreak: 'break-all'
                    }}>
                        {data.loopCondition || 'No condition'}
                    </div>
                </div>

                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
            </div>
        </NodeWrapper>
    );
};

export default memo(LoopNode);
