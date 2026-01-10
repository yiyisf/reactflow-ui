import { memo, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import NodeLayout from './NodeLayout';
import { WorkflowNodeData } from '../../types/workflow';
import useWorkflowStore from '../../store/workflowStore';
import { TASK_TYPES } from '../../config/taskTypes';
import { Activity } from 'lucide-react';

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
    const sourcePosition = data.sourcePosition || (layoutDirection === 'LR' ? Position.Right : Position.Bottom);
    const targetPosition = data.targetPosition || (layoutDirection === 'LR' ? Position.Left : Position.Top);

    // 获取图标和标签
    const taskConfig = useMemo(() => TASK_TYPES.find(t => t.type === taskType), [taskType]);
    const IconComponent = taskConfig?.icon || Activity;

    // 使用 CSS 变量以支持主题切换
    const color = 'var(--color-accent)';

    // 生成 Meta 信息 (Description 或 表达式)
    const meta = useMemo(() => {
        if (taskType === 'SIMPLE') return data.label === 'Worker Task' ? 'Execute on Worker' : 'Worker Task';
        if (taskType === 'HTTP') return 'REST API Call';
        if (taskType === 'JSON_JQ_TRANSFORM') return 'JQ Expression';
        return taskConfig?.label || taskType;
    }, [taskType, taskConfig, data.label]);

    return (
        <NodeWrapper
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
            isHighlighted={data.isHighlighted}
        >
            <div style={{
                borderRadius: '8px',
                background: 'var(--bg-secondary)', // 使用 NodeWrapper 的 Glass 效果叠加，或者这里设置基础色
                // 注意：NodeWrapper 已经提供了 border 和 glass 背景，这里主要处理尺寸
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
