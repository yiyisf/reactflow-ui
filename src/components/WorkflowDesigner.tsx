import React, { useState, useMemo, useCallback, useEffect } from 'react';
import ReactFlow, {
    Background,
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
import ExecutionStatusBar from './ExecutionStatusBar';
import HealthCheckPanel from './HealthCheckPanel';
import AddableEdge from './edges/AddableEdge';
import ControlHub from './Controls/ControlHub';
import ActionBar from './Controls/ActionBar';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';
import { useShortcuts } from '../hooks/useShortcuts';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../hooks/useToast';

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
        nodesLocked,
        executionData,
        validationResults,
        setIsDetailPanelOpen,
    } = useWorkflowStore();

    const { fitView } = useReactFlow();
    const [showSelector, setShowSelector] = useState(false);
    const [activeEdgeData, setActiveEdgeData] = useState<any>(null);

    const [showHealthCheck, setShowHealthCheck] = React.useState(false);

    // ConfirmDialog 和 Toast
    const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
    const { toasts, showToast, dismissToast } = useToast();

    // 使用统一的快捷键 Hook（唯一入口）
    useShortcuts({ confirm, showToast });

    // 监听选中任务变化，自动定位 (Locate)
    useEffect(() => {
        if (selectedTask) {
            const node = nodes.find(n => n.data.taskReferenceName === selectedTask.taskReferenceName);
            if (node) {
                // 如果是外部触发（比如通过错误面板），则自动居中
                // 这里可以通过标记位或简单判断
                fitView({ nodes: [node], duration: 800, padding: 0.5 });
            }
        }
    }, [selectedTask?.taskReferenceName, fitView]); // 仅在引用名变化时触发定位，避免频繁跳动

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

            let currentStyle = { ...baseStyle };
            let isAnimated = !isLoopBack; // 默认循环回退线不动画，其他动画

            // 如果是运行模式且有执行数据，应用动态样式
            if (mode === 'run' && executionData) {
                const sourceStatus = executionData[edge.source]?.status;
                const targetStatus = executionData[edge.target]?.status;

                const isSourceCompleted = sourceStatus === 'COMPLETED' || edge.source === 'start';
                const isTargetCompleted = targetStatus === 'COMPLETED';
                const isTargetInProgress = targetStatus === 'IN_PROGRESS';

                if (isSourceCompleted && isTargetCompleted) {
                    currentStyle = { ...currentStyle, stroke: 'var(--status-completed)', strokeWidth: 4 };
                    isAnimated = false;
                } else if (isSourceCompleted && isTargetInProgress) {
                    currentStyle = { ...currentStyle, stroke: 'var(--status-in-progress)', strokeWidth: 4 };
                    isAnimated = true;
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
                    color: currentStyle.stroke, // 使用当前线条颜色确保箭头颜色匹配
                },
                style: currentStyle,
                animated: isAnimated,
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
                            selected: selectedTask?.taskReferenceName === ref,
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
                }, [nodes, validationResults, searchQuery, selectedTask])}
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
                onPaneClick={() => {
                    setSelectedTask(null);
                    if (mode !== 'run') setIsDetailPanelOpen(false);
                }}
                fitView
                nodesDraggable={!nodesLocked}
                nodesConnectable={!nodesLocked}
                elementsSelectable={true}
                minZoom={0.2}
                maxZoom={2}
            >
                <Background color="var(--border-primary)" gap={20} />

                {/* Navigation Hub: Zoom (Moved to Bottom-Left) */}
                <Panel position="bottom-left" style={{ marginBottom: '20px', marginLeft: '20px', zIndex: 1000 }}>
                    <ControlHub />
                </Panel>

                {/* 运行态状态栏 */}
                {mode === 'run' && (
                    <Panel position="bottom-center">
                        <ExecutionStatusBar />
                    </Panel>
                )}

                {/* 运行态详情面板 */}
                {mode === 'run' && <ExecutionTaskPanel />}

                <HealthCheckPanel
                    isOpen={showHealthCheck}
                    onClose={() => setShowHealthCheck(false)}
                    theme={theme}
                    onTaskSelect={(task) => {
                        setSelectedTask(task);
                        // setIsDetailPanelOpen(true); // You may need to expose this state if HealthCheckPanel needs to open it
                    }}
                />

                {/* Action Bar (Top Right) */}
                <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 1000 }}>
                    <ActionBar
                        onShowHealthCheck={() => setShowHealthCheck(!showHealthCheck)}
                        showHealthCheck={showHealthCheck}
                    />
                </div>
            </ReactFlow>

            {showSelector && (
                <NodeSelector
                    theme={theme}
                    onSelect={handleTypeSelect}
                    onCancel={() => setShowSelector(false)}
                />
            )}

            {confirmState && (
                <ConfirmDialog
                    message={confirmState.message}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                />
            )}

            <Toast messages={toasts} onDismiss={dismissToast} />
        </div>
    );
};

export default WorkflowDesigner;
