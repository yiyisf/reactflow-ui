import { memo, useMemo, useEffect } from 'react';
import { Handle, Position, NodeProps, useUpdateNodeInternals } from 'reactflow';
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
    const updateNodeInternals = useUpdateNodeInternals();

    // 监听分支数量变化，更新 Handle
    const branchCount = data.task?.forkTasks?.length || 0;
    useEffect(() => {
        updateNodeInternals(id);
    }, [branchCount, id, updateNodeInternals]);

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
            // onClick moved to '+' button
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
                        // 根据布局调整位置：TB在底部中间，LR在右侧中间
                        ...(layoutDirection === 'LR'
                            ? {
                                top: '50%',
                                right: -12,
                                transform: 'translateY(-50%)'
                            }
                            : {
                                bottom: -12,
                                left: '50%',
                                transform: 'translateX(-50%)'
                            }
                        ),
                        width: 20,
                        height: 20,
                        background: 'var(--color-accent)',
                        borderRadius: '50%',
                        color: '#fff',
                        fontSize: '14px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 1000,
                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                        border: '2px solid var(--bg-primary)' // 增加描边以区分
                    }}
                        onClick={(e) => {
                            e.stopPropagation();
                            addForkBranch(id);
                        }}
                        title="添加分支"
                    >+</div>
                )}

                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />


                {/* 动态 Source Handles (均匀分布，避开圆角) */}
                {!isDynamic && (data.task?.forkTasks || []).map((_: any, index: number, arr: any[]) => {
                    const count = arr.length;
                    // 使用 (index + 1) / (count + 1) 逻辑，确保 Handle 不会贴在圆角边缘
                    const offset = ((index + 1) / (count + 1)) * 100;

                    return (
                        <Handle
                            key={`branch_${index}`}
                            id={`branch_${index}`}
                            type="source"
                            position={sourcePosition}
                            style={{
                                background: '#fff',
                                [layoutDirection === 'LR' ? 'top' : 'left']: `${offset}%`,
                                [layoutDirection === 'LR' ? 'left' : 'top']: undefined, // clear
                                // 显式设置对齐边，防止默认位置偏差
                                [layoutDirection === 'LR' ? 'right' : 'bottom']: '-4px',
                                zIndex: 10
                            }}
                        />
                    );
                })}

                {/* 如果没有分支，保留一个默认 Handle 用于连接 Join */}
                {!isDynamic && (!data.task?.forkTasks || data.task.forkTasks.length === 0) && (
                    <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
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
