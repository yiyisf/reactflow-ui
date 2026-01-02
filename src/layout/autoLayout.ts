import dagre from 'dagre';
import { Edge } from 'reactflow';
import { WorkflowNode, LayoutDirection } from '../types/workflow';

/**
 * 根据节点类型和布局方向获取节点尺寸
 */
function getNodeDimensions(node: WorkflowNode, direction: LayoutDirection = 'TB') {
    let width = 180;
    let height = 80;

    switch (node.type) {
        case 'input':
        case 'output':
            width = 60;
            height = 60;
            break;
        case 'decisionNode':
            // 150x150 旋转 45度后的外接矩形宽度/高度为 150 * sqrt(2) ≈ 212
            width = 212;
            height = 212;
            break;
        case 'forkNode':
        case 'joinNode':
            width = 140;
            height = 60;
            break;
        case 'loopNode':
            // 循环节点需要更大的空间来容纳内部的迷你流程图
            const loopOver = node.data.loopOver || node.data.task?.loopOver || [];
            const loopTaskCount = loopOver.length;
            const hasCondition = !!(node.data.loopCondition || node.data.task?.loopCondition);

            if (direction === 'LR') {
                // 横向布局：任务水平排列
                // 宽度 = 基础宽度 + (任务数 * 任务宽度) + 间距
                width = 300 + (loopTaskCount * 100);
                width = Math.min(width, 700); // 限制最大宽度
                // 高度相对固定
                height = 200 + (hasCondition ? 60 : 0);
            } else {
                // 纵向布局：任务垂直排列
                width = 280;
                // 高度 = 基础高度 + (任务数 * 任务高度) + 条件区域
                height = 180 + (loopTaskCount * 45) + (hasCondition ? 60 : 0);
                height = Math.min(height, 500); // 限制最大高度
            }
            break;
        case 'subWorkflowNode':
            width = 200;
            height = 100;
            break;
        default:
            width = 180;
            height = 80;
    }

    return { width, height };
}

interface AutoLayoutOptions {
    direction?: LayoutDirection;
}

/**
 * 使用 dagre 算法自动布局节点
 * @param {Array} nodes - React Flow 节点数组
 * @param {Array} edges - React Flow 边数组
 * @param {Object} options - 布局选项
 * @returns {Array} 带有位置信息的节点数组
 */
export function getLayoutedElements(nodes: WorkflowNode[], edges: Edge[], options: AutoLayoutOptions = {}): { nodes: WorkflowNode[]; edges: Edge[] } {
    const {
        direction = 'TB', // TB (top-bottom), LR (left-right)
    } = options;

    // 根据布局方向调整间距
    const rankSep = direction === 'LR' ? 150 : 120;
    const nodeSep = direction === 'LR' ? 120 : 100;

    // 创建 dagre 图
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // 设置图的布局方向和间距
    dagreGraph.setGraph({
        rankdir: direction,
        ranksep: rankSep,
        nodesep: nodeSep,
        edgesep: 50,
        marginx: 50,
        marginy: 50,
    });

    // 添加节点到 dagre 图
    nodes.forEach((node) => {
        const { width, height } = getNodeDimensions(node, direction);
        dagreGraph.setNode(node.id, { width, height });
    });

    // 添加边到 dagre 图
    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    // 执行布局计算
    dagre.layout(dagreGraph);

    // 1. 更新节点位置
    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const { width, height } = getNodeDimensions(node, direction);

        return {
            ...node,
            position: {
                x: nodeWithPosition.x - width / 2,
                y: nodeWithPosition.y - height / 2,
            },
        };
    });

    // 2. 优化边句柄 (Handle) 分配
    // 根据布局后的节点中心点相对位置，动态指定 sourceHandle 避免连线交叉
    const nodeMap = layoutedNodes.reduce((acc, n) => ({ ...acc, [n.id]: n }), {} as Record<string, WorkflowNode>);

    const layoutedEdges = edges.map((edge) => {
        const sourceNode = nodeMap[edge.source];
        const targetNode = nodeMap[edge.target];

        if (!sourceNode || !targetNode ||
            (sourceNode.type !== 'decisionNode' && sourceNode.type !== 'forkNode')) {
            return edge;
        }

        const { width: sw, height: sh } = getNodeDimensions(sourceNode, direction);
        const { width: tw, height: th } = getNodeDimensions(targetNode, direction);

        const sourceCenter = { x: sourceNode.position.x + sw / 2, y: sourceNode.position.y + sh / 2 };
        const targetCenter = { x: targetNode.position.x + tw / 2, y: targetNode.position.y + th / 2 };

        let sourceHandle = null; // 默认

        if (direction === 'TB') {
            const threshold = sw * 0.25; // 居中判定阈值
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

        return {
            ...edge,
            sourceHandle
        };
    });

    return { nodes: layoutedNodes, edges: layoutedEdges };
}

/**
 * 重新计算布局
 * @param {Array} nodes - 节点数组
 * @param {Array} edges - 边数组
 * @param {String} direction - 布局方向 ('TB' 或 'LR')
 * @returns {Array} 重新布局后的节点数组
 */
export function relayout(nodes: WorkflowNode[], edges: Edge[], direction: LayoutDirection = 'TB'): { nodes: WorkflowNode[]; edges: Edge[] } {
    return getLayoutedElements(nodes, edges, { direction });
}
