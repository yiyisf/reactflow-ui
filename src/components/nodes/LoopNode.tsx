import { memo, useMemo, useState } from 'react';
import { Handle, NodeProps } from 'reactflow';
import useWorkflowStore from '../../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import { WorkflowNodeData } from '../../types/workflow';
import { useNodeLayout } from '../../hooks/useNodeLayout';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import { TASK_TYPES } from '../../config/taskTypes';
import { CircleAlert, Repeat, RotateCw, TriangleAlert } from 'lucide-react';
import { getNodeMeta, getNodeHeader } from '../../utils/nodeMeta';
import ConfirmDialog from '../ConfirmDialog';
import { describeTaskRemoval } from '../../utils/taskEditing';
import ExecutionStatusBadge from './ExecutionStatusBadge';

type LoopNodeProps = NodeProps<WorkflowNodeData>;

const LoopNode = ({ id, data, selected }: LoopNodeProps) => {
    const { sourcePosition, targetPosition } = useNodeLayout(data);
    const { execution, isRunning, durationText } = useNodeExecution(data.taskReferenceName);
    const { executionData, selectTaskAction, mode, viewMode, removeNode, activeLoopIterations, setLoopIteration } = useWorkflowStore(useShallow((s) => ({
            executionData: s.executionData,
            selectTaskAction: s.selectTaskAction,
            mode: s.mode,
            viewMode: s.viewMode,
            removeNode: s.removeNode,
            activeLoopIterations: s.activeLoopIterations,
            setLoopIteration: s.setLoopIteration,
        })));
    const [showConfirm, setShowConfirm] = useState(false);

    const task = data.task;
    const loopOver = task?.loopOver || [];

    const taskConfig = useMemo(() => TASK_TYPES.find(t => t.type === 'DO_WHILE'), []);
    const IconComponent = taskConfig?.icon || Repeat;

    // Infer total iterations from loop body execution data or loop task's own iteration count
    const totalIterations = useMemo(() => {
        if (!isRunning || !executionData) return 0;
        let maxIter = execution?.iteration ?? 0;
        loopOver.forEach(subTask => {
            const subExec = executionData[subTask.taskReferenceName];
            if (subExec?.totalIterations) maxIter = Math.max(maxIter, subExec.totalIterations);
            else if (subExec?.attempts.some(a => (a.iteration ?? 0) > 0)) maxIter = Math.max(maxIter, subExec.attempts.length);
        });
        return maxIter;
    }, [isRunning, executionData, loopOver, execution?.iteration]);

    const currentActiveIter = activeLoopIterations[data.taskReferenceName] || totalIterations;

    const loopCondition = data.loopCondition || task?.loopCondition || '';

    // viewMode-aware meta line (mirrors getNodeMeta used in TaskNode)
    const meta = useMemo(() => {
        const fallback = loopCondition
            ? loopCondition.length > 35 ? loopCondition.slice(0, 35) + '…' : loopCondition
            : '循环直到条件满足';
        return getNodeMeta('DO_WHILE', data, viewMode, fallback);
    }, [data, viewMode, loopCondition]);

    // Execution status colors
    const statusColor = execution?.status === 'COMPLETED' ? 'var(--status-completed)'
        : execution?.status === 'FAILED' || execution?.status === 'FAILED_WITH_TERMINAL_ERROR' ? 'var(--status-failed)'
        : execution?.status === 'IN_PROGRESS' || execution?.status === 'SCHEDULED' ? 'var(--status-in-progress)'
        : 'var(--color-accent)';

    const borderStyle = selected
        ? `2px solid ${statusColor}`
        : `1.5px dashed ${isRunning && execution?.status ? statusColor : 'var(--color-accent)'}`;

    const showDelete = mode === 'edit';

    // Show condition strip only in developer view mode
    const showConditionStrip = viewMode === 'developer' && loopCondition;

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                border: borderStyle,
                borderRadius: '10px',
                background: 'transparent',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'visible',
                boxSizing: 'border-box',
                pointerEvents: 'none',
            }}
        >
            {/* ── Delete button (edit mode) ───────────────── */}
            {showDelete && (
                <button
                    onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
                    aria-label="删除循环任务"
                    style={{
                        position: 'absolute',
                        top: '-10px',
                        right: '-10px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--cm-status-failed)',
                        color: 'var(--cm-on-danger)',
                        border: '2px solid var(--cm-surface-1)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        zIndex: 100,
                        boxShadow: 'var(--cm-shadow-card)',
                        padding: 0,
                        pointerEvents: 'auto',
                    }}
                    title="删除循环任务"
                >
                    ×
                </button>
            )}

            {/* ── Error / warning badges ──────────────────── */}
            {data.isError && (
                <div style={{
                    position: 'absolute', top: '-10px', left: '-10px',
                    width: '24px', height: '24px', borderRadius: '50%',
                    backgroundColor: 'var(--cm-status-failed)', color: 'var(--cm-on-danger)', border: '2px solid var(--cm-surface-1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', zIndex: 101, boxShadow: 'var(--cm-shadow-card)',
                    pointerEvents: 'auto',
                }} title="此节点配置有误"><CircleAlert size={14} strokeWidth={2} aria-hidden="true" /></div>
            )}
            {!data.isError && data.hasWarning && (
                <div style={{
                    position: 'absolute', top: '-10px', left: '-10px',
                    width: '24px', height: '24px', borderRadius: '50%',
                    backgroundColor: 'var(--cm-status-warning)', color: 'var(--cm-on-danger)', border: '2px solid var(--cm-surface-1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', zIndex: 101, boxShadow: 'var(--cm-shadow-card)',
                    pointerEvents: 'auto',
                }} title="此节点有警告信息"><TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" /></div>
            )}

            {data.proposalStatus && (
                <div className={`node-proposal-badge node-proposal-badge-${data.proposalStatus}`}
                    style={{ pointerEvents: 'auto' }}>
                    {data.proposalStatus === 'added' ? '+' : data.proposalStatus === 'modified' ? '~' : '−'}
                </div>
            )}

            {/* ── Header bar ─────────────────────────────── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: 'var(--glass-surface)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                borderBottom: '1px solid var(--border-primary)',
                borderRadius: '8px 8px 0 0',
                flexShrink: 0,
                minHeight: '44px',
                pointerEvents: 'auto',
            }}>
                {/* Loop icon */}
                <div style={{ color: 'var(--color-accent)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <IconComponent size={15} />
                </div>

                {/* Labels */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            {getNodeHeader('DO_WHILE', viewMode)}
                        </span>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                            <RotateCw size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />{loopOver.length} 个子任务
                        </span>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {data.taskReferenceName}
                    </div>
                    {(viewMode === 'business' || viewMode === 'developer') && meta && (
                        <div style={{
                            fontSize: '9px', color: 'var(--text-secondary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            marginTop: '1px', fontStyle: 'italic',
                        }}>
                            {meta}
                        </div>
                    )}
                </div>

                {/* Runtime duration pill */}
                {isRunning && durationText && (
                    <span style={{
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono, monospace)',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-secondary)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        flexShrink: 0,
                    }}>
                        {durationText}
                    </span>
                )}

                {/* Iteration badge in run mode */}
                {isRunning && totalIterations > 0 && (
                    <div
                        onClick={() => selectTaskAction(task || null)}
                        style={{
                            padding: '2px 8px', borderRadius: '12px',
                            background: 'var(--color-accent)', color: 'var(--color-on-accent)',
                            fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                            flexShrink: 0,
                        }}
                        title={`共执行 ${totalIterations} 次迭代`}
                    >
                        ×{totalIterations}
                    </div>
                )}

                {/* Execution status badge */}
                {isRunning && execution?.status && (
                    <div style={{ position: 'relative', width: 20, height: 20, flexShrink: 0 }}>
                        <ExecutionStatusBadge status={execution.status} />
                    </div>
                )}
            </div>

            {/* ── Run-mode Iteration Switcher Strip ──────── */}
            {isRunning && totalIterations > 1 && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        background: 'var(--cm-overlay)',
                        borderBottom: '1px solid var(--border-primary)',
                        flexShrink: 0,
                        pointerEvents: 'auto',
                        overflowX: 'auto',
                    }}
                >
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, marginRight: '2px' }}>
                        切换轮次:
                    </span>
                    {Array.from({ length: totalIterations }, (_, idx) => idx + 1).map((iterNum) => {
                        const isSelectedIter = currentActiveIter === iterNum;
                        return (
                            <button
                                key={iterNum}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setLoopIteration(data.taskReferenceName, iterNum);
                                }}
                                style={{
                                    fontSize: '9px',
                                    padding: '1px 7px',
                                    borderRadius: '999px',
                                    border: isSelectedIter
                                        ? '1px solid var(--cm-data)'
                                        : '1px solid var(--border-primary)',
                                    background: isSelectedIter
                                        ? 'color-mix(in srgb, var(--cm-data) 22%, transparent)'
                                        : 'var(--bg-tertiary)',
                                    color: isSelectedIter ? 'var(--cm-data)' : 'var(--text-secondary)',
                                    fontWeight: isSelectedIter ? 700 : 500,
                                    cursor: 'pointer',
                                }}
                            >
                                #{iterNum}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── Condition strip (developer mode only) ──── */}
            {showConditionStrip && (
                <div style={{
                    padding: '3px 12px',
                    fontSize: '9px',
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-tertiary)',
                    borderBottom: '1px solid var(--border-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    pointerEvents: 'auto',
                }}>
                    until: {loopCondition}
                </div>
            )}

            {/* ── Body area (children rendered by ReactFlow) ─── */}
            <div style={{
                flex: 1,
                position: 'relative',
                background: 'var(--loop-body-bg, color-mix(in srgb, var(--cm-ai) 4%, transparent))',
                borderRadius: '0 0 8px 8px',
                pointerEvents: 'none',
            }} />

            {/* ── Handles ─────────────────────────────────── */}
            {/* ReactFlow 的 Handle CSS 自带 pointer-events: all，无需额外设置 */}
            <Handle type="target" position={targetPosition} style={{ background: 'var(--color-accent)', zIndex: 10 }} />
            <Handle type="source" position={sourcePosition} style={{ background: 'var(--color-accent)', zIndex: 10 }} />

            {/* ── Confirm delete dialog ────────────────────── */}
            {showConfirm && (
                <ConfirmDialog
                    message={describeTaskRemoval(useWorkflowStore.getState().workflowDef, id).message}
                    confirmLabel="删除"
                    onConfirm={() => { removeNode(id); setShowConfirm(false); }}
                    onCancel={() => setShowConfirm(false)}
                />
            )}
        </div>
    );
};

export default memo(LoopNode);
