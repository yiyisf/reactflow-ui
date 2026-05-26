import dagre from 'dagre';
import { Edge, Position } from 'reactflow';
import { WorkflowNode, LayoutDirection, EditorMode } from '../types/workflow';

/**
 * 获取节点尺寸（用于布局计算）
 * 重构后所有节点都使用 NodeLayout，统一为横向卡片
 */
function getNodeDimensions(node: WorkflowNode, _direction: LayoutDirection = 'TB') {
    // Check for pre-computed loop container size (set by layoutLoopChildren)
    if (node.data?._layoutWidth && node.data?._layoutHeight) {
        return { width: node.data._layoutWidth as number, height: node.data._layoutHeight as number };
    }

    let width = 240; // NodeLayout 的 min-width
    let height = 80;  // NodeLayout 的标准高度

    switch (node.type) {
        case 'decisionNode':
            // 菱形 DecisionNode (150x150 旋转后的边界框约为 212x212)
            width = 212;
            height = 160;
            break;
        case 'forkNode':
            // ForkJoinNode 使用 NodeLayout
            width = 240;
            height = 95;
            break;
        case 'joinNode':
            // ForkJoinNode 使用 NodeLayout
            width = 240;
            height = 95;
            break;
        case 'dynamicPlaceholderNode':
            width = 220;
            height = 70;
            break;
        case 'loopNode':
            // Default fallback size for loopNode (will be overridden by _layoutWidth/_layoutHeight)
            width = 320;
            height = 200;
            break;
        case 'subWorkflowNode':
            // SubWorkflowNode 使用 NodeLayout
            width = 240;
            height = 95;
            break;
        case 'eventNode':
            // EventNode 使用 NodeLayout
            width = 240;
            height = 85;
            break;
        case 'default':
            // DefaultNode 使用 NodeLayout
            width = 240;
            height = 40;
            break;
        case 'plusNode':
            // 极简引导节点
            width = node.data.label && node.data.label !== '+' ? 120 : 32;
            height = 32;
            break;
        default:
            // 默认 TaskNode 尺寸
            width = 240;
            height = 95;
            break;
    }

    return { width, height };
}

interface AutoLayoutOptions {
    direction?: LayoutDirection;
    mode?: EditorMode;
    enableSnakeLayout?: boolean;
    snakeColumns?: number;          // 每行/列节点数，默认 5
    snakeMinChainLength?: number;   // 最小链长度触发蛇形，默认 8
    snakeMinNodeCount?: number;     // 最小节点总数触发蛇形，默认 10
}

/**
 * 检测图中的长线性链
 */
function detectLinearChains(nodes: WorkflowNode[], edges: Edge[], minLength: number = 8): string[][] {
    const chains: string[][] = [];
    if (nodes.length < minLength) return chains;

    // O(1) 节点查找表
    const nodeMap = new Map<string, WorkflowNode>();
    const outDegree: Record<string, string[]> = {};
    const inDegree: Record<string, string[]> = {};

    nodes.forEach(n => {
        nodeMap.set(n.id, n);
        outDegree[n.id] = [];
        inDegree[n.id] = [];
    });

    edges.forEach(e => {
        if (outDegree[e.source]) outDegree[e.source].push(e.target);
        if (inDegree[e.target]) inDegree[e.target].push(e.source);
    });

    const visited = new Set<string>();
    const NON_CHAINABLE = new Set([
        'input', 'output',           // start/end 节点
        'decisionNode', 'forkNode', 'joinNode', 'loopNode',  // 分支/汇合/循环节点
        'default',                   // Decision 合并节点、空分支占位节点
        'plusNode',                  // 编辑器专用"添加"占位节点，不参与蛇形链
    ]);
    const isChainableNode = (n: WorkflowNode) =>
        !NON_CHAINABLE.has(n.type || '');

    const sortedNodes = [...nodes].sort((a, b) => a.position.y - b.position.y);

    for (const node of sortedNodes) {
        if (visited.has(node.id)) continue;
        if (!isChainableNode(node)) continue;
        // 分叉节点（outDegree > 1）不应成为链起点
        if (outDegree[node.id].length > 1) continue;

        const currentChain: string[] = [node.id];
        let curr = node;
        let nextIds = outDegree[curr.id];

        while (nextIds && nextIds.length === 1) {
            const nextId = nextIds[0];
            const nextNode = nodeMap.get(nextId);

            if (!nextNode || visited.has(nextId) || !isChainableNode(nextNode)) break;
            if (inDegree[nextId].length !== 1) break;

            currentChain.push(nextId);
            curr = nextNode;
            nextIds = outDegree[curr.id];
        }

        if (currentChain.length >= minLength) {
            chains.push(currentChain);
            currentChain.forEach(id => visited.add(id));
        }
    }
    return chains;
}

/**
 * 计算蛇形块的尺寸
 */
function getSnakeBlockDimensions(
    chain: string[],
    nodes: WorkflowNode[],
    direction: LayoutDirection,
    nodeSep: number,
    rankSep: number,
    columns: number = 5,
    mode: EditorMode = 'view'
): { width: number, height: number, gridKW: number, gridKH: number, cols: number } {
    const sampleNode = nodes.find(n => n.id === chain[0]);
    const { width: nW, height: nH } = getNodeDimensions(sampleNode || nodes[0], direction);

    // 间距根据链长度和模式动态调整
    const chainFactor = Math.max(0.7, 1 - (chain.length - 10) / 80);
    const modeFactor = (mode === 'edit' || mode === 'run') ? 1.15 : 1.0;
    const snakeNodeSep = Math.min(nodeSep, Math.round(60 * chainFactor * modeFactor));
    const snakeRankSep = Math.min(rankSep, Math.round(80 * chainFactor * modeFactor));

    const gridKW = nW + snakeNodeSep;
    const gridKH = nH + snakeRankSep;

    let width = 0;
    let height = 0;

    if (direction === 'TB') {
        const rows = Math.ceil(chain.length / columns);
        width = columns * gridKW - snakeNodeSep;
        height = rows * gridKH - snakeRankSep;
    } else {
        // LR模式：layers 表示蛇形的垂直层数
        const layers = Math.ceil(chain.length / columns);
        width = layers * gridKW - snakeNodeSep;
        height = columns * gridKH - snakeRankSep;
    }

    // Dagre 需要 extra padding
    width += 40;
    height += 40;

    return { width, height, gridKW, gridKH, cols: columns };
}

// Constants for loop container layout
const LOOP_HEADER_HEIGHT = 58;   // Header + padding above children
const LOOP_PADDING_X = 20;       // Left/right padding inside loop
const LOOP_PADDING_BOTTOM = 16;  // Bottom padding inside loop

/**
 * Layout loop body children as a flat sub-graph and compute container size.
 */
function layoutLoopChildren(
    children: WorkflowNode[],
    childEdges: Edge[],
    direction: LayoutDirection,
    mode: EditorMode
): { positionedChildren: WorkflowNode[], containerWidth: number, containerHeight: number } {
    if (children.length === 0) {
        return {
            positionedChildren: [],
            containerWidth: 280,
            containerHeight: LOOP_HEADER_HEIGHT + 50,
        };
    }

    // Strip parentId so inner dagre layout works on a flat graph
    const flatChildren = children.map(c => ({
        ...c,
        parentId: undefined as any,
        extent: undefined as any,
    }));

    // Layout children as a flat sub-graph (disable snake for loop bodies)
    const { nodes: laidOut } = layoutFlatGraph(flatChildren, childEdges, { direction, mode, enableSnakeLayout: false });

    // Calculate bounding box
    let maxX = 0, maxY = 0;
    laidOut.forEach(n => {
        const { width, height } = getNodeDimensions(n, direction);
        maxX = Math.max(maxX, n.position.x + width);
        maxY = Math.max(maxY, n.position.y + height);
    });

    const containerWidth = Math.max(300, maxX + LOOP_PADDING_X * 2);
    const containerHeight = LOOP_HEADER_HEIGHT + maxY + LOOP_PADDING_BOTTOM;

    // Restore parentId and apply position offset (children positioned relative to parent)
    const positionedChildren = laidOut.map(n => {
        const orig = children.find(c => c.id === n.id)!;
        return {
            ...n,
            parentId: orig.parentId,
            extent: orig.extent,
            position: {
                x: n.position.x + LOOP_PADDING_X,
                y: n.position.y + LOOP_HEADER_HEIGHT,
            },
        };
    });

    return { positionedChildren, containerWidth, containerHeight };
}

/**
 * 内部布局函数：对平铺图执行 dagre 布局（不处理 parentId）
 */
function layoutFlatGraph(nodes: WorkflowNode[], edges: Edge[], options: AutoLayoutOptions = {}): { nodes: WorkflowNode[]; edges: Edge[] } {
    const {
        direction = 'TB',
        mode = 'view',
        enableSnakeLayout = true,
        snakeColumns = 5,
        snakeMinChainLength = 8,
        snakeMinNodeCount = 10
    } = options;

    const nodeCount = nodes.length;
    // 蛇形布局阈值仅计算真实业务节点，排除编辑器专用的 plusNode，
    // 避免编辑模式因大量 plusNode 将节点数虚增而导致视图/编辑模式蛇形行为不一致
    const realNodeCount = nodes.filter(n => n.type !== 'plusNode').length;

    // 1. 间距配置
    let baseRankSep = direction === 'LR' ? 150 : 120;
    let baseNodeSep = direction === 'LR' ? 120 : 100;
    let rankSep = baseRankSep;
    let nodeSep = baseNodeSep;

    if (nodeCount > 15) {
        let rankFactor = Math.max(0.5, 1 - (nodeCount - 15) / 50);
        let nodeFactor = Math.max(0.4, 1 - (nodeCount - 15) / 40);
        if (mode === 'edit' || mode === 'run') {
            rankFactor = 1 - (1 - rankFactor) * 0.5;
            nodeFactor = 1 - (1 - nodeFactor) * 0.5;
        }
        rankSep = Math.round(baseRankSep * rankFactor);
        nodeSep = Math.round(baseNodeSep * nodeFactor);
    }

    // 2. 检测蛇形链（使用去除 plusNode 后的真实节点数作为触发阈值）
    const snakeChains = (enableSnakeLayout && realNodeCount > snakeMinNodeCount) ? detectLinearChains(nodes, edges, snakeMinChainLength) : [];

    // 建立映射：节点ID -> 链索引
    const nodeToChainIndex: Record<string, number> = {};
    snakeChains.forEach((chain, idx) => {
        chain.forEach(id => {
            nodeToChainIndex[id] = idx;
        });
    });

    // 3. 构建虚拟图 (Virtual Graph)
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
        rankdir: direction,
        ranker: 'network-simplex', // Default, centers nodes well
        ranksep: rankSep,
        nodesep: nodeSep,
        edgesep: 50,
        marginx: 50,
        marginy: 50,
    });

    // 3.1 添加节点 (普通节点 + 虚拟占位节点)
    const addedChainIndices = new Set<number>();

    // 保存每个链的布局信息，供后续展开使用
    const chainLayoutInfos: Record<number, any> = {};

    nodes.forEach(node => {
        const chainIdx = nodeToChainIndex[node.id];

        if (chainIdx !== undefined) {
            // 是链中的节点
            if (!addedChainIndices.has(chainIdx)) {
                // 第一次遇到该链，添加虚拟节点
                addedChainIndices.add(chainIdx);
                const info = getSnakeBlockDimensions(snakeChains[chainIdx], nodes, direction, nodeSep, rankSep, snakeColumns, mode);
                chainLayoutInfos[chainIdx] = info;

                dagreGraph.setNode(`__CHAIN_${chainIdx}`, { width: info.width, height: info.height });
            }
        } else {
            // 普通节点
            const { width, height } = getNodeDimensions(node, direction);
            dagreGraph.setNode(node.id, { width, height });
        }
    });

    // 3.2 添加边 (重连到虚拟节点)
    edges.forEach(edge => {
        const sourceChainIdx = nodeToChainIndex[edge.source];
        const targetChainIdx = nodeToChainIndex[edge.target];

        let sourceId = edge.source;
        let targetId = edge.target;

        if (sourceChainIdx !== undefined) sourceId = `__CHAIN_${sourceChainIdx}`;
        if (targetChainIdx !== undefined) targetId = `__CHAIN_${targetChainIdx}`;

        // 如果源和目标是同一个虚拟节点（即链内部的边），则忽略
        if (sourceId !== targetId) {
            dagreGraph.setEdge(sourceId, targetId);
        }
    });

    // 4. 执行 Dagre 布局
    dagre.layout(dagreGraph);

    // 5. 还原节点坐标
    // 先建立 ID->Node 映射方便查找
    const originalNodeMap: Record<string, WorkflowNode> = {};
    for (const n of nodes) {
        originalNodeMap[n.id] = { ...n };
    }

    const finalNodes: WorkflowNode[] = [];
    const snakeNodeIds = new Set<string>();

    // 5.1 处理普通节点
    nodes.forEach(node => {
        if (nodeToChainIndex[node.id] === undefined) {
            const pos = dagreGraph.node(node.id);
            const refNode = originalNodeMap[node.id];
            const { width, height } = getNodeDimensions(refNode, direction);

            refNode.position = {
                x: pos.x - width / 2,
                y: pos.y - height / 2
            };
            // 清理旧 Handle 数据，同步节点级属性
            refNode.data = { ...refNode.data, sourcePosition: undefined, targetPosition: undefined };
            refNode.sourcePosition = direction === 'LR' ? Position.Right : Position.Bottom;
            refNode.targetPosition = direction === 'LR' ? Position.Left : Position.Top;
            finalNodes.push(refNode);
        } else {
            snakeNodeIds.add(node.id);
        }
    });

    // 5.2 展开蛇形链
    snakeChains.forEach((chain, idx) => {
        const dummyId = `__CHAIN_${idx}`;
        const dummyPos = dagreGraph.node(dummyId);
        const info = chainLayoutInfos[idx];

        // 虚拟节点的左上角 (Dagre 返回的是中心点)
        const startX = dummyPos.x - info.width / 2 + 20; // +20 margin padding
        const startY = dummyPos.y - info.height / 2 + 20;

        const COLUMNS = info.cols;
        const gridKW = info.gridKW;
        const gridKH = info.gridKH;

        //TB Mode: ROW major traverse.
        //LR Mode: COL major traverse.

        chain.forEach((nodeId, index) => {
            const node = originalNodeMap[nodeId];

            let x = 0, y = 0;
            let srcPos: Position | undefined, tgtPos: Position | undefined;

            if (direction === 'TB') {
                // TB模式：水平贪吃蛇 (S型向下)
                const row = Math.floor(index / COLUMNS);
                const col = index % COLUMNS;
                const isEvenRow = row % 2 === 0;
                const totalRows = Math.ceil(chain.length / COLUMNS);
                const isLastRow = row === totalRows - 1;
                const lastRowCount = chain.length % COLUMNS || COLUMNS;

                // 末行居中偏移
                const centerOffset = isLastRow ? ((COLUMNS - lastRowCount) * gridKW) / 2 : 0;

                let xOffset: number;
                if (isEvenRow) {
                    xOffset = col * gridKW + centerOffset;
                } else {
                    xOffset = (COLUMNS - 1 - col) * gridKW - centerOffset;
                }
                const yOffset = row * gridKH;

                x = startX + xOffset;
                y = startY + yOffset;

                // Handles
                const rowNodeCount = isLastRow ? lastRowCount : COLUMNS;
                if (isEvenRow) {
                    tgtPos = Position.Left;
                    srcPos = Position.Right;
                    if (col === rowNodeCount - 1 && index !== chain.length - 1) srcPos = Position.Bottom;
                    if (col === 0 && index !== 0) tgtPos = Position.Top;
                } else {
                    tgtPos = Position.Right;
                    srcPos = Position.Left;
                    if (col === rowNodeCount - 1 && index !== chain.length - 1) srcPos = Position.Bottom;
                    if (col === 0 && index !== 0) tgtPos = Position.Top;
                }
                if (index === 0) tgtPos = Position.Top; // Entry
                if (index === chain.length - 1) srcPos = Position.Bottom; // Exit

            } else {
                // LR模式：垂直贪吃蛇 (S型向右)
                const layer = Math.floor(index / COLUMNS);
                const row = index % COLUMNS;
                const isEvenLayer = layer % 2 === 0;
                const totalLayers = Math.ceil(chain.length / COLUMNS);
                const isLastLayer = layer === totalLayers - 1;
                const lastLayerCount = chain.length % COLUMNS || COLUMNS;

                // 末层居中偏移（非负保护）
                const centerOffset = isLastLayer ? Math.max(0, (COLUMNS - lastLayerCount) * gridKH) / 2 : 0;

                const xOffset = layer * gridKW;
                let yOffset: number;
                if (isEvenLayer) {
                    yOffset = row * gridKH + centerOffset;
                } else {
                    yOffset = (COLUMNS - 1 - row) * gridKH - centerOffset;
                }

                x = startX + xOffset;
                y = startY + yOffset;

                // Handles
                const layerNodeCount = isLastLayer ? lastLayerCount : COLUMNS;
                if (isEvenLayer) {
                    tgtPos = Position.Top;
                    srcPos = Position.Bottom;
                    if (row === layerNodeCount - 1 && index !== chain.length - 1) srcPos = Position.Right;
                    if (row === 0 && index !== 0) tgtPos = Position.Left;
                } else {
                    tgtPos = Position.Bottom;
                    srcPos = Position.Top;
                    if (row === layerNodeCount - 1 && index !== chain.length - 1) srcPos = Position.Right;
                    if (row === 0 && index !== 0) tgtPos = Position.Left;
                }
                if (index === 0) tgtPos = Position.Left; // Entry
                if (index === chain.length - 1) srcPos = Position.Right; // Exit
            }

            node.position = { x, y };
            node.data = { ...node.data, sourcePosition: srcPos, targetPosition: tgtPos };
            node.sourcePosition = srcPos;
            node.targetPosition = tgtPos;
            finalNodes.push(node);
        });
    });

    // 6. 边处理
    const finalNodeMap = finalNodes.reduce((acc, n) => ({ ...acc, [n.id]: n }), {} as Record<string, WorkflowNode>);

    const finalEdges = edges.map(edge => {
        const sourceNode = finalNodeMap[edge.source];
        const targetNode = finalNodeMap[edge.target];

        if (!sourceNode || !targetNode || snakeNodeIds.has(sourceNode.id)) {
            return edge;
        }

        // 仅对非蛇形链的 Decision 节点做优化 (ForkNode 使用固定分支 Handle，不应被由于位置而改变)
        if (sourceNode.type !== 'decisionNode') {
            return edge;
        }

        const { width: sw, height: sh } = getNodeDimensions(sourceNode, direction);
        const { width: tw, height: th } = getNodeDimensions(targetNode, direction);

        const sourceCenter = { x: sourceNode.position.x + sw / 2, y: sourceNode.position.y + sh / 2 };
        const targetCenter = { x: targetNode.position.x + tw / 2, y: targetNode.position.y + th / 2 };

        let sourceHandle = null;

        if (direction === 'TB') {
            const threshold = sw * 0.25;
            if (targetCenter.x < sourceCenter.x - threshold) {
                sourceHandle = 'left';
            } else if (targetCenter.x > sourceCenter.x + threshold) {
                sourceHandle = 'right';
            }
        } else {
            const threshold = sh * 0.25;
            if (targetCenter.y < sourceCenter.y - threshold) {
                sourceHandle = 'top';
            } else if (targetCenter.y > sourceCenter.y + threshold) {
                sourceHandle = 'bottom';
            }
        }

        return { ...edge, sourceHandle };
    });

    return { nodes: finalNodes, edges: finalEdges };
}

/**
 * 自动布局主函数（支持 parentId 子节点）
 */
export function getLayoutedElements(nodes: WorkflowNode[], edges: Edge[], options: AutoLayoutOptions = {}): { nodes: WorkflowNode[]; edges: Edge[] } {
    const direction = options.direction || 'TB';
    const mode = options.mode || 'view';

    // Separate child nodes from main nodes
    const childNodes = nodes.filter(n => n.parentId);
    const mainNodes = nodes.filter(n => !n.parentId);

    if (childNodes.length === 0) {
        // No parent-child structure — use flat layout directly
        return layoutFlatGraph(nodes, edges, options);
    }

    // Build a lookup for child nodes
    const childNodeById = new Map(childNodes.map(n => [n.id, n]));

    // Classify edges: child-only edges vs main graph edges
    const childEdgesByParent: Record<string, Edge[]> = {};
    const mainEdges: Edge[] = [];

    edges.forEach(e => {
        const srcNode = childNodeById.get(e.source);
        const tgtNode = childNodeById.get(e.target);
        // Edge is "within a loop" if both endpoints are children of the SAME parent
        if (srcNode?.parentId && srcNode.parentId === tgtNode?.parentId) {
            const pid = srcNode.parentId;
            if (!childEdgesByParent[pid]) childEdgesByParent[pid] = [];
            childEdgesByParent[pid].push(e);
        } else {
            mainEdges.push(e);
        }
    });

    // Group child nodes by parent
    const childrenByParent: Record<string, WorkflowNode[]> = {};
    childNodes.forEach(n => {
        const pid = n.parentId!;
        if (!childrenByParent[pid]) childrenByParent[pid] = [];
        childrenByParent[pid].push(n);
    });

    // Layout each loop's children and compute container sizes
    const loopSizes: Record<string, { width: number; height: number }> = {};
    const allPositionedChildren: WorkflowNode[] = [];

    for (const [parentId, children] of Object.entries(childrenByParent)) {
        const loopEdges = childEdgesByParent[parentId] || [];
        const { positionedChildren, containerWidth, containerHeight } = layoutLoopChildren(children, loopEdges, direction, mode);
        loopSizes[parentId] = { width: containerWidth, height: containerHeight };
        allPositionedChildren.push(...positionedChildren);
    }

    // Override loop node sizes in the main node list
    const mainNodesWithSizes = mainNodes.map(n => {
        if (n.type === 'loopNode' && loopSizes[n.id]) {
            const { width, height } = loopSizes[n.id];
            return {
                ...n,
                // Pass sizes via data so getNodeDimensions can pick them up
                data: { ...n.data, _layoutWidth: width, _layoutHeight: height },
                style: { ...n.style, width, height },
            };
        }
        return n;
    });

    // Layout the main graph with correct loop sizes
    const { nodes: layoutedMain, edges: layoutedMainEdges } = layoutFlatGraph(mainNodesWithSizes, mainEdges, options);

    // Re-apply style.width/height AND explicit width/height to loop nodes in the result.
    // ReactFlow uses node.width / node.height (not style) for computing child-node
    // absolute handle positions in the global SVG edge layer. Without these, edges
    // between child nodes render at incorrect coordinates and appear invisible.
    const finalMain = layoutedMain.map(n => {
        if (n.type === 'loopNode' && loopSizes[n.id]) {
            const { width, height } = loopSizes[n.id];
            return { ...n, width, height, style: { ...n.style, width, height } };
        }
        return n;
    });

    return {
        nodes: [...finalMain, ...allPositionedChildren],
        edges: [...layoutedMainEdges, ...Object.values(childEdgesByParent).flat()],
    };
}

export function relayout(nodes: WorkflowNode[], edges: Edge[], direction: LayoutDirection = 'TB', mode: EditorMode = 'view'): { nodes: WorkflowNode[]; edges: Edge[] } {
    return getLayoutedElements(nodes, edges, { direction, mode });
}
