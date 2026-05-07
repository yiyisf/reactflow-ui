import { memo, useCallback, useMemo } from 'react';
import { Handle, NodeProps } from 'reactflow';
import useWorkflowStore from '../../store/workflowStore';
import NodeWrapper from './NodeWrapper';
import NodeLayout from './NodeLayout';
import { WorkflowNodeData } from '../../types/workflow';
import { TaskDef } from '../../types/conductor';
import { useNodeLayout } from '../../hooks/useNodeLayout';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import { TASK_TYPES } from '../../config/taskTypes';
import { Repeat } from 'lucide-react';
import { getNodeMeta } from '../../utils/nodeMeta';

type LoopNodeProps = NodeProps<WorkflowNodeData>;

// 使用 CSS 变量以支持主题切换
const LOOP_COLOR = 'var(--color-accent)';

/**
 * 循环节点组件（DO_WHILE）
 */
const LoopNode = ({ id, data, selected }: LoopNodeProps) => {
    const { layoutDirection, sourcePosition, targetPosition } = useNodeLayout(data);
    const { mode, execution, isRunning } = useNodeExecution(data.taskReferenceName);
    const { removeLoopTask, executionData, selectTaskAction, viewMode } = useWorkflowStore();

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

    const taskConfig = useMemo(() => TASK_TYPES.find(t => t.type === 'DO_WHILE'), []);
    const IconComponent = taskConfig?.icon || Repeat;

    // 渲染迷你任务节点
    const renderMiniTask = (task: TaskDef, index: number) => {
        const isHorizontal = layoutDirection === 'LR';
        const bgColor = 'var(--bg-tertiary)';
        const borderColor = 'var(--border-secondary)';
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
                        whiteSpace: 'nowrap',
                        maxWidth: '100px'
                    }}>
                        {task.name || task.taskReferenceName}
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
                            pointerEvents: 'none'
                        }} />
                    ) : (
                        <div style={{
                            position: 'absolute',
                            left: '50%',
                            bottom: '-8px',
                            transform: 'translateX(-50%)',
                            width: '2px',
                            height: '8px',
                            background: 'var(--border-secondary)',
                            pointerEvents: 'none'
                        }} />
                    )
                )}
            </div>
        );
    };

    const isHorizontal = layoutDirection === 'LR';

    // 从循环体子任务的 executionData 中推断总迭代次数
    const totalIterations = useMemo(() => {
        if (!isRunning || !executionData || loopOver.length === 0) return 0;
        let maxIter = 0;
        loopOver.forEach(subTask => {
            const subExec = executionData[subTask.taskReferenceName];
            if (subExec?.totalIterations) {
                maxIter = Math.max(maxIter, subExec.totalIterations);
            } else if (subExec?.attempts.some(a => a.iteration !== undefined && a.iteration > 0)) {
                maxIter = Math.max(maxIter, subExec.attempts.length);
            }
        });
        return maxIter;
    }, [isRunning, executionData, loopOver]);

    const conditionFallback = `Condition: ${data.loopCondition || 'None'}`;
    const meta = viewMode === 'business'
        ? getNodeMeta('DO_WHILE', data, viewMode, '循环执行')
        : getNodeMeta('DO_WHILE', data, viewMode, conditionFallback);

    return (
        <NodeWrapper
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
            isHighlighted={data.isHighlighted}
            executionStatus={execution?.status}
            simRunning={data.simRunning}
            simDone={data.simDone}
        >
            <div
                style={{
                    borderRadius: '8px',
                    background: 'var(--bg-secondary)',
                    minWidth: isHorizontal ? (layoutDirection === 'LR' ? '320px' : '240px') : '240px',
                    position: 'relative',
                    overflow: 'visible',
                }}
            >
                <NodeLayout
                    icon={IconComponent}
                    header="DO WHILE"
                    title={data.taskReferenceName}
                    meta={meta}
                    color={LOOP_COLOR}
                    status={execution?.status}
                    isRunning={isRunning}
                    width="100%"
                >
                    {/* 循环体迷你流程图 (作为 Children 传入) */}
                    {(loopTaskCount > 0 || mode === 'edit') && (
                        <div style={{
                            background: 'var(--bg-primary)', // Slightly darker/lighter
                            borderRadius: '6px',
                            padding: '12px',
                            marginTop: '8px',
                            border: '1px dashed var(--border-secondary)',
                            display: 'flex',
                            flexDirection: isHorizontal ? 'row' : 'column',
                            alignItems: isHorizontal ? 'center' : 'stretch',
                            flexWrap: isHorizontal ? 'nowrap' : 'nowrap', // 修复：LR 模式下不换行，保持横向
                            gap: '8px',
                            justifyContent: 'flex-start'
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
                                        borderRadius: '50%',
                                        width: '24px',
                                        height: '24px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        fontSize: '16px',
                                        fontWeight: 'bold',
                                        marginLeft: '0',
                                        marginRight: '0',
                                        flexShrink: 0
                                    }}
                                >
                                    +
                                </div>
                            )}
                        </div>
                    )}

                    {/* 运行态迭代进度 */}
                    {isRunning && totalIterations > 0 && (
                        <div
                            onClick={() => selectTaskAction(data.task || null)}
                            style={{
                                marginTop: '8px',
                                padding: '4px 10px',
                                background: 'var(--bg-primary)',
                                borderRadius: '6px',
                                fontSize: '11px',
                                color: 'var(--color-accent)',
                                textAlign: 'center',
                                cursor: 'pointer',
                                border: '1px solid var(--border-secondary)',
                                fontWeight: '600',
                            }}
                        >
                            已完成 {totalIterations} 次迭代
                        </div>
                    )}
                </NodeLayout>

                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />

                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
            </div>
        </NodeWrapper>
    );
};

export default memo(LoopNode);
