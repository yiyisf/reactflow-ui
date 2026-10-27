import React, { useState, useMemo, useCallback, useEffect } from 'react';
import ReactFlow, {
    Background,
    Panel,
    MarkerType,
    MiniMap,
    useReactFlow,
    Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';

import useWorkflowStore from '../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import { TASK_TYPES, CATEGORY_VISIBILITY } from '../config/taskTypes';
import TaskNode from './nodes/TaskNode';
import DecisionNode from './nodes/DecisionNode';
import ForkJoinNode from './nodes/ForkJoinNode';
import LoopNode from './nodes/LoopNode';
import SubWorkflowNode from './nodes/SubWorkflowNode';
import PlusNode from './nodes/PlusNode';
import DynamicPlaceholderNode from './nodes/DynamicPlaceholderNode';
import NodeSelector from './Editor/NodeSelector';
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
import useAiStoreSingleton from '../store/aiStore';
import { useIdeStoresOptional } from '../store/ideStoresContext';
import { parseWorkflow } from '../parser/conductorParser';
import { getLayoutedElements } from '../layout/autoLayout';
import { buildDataFlowGraph } from '../services/wlsp/workflowLsp';
import ExecutionWaterfallPanel from './ExecutionWaterfallPanel';
import InlineCanvasCopilot from './AiNative/InlineCanvasCopilot';
import { Check, Sparkles, X } from 'lucide-react';

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
    const { nodes, edges, onNodesChange, onEdgesChange, mode, viewMode, selectedTask, setSelectedTask, selectTaskAction, theme, edgeType, addNode, nodesLocked, executionData, validationResults, isDetailPanelOpen, setIsDetailPanelOpen, workflowDef, setWorkflow, dynamicRuntimeTasksByFork, layoutDirection, simState, isSimRunning, workflowLoadKey, showDataLineage } = useWorkflowStore(useShallow((s) => ({
            nodes: s.nodes,
            edges: s.edges,
            onNodesChange: s.onNodesChange,
            onEdgesChange: s.onEdgesChange,
            mode: s.mode,
            viewMode: s.viewMode,
            selectedTask: s.selectedTask,
            setSelectedTask: s.setSelectedTask,
            selectTaskAction: s.selectTaskAction,
            theme: s.theme,
            edgeType: s.edgeType,
            addNode: s.addNode,
            nodesLocked: s.nodesLocked,
            executionData: s.executionData,
            validationResults: s.validationResults,
            isDetailPanelOpen: s.isDetailPanelOpen,
            setIsDetailPanelOpen: s.setIsDetailPanelOpen,
            workflowDef: s.workflowDef,
            setWorkflow: s.setWorkflow,
            dynamicRuntimeTasksByFork: s.dynamicRuntimeTasksByFork,
            layoutDirection: s.layoutDirection,
            simState: s.simState,
            isSimRunning: s.isSimRunning,
            workflowLoadKey: s.workflowLoadKey,
            showDataLineage: s.showDataLineage,
        })));

    // ─── 视图模式过滤：计算可见节点 ID 集合 ─────────────────────────────
    const visibleNodeIdSet = useMemo(() => {
        if (viewMode === 'developer') {
            return new Set(nodes.map((n) => n.id));
        }
        const allowed = CATEGORY_VISIBILITY[viewMode];
        const visible = new Set<string>();
        // First pass: determine which non-child nodes are visible
        nodes.forEach((n) => {
            // 工具节点（plusNode / placeholder）在 developer 模式下显示；在精简视图下仅当其关联父节点可见时保留
            if (n.type === 'dynamicPlaceholderNode') {
                visible.add(n.id);
                return;
            }
            if (n.type === 'plusNode') {
                if (mode === 'edit' && (!n.data?.parentRef || visible.has(n.data.parentRef))) {
                    visible.add(n.id);
                }
                return;
            }
            // 运行态下，失败/运行中/超时的节点始终可见，避免关键异常被视图过滤隐藏
            if (mode === 'run' && executionData) {
                const st = executionData[n.id]?.status;
                if (st === 'FAILED' || st === 'FAILED_WITH_TERMINAL_ERROR' || st === 'TIMED_OUT' || st === 'IN_PROGRESS') {
                    visible.add(n.id);
                    return;
                }
            }
            // Child nodes (loop body): will be handled in second pass based on parent visibility
            if (n.parentId) return;
            const cfg = TASK_TYPES.find((t) => t.type === n.data.taskType);
            const cat = cfg?.viewCategory ?? 'business';
            if (allowed.includes(cat)) visible.add(n.id);
        });
        // Second pass: include child nodes whose parent is visible
        nodes.forEach((n) => {
            if (n.parentId && visible.has(n.parentId)) {
                if (n.type === 'plusNode') {
                    if (mode === 'edit') visible.add(n.id);
                    return;
                }
                const cfg = TASK_TYPES.find((t) => t.type === n.data.taskType);
                const cat = cfg?.viewCategory ?? 'business';
                if (allowed.includes(cat)) {
                    visible.add(n.id);
                }
            }
        });
        return visible;
    }, [nodes, viewMode, mode, executionData]);

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

    // Rendered under <AiWorkflowIDE> (own aiStore instance via context) or standalone
    // under <WorkflowIDE> (no provider — falls back to the module singleton).
    const ideStores = useIdeStoresOptional();
    const useActiveAiStore = ideStores?.aiStore ?? useAiStoreSingleton;
    const pendingProposal = useActiveAiStore(s => s.pendingProposal);
    const clearProposal = useActiveAiStore(s => s.clearProposal);
    const recordAccept = useActiveAiStore(s => s.recordAccept);
    const recordReject = useActiveAiStore(s => s.recordReject);
    const pushUndo = useActiveAiStore(s => s.pushUndo);

    // ─── Ghost Preview: parse proposed workflow and build overlay nodes/edges ──
    // When a proposal is pending, show the proposed canvas with diff coloring
    // instead of (not in addition to) the current canvas — giving the user a
    // "what will it look like after accept" preview with +/~/− markers.
    const ghostOverlay = useMemo(() => {
        if (!pendingProposal) return null;
        try {
            const { nodes: pNodes, edges: pEdges } = parseWorkflow(
                pendingProposal.proposedDef,
                layoutDirection,
                { hideEmptyBranches: false },
            );

            // Apply dagre layout so nodes get proper positions (not all stacked at 0,0)
            const { nodes: layoutedPNodes, edges: layoutedPEdges } = getLayoutedElements(
                pNodes, pEdges, { direction: layoutDirection, mode: 'edit' },
            );

            const addedSet = new Set(pendingProposal.diff.added);
            const modifiedSet = new Set(pendingProposal.diff.modified);
            const removedSet = new Set(pendingProposal.diff.removed);
            const currentNodeMap = new Map(nodes.map(n => [n.data?.taskReferenceName, n]));

            // Proposed workflow nodes (all except editor-only plusNodes)
            const previewNodes = layoutedPNodes
                .filter(n => n.type !== 'plusNode')
                .map(n => {
                    const ref = n.data?.taskReferenceName;
                    const ps = addedSet.has(ref) ? 'added' as const
                        : modifiedSet.has(ref) ? 'modified' as const
                        : undefined;
                    return {
                        ...n,
                        draggable: false,
                        selectable: false,
                        data: { ...n.data, proposalStatus: ps, layoutDirection },
                    };
                });

            // Removed nodes: kept in their current canvas position, marked as removed
            const removedNodes = [...removedSet]
                .map(ref => currentNodeMap.get(ref))
                .filter((n): n is NonNullable<typeof n> => n != null)
                .map(n => ({
                    ...n,
                    draggable: false,
                    selectable: false,
                    data: { ...n.data, proposalStatus: 'removed' as const },
                }));

            return { nodes: [...previewNodes, ...removedNodes], edges: layoutedPEdges };
        } catch {
            return null; // Fall back to normal rendering if parse fails
        }
    }, [pendingProposal, nodes, layoutDirection]);

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

    // 沙箱试运行的提示（空流程、执行出错）
    const sandboxNotice = useWorkflowStore((s) => s.sandboxNotice);
    useEffect(() => {
        if (!sandboxNotice) return;
        showToast(sandboxNotice.text, sandboxNotice.type);
        useWorkflowStore.getState().clearSandboxNotice();
    }, [sandboxNotice, showToast]);

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

    // 每次加载新工作流（setWorkflow 调用）自动适应屏幕
    // workflowLoadKey 仅在 setWorkflow 时递增，updateTask 等增量操作不会触发
    useEffect(() => {
        if (workflowLoadKey === 0) return; // 跳过初始值
        // 短暂延迟，等待 ReactFlow 完成节点渲染后再 fitView
        const timer = setTimeout(() => {
            fitView({ duration: 600, padding: 0.12 });
        }, 50);
        return () => clearTimeout(timer);
    }, [workflowLoadKey, fitView]);

    // 监听各种自定义交互事件
    useEffect(() => {
        const handleMiniTaskClick = (event: any) => {
            if (onNodeClickProp && event.detail && event.detail.task) {
                onNodeClickProp(event.detail.task);
            }
        };

        const handleLoopAddNode = (event: any) => {
            if (mode === 'edit') {
                const { loopId, afterRef } = event.detail;
                if (afterRef) {
                    // Append after the last task in the loop body
                    setActiveEdgeData({ sourceId: afterRef, edgeData: {} });
                } else {
                    // Empty loop: insert first task
                    setActiveEdgeData({ sourceId: loopId, edgeData: { isLoopAdd: true } });
                }
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

    // 运行态：计算 FORK_JOIN_DYNAMIC 动态子任务节点和边，并通过 Dagre 自动重排避免遮挡重叠
    const dynamicForkData = useMemo(() => {
        const empty = {
            layoutedNodes: null as typeof nodes | null,
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

        for (const forkNode of forkNodes) {
            const forkTasks = dynamicRuntimeTasksByFork[forkNode.id] || [];
            const placeholderId = `${forkNode.id}_dynamic_placeholder`;
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

            forkTasks.forEach((task) => {
                const nodeId = `dynamic_rt_${task.referenceTaskName}`;
                allExtraNodes.push({
                    id: nodeId,
                    type: 'taskNode',
                    data: {
                        label: task.taskDefName || task.referenceTaskName,
                        task: {
                            name: task.taskDefName || task.referenceTaskName,
                            taskReferenceName: task.referenceTaskName,
                            type: task.taskType || 'SIMPLE',
                        },
                        taskReferenceName: task.referenceTaskName,
                        taskType: task.taskType || 'SIMPLE',
                        isDynamicRuntime: true,
                        layoutDirection,
                    },
                    position: { x: 0, y: 0 },
                } as typeof nodes[0]);

                allExtraEdges.push({
                    id: `e-${forkNode.id}-${nodeId}`,
                    source: forkNode.id,
                    target: nodeId,
                    style: { strokeDasharray: '4,4' },
                });
                allExtraEdges.push({
                    id: `e-${nodeId}-${joinNodeId}`,
                    source: nodeId,
                    target: joinNodeId,
                    style: { strokeDasharray: '4,4' },
                });
            });
        }

        let layoutedNodes: typeof nodes | null = null;
        if (allExtraNodes.length > 0) {
            const combinedNodes = [
                ...nodes.filter(n => !allRemovedNodeIds.has(n.id)),
                ...allExtraNodes,
            ];
            const combinedEdges = [
                ...edges.filter(e => !allRemovedEdgeIds.has(e.id)),
                ...allExtraEdges,
            ];
            const layouted = getLayoutedElements(combinedNodes, combinedEdges, {
                direction: layoutDirection,
                mode: 'run',
            });
            layoutedNodes = layouted.nodes;
        }

        return {
            layoutedNodes,
            extraNodes: allExtraNodes,
            extraEdges: allExtraEdges,
            removedEdgeIds: allRemovedEdgeIds,
            removedNodeIds: allRemovedNodeIds,
        };
    }, [mode, dynamicRuntimeTasksByFork, nodes, edges, layoutDirection]);

    // 为边添加元数据和箭头标记
    const processedEdges = useMemo(() => {
        // 先折叠经过隐藏节点的边，再处理样式
        const baseVisibleEdges = collapseEdgesOverHidden(
            edges.filter(edge => !dynamicForkData.removedEdgeIds.has(edge.id))
        );
        const allRawEdges = [...baseVisibleEdges, ...dynamicForkData.extraEdges];
        const hasSimState = isSimRunning || Object.keys(simState).length > 0;

        const resolveTaskRef = (nodeId: string) =>
            nodeId.startsWith('dynamic_rt_') ? nodeId.slice('dynamic_rt_'.length) : nodeId;

        return allRawEdges.map((edge) => {
            const isLoopBack = edge.id.includes('loop-back');
            const isDynamicEdge = edge.source.startsWith('dynamic_rt_') || edge.target.startsWith('dynamic_rt_');
            // 连线颜色：浅色/深色主题略有区别，加深使其更醒目
            const edgeStroke = 'var(--cm-edge-default)';
            const baseStyle: React.CSSProperties = {
                ...edge.style,
                stroke: edgeStroke,
                strokeWidth: 2.2,
                strokeDasharray: isLoopBack ? '5,5' : isDynamicEdge ? '4,4' : undefined,
            };

            let currentStyle: React.CSSProperties = { ...baseStyle };
            let isAnimated = false;

            // 运行模式且有执行数据：全状态高亮 + 未执行分支弱化
            if (mode === 'run' && executionData) {
                const sourceRef = resolveTaskRef(edge.source);
                const targetRef = resolveTaskRef(edge.target);
                const sourceStatus = executionData[sourceRef]?.status;
                const targetStatus = executionData[targetRef]?.status;

                const isSourceReached =
                    sourceStatus === 'COMPLETED' || sourceStatus === 'COMPLETED_WITH_ERRORS';

                if (isSourceReached && (targetStatus === 'COMPLETED' || targetStatus === 'COMPLETED_WITH_ERRORS')) {
                    currentStyle = { ...currentStyle, stroke: 'var(--status-completed)', strokeWidth: 3.2, opacity: 1 };
                    isAnimated = false;
                } else if (isSourceReached && (targetStatus === 'IN_PROGRESS' || targetStatus === 'SCHEDULED')) {
                    currentStyle = { ...currentStyle, stroke: 'var(--status-in-progress)', strokeWidth: 3.5, opacity: 1 };
                    isAnimated = true;
                } else if (isSourceReached && (targetStatus === 'FAILED' || targetStatus === 'FAILED_WITH_TERMINAL_ERROR')) {
                    currentStyle = { ...currentStyle, stroke: 'var(--status-failed)', strokeWidth: 3.5, opacity: 1 };
                    isAnimated = false;
                } else if (isSourceReached && targetStatus === 'TIMED_OUT') {
                    currentStyle = { ...currentStyle, stroke: 'var(--status-timed-out)', strokeWidth: 3.5, opacity: 1 };
                    isAnimated = false;
                } else {
                    // 未走到的分支或已跳过的分支降低透明度，突出主执行链路
                    currentStyle = { ...currentStyle, stroke: edgeStroke, strokeWidth: 1.8, opacity: 0.28 };
                    isAnimated = false;
                }
            } else if (hasSimState) {
                // 模拟运行模式：同步高亮连线与流动动效
                const srcSim = simState[edge.source];
                const tgtSim = simState[edge.target];
                if (srcSim === 'done' && tgtSim === 'done') {
                    currentStyle = { ...currentStyle, stroke: 'var(--status-completed)', strokeWidth: 3.2 };
                    isAnimated = false;
                } else if (srcSim === 'done' && tgtSim === 'running') {
                    currentStyle = { ...currentStyle, stroke: 'var(--status-in-progress)', strokeWidth: 3.5 };
                    isAnimated = true;
                }
            }

            // 编辑模式下允许在普通连线上显示 "+" 按钮（占位边、回退边、引导边除外）
            const isPlaceholderEdge =
                edge.source.endsWith('_dynamic_placeholder') ||
                edge.target.endsWith('_dynamic_placeholder');
            const isStartGuideEdge =
                edge.source === '__workflow_start__' ||
                edge.source.startsWith('__loop_start__') ||
                edge.target.startsWith('__loop_end__') ||
                edge.target.includes('_empty_');
            const isAddable = mode === 'edit' && !isLoopBack && !isPlaceholderEdge && !isStartGuideEdge;

            return {
                ...edge,
                // 统一使用 addableEdge 渲染器，确保所有模式下分支胶囊标签常驻且风格一致
                type: 'addableEdge',
                data: {
                    ...edge.data,
                    mode,
                    isAddable,
                    edgeType, // 传入全局样式设置
                    label: edge.label
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 18,
                    height: 18,
                    color: String(currentStyle.stroke || edgeStroke),
                },
                style: currentStyle,
                animated: isAnimated,
            };
        });
    }, [edges, edgeType, theme, mode, executionData, dynamicForkData, collapseEdgesOverHidden, isSimRunning, simState]);

    // Pillar 1: W-LSP 数据流血缘图谱 (Data Flow Graph) 连线叠加层
    const dataLineageEdges = useMemo<Edge[]>(() => {
        if (!showDataLineage || !workflowDef) return [];
        const dfg = buildDataFlowGraph(workflowDef as any);
        const activeRef = selectedTask?.taskReferenceName;
        const result: Edge[] = [];
        const seenPair = new Set<string>();

        dfg.edges.forEach((item, idx) => {
            if (!visibleNodeIdSet.has(item.sourceRef) || !visibleNodeIdSet.has(item.targetRef)) return;
            // If a node is selected, focus on its incoming & outgoing data lineage edges
            if (
                activeRef &&
                item.sourceRef !== activeRef &&
                item.targetRef !== activeRef
            ) {
                return;
            }
            const pairKey = `${item.sourceRef}->${item.targetRef}:${item.fieldPath}`;
            if (seenPair.has(pairKey)) return;
            seenPair.add(pairKey);

            result.push({
                id: `wlsp-dfg-${idx}-${pairKey}`,
                source: item.sourceRef,
                target: item.targetRef,
                type: 'addableEdge',
                animated: true,
                label: item.fieldPath,
                data: {
                    mode: 'view',
                    isAddable: false,
                    edgeType: 'default',
                    label: item.fieldPath,
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 16,
                    height: 16,
                    color: 'var(--cm-data)',
                },
                style: {
                    stroke: 'var(--cm-data)',
                    strokeWidth: 2.4,
                    strokeDasharray: '6,4',
                    opacity: 0.95,
                },
            });
        });

        return result;
    }, [showDataLineage, workflowDef, visibleNodeIdSet, selectedTask?.taskReferenceName]);

    // 背景颜色 - 使用 CSS变量
    const backgroundColor = 'var(--bg-secondary)';
    const realNodeCount = useMemo(() => nodes.filter(n => n.type !== 'plusNode').length, [nodes]);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: backgroundColor }}>
            <ReactFlow
                nodes={useMemo(() => {
                    // Ghost Preview: when a proposal is pending, show the proposed workflow
                    // with diff coloring so the user can preview the result before accepting.
                    if (ghostOverlay) return ghostOverlay.nodes as typeof nodes;

                    const errorRefs = new Set(validationResults.errors.filter(e => e.type === 'TASK').map(e => e.ref));
                    const warningRefs = new Set(validationResults.warnings.filter(w => w.type === 'TASK').map(w => w.ref));
                    const query = searchQuery.toLowerCase();

                    const sourceNodes = dynamicForkData.layoutedNodes
                        ? dynamicForkData.layoutedNodes.filter(n => n.id.startsWith('dynamic_rt_') || visibleNodeIdSet.has(n.id))
                        : nodes
                            .filter(n => !dynamicForkData.removedNodeIds.has(n.id) && visibleNodeIdSet.has(n.id))
                            .concat(dynamicForkData.extraNodes);

                    return sourceNodes.map(node => {
                        const ref = node.data.taskReferenceName;
                        const sim = simState[ref];
                        return {
                            ...node,
                            selected: selectedTask?.taskReferenceName === ref,
                            data: {
                                ...node.data,
                                isError: mode === 'edit' && errorRefs.has(ref),
                                hasWarning: mode === 'edit' && warningRefs.has(ref),
                                isHighlighted: searchQuery ? (
                                    (node.data.label || '').toLowerCase().includes(query) ||
                                    (node.data.taskReferenceName || '').toLowerCase().includes(query)
                                ) : false,
                                simRunning: sim === 'running',
                                simDone: sim === 'done',
                            }
                        };
                    });
                }, [nodes, validationResults, searchQuery, selectedTask, dynamicForkData, visibleNodeIdSet, simState, mode, ghostOverlay])}
                edges={ghostOverlay?.edges ?? [...processedEdges, ...dataLineageEdges]}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
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
                    if (node.type === 'loopNode') {
                        // Click on loop container — show loop task details
                        const task = node.data.task || null;
                        setSelectedTask(task);
                        if (onNodeClickProp) onNodeClickProp(task);
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
                /* E11：连线由 Conductor 定义推导，手拉的连线无法写回定义，因此关闭 */
                nodesConnectable={false}
                /* E10：关闭 ReactFlow 内置删除（只删画布不删定义），统一走 useShortcuts → removeNode */
                deleteKeyCode={null}
                elementsSelectable={true}
                minZoom={0.2}
                maxZoom={2}
            >
                <Background color="var(--border-primary)" gap={20} />

                {/* Navigation Hub: Zoom (Bottom-Left) */}
                <Panel position="bottom-left" style={{ marginBottom: '20px', marginLeft: '20px', zIndex: 1000 }}>
                    <ControlHub />
                </Panel>

                {/* 缩略导航图（当真实节点数 >= 5 且右侧详情抽屉未打开时展示） */}
                {realNodeCount >= 5 && !isDetailPanelOpen && !showHealthCheck && (
                    <MiniMap
                        position="bottom-right"
                        pannable
                        zoomable
                        style={{
                            marginBottom: 20,
                            marginRight: 20,
                            width: 160,
                            height: 110,
                            backgroundColor: 'var(--glass-surface)',
                        }}
                        maskColor="color-mix(in srgb, var(--cm-surface-0) 70%, transparent)"
                        nodeColor={(node) => {
                            if (node.type === 'plusNode') return 'transparent';
                            if (mode === 'run' && executionData) {
                                const ref = node.data?.taskReferenceName;
                                const st = executionData[ref]?.status;
                                if (st === 'COMPLETED') return 'var(--cm-status-success)';
                                if (st === 'FAILED' || st === 'FAILED_WITH_TERMINAL_ERROR') return 'var(--cm-status-failed)';
                                if (st === 'IN_PROGRESS' || st === 'SCHEDULED') return 'var(--cm-status-running)';
                                if (st === 'TIMED_OUT' || st === 'COMPLETED_WITH_ERRORS') return 'var(--cm-status-warning)';
                                return 'var(--cm-status-pending)';
                            }
                            if (node.type === 'decisionNode') return 'var(--cm-status-warning)';
                            if (node.type === 'forkNode' || node.type === 'joinNode') return 'var(--cm-status-success)';
                            if (node.type === 'loopNode') return 'var(--cm-ai)';
                            return 'var(--color-accent)';
                        }}
                    />
                )}

                {/* 运行态状态栏 */}
                {mode === 'run' && (
                    <Panel position="bottom-center">
                        <ExecutionStatusBar />
                    </Panel>
                )}

                <HealthCheckPanel
                    isOpen={showHealthCheck}
                    onClose={() => setShowHealthCheck(false)}
                    theme={theme}
                    onTaskSelect={(task) => {
                        selectTaskAction(task, true);
                    }}
                />

                {/* Shadow Graph Visual Diff Floating Review Banner */}
                {pendingProposal && (
                    <Panel position="top-left" style={{ marginTop: '14px', marginLeft: '16px', zIndex: 1500 }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '8px 16px',
                                borderRadius: '999px',
                                background: 'color-mix(in srgb, var(--cm-surface-1) 94%, transparent)',
                                backdropFilter: 'blur(16px)',
                                border: '1px solid color-mix(in srgb, var(--cm-ai) 45%, transparent)',
                                boxShadow: 'var(--cm-shadow-float)',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                            }}
                        >
                            <span style={{ fontWeight: 700, color: 'var(--cm-ai)' }}>
                                <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />AI 提案预览（Shadow Graph）
                            </span>
                            <div style={{ display: 'flex', gap: '8px', fontFamily: 'monospace', fontSize: '11px' }}>
                                {pendingProposal.diff.added.length > 0 && (
                                    <span style={{ color: 'var(--cm-diff-added)', fontWeight: 700 }}>
                                        +{pendingProposal.diff.added.length} 新增
                                    </span>
                                )}
                                {pendingProposal.diff.modified.length > 0 && (
                                    <span style={{ color: 'var(--cm-diff-modified)', fontWeight: 700 }}>
                                        ~{pendingProposal.diff.modified.length} 修改
                                    </span>
                                )}
                                {pendingProposal.diff.removed.length > 0 && (
                                    <span style={{ color: 'var(--cm-diff-removed)', fontWeight: 700 }}>
                                        -{pendingProposal.diff.removed.length} 移除
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (workflowDef) pushUndo(workflowDef);
                                        setWorkflow(pendingProposal.proposedDef);
                                        recordAccept();
                                        clearProposal();
                                    }}
                                    style={{
                                        padding: '4px 12px',
                                        borderRadius: '999px',
                                        border: 'none',
                                        background: 'var(--cm-status-success)',
                                        color: 'var(--cm-on-danger)',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <Check size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />全部采纳
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        recordReject();
                                        clearProposal();
                                    }}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '999px',
                                        border: '1px solid color-mix(in srgb, var(--cm-status-failed) 40%, transparent)',
                                        background: 'color-mix(in srgb, var(--cm-status-failed) 14%, transparent)',
                                        color: 'var(--cm-status-failed)',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <X size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />放弃
                                </button>
                            </div>
                        </div>
                    </Panel>
                )}

                {/* Unified Top Toolbar Dock (Top Right) */}
                <div style={{ position: 'absolute', top: 14, right: 16, zIndex: 1000 }}>
                    <ActionBar
                        onShowHealthCheck={() => setShowHealthCheck(!showHealthCheck)}
                        showHealthCheck={showHealthCheck}
                        onShowSettings={() => setShowWorkflowSettings(true)}
                        executionActions={executionActions}
                    />
                </div>
            </ReactFlow>

            {/* Pillar 2: Concurrent Gantt Waterfall & Time-Travel Scrubber */}
            <ExecutionWaterfallPanel />

            {/* Pillar 3: Spatially-Aware Inline Cmd+K Canvas Copilot */}
            <InlineCanvasCopilot />

            {!workflowDef && !pendingProposal && <EmptyStatePanel onRequestImport={onRequestImport} />}

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
                            boxShadow: 'var(--cm-shadow-card)'
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
                    confirmLabel={confirmState.confirmLabel}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                />
            )}

            <Toast messages={toasts} onDismiss={dismissToast} />
        </div>
    );
};

export default WorkflowDesigner;

