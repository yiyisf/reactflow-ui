import dagre from 'dagre';

/**
 * 使用 dagre 算法自动布局节点
 * @param {Array} nodes - React Flow 节点数组
 * @param {Array} edges - React Flow 边数组
 * @param {Object} options - 布局选项
 * @returns {Array} 带有位置信息的节点数组
 */
export function getLayoutedElements(nodes, edges, options = {}) {
    const {
        direction = 'TB', // TB (top-bottom), LR (left-right)
        nodeWidth = 180,
        nodeHeight = 80,
        rankSep = 100, // 层级间距
        nodeSep = 80,  // 节点间距
    } = options;

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
        // 根据节点类型设置不同的尺寸
        let width = nodeWidth;
        let height = nodeHeight;

        if (node.type === 'input' || node.type === 'output') {
            width = 60;
            height = 60;
        } else if (node.type === 'decisionNode') {
            width = 150;
            height = 150;
        } else if (node.type === 'forkNode' || node.type === 'joinNode') {
            width = 120;
            height = 60;
        } else if (node.type === 'loopNode') {
            width = 160;
            height = 100;
        }

        dagreGraph.setNode(node.id, { width, height });
    });

    // 添加边到 dagre 图
    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    // 执行布局计算
    dagre.layout(dagreGraph);

    // 更新节点位置
    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);

        // dagre 返回的是节点中心点坐标，需要转换为左上角坐标
        let width = nodeWidth;
        let height = nodeHeight;

        if (node.type === 'input' || node.type === 'output') {
            width = 60;
            height = 60;
        } else if (node.type === 'decisionNode') {
            width = 150;
            height = 150;
        } else if (node.type === 'forkNode' || node.type === 'joinNode') {
            width = 120;
            height = 60;
        } else if (node.type === 'loopNode') {
            width = 160;
            height = 100;
        }

        return {
            ...node,
            position: {
                x: nodeWithPosition.x - width / 2,
                y: nodeWithPosition.y - height / 2,
            },
        };
    });

    return layoutedNodes;
}

/**
 * 重新计算布局
 * @param {Array} nodes - 节点数组
 * @param {Array} edges - 边数组
 * @param {String} direction - 布局方向 ('TB' 或 'LR')
 * @returns {Array} 重新布局后的节点数组
 */
export function relayout(nodes, edges, direction = 'TB') {
    return getLayoutedElements(nodes, edges, { direction });
}
