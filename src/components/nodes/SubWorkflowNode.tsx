import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import useWorkflowStore from '../../store/workflowStore';
import { WorkflowNodeData } from '../../types/workflow';
import ExecutionStatusBadge from './ExecutionStatusBadge';

type SubWorkflowNodeProps = NodeProps<WorkflowNodeData>;

/**
 * 子工作流节点组件
 */
const SubWorkflowNode = ({ id, data, selected }: SubWorkflowNodeProps) => {
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
        <NodeWrapper
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
                        : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    border: selected ? '3px solid #fbbf24' : (isRunning && execution?.status ? undefined : '2px solid rgba(255,255,255,0.2)'),
                    borderRadius: '12px',
                    padding: '4px', // 给双边框留出的空间
                    width: '180px',
                    boxShadow: selected
                        ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                        : (isRunning && execution?.status ? undefined : '0 4px 12px rgba(0,0,0,0.15)'),
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                    position: 'relative'
                }}
            >
                <div style={{
                    border: isRunning && execution?.status ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.4)',
                    borderRadius: '8px',
                    padding: '12px'
                }}>
                    <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />

                    {/* 运行态徽章 */}
                    {isRunning && execution?.status && (
                        <ExecutionStatusBadge status={execution.status} />
                    )}

                    <div style={{ color: '#fff' }}>
                        <div style={{
                            fontSize: '9px',
                            opacity: 0.8,
                            marginBottom: '2px',
                            textTransform: 'uppercase',
                            fontWeight: '600'
                        }}>
                            Sub Workflow
                        </div>
                        <div style={{
                            fontSize: '13px',
                            fontWeight: 'bold',
                            marginBottom: '4px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {data.label}
                        </div>
                        <div style={{
                            fontSize: '11px',
                            opacity: 0.7,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            🔗 {data.subWorkflowName || 'None'}
                        </div>
                    </div>

                    <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
                </div>
            </div>
        </NodeWrapper>
    );
};

export default memo(SubWorkflowNode);
