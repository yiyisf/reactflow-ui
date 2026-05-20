import React, { useState, useMemo, useCallback, useEffect } from 'react';
import ReactFlow, {
    Background,
    Panel,
    MarkerType,
    useReactFlow,
    Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';

import useWorkflowStore from '../store/workflowStore';
import { TASK_TYPES, CATEGORY_VISIBILITY } from '../config/taskTypes';
import TaskNode from './nodes/TaskNode';
import DecisionNode from './nodes/DecisionNode';
import ForkJoinNode from './nodes/ForkJoinNode';
import LoopNode from './nodes/LoopNode';
import SubWorkflowNode from './nodes/SubWorkflowNode';
import PlusNode from './nodes/PlusNode';
import DynamicPlaceholderNode from './nodes/DynamicPlaceholderNode';
import NodeSelector from './Editor/NodeSelector';
import ExecutionTaskPanel from './ExecutionTaskPanel';
import ExecutionStatusBar from './ExecutionStatusBar';
import HealthCheckPanel from './HealthCheckPanel';
import AddableEdge from './edges/AddableEdge';
import ControlHub from './Controls/ControlHub';
import ActionBar from './Controls/ActionBar';
import WorkflowSettingsPanel from './WorkflowSettingsPanel';
import EmptyStatePanel from './EmptyStatePanel';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';
import { useShortcuts } from '../hooks/useShortcuts';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../hooks/useToast';
import { ExecutionActions } from '../types/workflow';

// 注册自定义节点，Key 必须与 parser 中生成的 type 一致
const nodeTypes = {
    taskNode: TaskNode,
    decisionNode: DecisionNode,
    forkNode: ForkJoinNode.ForkNode,
    joinNode: ForkJoinNode.JoinNode,
    loopNode: LoopNode,
    subWorkflowNode: SubWorkflowNode,
    plusNode: PlusNode,
    dynamicPlaceholderNode: DynamicPlaceholderNode,
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
    onSave?: (def: any) => void;
    onRequestImport?: () => void;
    executionActions?: ExecutionActions;
}

const WorkflowDesigner: React.FC<WorkflowDesignerProps> = ({
    onNodeClick: onNodeClickProp,
    searchQuery = '',
    onSave,
    onRequestImport,
    executionActions,
}) => {
    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        mode,
        viewMode,
        selectedTask,
        setSelectedTask,
        theme,
        edgeType,
        addNode,
        nodesLocked,
        executionData,
        validationResults,
        setIsDetailPanelOpen,
        workflowDef,
        dynamicRuntimeTasksByFork,
        layoutDirection,
        simState,
    } = useWorkflowStore();

    // ─── 视图模式过滤：计算可见节点 ID 集合 ─────────────────────────────
    const visibleNodeIdSet = useMemo(() => {
        // run 模式和 edit 模式始终显示所有节点，避免影响编辑/监控
        if (mode === 'run' || mode === 'edit') {
            return new Set(nodes.map((n) => n.id));
        }
        const allowed = CATEGORY_VISIBILITY[viewMode];
        const visible = new Set<string>();
        nodes.forEach((n) => {
            // 工具节点（plusNode / placeholder）不受视图模式控制
            if (n.type === 'plusNode' || n.type === 'dynamicPlaceholderNode') {
                visible.add(n.id);
                return;
            }
            const cfg = TASK_TYPES.find((t) => t.type === n.data.taskType);
            const cat = cfg?.viewCategory ?? 'business';
            if (allowed.includes(cat)) visible.add(n.id);
        });
        return visible;
    }, [nodes, viewMode, mode]);

    // 在业务/标准模式下，折叠经过隐藏节点的边（BFS 穿越）
    const collapseEdgesOverHidden = useCallback(
        (rawEdges: Edge[]): Edge[] => {
            if (visibleNodeIdSet.size === nodes.length) return rawEdges; // 全可见，无需处理
            const adjacency: Record<string, Edge[]> = {};
            rawEdges.forEach((e) => {
                if (!adjacency[e.source]) adjacency[e.source] = [];
                adjacency[e.source].push(e);
            });
            const result: Edge[] = [];
            const seen = new Set<string>();
            rawEdges.forEach((e) => {
                if (!visibleNodeIdSet.has(e.source)) return;
                if (visibleNodeIdSet.has(e.target)) {
                    const key = `${e.source}->${e.target}`;
                    if (!seen.has(key)) { seen.add(key); result.push(e); }
                    return;
                }
                // BFS 找第一个可见目标
                const queue: Array<{ to: string; label?: string }> = [{ to: e.target, label: e.label as string | undefined }];
                const localSeen = new Set<string>();
                while (queue.length) {
                    const cur = queue.shift()!;
                    if (localSeen.has(cur.to)) continue;
                    localSeen.add(cur.to);
                    if (visibleNodeIdSet.has(cur.to)) {
                        const key = `${e.source}->${cur.to}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            result.push({ ...e, id: key, target: cur.to, label: cur.label ?? e.label });
                        }
                        continue;
                    }
                    (adjacency[cur.to] ?? []).forEach((n2) =>
                        queue.push({ to: n2.target, label: cur.label ?? (n2.label as string | undefined) }),
                    );
                }
            });
            return result;
        },
        [visibleNodeIdSet, nodes.length],
    );

    const { fitView } = useReactFlow();
    const [showSelector, setShowSelector] = useState(false);
    const [activeEdgeData, setActiveEdgeData] = useState<any>(null);

    const [showHealthCheck, setShowHealthCheck] = React.useState(false);
    const [showWorkflowSettings, setShowWorkflowSettings] = useState(false);

    // ConfirmDialog 和 Toast
    const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
    const { toasts, showToast, dismissToast } = useToast();

    // 使用统一的快捷键 Hook（唯一入口）
    useShortcuts({ confirm, showToast, onSave });

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

    // 运行态：计算 FORK_JOIN_DYNAMIC 动态子任务节点和边
    const dynamicForkData = useMemo(() => {
        const empty = {
            extraNodes: [] as typeof nodes,
            extraEdges: [] as typeof edges,
            removedEdgeIds: new Set<string>(),
            removedNodeIds: new Set<string>(),
        };
        if (mode !== 'run') return empty;

        const forkNodes = nodes.filter(n => n.type === 'forkNode' && n.data.taskType === 'FORK_JOIN_DYNAMIC');
        if (!forkNodes.length) return empty;

        const allExtraNodes: typeof nodes = [];
        const allExtraEdges: typeof edges = [];
        const allRemovedEdgeIds = new Set<string>();
        const allRemovedNodeIds = new Set<string>();

        const isHorizontal = layoutDirection === 'LR';
        const NODE_HALF_H = 47;
        const NODE_HALF_W = 120;

        const dynamicEdgeBase = {
            animated: true,
            style: { stroke: '#10b981', strokeDasharray: '4,4' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
        };

        for (const forkNode of forkNodes) {
            const forkTasks = dynamicRuntimeTasksByFork[forkNode.id] || [];
            const placeholderId = `${forkNode.id}_dynamic_placeholder`;
            const placeholderNode = nodes.find(n => n.id === placeholderId);
            const forkToPlaceholderEdge = edges.find(e => e.target === placeholderId);
            const placeholderOutEdge = edges.find(e => e.source === placeholderId);

            let joinNodeId: string;
            let joinNode: typeof nodes[0] | undefined;

            if (placeholderOutEdge) {
                joinNodeId = placeholderOutEdge.target;
                joinNode = nodes.find(n => n.id === joinNodeId);
            } else {
                // fallback：找此 fork 之后最近的 joinNode
                const forkIdx = nodes.indexOf(forkNode);
                joinNode = nodes.slice(forkIdx).find(n => n.type === 'joinNode');
                if (!joinNode) continue;
                joinNodeId = joinNode.id;
            }

            if (!joinNode) continue;

            // 无论是否有动态任务，都移除占位节点和相关边
            if (placeholderOutEdge) allRemovedEdgeIds.add(placeholderOutEdge.id);
            if (forkToPlaceholderEdge) allRemovedEdgeIds.add(forkToPlaceholderEdge.id);
            allRemovedNodeIds.add(placeholderId);

            if (!forkTasks.length) continue;

            const count = forkTasks.length;
            const centerX = placeholderNode
                ? placeholderNode.position.x + 110
                : (forkNode.position.x + joinNode.position.x) / 2;
            const centerY = placeholderNode
                ? placeholderNode.position.y + 35
                : (forkNode.position.y + joinNode.position.y) / 2;

            forkTasks.forEach((task, idx) => {
                const nodeId = `dynamic_rt_${task.referenceTaskName}`;
                const x = isHorizontal
                    ? centerX - NODE_HALF_W
                    : forkNode.position.x + (idx - (count - 1) / 2) * 280;
                const y = isHorizontal
                    ? centerY - NODE_HALF_H + (idx - (count - 1) / 2) * 110
                    : centerY - NODE_HALF_H;

                allExtraNodes.push({
                    id: nodeId,
                    type: 'taskNode',
                    data: {
                        label: task.referenceTaskName,
                        task: {
                            name: task.referenceTaskName,
                            taskReferenceName: task.referenceTaskName,
                            type: task.taskType || 'SIMPLE',
                        },
                        taskReferenceName: task.referenceTaskName,
                        taskType: task.taskType || 'SIMPLE',
                        isDynamicRuntime: true,
                        layoutDirection,
                    },
                    position: { x, y },
                } as typeof nodes[0]);

                allExtraEdges.push({ id: `e-${forkNode.id}-${nodeId}`, source: forkNode.id, target: nodeId, ...dynamicEdgeBase });
                allExtraEdges.push({ id: `e-${nodeId}-${joinNodeId}`, source: nodeId, target: joinNodeId, ...dynamicEdgeBase });
            });
        }

        return {
            extraNodes: allExtraNodes,
            extraEdges: allExtraEdges,
            removedEdgeIds: allRemovedEdgeIds,
            removedNodeIds: allRemovedNodeIds,
        };
    }, [mode, dynamicRuntimeTasksByFork, nodes, edges, layoutDirection]);

    // 为边添加元数据和箭头标记
    const processedEdges = useMemo(() => {
        // 先折叠经过隐藏节点的边，再处理样式
        const visibleEdges = collapseEdgesOverHidden(
            edges.filter(edge => !dynamicForkData.removedEdgeIds.has(edge.id))
        );
        const mappedEdges = visibleEdges
          .map((edge) => {
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

                const isSourceCompleted = sourceStatus === 'COMPLETED';
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

            // 编辑模式下使用自定义边以显示 "+" 按钮（占位边除外）
            const isPlaceholderEdge =
                edge.source.endsWith('_dynamic_placeholder') ||
                edge.target.endsWith('_dynamic_placeholder');
            const isAddable = mode === 'edit' && !isLoopBack && !isPlaceholderEdge;

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
        return [...mappedEdges, ...dynamicForkData.extraEdges];
    }, [edges, edgeType, theme, mode, executionData, dynamicForkData, collapseEdgesOverHidden]);

    // 背景颜色 - 使用 CSS变量
    const backgroundColor = 'var(--bg-secondary)';

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: backgroundColor }}>
            <ReactFlow
                nodes={useMemo(() => {
                    const errorRefs = new Set(validationResults.errors.filter(e => e.type === 'TASK').map(e => e.ref));
                    const warningRefs = new Set(validationResults.warnings.filter(w => w.type === 'TASK').map(w => w.ref));
                    const query = searchQuery.toLowerCase();

                    const baseNodes = nodes
                    .filter(n => !dynamicForkData.removedNodeIds.has(n.id) && visibleNodeIdSet.has(n.id))
                    .map(node => {
                        const ref = node.data.taskReferenceName;
                        const sim = simState[ref];
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
                                ) : false,
                                simRunning: sim === 'running',
                                simDone: sim === 'done',
                            }
                        };
                    });
                    // 追加动态 fork 子任务节点
                    return baseNodes.concat(dynamicForkData.extraNodes.map(node => ({
                        ...node,
                        data: { ...node.data, isError: false, hasWarning: false, isHighlighted: false },
                    })) as typeof baseNodes);
                }, [nodes, validationResults, searchQuery, selectedTask, dynamicForkData, visibleNodeIdSet, simState])}
                edges={processedEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodeClick={(_: any, node: any) => {
                    if (node.type === 'plusNode') {
                        setActiveEdgeData({
                            sourceId: node.data.parentRef,
                            edgeData: node.data.edgeData || {}
                        });
                        setShowSelector(true);
                        return;
                    }
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
                {mode === 'run' && <ExecutionTaskPanel executionActions={executionActions} />}

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
                        onShowSettings={() => setShowWorkflowSettings(true)}
                        executionActions={executionActions}
                    />
                </div>
            </ReactFlow>

            
            {!workflowDef && <EmptyStatePanel onRequestImport={onRequestImport} />}

            {workflowDef && nodes.length === 0 && mode === 'edit' && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <button 
                        className="empty-state-btn primary"
                        style={{
                            padding: '12px 24px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '16px',
                            fontWeight: 500,
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                        onClick={() => {
                            setActiveEdgeData({
                                sourceId: 'start',
                                targetId: 'end',
                                edgeId: 'new',
                                edgeData: {}
                            });
                            setShowSelector(true);
                        }}
                    >
                        <span style={{ fontSize: '20px', lineHeight: 1 }}>+</span>
                        添加第一个任务
                    </button>
                </div>
            )}

            {showSelector && (
                <NodeSelector
                    theme={theme}
                    onSelect={handleTypeSelect}
                    onCancel={() => setShowSelector(false)}
                />
            )}

            <WorkflowSettingsPanel
                isOpen={showWorkflowSettings}
                onClose={() => setShowWorkflowSettings(false)}
            />

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

