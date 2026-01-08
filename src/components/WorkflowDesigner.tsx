import React, { useState, useMemo, useCallback, useEffect } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    Panel,
    MarkerType,
    useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import useWorkflowStore from '../store/workflowStore';
import TaskNode from './nodes/TaskNode';
import DecisionNode from './nodes/DecisionNode';
import ForkJoinNode from './nodes/ForkJoinNode';
import LoopNode from './nodes/LoopNode';
import SubWorkflowNode from './nodes/SubWorkflowNode';
import NodeSelector from './Editor/NodeSelector';
import ExecutionTaskPanel from './ExecutionTaskPanel';
import AddableEdge from './edges/AddableEdge';
import UndoRedoControls from './UndoRedoControls';
import { useStore } from 'zustand';

// 注册自定义节点，Key 必须与 parser 中生成的 type 一致
const nodeTypes = {
    taskNode: TaskNode,
    decisionNode: DecisionNode,
    forkNode: ForkJoinNode.ForkNode,
    joinNode: ForkJoinNode.JoinNode,
    loopNode: LoopNode,
    subWorkflowNode: SubWorkflowNode,
};

const edgeTypes = {
    addableEdge: AddableEdge,
};

interface WorkflowDesignerProps {
    onNodeClick?: (task: any) => void;
    searchQuery?: string;
    // 以下通过 store 获取的其实可以不用，但 App.tsx 既然传了，我们兼容一下
    edgeType?: string;
    theme?: 'dark' | 'light';
    nodesLocked?: boolean;
}

const WorkflowDesigner: React.FC<WorkflowDesignerProps> = ({
    onNodeClick: onNodeClickProp,
    searchQuery = ''
}) => {
    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        mode,
        selectedTask,
        setSelectedTask,
        theme,
        edgeType,
        addNode,
        removeNode,
        copyTask,
        pasteTask,
        copiedTask,
        nodesLocked,
        executionData,
        validationResults,
    } = useWorkflowStore();

    const { fitView } = useReactFlow();
    const [showSelector, setShowSelector] = useState(false);
    const [activeEdgeData, setActiveEdgeData] = useState<any>(null);

    const { undo, redo } = useStore((useWorkflowStore as any).temporal, (state: any) => state);

    // 监听来自 Header 的自动缩放事件
    useEffect(() => {
        const handleZoomToFit = () => {
            fitView({ duration: 800 });
        };
        window.addEventListener('workflow-zoom-to-fit', handleZoomToFit);
        return () => window.removeEventListener('workflow-zoom-to-fit', handleZoomToFit);
    }, [fitView]);

    // 监听各种自定义交互事件
    useEffect(() => {
        const handleMiniTaskClick = (event: any) => {
            if (onNodeClickProp && event.detail && event.detail.task) {
                onNodeClickProp(event.detail.task);
            }
        };

        const handleLoopAddNode = (event: any) => {
            if (mode === 'edit') {
                setActiveEdgeData({
                    sourceId: event.detail.loopId,
                    edgeData: { isLoopAdd: true }
                });
                setShowSelector(true);
            }
        };

        const handleEdgeAddNode = (event: any) => {
            if (mode === 'edit') {
                setActiveEdgeData({
                    sourceId: event.detail.source,
                    targetId: event.detail.target,
                    edgeId: event.detail.id,
                    edgeData: event.detail.edgeData
                });
                setShowSelector(true);
            }
        };

        document.addEventListener('miniTaskClick', handleMiniTaskClick);
        document.addEventListener('loopAddNodeRequested', handleLoopAddNode);
        window.addEventListener('edgeAddNode', handleEdgeAddNode as any);

        return () => {
            document.removeEventListener('miniTaskClick', handleMiniTaskClick);
            document.removeEventListener('loopAddNodeRequested', handleLoopAddNode);
            window.removeEventListener('edgeAddNode', handleEdgeAddNode as any);
        };
    }, [mode, onNodeClickProp]);

    // 全局快捷键监听
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isApple = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const ctrlKey = isApple ? e.metaKey : e.ctrlKey;

            if (ctrlKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            } else if (ctrlKey && e.key.toLowerCase() === 'c') {
                if (selectedTask && mode === 'edit') {
                    copyTask(selectedTask);
                    // 可选：添加一些视觉反馈，比如一个小提示
                }
            } else if (ctrlKey && e.key.toLowerCase() === 'v') {
                if (copiedTask && mode === 'edit') {
                    pasteTask(copiedTask);
                }
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (mode === 'edit' && selectedTask &&
                    document.activeElement?.tagName !== 'INPUT' &&
                    document.activeElement?.tagName !== 'TEXTAREA') {
                    if (window.confirm('确定要删除选中的任务吗？')) {
                        removeNode(selectedTask.taskReferenceName);
                        setSelectedTask(null);
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, selectedTask, copiedTask, mode, copyTask, pasteTask, removeNode, setSelectedTask]);

    // 处理新节点选择
    const handleTypeSelect = useCallback((type: string) => {
        if (activeEdgeData) {
            const { sourceId, targetId, edgeId, edgeData } = activeEdgeData;
            addNode(
                { data: { label: `New ${type}`, taskReferenceName: `${type.toLowerCase()}_${Date.now()}`, taskType: type } },
                sourceId,
                targetId,
                edgeId,
                edgeData
            );
        }
        setShowSelector(false);
        setActiveEdgeData(null);
    }, [activeEdgeData, addNode]);

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

            // 编辑模式下使用自定义边以显示 "+" 按钮
            const isAddable = mode === 'edit' && !isLoopBack;

            return {
                ...edge,
                type: isAddable ? 'addableEdge' : edgeType,
                data: {
                    ...edge.data,
                    mode,
                    edgeType, // 传入全局样式设置
                    label: edge.label
                },
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

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: backgroundColor }}>
            <ReactFlow
                nodes={useMemo(() => {
                    const errorRefs = new Set(validationResults.errors.filter(e => e.type === 'TASK').map(e => e.ref));
                    const warningRefs = new Set(validationResults.warnings.filter(w => w.type === 'TASK').map(w => w.ref));
                    const query = searchQuery.toLowerCase();

                    return nodes.map(node => {
                        const ref = node.data.taskReferenceName;
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                isError: errorRefs.has(ref),
                                hasWarning: warningRefs.has(ref),
                                isHighlighted: searchQuery ? (
                                    node.data.label.toLowerCase().includes(query) ||
                                    node.data.taskReferenceName.toLowerCase().includes(query)
                                ) : false
                            }
                        };
                    });
                }, [nodes, validationResults, searchQuery])}
                edges={processedEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodeClick={(_: any, node: any) => {
                    const task = node.data.task || null;
                    setSelectedTask(task);
                    if (onNodeClickProp) {
                        onNodeClickProp(task);
                    }
                }}
                fitView
                nodesDraggable={!nodesLocked}
                nodesConnectable={!nodesLocked}
                elementsSelectable={true}
                minZoom={0.2}
                maxZoom={2}
            >
                <Background color="var(--border-primary)" gap={20} />
                <Controls showInteractive={false} />
                <MiniMap
                    style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}
                    maskColor="rgba(0, 0, 0, 0.1)"
                    nodeColor={(node: any) => {
                        if (node.type === 'taskNode') return 'var(--color-accent)';
                        if (node.type === 'decisionNode') return 'var(--status-failed)';
                        if (node.type === 'forkNode') return 'var(--color-accent)';
                        if (node.type === 'joinNode') return 'var(--status-completed)';
                        return '#ccc';
                    }}
                />

                {/* 运行态状态栏 */}
                {mode === 'run' && (
                    <Panel position="bottom-center">
                        <ExecutionStatusBar />
                    </Panel>
                )}

                {/* 运行态详情面板 */}
                {mode === 'run' && <ExecutionTaskPanel />}

                {/* 撤销重放工具栏 */}
                {mode === 'edit' && (
                    <Panel position="bottom-right" style={{ marginBottom: '160px', marginRight: '20px', zIndex: 1000 }}>
                        <UndoRedoControls />
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
    const {
        executionData,
        loadSampleExecution,
        importExecutionJSON,
        workflowInstance,
        setSelectedTask
    } = useWorkflowStore();

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

    // 如果没有执行数据，显示启动按钮
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
                        onClick={loadSampleExecution}
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
                        🚀 加载示例运行
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
    const completedCount = statsArr.filter(t => t.status === 'COMPLETED').length;
    const failedCount = statsArr.filter(t => t.status === 'FAILED' || t.status === 'FAILED_WITH_TERMINAL_ERROR' || t.status === 'TIMED_OUT').length;
    const inProgressCount = statsArr.filter(t => t.status === 'IN_PROGRESS' || t.status === 'SCHEDULED').length;


    return (
        <div className="execution-status-bar">
            {workflowInstance && (
                <>
                    <div className="status-item">
                        <span className="status-label"> Workflow ID:</span>
                        <span className="status-value highlight" style={{ color: 'var(--text-primary)', opacity: 0.8 }}>{workflowInstance.workflowId}</span>
                    </div>
                    <div className="status-divider" />
                </>
            )}
            <div className="status-item">
                <span className="status-label">状态:</span>
                <span className="status-value highlight" style={{
                    color: workflowInstance?.status === 'COMPLETED' ? 'var(--status-completed)' : 'var(--status-in-progress)'
                }}>{workflowInstance?.status || '运行中'}</span>
            </div>
            <div className="status-divider" />
            <div className="status-item">
                <span className="status-label">已完成:</span>
                <span className="status-value">{completedCount}</span>
            </div>
            <div className="status-item">
                <span className="status-label" style={{ color: 'var(--status-failed)' }}>失败:</span>
                <span className="status-value" style={{ color: 'var(--status-failed)' }}>{failedCount}</span>
            </div>
            <div className="status-item">
                <span className="status-label" style={{ color: 'var(--status-in-progress)' }}>处理中:</span>
                <span className="status-value" style={{ color: 'var(--status-in-progress)' }}>{inProgressCount}</span>
            </div>
            <div className="status-divider" />
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={() => {
                        // 特殊处理：将 selectedTask 设为一个具有 workflow input/output 的虚拟对象
                        setSelectedTask({
                            name: 'Workflow Global Data',
                            taskReferenceName: '__workflow_global__',
                            type: 'SIMPLE'
                        } as any);
                    }}
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-primary)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '600'
                    }}
                >
                    🔍 全局 I/O
                </button>
            </div>
        </div>
    );
};

export default WorkflowDesigner;
