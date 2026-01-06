import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import { WorkflowNodeData } from '../../types/workflow';
import useWorkflowStore from '../../store/workflowStore';
import ExecutionStatusBadge from './ExecutionStatusBadge';

type TaskNodeProps = NodeProps<WorkflowNodeData>;

/**
 * 常规任务节点组件
 */
const TaskNode = ({ id, data, selected }: TaskNodeProps) => {
    const taskType = data.taskType || 'SIMPLE';
    const layoutDirection = data.layoutDirection || 'TB';

    // 获取运行态信息
    const { mode, executionData } = useWorkflowStore();
    const execution = mode === 'run' ? executionData?.[data.taskReferenceName] : null;
    const isRunning = mode === 'run';

    // 根据布局方向确定 Handle 位置
    const sourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;

    // 根据任务类型设置颜色 (定义模式)
    const getTaskColor = (type: string) => {
        const colors: Record<string, { bg: string; border: string }> = {
            SIMPLE: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            HTTP: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            JSON_JQ_TRANSFORM: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            EVENT: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            INLINE: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            KAFKA_PUBLISH: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            LAMBDA: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            TERMINATE: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
            WAIT: { bg: 'var(--color-accent)', border: 'var(--color-accent-hover)' },
        };
        return colors[type] || colors.SIMPLE;
    };

    const color = getTaskColor(taskType);

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

    return (
        <NodeWrapper
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
            isHighlighted={data.isHighlighted}
        >
            <div
                className={executionClass}
                style={{
                    background: isRunning && execution?.status
                        ? undefined // 使用 CSS 类定义的背景
                        : `linear-gradient(135deg, ${color.bg} 0%, ${color.border} 100%)`,
                    border: selected ? `3px solid #fbbf24` : (isRunning && execution?.status ? undefined : `2px solid ${color.border}`),
                    borderRadius: '12px',
                    padding: '16px',
                    width: '180px',
                    boxShadow: selected
                        ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                        : (isRunning && execution?.status ? undefined : '0 4px 12px rgba(0,0,0,0.15)'),
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                    overflow: 'visible', // 允许徽章溢出
                    position: 'relative'
                }}
            >
                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />

                {/* 运行态徽章 */}
                {isRunning && execution?.status && (
                    <ExecutionStatusBadge status={execution.status} />
                )}

                <div style={{ color: '#fff' }}>
                    <div style={{
                        fontSize: '10px',
                        opacity: 0.8,
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        fontWeight: '600',
                        letterSpacing: '0.5px'
                    }}>
                        {taskType}
                    </div>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        marginBottom: '4px',
                        lineHeight: '1.3',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {data.label}
                    </div>
                    <div style={{
                        fontSize: '11px',
                        opacity: 0.7,
                        fontStyle: 'italic',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {data.taskReferenceName}
                    </div>

                    {/* 运行态时间统计 */}
                    {isRunning && execution?.startTime && (
                        <div style={{
                            fontSize: '9px',
                            marginTop: '4px',
                            paddingTop: '4px',
                            borderTop: '1px solid rgba(255,255,255,0.1)',
                            opacity: 0.6
                        }}>
                            {execution.endTime
                                ? `耗时: ${((execution.endTime - execution.startTime) / 1000).toFixed(2)}s`
                                : '运行中...'}
                        </div>
                    )}
                </div>

                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
            </div>
        </NodeWrapper>
    );
};

export default memo(TaskNode);
