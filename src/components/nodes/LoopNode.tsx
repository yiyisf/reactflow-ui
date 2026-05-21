import React, { memo, useCallback, useMemo } from 'react';
import { Handle, NodeProps } from 'reactflow';
import useWorkflowStore from '../../store/workflowStore';
import NodeWrapper from './NodeWrapper';
import NodeLayout from './NodeLayout';
import { WorkflowNodeData, ExecutionStatus } from '../../types/workflow';
import { TaskDef } from '../../types/conductor';
import { useNodeLayout } from '../../hooks/useNodeLayout';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import { TASK_TYPES } from '../../config/taskTypes';
import { Repeat } from 'lucide-react';
import { getNodeMeta } from '../../utils/nodeMeta';

type LoopNodeProps = NodeProps<WorkflowNodeData>;

const LOOP_COLOR = 'var(--color-accent)';

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

// Mirrors the styling logic from NodeWrapper for mini-task cards
function getStatusCardStyle(status: ExecutionStatus | string | undefined, isRunMode: boolean): React.CSSProperties {
    if (!isRunMode) return {};
    if (!status) return { opacity: 0.4 };
    switch (status) {
        case 'COMPLETED':
            return { borderColor: 'var(--status-completed)', opacity: 0.9 };
        case 'IN_PROGRESS':
        case 'SCHEDULED':
            return { borderColor: 'var(--status-in-progress)', animation: 'status-pulse 1.5s ease-in-out infinite' };
        case 'FAILED':
        case 'FAILED_WITH_TERMINAL_ERROR':
            return { borderColor: 'var(--status-failed)', boxShadow: '0 0 8px rgba(239, 68, 68, 0.35)' };
        case 'TIMED_OUT':
            return { borderColor: 'var(--status-timed-out)' };
        case 'SKIPPED':
        case 'CANCELED':
            return { opacity: 0.5 };
        default:
            return {};
    }
}

// Color for connector arrows in run mode
function getConnectorColor(status: string | undefined, isRunMode: boolean): string {
    if (!isRunMode || !status) return 'var(--border-secondary)';
    if (status === 'COMPLETED') return 'var(--status-completed)';
    if (status === 'IN_PROGRESS' || status === 'SCHEDULED') return 'var(--status-in-progress)';
    return 'var(--border-secondary)';
}

const LoopNode = ({ id, data, selected }: LoopNodeProps) => {
    const { layoutDirection, sourcePosition, targetPosition } = useNodeLayout(data);
    const { mode, execution, isRunning } = useNodeExecution(data.taskReferenceName);
    const { removeLoopTask, addDecisionBranch, addForkBranch, executionData, selectTaskAction, viewMode } = useWorkflowStore();

    const loopOver = data.loopOver || data.task?.loopOver || [];
    const loopTaskCount = loopOver.length;

    const handleMiniTaskClick = useCallback((task: TaskDef, event: React.MouseEvent) => {
        event.stopPropagation();
        document.dispatchEvent(new CustomEvent('miniTaskClick', { detail: { task }, bubbles: true }));
    }, []);

    const handleRemoveTask = (e: React.MouseEvent, taskRef: string) => {
        e.stopPropagation();
        if (window.confirm('确定要从循环中删除此任务吗？')) {
            removeLoopTask(id, taskRef);
        }
    };

    const handleInsertAfter = (e: React.MouseEvent, afterRef: string) => {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('loopInsertAfterRequested', { detail: { afterRef } }));
    };

    const handleBranchAdd = (e: React.MouseEvent, parentRef: string, branchCase: string) => {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('loopBranchAddRequested', { detail: { parentRef, branchCase } }));
    };

    const handleForkBranchAdd = (e: React.MouseEvent, parentRef: string, forkIndex: number) => {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('loopForkAddRequested', { detail: { parentRef, forkIndex } }));
    };

    const taskConfig = useMemo(() => TASK_TYPES.find(t => t.type === 'DO_WHILE'), []);
    const IconComponent = taskConfig?.icon || Repeat;

    // Shared branch pill component
    const renderBranchPill = (
        label: string,
        count: number | null,
        status: string | undefined,
        onClick: ((e: React.MouseEvent) => void) | null
    ) => {
        const isRunPill = mode === 'run';
        const pillColor = isRunPill
            ? (status === 'COMPLETED' ? 'var(--status-completed)'
                : status === 'FAILED' || status === 'FAILED_WITH_TERMINAL_ERROR' ? 'var(--status-failed)'
                : status === 'IN_PROGRESS' || status === 'SCHEDULED' ? 'var(--status-in-progress)'
                : 'var(--border-secondary)')
            : 'var(--border-secondary)';

        return (
            <button
                key={label}
                onClick={onClick ?? undefined}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: `1px solid ${pillColor}`,
                    background: 'var(--bg-secondary)',
                    color: isRunPill ? pillColor : 'var(--text-secondary)',
                    fontSize: '9px',
                    cursor: onClick ? 'pointer' : 'default',
                    whiteSpace: 'nowrap',
                    fontWeight: isRunPill && status === 'COMPLETED' ? 700 : 500,
                }}
            >
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{label}</span>
                {count !== null && <span>({count})</span>}
                {!isRunPill && onClick && <span style={{ color: 'var(--color-accent)', fontWeight: 700, fontSize: '11px' }}>+</span>}
                {isRunPill && status === 'COMPLETED' && <span style={{ fontSize: '9px' }}>✓</span>}
            </button>
        );
    };

    const renderInsertAfterBtn = (afterRef: string) => (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0' }}>
            <div
                onClick={(e) => handleInsertAfter(e, afterRef)}
                title="在此处插入任务"
                style={{
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: 'var(--bg-secondary)', border: '1px dashed var(--color-accent)',
                    color: 'var(--color-accent)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
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
        const isEditMode = mode === 'edit';
        const isRunMode = mode === 'run';

        // Runtime execution data for this specific sub-task
        const execData = (isRunMode && executionData) ? executionData[task.taskReferenceName] : null;
        const taskStatus = execData?.status;
        const cardStatusStyle = getStatusCardStyle(taskStatus, isRunMode);
        const connectorColor = getConnectorColor(taskStatus, isRunMode);

        // SWITCH: determine which branches were executed (run mode) — inline, no hook
        const executedCases = new Set<string>();
        if (isSwitchTask && isRunMode && executionData) {
            Object.entries(task.decisionCases || {}).forEach(([caseName, caseTasks]) => {
                if ((caseTasks as TaskDef[]).some(t => executionData![t.taskReferenceName])) executedCases.add(caseName);
            });
            if ((task.defaultCase || []).some(t => executionData![t.taskReferenceName])) executedCases.add('default');
        }

        // FORK: branch statuses (run mode) — inline, no hook
        const forkBranchStatuses: (string | undefined)[] = isForkTask && isRunMode && executionData
            ? (task.forkTasks || []).map(branch => {
                const last = branch[branch.length - 1];
                return last ? executionData[last.taskReferenceName]?.status : undefined;
            })
            : [];

        // JOIN: compact indicator
        if (isJoinTask) {
            const joinExec = (isRunMode && executionData) ? executionData[task.taskReferenceName] : null;
            const joinStyle = getStatusCardStyle(joinExec?.status, isRunMode);
            return (
                <div key={index} style={{
                    position: 'relative',
                    marginBottom: !isHorizontal && !isLast && !isEditMode ? '4px' : 0,
                    marginRight: isHorizontal && !isLast && !isEditMode ? '4px' : 0,
                    display: isHorizontal ? 'inline-block' : 'block',
                }}>
                    <div
                        onClick={(e) => handleMiniTaskClick(task, e)}
                        title={`JOIN: ${task.taskReferenceName}${joinExec ? ` · ${joinExec.status}` : ''}`}
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
                            ...joinStyle,
                        }}
                    >
                        ⊕ join{joinExec?.status === 'COMPLETED' ? ' ✓' : ''}
                    </div>
                    {!isLast && !isEditMode && (
                        isHorizontal
                            ? <div style={{ position: 'absolute', right: '-8px', top: '50%', transform: 'translateY(-50%)', width: '8px', height: '2px', background: connectorColor, pointerEvents: 'none' }} />
                            : <div style={{ position: 'absolute', left: '50%', bottom: '-8px', transform: 'translateX(-50%)', width: '2px', height: '8px', background: connectorColor, pointerEvents: 'none' }} />
                    )}
                    {isEditMode && !isLast && renderInsertAfterBtn(task.taskReferenceName)}
                </div>
            );
        }

        // Branch section content — same structure for both edit & run, different controls
        const branchSection = () => {
            if (!isSwitchTask && !isForkTask) return null;
            const showSection = isEditMode || (isRunMode && executionData != null);
            if (!showSection) return null;

            const allCaseKeys = isSwitchTask
                ? [...Object.keys(task.decisionCases || {}), 'default']
                : (task.forkTasks || []).map((_, i) => String(i));

            return (
                <div style={{
                    marginTop: '6px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '3px',
                    borderTop: '1px solid var(--border-secondary)',
                    paddingTop: '5px',
                }}>
                    {isSwitchTask && isEditMode && (
                        <>
                            {Object.entries(task.decisionCases || {}).map(([caseName, caseTasks]) =>
                                renderBranchPill(caseName, (caseTasks as TaskDef[]).length, undefined, (e) => handleBranchAdd(e, task.taskReferenceName, caseName))
                            )}
                            {renderBranchPill('default', (task.defaultCase || []).length, undefined, (e) => handleBranchAdd(e, task.taskReferenceName, 'default'))}
                            <button
                                onClick={(e) => { e.stopPropagation(); const n = prompt('新分支名称:'); if (n) addDecisionBranch(task.taskReferenceName, n); }}
                                style={{ padding: '2px 5px', borderRadius: '4px', border: '1px dashed var(--border-secondary)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: '9px', cursor: 'pointer' }}
                            >+ 分支</button>
                        </>
                    )}
                    {isSwitchTask && isRunMode && allCaseKeys.map(caseName => {
                        const isExecuted = executedCases.has(caseName);
                        const count = caseName === 'default'
                            ? (task.defaultCase || []).length
                            : (task.decisionCases?.[caseName] || []).length;
                        const status = isExecuted ? 'COMPLETED' : undefined;
                        return renderBranchPill(caseName, count, status, null);
                    })}
                    {isForkTask && isEditMode && (
                        <>
                            {(task.forkTasks || []).map((branch, i) =>
                                renderBranchPill(`Branch ${i + 1}`, branch.length, undefined, (e) => handleForkBranchAdd(e, task.taskReferenceName, i))
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); addForkBranch(task.taskReferenceName); }}
                                style={{ padding: '2px 5px', borderRadius: '4px', border: '1px dashed var(--border-secondary)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: '9px', cursor: 'pointer' }}
                            >+ 并行</button>
                        </>
                    )}
                    {isForkTask && isRunMode && (task.forkTasks || []).map((branch, i) => {
                        const branchStatus = forkBranchStatuses[i];
                        const count = branch.length;
                        return renderBranchPill(`B${i + 1}`, count, branchStatus, null);
                    })}
                </div>
            );
        };

        return (
            <div key={index} style={{
                position: 'relative',
                marginBottom: !isHorizontal && !isLast && !isEditMode ? '8px' : 0,
                marginRight: isHorizontal && !isLast && !isEditMode ? '8px' : 0,
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
                        transition: 'border-color 0.2s ease',
                        minWidth: isHorizontal ? '80px' : 'auto',
                        position: 'relative',
                        ...cardStatusStyle,
                    }}
                >
                    {/* Execution status badge (run mode, top-right corner) */}
                    {isRunMode && taskStatus && (
                        <div style={{
                            position: 'absolute', top: '-5px', right: isEditMode ? '14px' : '-5px',
                            width: '10px', height: '10px', borderRadius: '50%',
                            background: taskStatus === 'COMPLETED' ? 'var(--status-completed)'
                                : taskStatus === 'FAILED' || taskStatus === 'FAILED_WITH_TERMINAL_ERROR' ? 'var(--status-failed)'
                                : taskStatus === 'IN_PROGRESS' || taskStatus === 'SCHEDULED' ? 'var(--status-in-progress)'
                                : 'var(--border-secondary)',
                            border: '1px solid var(--bg-secondary)',
                        }} />
                    )}

                    {/* Delete button (edit mode only, not for JOIN) */}
                    {isEditMode && (
                        <div
                            onClick={(e) => handleRemoveTask(e, task.taskReferenceName)}
                            title="从循环中删除"
                            style={{
                                position: 'absolute', top: '-6px', right: '-6px',
                                width: '16px', height: '16px', borderRadius: '50%',
                                backgroundColor: '#ef4444', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: '10px', border: '1px solid white', zIndex: 1,
                            }}
                        >×</div>
                    )}

                    {/* Type badge (hidden for SIMPLE tasks) */}
                    {!isSimpleType && (
                        <div style={{
                            display: 'inline-block', fontSize: '8px', fontWeight: 700, color: '#fff',
                            background: badgeColor, borderRadius: '3px', padding: '1px 4px',
                            marginBottom: '3px', letterSpacing: '0.03em',
                        }}>
                            {task.type}
                        </div>
                    )}

                    {/* Task name */}
                    <div style={{
                        fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', maxWidth: '120px',
                    }}>
                        {task.name || task.taskReferenceName}
                    </div>

                    {/* Retry/iteration info in run mode */}
                    {isRunMode && execData && execData.attempts.length > 1 && !execData.attempts.some(a => (a.iteration ?? 0) > 0) && (
                        <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                            重试 ×{execData.attempts.length - 1}
                        </div>
                    )}

                    {/* Nested DO_WHILE: show iteration count */}
                    {isLoopTask && (
                        <div style={{ marginTop: '4px', fontSize: '9px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                            {isRunMode && execData
                                ? `执行中 / 已完成`
                                : `${(task.loopOver || []).length} 个子任务`}
                        </div>
                    )}

                    {/* Branch section (SWITCH/FORK) */}
                    {branchSection()}
                </div>

                {/* Connector arrow (view/run mode) with status-based color */}
                {!isLast && !isEditMode && (
                    isHorizontal
                        ? <div style={{ position: 'absolute', right: '-8px', top: '50%', transform: 'translateY(-50%)', width: '8px', height: '2px', background: connectorColor, pointerEvents: 'none' }} />
                        : <div style={{ position: 'absolute', left: '50%', bottom: '-8px', transform: 'translateX(-50%)', width: '2px', height: '8px', background: connectorColor, pointerEvents: 'none' }} />
                )}

                {/* Insert after button (edit mode only, between tasks) */}
                {isEditMode && !isLast && renderInsertAfterBtn(task.taskReferenceName)}
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
            <div style={{
                borderRadius: '8px',
                background: 'var(--bg-secondary)',
                minWidth: isHorizontal ? '320px' : '240px',
                position: 'relative',
                overflow: 'visible',
            }}>
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

                            {/* Append-to-end (+) button, edit mode only */}
                            {mode === 'edit' && (
                                <div style={{ display: 'flex', justifyContent: isHorizontal ? 'flex-start' : 'center', marginTop: loopTaskCount > 0 ? '4px' : 0 }}>
                                    <div
                                        onClick={() => {
                                            const lastTask = loopOver.length > 0 ? loopOver[loopOver.length - 1] : null;
                                            document.dispatchEvent(new CustomEvent('loopAddNodeRequested', {
                                                detail: { loopId: id, afterRef: lastTask?.taskReferenceName ?? null }
                                            }));
                                        }}
                                        title="追加任务到循环末尾"
                                        style={{
                                            background: 'var(--color-accent)', color: '#fff',
                                            borderRadius: '50%', width: '22px', height: '22px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', flexShrink: 0,
                                        }}
                                    >+</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Iteration progress badge */}
                    {isRunning && totalIterations > 0 && (
                        <div
                            onClick={() => selectTaskAction(data.task || null)}
                            style={{
                                marginTop: '8px', padding: '4px 10px',
                                background: 'var(--bg-primary)', borderRadius: '6px',
                                fontSize: '11px', color: 'var(--color-accent)',
                                textAlign: 'center', cursor: 'pointer',
                                border: '1px solid var(--border-secondary)', fontWeight: '600',
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
