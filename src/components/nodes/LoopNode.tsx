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

const LOOP_COLOR = 'var(--color-accent)';

// Task type → badge color
const TYPE_BADGE_COLORS: Record<string, string> = {
    SWITCH: '#8b5cf6',
    DECISION: '#8b5cf6',
    FORK_JOIN: '#0891b2',
    JOIN: '#64748b',
    EXCLUSIVE_JOIN: '#64748b',
    HTTP: '#059669',
    DO_WHILE: 'var(--color-accent)',
    SUB_WORKFLOW: '#d97706',
    FORK_JOIN_DYNAMIC: '#0891b2',
};

function getTypeBadgeColor(type: string): string {
    return TYPE_BADGE_COLORS[type] || 'var(--color-accent)';
}

const LoopNode = ({ id, data, selected }: LoopNodeProps) => {
    const { layoutDirection, sourcePosition, targetPosition } = useNodeLayout(data);
    const { mode, execution, isRunning } = useNodeExecution(data.taskReferenceName);
    const { removeLoopTask, addDecisionBranch, addForkBranch, executionData, selectTaskAction, viewMode } = useWorkflowStore();

    const loopOver = data.loopOver || data.task?.loopOver || [];
    const loopTaskCount = loopOver.length;

    const handleMiniTaskClick = useCallback((task: TaskDef, event: React.MouseEvent) => {
        event.stopPropagation();
        const customEvent = new CustomEvent('miniTaskClick', {
            detail: { task },
            bubbles: true
        });
        document.dispatchEvent(customEvent);
    }, []);

    const handleRemoveTask = (e: React.MouseEvent, taskRef: string) => {
        e.stopPropagation();
        if (window.confirm('确定要从循环中删除此任务吗？')) {
            removeLoopTask(id, taskRef);
        }
    };

    // Dispatch "insert after specific task" event
    const handleInsertAfter = (e: React.MouseEvent, afterRef: string) => {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('loopInsertAfterRequested', {
            detail: { afterRef }
        }));
    };

    // Dispatch "add task to SWITCH/DECISION branch" event
    const handleBranchAdd = (e: React.MouseEvent, parentRef: string, branchCase: string) => {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('loopBranchAddRequested', {
            detail: { parentRef, branchCase }
        }));
    };

    // Dispatch "add task to FORK branch" event
    const handleForkBranchAdd = (e: React.MouseEvent, parentRef: string, forkIndex: number) => {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('loopForkAddRequested', {
            detail: { parentRef, forkIndex }
        }));
    };

    const taskConfig = useMemo(() => TASK_TYPES.find(t => t.type === 'DO_WHILE'), []);
    const IconComponent = taskConfig?.icon || Repeat;

    // Render a branch pill for SWITCH/FORK tasks
    const renderBranchPill = (label: string, count: number, onClick: (e: React.MouseEvent) => void) => (
        <button
            key={label}
            onClick={onClick}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid var(--border-secondary)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                fontSize: '9px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
            }}
        >
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{label}</span>
            <span>({count})</span>
            <span style={{ color: 'var(--color-accent)', fontWeight: 700, fontSize: '11px' }}>+</span>
        </button>
    );

    // Insert-after "+" button shown between tasks in edit mode
    const renderInsertAfterBtn = (afterRef: string) => (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0', zIndex: 1 }}>
            <div
                onClick={(e) => handleInsertAfter(e, afterRef)}
                title="在此处插入任务"
                style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'var(--bg-secondary)',
                    border: '1px dashed var(--color-accent)',
                    color: 'var(--color-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    lineHeight: 1,
                }}
            >
                +
            </div>
        </div>
    );

    const renderMiniTask = (task: TaskDef, index: number) => {
        const isHorizontal = layoutDirection === 'LR';
        const isSwitchTask = task.type === 'DECISION' || task.type === 'SWITCH';
        const isForkTask = task.type === 'FORK_JOIN' || task.type === 'FORK_JOIN_DYNAMIC';
        const isJoinTask = task.type === 'JOIN' || task.type === 'EXCLUSIVE_JOIN';
        const isLoopTask = task.type === 'DO_WHILE';
        const isSimpleType = task.type === 'SIMPLE' || !task.type;
        const badgeColor = getTypeBadgeColor(task.type);
        const isLast = index === loopTaskCount - 1;

        // JOIN tasks are companion to FORK — show as a lighter connector indicator
        if (isJoinTask) {
            return (
                <div key={index} style={{
                    position: 'relative',
                    marginBottom: !isHorizontal && !isLast ? '4px' : 0,
                    marginRight: isHorizontal && !isLast ? '4px' : 0,
                    display: isHorizontal ? 'inline-block' : 'block',
                }}>
                    <div
                        onClick={(e) => handleMiniTaskClick(task, e)}
                        title={`JOIN: ${task.taskReferenceName}`}
                        style={{
                            background: 'var(--bg-primary)',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '9px',
                            color: 'var(--text-tertiary)',
                            border: '1px dashed var(--border-secondary)',
                            cursor: 'pointer',
                            textAlign: 'center',
                            fontStyle: 'italic',
                        }}
                    >
                        ⊕ join
                    </div>
                    {/* Connector arrow in view/run mode */}
                    {!isLast && mode !== 'edit' && (
                        isHorizontal ? (
                            <div style={{
                                position: 'absolute', right: '-8px', top: '50%',
                                transform: 'translateY(-50%)',
                                width: '8px', height: '2px',
                                background: 'var(--border-secondary)', pointerEvents: 'none'
                            }} />
                        ) : (
                            <div style={{
                                position: 'absolute', left: '50%', bottom: '-8px',
                                transform: 'translateX(-50%)',
                                width: '2px', height: '8px',
                                background: 'var(--border-secondary)', pointerEvents: 'none'
                            }} />
                        )
                    )}
                    {/* Insert after in edit mode */}
                    {mode === 'edit' && !isLast && renderInsertAfterBtn(task.taskReferenceName)}
                </div>
            );
        }

        const branches = isSwitchTask
            ? [
                ...Object.entries(task.decisionCases || {}).map(([k, v]) => ({ label: k, count: (v as TaskDef[]).length, key: k })),
                { label: 'default', count: (task.defaultCase || []).length, key: 'default' },
            ]
            : isForkTask
            ? (task.forkTasks || []).map((b, i) => ({ label: `Branch ${i + 1}`, count: b.length, key: String(i) }))
            : [];

        return (
            <div key={index} style={{
                position: 'relative',
                marginBottom: !isHorizontal && !isLast && mode !== 'edit' ? '8px' : 0,
                marginRight: isHorizontal && !isLast && mode !== 'edit' ? '8px' : 0,
                display: isHorizontal ? 'inline-block' : 'block',
            }}>
                <div
                    onClick={(e) => handleMiniTaskClick(task, e)}
                    style={{
                        background: 'var(--bg-tertiary)',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '10px',
                        color: 'var(--text-primary)',
                        border: `1px solid ${(isSwitchTask || isForkTask || isLoopTask) ? badgeColor + '66' : 'var(--border-secondary)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        minWidth: isHorizontal ? '80px' : 'auto',
                        position: 'relative',
                    }}
                >
                    {/* Delete button (not for JOIN tasks) */}
                    {mode === 'edit' && (
                        <div
                            onClick={(e) => handleRemoveTask(e, task.taskReferenceName)}
                            title="从循环中删除"
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
                                border: '1px solid white',
                                zIndex: 1,
                            }}
                        >
                            ×
                        </div>
                    )}

                    {/* Type badge (hidden for plain SIMPLE tasks) */}
                    {!isSimpleType && (
                        <div style={{
                            display: 'inline-block',
                            fontSize: '8px',
                            fontWeight: 700,
                            color: '#fff',
                            background: badgeColor,
                            borderRadius: '3px',
                            padding: '1px 4px',
                            marginBottom: '3px',
                            letterSpacing: '0.03em',
                        }}>
                            {task.type}
                        </div>
                    )}

                    {/* Task name */}
                    <div style={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '120px',
                    }}>
                        {task.name || task.taskReferenceName}
                    </div>

                    {/* SWITCH/DECISION branches */}
                    {isSwitchTask && mode === 'edit' && branches.length > 0 && (
                        <div style={{
                            marginTop: '6px',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '3px',
                            borderTop: '1px solid var(--border-secondary)',
                            paddingTop: '5px',
                        }}>
                            {branches.map(b => renderBranchPill(b.label, b.count, (e) => handleBranchAdd(e, task.taskReferenceName, b.key)))}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const caseName = prompt('新分支名称:');
                                    if (caseName) addDecisionBranch(task.taskReferenceName, caseName);
                                }}
                                style={{
                                    padding: '2px 5px',
                                    borderRadius: '4px',
                                    border: '1px dashed var(--border-secondary)',
                                    background: 'transparent',
                                    color: 'var(--text-tertiary)',
                                    fontSize: '9px',
                                    cursor: 'pointer',
                                }}
                            >
                                + 分支
                            </button>
                        </div>
                    )}

                    {/* FORK_JOIN branches */}
                    {isForkTask && mode === 'edit' && branches.length > 0 && (
                        <div style={{
                            marginTop: '6px',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '3px',
                            borderTop: '1px solid var(--border-secondary)',
                            paddingTop: '5px',
                        }}>
                            {branches.map((b, i) => renderBranchPill(b.label, b.count, (e) => handleForkBranchAdd(e, task.taskReferenceName, i)))}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    addForkBranch(task.taskReferenceName);
                                }}
                                style={{
                                    padding: '2px 5px',
                                    borderRadius: '4px',
                                    border: '1px dashed var(--border-secondary)',
                                    background: 'transparent',
                                    color: 'var(--text-tertiary)',
                                    fontSize: '9px',
                                    cursor: 'pointer',
                                }}
                            >
                                + 并行
                            </button>
                        </div>
                    )}

                    {/* Nested DO_WHILE indicator */}
                    {isLoopTask && (
                        <div style={{
                            marginTop: '4px',
                            fontSize: '9px',
                            color: 'var(--text-tertiary)',
                            fontStyle: 'italic',
                        }}>
                            {(task.loopOver || []).length} 个子任务
                        </div>
                    )}
                </div>

                {/* Connector arrow in view/run mode */}
                {!isLast && mode !== 'edit' && (
                    isHorizontal ? (
                        <div style={{
                            position: 'absolute', right: '-8px', top: '50%',
                            transform: 'translateY(-50%)',
                            width: '8px', height: '2px',
                            background: 'var(--border-secondary)', pointerEvents: 'none'
                        }} />
                    ) : (
                        <div style={{
                            position: 'absolute', left: '50%', bottom: '-8px',
                            transform: 'translateX(-50%)',
                            width: '2px', height: '8px',
                            background: 'var(--border-secondary)', pointerEvents: 'none'
                        }} />
                    )
                )}

                {/* Insert after button in edit mode (between tasks) */}
                {mode === 'edit' && !isLast && renderInsertAfterBtn(task.taskReferenceName)}
            </div>
        );
    };

    const isHorizontal = layoutDirection === 'LR';

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
                    minWidth: isHorizontal ? '320px' : '240px',
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
                    {(loopTaskCount > 0 || mode === 'edit') && (
                        <div style={{
                            background: 'var(--bg-primary)',
                            borderRadius: '6px',
                            padding: '10px',
                            marginTop: '8px',
                            border: '1px dashed var(--border-secondary)',
                            display: 'flex',
                            flexDirection: isHorizontal ? 'row' : 'column',
                            alignItems: isHorizontal ? 'flex-start' : 'stretch',
                            gap: mode === 'edit' ? '0' : '8px',
                            justifyContent: 'flex-start',
                        }}>
                            {loopOver.map((task, index) => renderMiniTask(task, index))}

                            {/* Append-to-end button */}
                            {mode === 'edit' && (
                                <div style={{ display: 'flex', justifyContent: isHorizontal ? 'flex-start' : 'center', marginTop: loopTaskCount > 0 ? '4px' : 0 }}>
                                    <div
                                        onClick={() => {
                                            // If loop has tasks, append after the last one; otherwise insert first
                                            const lastTask = loopOver.length > 0 ? loopOver[loopOver.length - 1] : null;
                                            const event = new CustomEvent('loopAddNodeRequested', {
                                                detail: {
                                                    loopId: id,
                                                    afterRef: lastTask?.taskReferenceName ?? null,
                                                }
                                            });
                                            document.dispatchEvent(event);
                                        }}
                                        title="追加任务到循环末尾"
                                        style={{
                                            background: 'var(--color-accent)',
                                            color: '#fff',
                                            borderRadius: '50%',
                                            width: '22px',
                                            height: '22px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            fontSize: '15px',
                                            fontWeight: 'bold',
                                            flexShrink: 0,
                                        }}
                                    >
                                        +
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

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
