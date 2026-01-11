import dagre from 'dagre';
import { Edge, Position } from 'reactflow';
import { WorkflowNode, LayoutDirection, EditorMode } from '../types/workflow';

/**
 * 根据节点类型和布局方向获取节点尺寸
 */
/**
 * 获取节点尺寸（用于布局计算）
 * 重构后所有节点都使用 NodeLayout，统一为横向卡片
 */
function getNodeDimensions(node: WorkflowNode, direction: LayoutDirection = 'TB') {
    let width = 240; // NodeLayout 的 min-width
    let height = 80;  // NodeLayout 的标准高度

    switch (node.type) {
        case 'input':
        case 'output':
            width = 60;
            height = 60;
            break;
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
        case 'loopNode':
            // LoopNode 宽度更大，高度取决于子任务数量
            const loopOver = node.data.loopOver || node.data.task?.loopOver || [];
            const loopTaskCount = loopOver.length;
            const hasCondition = !!(node.data.loopCondition || node.data.task?.loopCondition);

            if (direction === 'LR') {
                width = 320 + (loopTaskCount * 50); // 横向布局时宽度更大
                width = Math.min(width, 600);
                height = 145 + (hasCondition ? 20 : 0);
            } else {
                width = 320; // 纵向布局时固定宽度
                height = 120 + (loopTaskCount * 40) + (hasCondition ? 30 : 0);
                height = Math.min(height, 400);
            }
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
}

/**
 * 检测图中的长线性链
 */
function detectLinearChains(nodes: WorkflowNode[], edges: Edge[], minLength: number = 8): string[][] {
    const chains: string[][] = [];
    if (nodes.length < minLength) return chains;

    const outDegree: Record<string, string[]> = {};
    const inDegree: Record<string, string[]> = {};

    nodes.forEach(n => {
        outDegree[n.id] = [];
        inDegree[n.id] = [];
    });

    edges.forEach(e => {
        if (outDegree[e.source]) outDegree[e.source].push(e.target);
        if (inDegree[e.target]) inDegree[e.target].push(e.source);
    });

    const visited = new Set<string>();
    const isSimpleType = (n: WorkflowNode) =>
        ['simple', 'http', 'kafka', 'json_jq', 'set_variable', 'subWorkflowNode', 'task'].includes(n.type || '') ||
        n.data.taskType === 'SIMPLE' || n.data.taskType === 'HTTP' || n.data.taskType === 'SUB_WORKFLOW';

    const sortedNodes = [...nodes].sort((a, b) => a.position.y - b.position.y);

    for (const node of sortedNodes) {
        if (visited.has(node.id)) continue;
        if (!isSimpleType(node)) continue;

        const currentChain: string[] = [node.id];
        let curr = node;
        let nextIds = outDegree[curr.id];

        while (nextIds && nextIds.length === 1) {
            const nextId = nextIds[0];
            const nextNode = nodes.find(n => n.id === nextId);

            if (!nextNode || visited.has(nextId) || !isSimpleType(nextNode)) break;
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
function getSnakeBlockDimensions(chain: string[], nodes: WorkflowNode[], direction: LayoutDirection, nodeSep: number, rankSep: number): { width: number, height: number, gridKW: number, gridKH: number, cols: number } {
    const COLUMNS = 5;
    const nodeMap = nodes.reduce((acc, n) => ({ ...acc, [n.id]: n }), {} as Record<string, WorkflowNode>);

    // 假设链中所有节点尺寸相近，取第一个
    const sampleNode = nodeMap[chain[0]];
    const { width: nW, height: nH } = getNodeDimensions(sampleNode, direction);

    const snakeNodeSep = Math.min(nodeSep, 60);
    const snakeRankSep = Math.min(rankSep, 80);

    const gridKW = nW + snakeNodeSep;
    const gridKH = nH + snakeRankSep;

    let width = 0;
    let height = 0;

    if (direction === 'TB') {
        // TB模式（行优先）：width = Cols * KW, height = Rows * KH
        const rows = Math.ceil(chain.length / COLUMNS);
        // 实际宽度取决于是不是满行，但为了简单，给满宽
        width = COLUMNS * gridKW - snakeNodeSep;
        height = rows * gridKH - snakeRankSep;
    } else {
        // LR模式（列优先）：width = Cols * KW, height = Rows * KH
        // 这里的 "Col" 实际上是布局的列数（蛇形的“层”）
        const visualCols = Math.ceil(chain.length / COLUMNS);
        width = visualCols * gridKW - snakeNodeSep;
        height = COLUMNS * gridKH - snakeRankSep;
    }

    // Dagre 需要一点 extra padding
    width += 40;
    height += 40;

    return { width, height, gridKW, gridKH, cols: COLUMNS };
}

/**
 * 自动布局主函数
 */
export function getLayoutedElements(nodes: WorkflowNode[], edges: Edge[], options: AutoLayoutOptions = {}): { nodes: WorkflowNode[]; edges: Edge[] } {
    const {
        direction = 'TB',
        mode = 'view',
        enableSnakeLayout = true
    } = options;

    const nodeCount = nodes.length;

    // 1. 间距配置
    let baseRankSep = direction === 'LR' ? 150 : 120;
    let baseNodeSep = direction === 'LR' ? 120 : 100;
    let rankSep = baseRankSep;
    let nodeSep = baseNodeSep;

    if (nodeCount > 15) {
        let rankFactor = Math.max(0.5, 1 - (nodeCount - 15) / 50);
        let nodeFactor = Math.max(0.4, 1 - (nodeCount - 15) / 40);
        if (mode === 'edit') {
            rankFactor = 1 - (1 - rankFactor) * 0.5;
            nodeFactor = 1 - (1 - nodeFactor) * 0.5;
        }
        rankSep = Math.round(baseRankSep * rankFactor);
        nodeSep = Math.round(baseNodeSep * nodeFactor);
    }

    // 2. 检测蛇形链
    const snakeChains = (enableSnakeLayout && nodeCount > 10) ? detectLinearChains(nodes, edges, 8) : [];

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
                const info = getSnakeBlockDimensions(snakeChains[chainIdx], nodes, direction, nodeSep, rankSep);
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
    const originalNodeMap = nodes.reduce((acc, n) => ({ ...acc, [n.id]: { ...n } }), {} as Record<string, WorkflowNode>);

    const finalNodes: WorkflowNode[] = [];
    const snakeNodeIds = new Set<string>();

    // 5.1 处理普通节点
    nodes.forEach(node => {
        if (nodeToChainIndex[node.id] === undefined) {
            const pos = dagreGraph.node(node.id);
            const refNode = originalNodeMap[node.id];
            const { width, height } = getNodeDimensions(refNode, direction); // 重新获取尺寸，因为 originalNodeMap 里的尺寸可能不准

            refNode.position = {
                x: pos.x - width / 2,
                y: pos.y - height / 2
            };
            // 清理旧 Handle 数据
            refNode.data = { ...refNode.data, sourcePosition: undefined, targetPosition: undefined };
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

                const xOffset = isEvenRow ? (col * gridKW) : ((COLUMNS - 1 - col) * gridKW);
                const yOffset = row * gridKH;

                x = startX + xOffset;
                y = startY + yOffset;

                // Handles
                if (isEvenRow) {
                    tgtPos = Position.Left;
                    srcPos = Position.Right;
                    if (col === COLUMNS - 1 && index !== chain.length - 1) srcPos = Position.Bottom;
                    if (col === 0 && index !== 0) tgtPos = Position.Top;
                } else {
                    tgtPos = Position.Right;
                    srcPos = Position.Left;
                    if (col === COLUMNS - 1 && index !== chain.length - 1) srcPos = Position.Bottom;
                    if (col === 0 && index !== 0) tgtPos = Position.Top;
                }
                if (index === 0) tgtPos = Position.Top; // Entry
                if (index === chain.length - 1) srcPos = Position.Bottom; // Exit

            } else {
                // LR模式：垂直贪吃蛇 (S型向右)
                // 这里的 Col 其实是 Layout 上的 Grid Col (Visual Columns)
                const col = Math.floor(index / COLUMNS);
                const row = index % COLUMNS;
                const isEvenCol = col % 2 === 0;

                const xOffset = col * gridKW;
                const yOffset = isEvenCol ? (row * gridKH) : ((COLUMNS - 1 - row) * gridKH);

                x = startX + xOffset;
                y = startY + yOffset;

                // Handles
                if (isEvenCol) {
                    tgtPos = Position.Top;
                    srcPos = Position.Bottom;
                    if (row === COLUMNS - 1 && index !== chain.length - 1) srcPos = Position.Right;
                    if (row === 0 && index !== 0) tgtPos = Position.Left;
                } else {
                    tgtPos = Position.Bottom;
                    srcPos = Position.Top;
                    if (row === COLUMNS - 1 && index !== chain.length - 1) srcPos = Position.Right;
                    if (row === 0 && index !== 0) tgtPos = Position.Left;
                }
                if (index === 0) tgtPos = Position.Left; // Entry
                if (index === chain.length - 1) srcPos = Position.Right; // Exit
            }

            node.position = { x, y };
            node.data = { ...node.data, sourcePosition: srcPos, targetPosition: tgtPos };
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

        // ... 原有的 Handle 优化逻辑 ...
        const { width: sw, height: sh } = getNodeDimensions(sourceNode, direction);
        const { width: tw, height: th } = getNodeDimensions(targetNode, direction); // 这里注意 targetNode 可能是 snake 里的，所以 width/height 最好重新取，或者信任 getNodeDimensions

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

export function relayout(nodes: WorkflowNode[], edges: Edge[], direction: LayoutDirection = 'TB', mode: EditorMode = 'view'): { nodes: WorkflowNode[]; edges: Edge[] } {
    return getLayoutedElements(nodes, edges, { direction, mode });
}
