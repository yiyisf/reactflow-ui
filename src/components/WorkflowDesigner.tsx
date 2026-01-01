import { useCallback, useMemo, useEffect, useState } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    MarkerType,
    useReactFlow,
    Node,
    Edge
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
import { TaskDef, TaskType } from '../types/conductor';

interface WorkflowDesignerProps {
    onNodeClick?: (task: TaskDef) => void;
    edgeType?: string;
    theme?: 'dark' | 'light';
    nodesLocked?: boolean;
    searchQuery?: string;
}

interface PendingEdge {
    id: string;
    source: string;
    target: string;
    edgeData?: any;
}

/**
 * 工作流查看/设计器组件
 */
const WorkflowDesigner = ({
    onNodeClick,
    edgeType = 'default',
    theme = 'dark',
    nodesLocked = true,
    searchQuery = '',
}: WorkflowDesignerProps) => {
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
        taskMap,
        validationResults
    } = useWorkflowStore();

    const [showSelector, setShowSelector] = useState(false);
    const [pendingEdge, setPendingEdge] = useState<PendingEdge | null>(null);
    const [pendingLoopId, setPendingLoopId] = useState<string | null>(null);

    // 监听自动缩放事件
    useEffect(() => {
        const handleZoomToFit = () => {
            fitView({ padding: 0.2, duration: 800 });
        };
        window.addEventListener('workflow-zoom-to-fit', handleZoomToFit);
        return () => window.removeEventListener('workflow-zoom-to-fit', handleZoomToFit);
    }, [fitView]);

    // 处理节点搜索高亮和校验状态
    const processedNodes = useMemo(() => {
        const query = searchQuery?.toLowerCase();

        return nodes.map((node: Node) => {
            const label = node.data?.label?.toLowerCase() || '';
            const refName = node.data?.taskReferenceName || '';
            const isMatch = query ? (label.includes(query) || refName.toLowerCase().includes(query)) : false;

            // 获取校验状态
            const isError = validationResults?.errors?.some(err => err.ref === refName);
            const hasWarning = validationResults?.warnings?.some(warn => warn.ref === refName);

            let nodeStyle = { ...node.style, transition: 'all 0.3s ease' };

            if (searchQuery) {
                nodeStyle.opacity = isMatch ? 1 : 0.3;
                if (isMatch) {
                    nodeStyle.boxShadow = '0 0 20px 8px rgba(59, 130, 246, 0.6)';
                    nodeStyle.border = '3px solid #3b82f6';
                }
            } else if (isError) {
                nodeStyle.border = '2px solid #ef4444';
                nodeStyle.boxShadow = '0 0 10px rgba(239, 68, 68, 0.3)';
            } else if (hasWarning) {
                nodeStyle.border = '2px solid #f59e0b';
            }

            return {
                ...node,
                data: {
                    ...node.data,
                    isHighlighted: isMatch,
                    isError,
                    hasWarning
                },
                style: nodeStyle
            };
        });
    }, [nodes, searchQuery, validationResults]);

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
        (_event: React.MouseEvent, node: Node) => {
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
        const handleEdgeAddNode = (event: Event) => {
            const customEvent = event as CustomEvent;
            setPendingEdge(customEvent.detail);
            setShowSelector(true);
        };

        window.addEventListener('edgeAddNode', handleEdgeAddNode);
        return () => window.removeEventListener('edgeAddNode', handleEdgeAddNode);
    }, []);

    // 监听循环节点内迷你任务的点击事件
    useEffect(() => {
        const handleMiniTaskClick = (event: Event) => {
            const customEvent = event as CustomEvent;
            if (onNodeClick && customEvent.detail && customEvent.detail.task) {
                onNodeClick(customEvent.detail.task);
            }
        };

        const handleLoopAddNode = (event: Event) => {
            const customEvent = event as CustomEvent;
            if (customEvent.detail && customEvent.detail.loopId) {
                setPendingLoopId(customEvent.detail.loopId);
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
    const handleTypeSelect = (type: TaskType) => {
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
            addLoopTask(pendingLoopId, type as string);
        }

        setShowSelector(false);
        setPendingEdge(null);
        setPendingLoopId(null);
    };

    // 为边添加元数据和箭头标记
    const processedEdges = useMemo(() => {
        return edges.map((edge: Edge) => {
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
