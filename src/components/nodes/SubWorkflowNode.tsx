import { memo, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import NodeLayout from './NodeLayout';
import useWorkflowStore from '../../store/workflowStore';
import { WorkflowNodeData } from '../../types/workflow';
import { TASK_TYPES } from '../../config/taskTypes';
import { GitMerge } from 'lucide-react';

type SubWorkflowNodeProps = NodeProps<WorkflowNodeData>;

// 使用 CSS 变量以支持主题切换
const SUB_WORKFLOW_COLOR = 'var(--color-accent)';

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
    const sourcePosition = data.sourcePosition || (layoutDirection === 'LR' ? Position.Right : Position.Bottom);
    const targetPosition = data.targetPosition || (layoutDirection === 'LR' ? Position.Left : Position.Top);

    const taskConfig = useMemo(() => TASK_TYPES.find(t => t.type === 'SUB_WORKFLOW'), []);
    const IconComponent = taskConfig?.icon || GitMerge;

    const subWorkflowName = data.task?.subWorkflowParam?.name || data.subWorkflowName || 'Unknown';
    const version = data.task?.subWorkflowParam?.version;

    return (
        <NodeWrapper
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
            isHighlighted={data.isHighlighted}
        >
            <div
                style={{
                    borderRadius: '8px',
                    background: 'var(--bg-secondary)',
                    position: 'relative'
                }}
            >
                <NodeLayout
                    icon={IconComponent}
                    header="SUB WORKFLOW"
                    title={data.taskReferenceName}
                    meta={`Flow: ${subWorkflowName} (v${version})`}
                    color={SUB_WORKFLOW_COLOR}
                    status={execution?.status}
                    isRunning={isRunning}
                />

                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />

                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
            </div>
        </NodeWrapper>
    );
};

export default memo(SubWorkflowNode);
