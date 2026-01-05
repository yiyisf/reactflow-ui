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
import { Panel } from 'reactflow';

import TaskNode from './nodes/TaskNode';
import DecisionNode from './nodes/DecisionNode';
import { ForkNode, JoinNode } from './nodes/ForkJoinNode';
import LoopNode from './nodes/LoopNode';
import SubWorkflowNode from './nodes/SubWorkflowNode';
import AddableEdge from './edges/AddableEdge';
import NodeSelector from './Editor/NodeSelector';
import UndoRedoControls from './UndoRedoControls';
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

import { useShortcuts } from '../hooks/useShortcuts';

/**
 * 工作流查看/设计器组件
 */
const WorkflowDesigner = ({
    onNodeClick,
    edgeType = 'default',
    theme = 'dark',
    searchQuery = '',
}: WorkflowDesignerProps) => {
    // 激活快捷键
    useShortcuts();

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
        nodesLocked,
        taskMap,
        validationResults,
        executionData,
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
        return edges.map((edge) => {
            const isLoopBack = edge.id.includes('loop-back');
            const baseStyle = {
                ...edge.style,
                stroke: theme === 'light' ? '#475569' : '#64748b',
                strokeWidth: 2,
                strokeDasharray: isLoopBack ? '5,5' : undefined,
            };

            // 如果是运行模式且有执行数据，应用动态样式
            if (mode === 'run' && executionData) {
                const sourceStatus = executionData[edge.source]?.status;
                const targetStatus = executionData[edge.target]?.status;

                // 规则：
                // 1. 已完成路径：源和目标都已完成 -> 绿色/蓝色常亮
                // 2. 活动路径：源已完成，目标正在执行 -> 蓝色加粗动画
                // 3. 开始节点特殊处理
                const isSourceCompleted = sourceStatus === 'COMPLETED' || edge.source === 'start';
                const isTargetCompleted = targetStatus === 'COMPLETED';
                const isTargetInProgress = targetStatus === 'IN_PROGRESS';

                if (isSourceCompleted && isTargetCompleted) {
                    return {
                        ...edge,
                        style: { ...baseStyle, stroke: 'var(--status-completed)', strokeWidth: 4 },
                        animated: false,
                    };
                }

                if (isSourceCompleted && isTargetInProgress) {
                    return {
                        ...edge,
                        style: { ...baseStyle, stroke: 'var(--status-in-progress)', strokeWidth: 4 },
                        animated: true,
                    };
                }
            }

            return {
                ...edge,
                type: edgeType === 'step' ? 'step' : 'default',
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 20,
                    height: 20,
                    color: theme === 'light' ? '#475569' : '#64748b',
                },
                style: baseStyle,
                animated: true,
            };
        });
    }, [edges, edgeType, theme, mode, executionData]);

    // 背景颜色 - 使用 CSS变量
    const backgroundColor = 'var(--bg-secondary)';
    const gridColor = 'var(--border-primary)';

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
                        background: 'var(--glass-surface)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        backdropFilter: 'blur(10px)',
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
                        background: 'var(--glass-surface)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        backdropFilter: 'blur(10px)',
                    }}
                    maskColor="rgba(0,0,0,0.2)"
                />

                {mode === 'edit' && (
                    <Panel position="top-center">
                        <UndoRedoControls />
                    </Panel>
                )}

                {/* 运行态状态栏 */}
                {mode === 'run' && (
                    <Panel position="bottom-center">
                        <ExecutionStatusBar />
                    </Panel>
                )}
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

/**
 * 内部组件：运行态状态栏
 */
const ExecutionStatusBar = () => {
    const { executionData, simulateExecution, importExecutionJSON, workflowDef } = useWorkflowStore();

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target?.result as string);
                    importExecutionJSON(json);
                } catch (err) {
                    console.error('Failed to parse execution JSON:', err);
                    alert('JSON 解析失败，请检查格式是否正确');
                }
            };
            reader.readAsText(file);
        }
    };

    // 如果没有执行数据，显示启动模拟按钮
    if (!executionData) {
        return (
            <div className="execution-status-bar">
                <input
                    type="file"
                    id="execution-json-upload"
                    accept=".json"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                />
                <div className="status-item">
                    <span className="status-label">准备就绪</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={simulateExecution}
                        style={{
                            background: 'var(--color-accent)',
                            color: '#fff',
                            border: 'none',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        ▶ 启动模拟运行
                    </button>
                    <button
                        onClick={() => document.getElementById('execution-json-upload')?.click()}
                        title="上传 Conductor 运行态 JSON"
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-primary)',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        📁 导入执行 JSON
                    </button>
                </div>
            </div>
        );
    }

    // 统计状态
    const statsArr = Object.values(executionData);
    const completed = statsArr.filter(t => t.status === 'COMPLETED').length;
    const failed = statsArr.filter(t => t.status === 'FAILED' || t.status === 'FAILED_WITH_TERMINAL_ERROR' || t.status === 'TIMED_OUT').length;
    const inProgress = statsArr.filter(t => t.status === 'IN_PROGRESS' || t.status === 'SCHEDULED').length;

    return (
        <div className="execution-status-bar">
            <div className="status-item">
                <span className="status-label">执行 ID:</span>
                <span className="status-value">RUN_{workflowDef?.name?.toUpperCase() || 'WORKFLOW'}_001</span>
            </div>

            <div className="status-item">
                <span className="status-label">总体状态:</span>
                <span className="status-value status-running">IN_PROGRESS</span>
            </div>

            <div className="status-item">
                <span className="status-label">统计:</span>
                <span className="status-value">
                    <span style={{ color: '#10b981' }}>{completed}</span> 完成 /
                    <span style={{ color: '#ef4444' }}> {failed}</span> 失败 /
                    <span style={{ color: '#3b82f6' }}> {inProgress}</span> 进行中
                </span>
            </div>

            <div className="status-item">
                <span className="status-label">持续时间:</span>
                <span className="status-value">00:05:23</span>
            </div>

            <button
                onClick={simulateExecution}
                title="重新模拟"
                style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    marginLeft: '8px'
                }}
            >
                ↻
            </button>
            <button
                onClick={() => document.getElementById('execution-json-upload')?.click()}
                title="导入新执行 JSON"
                style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    marginLeft: '4px'
                }}
            >
                📁
            </button>
        </div>
    );
};

export default WorkflowDesigner;
