import { useCallback, useMemo, useEffect, useState } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    MarkerType,
    useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import TaskNode from './nodes/TaskNode';
import DecisionNode from './nodes/DecisionNode';
import { ForkNode, JoinNode } from './nodes/ForkJoinNode';
import LoopNode from './nodes/LoopNode';
import SubWorkflowNode from './nodes/SubWorkflowNode';
import AddableEdge from './edges/AddableEdge';
import NodeSelector from './Editor/NodeSelector';
import useWorkflowStore from '../store/workflowStore';

/**
 * 工作流查看/设计器组件
 */
const WorkflowDesigner = ({
    onNodeClick,
    edgeType = 'default',
    theme = 'dark',
    nodesLocked = true,
    searchQuery = '',
}) => {
    const { fitView } = useReactFlow();

    // 从 store 中获取状态和操作
    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        mode,
        layoutDirection,
        addNode,
        addLoopTask,
        taskMap
    } = useWorkflowStore();

    const [showSelector, setShowSelector] = useState(false);
    const [pendingEdge, setPendingEdge] = useState(null);
    const [pendingLoopId, setPendingLoopId] = useState(null);

    // 监听自动缩放事件
    useEffect(() => {
        const handleZoomToFit = () => {
            fitView({ padding: 0.2, duration: 800 });
        };
        window.addEventListener('workflow-zoom-to-fit', handleZoomToFit);
        return () => window.removeEventListener('workflow-zoom-to-fit', handleZoomToFit);
    }, [fitView]);

    // 处理节点搜索高亮
    const processedNodes = useMemo(() => {
        if (!searchQuery) return nodes;

        const query = searchQuery.toLowerCase();
        return nodes.map(node => {
            const label = node.data?.label?.toLowerCase() || '';
            const refName = node.data?.taskReferenceName?.toLowerCase() || '';
            const isMatch = label.includes(query) || refName.includes(query);

            return {
                ...node,
                data: {
                    ...node.data,
                    isHighlighted: isMatch
                },
                style: {
                    ...node.style,
                    boxShadow: isMatch ? '0 0 20px 8px rgba(59, 130, 246, 0.6)' : node.style?.boxShadow,
                    border: isMatch ? '3px solid #3b82f6' : node.style?.border,
                    opacity: isMatch || !searchQuery ? 1 : 0.3,
                    transition: 'all 0.3s ease'
                }
            };
        });
    }, [nodes, searchQuery]);

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

    // 注册自定义边类型
    const edgeTypes = useMemo(
        () => ({
            addable: AddableEdge,
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

    // 监听加号按钮点击事件
    useEffect(() => {
        const handleEdgeAddNode = (event) => {
            setPendingEdge(event.detail);
            setShowSelector(true);
        };

        window.addEventListener('edgeAddNode', handleEdgeAddNode);
        return () => window.removeEventListener('edgeAddNode', handleEdgeAddNode);
    }, []);

    // 监听循环节点内迷你任务的点击事件
    useEffect(() => {
        const handleMiniTaskClick = (event) => {
            if (onNodeClick && event.detail && event.detail.task) {
                onNodeClick(event.detail.task);
            }
        };

        const handleLoopAddNode = (event) => {
            if (event.detail && event.detail.loopId) {
                setPendingLoopId(event.detail.loopId);
                setShowSelector(true);
            }
        };

        document.addEventListener('miniTaskClick', handleMiniTaskClick);
        document.addEventListener('loopAddNodeRequested', handleLoopAddNode);
        return () => {
            document.removeEventListener('miniTaskClick', handleMiniTaskClick);
            document.removeEventListener('loopAddNodeRequested', handleLoopAddNode);
        };
    }, [onNodeClick]);

    // 处理节点选择
    const handleTypeSelect = (type) => {
        if (!pendingEdge && !pendingLoopId) return;

        const timestamp = Date.now();
        const newNode = {
            id: `task_${timestamp}`,
            type: type === 'DECISION' ? 'decisionNode' :
                type === 'FORK_JOIN' ? 'forkNode' :
                    type === 'DO_WHILE' ? 'loopNode' :
                        type === 'SUB_WORKFLOW' ? 'subWorkflowNode' : 'taskNode',
            data: {
                label: `新任务_${timestamp.toString().slice(-4)}`,
                taskReferenceName: `task_${timestamp}`,
                taskType: type,
                layoutDirection,
            },
            position: { x: 0, y: 0 },
        };

        if (pendingEdge) {
            addNode(newNode, pendingEdge.source, pendingEdge.target, pendingEdge.id, pendingEdge.edgeData);
        } else if (pendingLoopId) {
            addLoopTask(pendingLoopId, type);
        }

        setShowSelector(false);
        setPendingEdge(null);
        setPendingLoopId(null);
    };

    // 为边添加元数据和箭头标记
    const processedEdges = useMemo(() => {
        return edges.map(edge => {
            const isLoopBack = edge.label === '继续' || edge.style?.strokeDasharray;

            return {
                ...edge,
                type: mode === 'edit' ? 'addable' : edgeType,
                data: { ...edge.data, mode, label: edge.label },
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
                    strokeDasharray: isLoopBack ? '5,5' : undefined,
                },
                animated: true,
            };
        });
    }, [edges, edgeType, theme, mode]);

    // 背景颜色
    const backgroundColor = theme === 'light' ? '#f1f5f9' : '#0f172a';
    const gridColor = theme === 'light' ? '#cbd5e1' : '#475569';

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
                nodes={processedNodes}
                edges={processedEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={handleNodeClick}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesDraggable={!nodesLocked}
                nodesConnectable={mode === 'edit'}
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
                            case 'input': return '#4ade80';
                            case 'output': return '#f87171';
                            case 'decisionNode': return '#f59e0b';
                            case 'forkNode': return '#10b981';
                            case 'joinNode': return '#a78bfa';
                            case 'loopNode': return '#f59e0b';
                            case 'subWorkflowNode': return '#6366f1';
                            default: return '#3b82f6';
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

            {showSelector && (
                <NodeSelector
                    theme={theme}
                    onSelect={handleTypeSelect}
                    onCancel={() => setShowSelector(false)}
                />
            )}
        </div>
    );
};

export default WorkflowDesigner;
