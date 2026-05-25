import { memo, useMemo, useState } from 'react';
import { Handle, NodeProps } from 'reactflow';
import useWorkflowStore from '../../store/workflowStore';
import { WorkflowNodeData } from '../../types/workflow';
import { useNodeLayout } from '../../hooks/useNodeLayout';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import { TASK_TYPES } from '../../config/taskTypes';
import { Repeat } from 'lucide-react';
import { getNodeMeta } from '../../utils/nodeMeta';
import ConfirmDialog from '../ConfirmDialog';

type LoopNodeProps = NodeProps<WorkflowNodeData>;

const LoopNode = ({ id, data, selected }: LoopNodeProps) => {
    const { sourcePosition, targetPosition } = useNodeLayout(data);
    const { execution, isRunning } = useNodeExecution(data.taskReferenceName);
    const { executionData, selectTaskAction, mode, viewMode, removeNode } = useWorkflowStore();
    const [showConfirm, setShowConfirm] = useState(false);

    const task = data.task;
    const loopOver = task?.loopOver || [];

    const taskConfig = useMemo(() => TASK_TYPES.find(t => t.type === 'DO_WHILE'), []);
    const IconComponent = taskConfig?.icon || Repeat;

    // Infer total iterations from loop body execution data
    const totalIterations = useMemo(() => {
        if (!isRunning || !executionData || loopOver.length === 0) return 0;
        let maxIter = 0;
        loopOver.forEach(subTask => {
            const subExec = executionData[subTask.taskReferenceName];
            if (subExec?.totalIterations) maxIter = Math.max(maxIter, subExec.totalIterations);
            else if (subExec?.attempts.some(a => (a.iteration ?? 0) > 0)) maxIter = Math.max(maxIter, subExec.attempts.length);
        });
        return maxIter;
    }, [isRunning, executionData, loopOver]);

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
                background: 'var(--bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'visible',
                boxSizing: 'border-box',
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
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: '2px solid white',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        zIndex: 100,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        padding: 0,
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
                    backgroundColor: '#ef4444', color: 'white', border: '2px solid white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', zIndex: 101, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }} title="此节点配置有误">❗</div>
            )}
            {!data.isError && data.hasWarning && (
                <div style={{
                    position: 'absolute', top: '-10px', left: '-10px',
                    width: '24px', height: '24px', borderRadius: '50%',
                    backgroundColor: '#f59e0b', color: 'white', border: '2px solid white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', zIndex: 101, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }} title="此节点有警告信息">⚠️</div>
            )}

            {/* ── Header bar ─────────────────────────────── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                borderBottom: '1px solid var(--border-primary)',
                borderRadius: '8px 8px 0 0',
                flexShrink: 0,
                minHeight: '42px',
            }}>
                {/* Loop icon */}
                <div style={{ color: 'var(--color-accent)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <IconComponent size={14} />
                </div>

                {/* Labels */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        DO WHILE
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {data.taskReferenceName}
                    </div>
                    {/* viewMode-aware meta: business shows description, developer shows loop condition */}
                    {(viewMode === 'business' || viewMode === 'developer') && meta && (
                        <div style={{
                            fontSize: '9px', color: 'var(--text-tertiary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            marginTop: '1px', fontStyle: 'italic',
                        }}>
                            {meta}
                        </div>
                    )}
                </div>

                {/* Iteration badge in run mode */}
                {isRunning && totalIterations > 0 && (
                    <div
                        onClick={() => selectTaskAction(task || null)}
                        style={{
                            padding: '2px 8px', borderRadius: '12px',
                            background: 'var(--color-accent)', color: '#fff',
                            fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                            flexShrink: 0,
                        }}
                    >
                        ×{totalIterations}
                    </div>
                )}

                {/* Execution status dot */}
                {isRunning && execution?.status && (
                    <div style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: statusColor, flexShrink: 0,
                    }} />
                )}
            </div>

            {/* ── Condition strip (developer mode only) ──── */}
            {showConditionStrip && (
                <div style={{
                    padding: '3px 12px',
                    fontSize: '9px',
                    color: 'var(--text-tertiary)',
                    background: 'var(--bg-primary)',
                    borderBottom: '1px solid var(--border-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                }}>
                    until: {loopCondition}
                </div>
            )}

            {/* ── Body area (children rendered by ReactFlow) ─── */}
            <div style={{ flex: 1, position: 'relative' }} />

            {/* ── Handles ─────────────────────────────────── */}
            <Handle type="target" position={targetPosition} style={{ background: 'var(--color-accent)', zIndex: 10 }} />
            <Handle type="source" position={sourcePosition} style={{ background: 'var(--color-accent)', zIndex: 10 }} />

            {/* ── Confirm delete dialog ────────────────────── */}
            {showConfirm && (
                <ConfirmDialog
                    message="确定要删除此循环任务吗？循环体内的任务也会一并删除。"
                    onConfirm={() => { removeNode(id); setShowConfirm(false); }}
                    onCancel={() => setShowConfirm(false)}
                />
            )}
        </div>
    );
};

export default memo(LoopNode);
