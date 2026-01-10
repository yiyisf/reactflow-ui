import { memo, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import NodeLayout from './NodeLayout';
import useWorkflowStore from '../../store/workflowStore';
import { WorkflowNodeData } from '../../types/workflow';
import { TASK_TYPES } from '../../config/taskTypes';
import { GitBranch, GitMerge } from 'lucide-react';

type ForkJoinNodeProps = NodeProps<WorkflowNodeData>;

// 使用 CSS 变量以支持主题切换
const FORK_JOIN_COLOR = 'var(--color-accent)';

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
    const sourcePosition = data.sourcePosition || (layoutDirection === 'LR' ? Position.Right : Position.Bottom);
    const targetPosition = data.targetPosition || (layoutDirection === 'LR' ? Position.Left : Position.Top);

    const isDynamic = data.isDynamic || data.taskType === 'FORK_JOIN_DYNAMIC';

    const taskConfig = useMemo(() => TASK_TYPES.find(t => t.type === 'FORK_JOIN'), []);
    const IconComponent = taskConfig?.icon || GitBranch;

    return (
        <NodeWrapper isHighlighted={data.isHighlighted}
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
        >
            <div
                className={`fork-node ${isDynamic ? 'dynamic' : 'static'}`}
                style={{
                    borderRadius: '8px',
                    background: 'var(--bg-secondary)',
                    position: 'relative'
                }}
                onClick={() => !isDynamic && mode === 'edit' && addForkBranch(id)}
            >
                <NodeLayout
                    icon={IconComponent}
                    header={isDynamic ? "DYNAMIC FORK" : "FORK"}
                    title={data.taskReferenceName}
                    meta={isDynamic ? 'Dynamic Parallel Execution' : 'Parallel Execution'}
                    color={FORK_JOIN_COLOR}
                    status={execution?.status}
                    isRunning={isRunning}
                />

                {/* Edit Mode Add Branch Button (Overlay) */}
                {mode === 'edit' && !isDynamic && (
                    <div style={{
                        position: 'absolute',
                        top: -8, right: -8,
                        width: 16, height: 16,
                        background: 'var(--color-accent)',
                        borderRadius: '50%',
                        color: '#fff',
                        fontSize: '12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer'
                    }}>+</div>
                )}

                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />

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
    const sourcePosition = data.sourcePosition || (layoutDirection === 'LR' ? Position.Right : Position.Bottom);
    const targetPosition = data.targetPosition || (layoutDirection === 'LR' ? Position.Left : Position.Top);

    const taskConfig = useMemo(() => TASK_TYPES.find(t => t.type === 'JOIN'), []);
    const IconComponent = taskConfig?.icon || GitMerge;

    return (
        <NodeWrapper isHighlighted={data.isHighlighted}
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
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
                    header="JOIN"
                    title={data.taskReferenceName}
                    meta="Wait for tasks"
                    color={FORK_JOIN_COLOR}
                    status={execution?.status}
                    isRunning={isRunning}
                />

                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />

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

                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
            </div>
        </NodeWrapper>
    );
});

JoinNode.displayName = 'JoinNode';

// 为了兼容之前的引入方式，提供一个默认导出
const ForkJoinNode = { ForkNode, JoinNode };
export default ForkJoinNode;
