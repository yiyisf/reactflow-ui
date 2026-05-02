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
    const { execution, isRunning } = useNodeExecution(data.taskReferenceName);

    // 获取图标和标签
    const taskConfig = useMemo(() => TASK_TYPES.find(t => t.type === taskType), [taskType]);
    const IconComponent = taskConfig?.icon || Activity;

    const isNoop = taskType === 'NOOP';
    const color = isNoop ? 'var(--text-secondary)' : 'var(--color-accent)';

    // 生成 Meta 信息
    const meta = useMemo(() => {
        if (taskType === 'SIMPLE') return data.label === 'Worker Task' ? 'Execute on Worker' : 'Worker Task';
        if (taskType === 'HTTP') return 'REST API Call';
        if (taskType === 'JSON_JQ_TRANSFORM') return 'JQ Expression';
        if (taskType === 'INLINE' || taskType === 'LAMBDA') return 'Inline Script';
        if (taskType === 'START_WORKFLOW') return 'Launch Workflow (no wait)';
        if (taskType === 'DYNAMIC') return 'Dynamic Task Type';
        if (taskType === 'HUMAN') return 'Human Approval';
        if (taskType === 'NOOP') return 'No Operation';
        return taskConfig?.label || taskType;
    }, [taskType, taskConfig, data.label]);

    return (
        <NodeWrapper
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
            isHighlighted={data.isHighlighted}
            executionStatus={execution?.status}
        >
            <div style={{
                borderRadius: '8px',
                background: isNoop ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                opacity: isNoop ? 0.7 : 1,
            }}>
                <NodeLayout
                    icon={IconComponent}
                    header={taskType}
                    title={data.taskReferenceName} // 引用名作为主标题
                    meta={meta} // 描述作为副标题
                    color={color}
                    status={execution?.status}
                    isRunning={isRunning}
                />

                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />
                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
            </div>
        </NodeWrapper>
    );
};

export default memo(TaskNode);
