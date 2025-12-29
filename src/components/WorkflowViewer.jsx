import { useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import TaskNode from './nodes/TaskNode';
import DecisionNode from './nodes/DecisionNode';
import { ForkNode, JoinNode } from './nodes/ForkJoinNode';
import LoopNode from './nodes/LoopNode';
import SubWorkflowNode from './nodes/SubWorkflowNode';

/**
 * 工作流查看器组件
 */
const WorkflowViewer = ({
    nodes: initialNodes,
    edges: initialEdges,
    onNodeClick,
    taskMap,
    edgeType = 'default',
    theme = 'dark',
    nodesLocked = true,
    layoutDirection = 'TB'
}) => {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // 当布局方向改变时，更新所有节点的 layoutDirection 数据和 Handle 位置
    useEffect(() => {
        setNodes((nds) =>
            nds.map((node) => {
                const updatedNode = {
                    ...node,
                    data: {
                        ...node.data,
                        layoutDirection,
                    },
                };

                // 为开始节点（input）和结束节点（output）设置 Handle 位置
                if (node.type === 'input') {
                    updatedNode.sourcePosition = layoutDirection === 'LR' ? 'right' : 'bottom';
                } else if (node.type === 'output') {
                    updatedNode.targetPosition = layoutDirection === 'LR' ? 'left' : 'top';
                }

                return updatedNode;
            })
        );
    }, [layoutDirection, setNodes]);

    // 注册自定义节点类型
    const nodeTypes = useMemo(
        () => ({
            taskNode: TaskNode,
            decisionNode: DecisionNode,
            forkNode: ForkNode,
            joinNode: JoinNode,
            loopNode: LoopNode,
            subWorkflowNode: SubWorkflowNode,
        }),
        []
    );

    // 处理节点点击
    const handleNodeClick = useCallback(
        (event, node) => {
            if (onNodeClick && taskMap) {
                const task = taskMap[node.data.taskReferenceName] || node.data.task;
                if (task) {
                    onNodeClick(task);
                }
            }
        },
        [onNodeClick, taskMap]
    );

    // 监听循环节点内迷你任务的点击事件
    useEffect(() => {
        const handleMiniTaskClick = (event) => {
            if (onNodeClick && event.detail && event.detail.task) {
                onNodeClick(event.detail.task);
            }
        };

        document.addEventListener('miniTaskClick', handleMiniTaskClick);
        return () => {
            document.removeEventListener('miniTaskClick', handleMiniTaskClick);
        };
    }, [onNodeClick]);

    // 为边添加箭头标记
    const edgesWithMarkers = useMemo(() => {
        return initialEdges.map(edge => {
            // 检查是否是循环回调边（通过 label 或 style 判断）
            const isLoopBack = edge.label === '继续' || edge.style?.strokeDasharray;

            return {
                ...edge,
                type: edgeType,
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 20,
                    height: 20,
                    color: theme === 'light' ? '#475569' : '#64748b',
                },
                style: {
                    ...edge.style,
                    stroke: edge.style?.stroke || (theme === 'light' ? '#475569' : '#64748b'),
                    strokeWidth: 2,
                    // 循环回调边使用虚线
                    strokeDasharray: isLoopBack ? '5,5' : undefined,
                },
                animated: true,
            };
        });
    }, [initialEdges, edgeType, theme]);

    // 边的默认样式 - 根据主题调整
    const defaultEdgeOptions = useMemo(() => ({
        animated: true,
        type: edgeType,
        markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: theme === 'light' ? '#475569' : '#64748b',
        },
        style: {
            stroke: theme === 'light' ? '#475569' : '#64748b',
            strokeWidth: 2
        },
    }), [edgeType, theme]);

    // 背景颜色根据主题调整
    const backgroundColor = theme === 'light' ? '#f1f5f9' : '#0f172a';
    const gridColor = theme === 'light' ? '#cbd5e1' : '#475569';

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
                nodes={nodes}
                edges={edgesWithMarkers}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={defaultEdgeOptions}
                nodesDraggable={!nodesLocked}
                nodesConnectable={false}
                elementsSelectable={true}
                fitView
                attributionPosition="bottom-left"
                minZoom={0.1}
                maxZoom={2}
            >
                <Background
                    color={gridColor}
                    gap={16}
                    size={1}
                    style={{ background: backgroundColor }}
                />
                <Controls
                    style={{
                        background: theme === 'light' ? 'rgba(241, 245, 249, 0.9)' : 'rgba(30, 41, 59, 0.9)',
                        border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'} `,
                        borderRadius: '8px',
                    }}
                />
                <MiniMap
                    nodeColor={(node) => {
                        switch (node.type) {
                            case 'input':
                                return '#4ade80';
                            case 'output':
                                return '#f87171';
                            case 'decisionNode':
                                return '#f59e0b';
                            case 'forkNode':
                                return '#10b981';
                            case 'joinNode':
                                return '#a78bfa';
                            case 'loopNode':
                                return '#f59e0b';
                            case 'subWorkflowNode':
                                return '#6366f1';
                            default:
                                return '#3b82f6';
                        }
                    }}
                    style={{
                        background: theme === 'light' ? 'rgba(241, 245, 249, 0.9)' : 'rgba(30, 41, 59, 0.9)',
                        border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'} `,
                        borderRadius: '8px',
                    }}
                    maskColor={theme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0.6)'}
                />
            </ReactFlow>
        </div>
    );
};

export default WorkflowViewer;
