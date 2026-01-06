import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import useWorkflowStore from '../../store/workflowStore';
import { WorkflowNodeData } from '../../types/workflow';
import ExecutionStatusBadge from './ExecutionStatusBadge';

type ForkJoinNodeProps = NodeProps<WorkflowNodeData>;

/**
 * FORK 节点组件
 */
export const ForkNode = memo(({ id, data, selected }: ForkJoinNodeProps) => {
    const layoutDirection = data.layoutDirection || 'TB';
    const { mode, addForkBranch, executionData } = useWorkflowStore();

    // 获取运行态信息
    const execution = mode === 'run' ? executionData?.[data.taskReferenceName] : null;
    const isRunning = mode === 'run';

    // 根据布局方向确定 Handle 位置
    const sourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;

    const isDynamic = data.isDynamic || data.taskType === 'FORK_JOIN_DYNAMIC';

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
        <NodeWrapper isHighlighted={data.isHighlighted}
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
        >
            <div
                className={`fork-node ${isDynamic ? 'dynamic' : 'static'} ${executionClass}`}
                style={{
                    background: isRunning && execution?.status
                        ? undefined
                        : 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%)',
                    border: selected ? '3px solid #fbbf24' : (isRunning && execution?.status ? undefined : (isDynamic ? '2px dashed var(--color-accent)' : '2px solid var(--color-accent)')),
                    borderRadius: '8px',
                    padding: '12px 20px',
                    width: '140px',
                    boxShadow: selected
                        ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                        : (isRunning && execution?.status ? undefined : '0 4px 12px rgba(0,0,0,0.15)'),
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                    position: 'relative'
                }}
                onClick={() => !isDynamic && mode === 'edit' && addForkBranch(id)}
            >
                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />

                {/* 运行态徽章 */}
                {isRunning && execution?.status && (
                    <ExecutionStatusBadge status={execution.status} />
                )}

                <div style={{ color: '#fff', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '4px' }}>
                        {isDynamic && (
                            <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>λ</span>
                        )}
                        <span style={{
                            fontSize: '10px',
                            opacity: 0.8,
                            textTransform: 'uppercase',
                            fontWeight: '600',
                            letterSpacing: '0.5px'
                        }}>
                            {data.taskType}
                        </span>
                    </div>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        marginBottom: mode === 'edit' && !isDynamic ? '4px' : '0'
                    }}>
                        {data.label}
                    </div>
                    {mode === 'edit' && !isDynamic && (
                        <div style={{
                            marginTop: '8px',
                            width: '24px',
                            height: '24px',
                            fontSize: '16px',
                            background: 'rgba(255,255,255,0.2)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '8px auto 0'
                        }}>
                            +
                        </div>
                    )}
                </div>

                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />

                {/* 侧边 Handles */}
                {!isDynamic && layoutDirection === 'TB' && (
                    <>
                        <Handle type="source" position={Position.Left} id="left" style={{ background: '#fff' }} />
                        <Handle type="source" position={Position.Right} id="right" style={{ background: '#fff' }} />
                    </>
                )}
                {!isDynamic && layoutDirection === 'LR' && (
                    <>
                        <Handle type="source" position={Position.Top} id="top" style={{ background: '#fff' }} />
                        <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: '#fff' }} />
                    </>
                )}
            </div>
        </NodeWrapper>
    );
});

ForkNode.displayName = 'ForkNode';

/**
 * JOIN 节点组件
 */
export const JoinNode = memo(({ id, data, selected }: ForkJoinNodeProps) => {
    const layoutDirection = data.layoutDirection || 'TB';
    const { mode, executionData } = useWorkflowStore();

    // 获取运行态信息
    const execution = mode === 'run' ? executionData?.[data.taskReferenceName] : null;
    const isRunning = mode === 'run';

    // 根据布局方向确定 Handle 位置
    const sourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;

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
        <NodeWrapper isHighlighted={data.isHighlighted}
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
        >
            <div
                className={executionClass}
                style={{
                    background: isRunning && execution?.status
                        ? undefined
                        : 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%)',
                    border: selected ? '3px solid #fbbf24' : (isRunning && execution?.status ? undefined : '2px solid var(--color-accent)'),
                    borderRadius: '8px',
                    padding: '12px 20px',
                    width: '140px',
                    boxShadow: selected
                        ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                        : (isRunning && execution?.status ? undefined : '0 4px 12px rgba(0,0,0,0.15)'),
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                    position: 'relative'
                }}
            >
                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />

                {/* 运行态徽章 */}
                {isRunning && execution?.status && (
                    <ExecutionStatusBadge status={execution.status} />
                )}

                {/* 侧边输入 Handles */}
                {layoutDirection === 'TB' && (
                    <>
                        <Handle type="target" position={Position.Left} id="left" style={{ background: '#fff' }} />
                        <Handle type="target" position={Position.Right} id="right" style={{ background: '#fff' }} />
                    </>
                )}
                {layoutDirection === 'LR' && (
                    <>
                        <Handle type="target" position={Position.Top} id="top" style={{ background: '#fff' }} />
                        <Handle type="target" position={Position.Bottom} id="bottom" style={{ background: '#fff' }} />
                    </>
                )}

                <div style={{ color: '#fff', textAlign: 'center' }}>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold'
                    }}>
                        {data.label}
                    </div>
                </div>

                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
            </div>
        </NodeWrapper>
    );
});

JoinNode.displayName = 'JoinNode';

// 为了兼容之前的引入方式，提供一个默认导出
const ForkJoinNode = { ForkNode, JoinNode };
export default ForkJoinNode;
