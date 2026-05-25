import { memo, useMemo } from 'react';
import { Handle, NodeProps } from 'reactflow';
import useWorkflowStore from '../../store/workflowStore';
import { WorkflowNodeData } from '../../types/workflow';
import { useNodeLayout } from '../../hooks/useNodeLayout';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import { TASK_TYPES } from '../../config/taskTypes';
import { Repeat } from 'lucide-react';

type LoopNodeProps = NodeProps<WorkflowNodeData>;

const LoopNode = ({ data, selected }: LoopNodeProps) => {
    const { sourcePosition, targetPosition } = useNodeLayout(data);
    const { execution, isRunning } = useNodeExecution(data.taskReferenceName);
    const { executionData, selectTaskAction } = useWorkflowStore();

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

    // Execution status colors
    const statusColor = execution?.status === 'COMPLETED' ? 'var(--status-completed)'
        : execution?.status === 'FAILED' || execution?.status === 'FAILED_WITH_TERMINAL_ERROR' ? 'var(--status-failed)'
        : execution?.status === 'IN_PROGRESS' || execution?.status === 'SCHEDULED' ? 'var(--status-in-progress)'
        : 'var(--color-accent)';

    const borderStyle = selected
        ? `2px solid ${statusColor}`
        : `1.5px dashed ${isRunning && execution?.status ? statusColor : 'var(--color-accent)'}`;

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
                <div style={{ color: 'var(--color-accent)', display: 'flex', alignItems: 'center' }}>
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

            {/* ── Condition strip ────────────────────────── */}
            {loopCondition && (
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

            {/* ── Body area (children are rendered by ReactFlow automatically) ─── */}
            <div style={{ flex: 1, position: 'relative' }} />

            {/* ── Handles ─────────────────────────────────── */}
            <Handle type="target" position={targetPosition} style={{ background: 'var(--color-accent)', zIndex: 10 }} />
            <Handle type="source" position={sourcePosition} style={{ background: 'var(--color-accent)', zIndex: 10 }} />
        </div>
    );
};

export default memo(LoopNode);
