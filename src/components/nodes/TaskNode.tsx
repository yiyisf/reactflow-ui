import { memo, useMemo } from 'react';
import { Handle, NodeProps } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import NodeLayout from './NodeLayout';
import { WorkflowNodeData } from '../../types/workflow';
import { useNodeLayout } from '../../hooks/useNodeLayout';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import { TASK_TYPES } from '../../config/taskTypes';
import { Activity } from 'lucide-react';

type TaskNodeProps = NodeProps<WorkflowNodeData>;

/**
 * 常规任务节点组件
 */
const TaskNode = ({ id, data, selected }: TaskNodeProps) => {
    const taskType = data.taskType || 'SIMPLE';
    const { sourcePosition, targetPosition } = useNodeLayout(data);
    const { execution, isRunning, retryCount } = useNodeExecution(data.taskReferenceName);

    // 获取图标和标签
    const taskConfig = useMemo(() => TASK_TYPES.find(t => t.type === taskType), [taskType]);
    const IconComponent = taskConfig?.icon || Activity;

    const isNoop = taskType === 'NOOP';
    const isDynamicRuntime = data.isDynamicRuntime === true;
    const color = isNoop ? 'var(--text-secondary)' : 'var(--color-accent)';

    // 生成 Meta 信息
    const meta = useMemo(() => {
        if (isDynamicRuntime) return `Dynamic (${taskType})`;
        if (taskType === 'SIMPLE') return data.label === 'Worker Task' ? 'Execute on Worker' : 'Worker Task';
        if (taskType === 'HTTP') return 'REST API Call';
        if (taskType === 'JSON_JQ_TRANSFORM') return 'JQ Expression';
        if (taskType === 'INLINE' || taskType === 'LAMBDA') return 'Inline Script';
        if (taskType === 'START_WORKFLOW') return 'Launch Workflow (no wait)';
        if (taskType === 'DYNAMIC') return 'Dynamic Task Type';
        if (taskType === 'HUMAN') return 'Human Approval';
        if (taskType === 'NOOP') return 'No Operation';
        return taskConfig?.label || taskType;
    }, [taskType, taskConfig, data.label, isDynamicRuntime]);

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
                background: isNoop ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                opacity: isNoop ? 0.7 : 1,
                position: 'relative',
                // 动态运行时节点用虚线边框标注
                outline: isDynamicRuntime ? '2px dashed var(--color-accent)' : 'none',
                outlineOffset: '-2px',
            }}>
                <NodeLayout
                    icon={IconComponent}
                    header={taskType}
                    title={data.taskReferenceName}
                    meta={meta}
                    color={color}
                    status={execution?.status}
                    isRunning={isRunning}
                />

                {/* 重试次数角标 */}
                {isRunning && retryCount > 0 && (
                    <div style={{
                        position: 'absolute',
                        bottom: '4px',
                        right: '4px',
                        background: 'var(--status-failed, #ef4444)',
                        color: '#fff',
                        borderRadius: '10px',
                        fontSize: '10px',
                        fontWeight: '700',
                        padding: '1px 6px',
                        zIndex: 10,
                        lineHeight: '1.4',
                        pointerEvents: 'none',
                    }}>
                        ×{retryCount}
                    </div>
                )}

                {/* 动态运行时角标 */}
                {isDynamicRuntime && (
                    <div style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: 'var(--color-accent)',
                        color: '#fff',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontWeight: '700',
                        padding: '1px 5px',
                        zIndex: 10,
                        pointerEvents: 'none',
                        opacity: 0.9,
                    }}>
                        动态
                    </div>
                )}

                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />
                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
            </div>
        </NodeWrapper>
    );
};

export default memo(TaskNode);
