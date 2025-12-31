import dagre from 'dagre';

/**
 * Conductor 工作流解析器
 * 将 Conductor 工作流 JSON 转换为 React Flow 的 nodes 和 edges
 */

/**
 * 解析 Conductor 工作流定义
 * @param {Object} workflowDef - Conductor 工作流定义 JSON
 * @param {string} direction - 布局方向 'TB' | 'LR'
 * @returns {Object} { nodes, edges, taskMap } - React Flow 所需的数据结构
 */
export function parseConductorWorkflow(workflowDef, direction = 'TB') {
    if (!workflowDef || !workflowDef.tasks) {
        return { nodes: [], edges: [], taskMap: {} };
    }

    const nodes = [];
    const edges = [];
    const taskMap = {}; // 用于快速查找任务
    let nodeIdCounter = 0;

    // 添加开始节点
    const startNode = {
        id: 'start',
        type: 'input',
        data: { label: '开始', layoutDirection: direction },
        position: { x: 0, y: 0 },
        sourcePosition: direction === 'LR' ? 'right' : 'bottom',
        style: {
            background: '#4ade80',
            color: '#fff',
            border: '2px solid #22c55e',
            borderRadius: '50%',
            width: 60,
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold'
        }
    };
    nodes.push(startNode);

    // 解析所有任务
    const tasks = workflowDef.tasks;
    let previousTaskRef = 'start';

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const result = parseTask(task, nodeIdCounter, taskMap, direction);

        nodes.push(...result.nodes);
        edges.push(...result.edges);
        nodeIdCounter = result.nextId;

        // 连接到前一个任务
        if (i === 0) {
            edges.push({
                id: `e-start-${task.taskReferenceName}`,
                source: 'start',
                target: task.taskReferenceName,
                animated: true
            });
        } else {
            const prevTask = tasks[i - 1];
            connectTasks(prevTask, task, edges);
        }

        // 更新 taskMap
        Object.assign(taskMap, result.taskMap);
    }

    // 添加结束节点
    const lastTask = tasks[tasks.length - 1];
    const endNode = {
        id: 'end',
        type: 'output',
        data: { label: '结束', layoutDirection: direction },
        position: { x: 0, y: 0 },
        targetPosition: direction === 'LR' ? 'left' : 'top',
        style: {
            background: '#f87171',
            color: '#fff',
            border: '2px solid #ef4444',
            borderRadius: '50%',
            width: 60,
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold'
        }
    };
    nodes.push(endNode);

    if (lastTask) {
        const lastNodeId = getLastNodeId(lastTask);
        edges.push({
            id: `e-${lastNodeId}-end`,
            source: lastNodeId,
            target: 'end',
            animated: true
        });
    }

    return { nodes, edges, taskMap };
}

/**
 * 解析单个任务
 */
function parseTask(task, startId, taskMap, direction = 'TB') {
    const nodes = [];
    const edges = [];
    let nextId = startId;
    const localTaskMap = {};

    const taskType = task.type || 'SIMPLE';

    switch (taskType) {
        case 'DECISION':
        case 'SWITCH':
            return parseDecisionTask(task, startId, taskMap, direction);

        case 'FORK_JOIN':
        case 'FORK_JOIN_DYNAMIC':
            return parseForkJoinTask(task, startId, taskMap, direction);

        case 'JOIN':
            return parseJoinTask(task, startId, taskMap, direction);

        case 'DO_WHILE':
            return parseDoWhileTask(task, startId, taskMap, direction);

        case 'SUB_WORKFLOW':
            return parseSubWorkflowTask(task, startId, taskMap, direction);

        default:
            // 常规任务 (SIMPLE, HTTP, JSON_JQ_TRANSFORM, EVENT, etc.)
            return parseSimpleTask(task, startId, taskMap, direction);
    }
}

/**
 * 解析简单任务
 */
function parseSimpleTask(task, startId, taskMap, direction = 'TB') {
    const node = {
        id: task.taskReferenceName,
        type: 'taskNode',
        data: {
            label: task.name,
            taskReferenceName: task.taskReferenceName,
            taskType: task.type || 'SIMPLE',
            task: task,
            layoutDirection: direction,
        },
        position: { x: 0, y: 0 },
        sourcePosition: direction === 'LR' ? 'right' : 'bottom',
        targetPosition: direction === 'LR' ? 'left' : 'top',
    };

    const localTaskMap = {
        [task.taskReferenceName]: task
    };

    return {
        nodes: [node],
        edges: [],
        taskMap: localTaskMap,
        nextId: startId + 1
    };
}

/**
 * 解析 DECISION/SWITCH 任务（支持分支嵌套）
 */
function parseDecisionTask(task, startId, taskMap, direction = 'TB') {
    const nodes = [];
    const edges = [];
    let nextId = startId;
    const localTaskMap = {};

    // 创建决策节点
    const decisionNode = {
        id: task.taskReferenceName,
        type: 'decisionNode',
        data: {
            label: task.name,
            taskReferenceName: task.taskReferenceName,
            taskType: task.type,
            task: task,
            layoutDirection: direction,
        },
        position: { x: 0, y: 0 },
        sourcePosition: direction === 'LR' ? 'right' : 'bottom',
        targetPosition: direction === 'LR' ? 'left' : 'top',
    };
    nodes.push(decisionNode);
    localTaskMap[task.taskReferenceName] = task;

    // 创建合并节点（用于汇聚所有分支）
    const joinNodeId = `${task.taskReferenceName}_join`;
    const joinNode = {
        id: joinNodeId,
        type: 'default',
        data: { label: '合并', layoutDirection: direction },
        position: { x: 0, y: 0 },
        sourcePosition: direction === 'LR' ? 'right' : 'bottom',
        targetPosition: direction === 'LR' ? 'left' : 'top',
        style: {
            background: '#a78bfa',
            color: '#fff',
            border: '2px solid #8b5cf6',
            borderRadius: '8px',
            padding: '10px',
            fontSize: '12px'
        }
    };
    nodes.push(joinNode);

    // 解析决策映射
    const decisionCases = task.decisionCases || {};
    const defaultCase = task.defaultCase || [];
    const caseKeys = Object.keys(decisionCases);

    // 分配 Handle 的辅助函数
    const getSourceHandle = (index, total) => {
        if (direction === 'TB') {
            if (index === 0 && total > 1) return 'left';
            if (index === 1 && total > 2) return 'right';
        } else {
            if (index === 0 && total > 1) return 'top';
            if (index === 1 && total > 2) return 'bottom';
        }
        return null; // 默认使用主 Handle
    };

    // 处理每个分支
    caseKeys.forEach((caseKey, index) => {
        const caseTasks = decisionCases[caseKey];
        const sourceHandle = getSourceHandle(index, caseKeys.length + 1);

        if (caseTasks && caseTasks.length > 0) {
            // 解析分支中的任务
            const branchResult = parseBranch(caseTasks, nextId, taskMap, `${task.taskReferenceName}_case_${caseKey}`, direction);
            nodes.push(...branchResult.nodes);
            edges.push(...branchResult.edges);
            Object.assign(localTaskMap, branchResult.taskMap);
            nextId = branchResult.nextId;

            // 连接决策节点到分支第一个任务
            const firstTaskRef = caseTasks[0].taskReferenceName;
            edges.push({
                id: `e-${task.taskReferenceName}-${firstTaskRef}`,
                source: task.taskReferenceName,
                sourceHandle: sourceHandle,
                target: firstTaskRef,
                label: caseKey,
                animated: true,
                data: { branchCase: caseKey }, // 即使不为空也标记，方便在起始连线插入
                style: { stroke: '#3b82f6' }
            });

            // 连接分支最后一个任务到合并节点
            const lastTaskRef = caseTasks[caseTasks.length - 1].taskReferenceName;
            edges.push({
                id: `e-${lastTaskRef}-${joinNodeId}`,
                source: lastTaskRef,
                target: joinNodeId,
                animated: true
            });
        } else {
            // 空分支：直接从决策节点连到合并节点
            edges.push({
                id: `e-${task.taskReferenceName}-${joinNodeId}-${caseKey}`,
                source: task.taskReferenceName,
                sourceHandle: sourceHandle,
                target: joinNodeId,
                label: caseKey,
                animated: true,
                data: { mode: 'edit', branchCase: caseKey }, // 记录分支键名
                style: { stroke: '#3b82f6', strokeDasharray: '5,5' }
            });
        }
    });

    // 处理默认分支
    if (defaultCase && defaultCase.length > 0) {
        const branchResult = parseBranch(defaultCase, nextId, taskMap, `${task.taskReferenceName}_default`, direction);
        nodes.push(...branchResult.nodes);
        edges.push(...branchResult.edges);
        Object.assign(localTaskMap, branchResult.taskMap);
        nextId = branchResult.nextId;

        const firstTaskRef = defaultCase[0].taskReferenceName;
        edges.push({
            id: `e-${task.taskReferenceName}-${firstTaskRef}`,
            source: task.taskReferenceName,
            target: firstTaskRef,
            label: 'default',
            animated: true,
            data: { branchCase: 'default' },
            style: { stroke: '#f59e0b' }
        });

        const lastTaskRef = defaultCase[defaultCase.length - 1].taskReferenceName;
        edges.push({
            id: `e-${lastTaskRef}-${joinNodeId}`,
            source: lastTaskRef,
            target: joinNodeId,
            animated: true
        });
    } else {
        // 默认分支为空
        edges.push({
            id: `e-${task.taskReferenceName}-${joinNodeId}-default`,
            source: task.taskReferenceName,
            target: joinNodeId,
            label: 'default',
            animated: true,
            data: { mode: 'edit', branchCase: 'default' }, // 记录 default
            style: { stroke: '#f59e0b', strokeDasharray: '5,5' }
        });
    }

    // 如果没有任何分支，直接连接到合并节点
    if (Object.keys(decisionCases).length === 0 && (!defaultCase || defaultCase.length === 0)) {
        edges.push({
            id: `e-${task.taskReferenceName}-${joinNodeId}`,
            source: task.taskReferenceName,
            target: joinNodeId,
            animated: true
        });
    }

    return {
        nodes,
        edges,
        taskMap: localTaskMap,
        nextId,
        joinNodeId // 返回合并节点 ID，用于后续连接
    };
}

/**
 * 解析 FORK_JOIN 任务
 */
function parseForkJoinTask(task, startId, taskMap, direction = 'TB') {
    const nodes = [];
    const edges = [];
    let nextId = startId;
    const localTaskMap = {};

    // 创建 FORK 节点
    const forkNode = {
        id: task.taskReferenceName,
        type: 'forkNode',
        data: {
            label: task.name,
            taskReferenceName: task.taskReferenceName,
            taskType: task.type,
            task: task,
            layoutDirection: direction,
        },
        position: { x: 0, y: 0 },
        sourcePosition: direction === 'LR' ? 'right' : 'bottom',
        targetPosition: direction === 'LR' ? 'left' : 'top',
    };
    nodes.push(forkNode);
    localTaskMap[task.taskReferenceName] = task;

    // 创建 JOIN 节点
    const joinNodeId = `${task.taskReferenceName}_join`;
    const joinNode = {
        id: joinNodeId,
        type: 'joinNode',
        data: {
            label: 'JOIN',
            taskReferenceName: joinNodeId,
            layoutDirection: direction,
        },
        position: { x: 0, y: 0 },
        sourcePosition: direction === 'LR' ? 'right' : 'bottom',
        targetPosition: direction === 'LR' ? 'left' : 'top',
    };
    nodes.push(joinNode);

    // 解析并行分支
    const forkTasks = task.forkTasks || [];

    forkTasks.forEach((branch, branchIndex) => {
        if (branch && branch.length > 0) {
            const branchResult = parseBranch(branch, nextId, taskMap, `${task.taskReferenceName}_fork_${branchIndex}`, direction);
            nodes.push(...branchResult.nodes);
            edges.push(...branchResult.edges);
            Object.assign(localTaskMap, branchResult.taskMap);
            nextId = branchResult.nextId;

            // 连接 FORK 到分支第一个任务
            const firstTaskRef = branch[0].taskReferenceName;
            edges.push({
                id: `e-${task.taskReferenceName}-${firstTaskRef}`,
                source: task.taskReferenceName,
                target: firstTaskRef,
                label: `分支 ${branchIndex + 1}`,
                animated: true,
                data: { forkIndex: branchIndex },
                style: { stroke: '#10b981' }
            });

            // 连接分支最后一个任务到 JOIN
            const lastTaskRef = branch[branch.length - 1].taskReferenceName;
            edges.push({
                id: `e-${lastTaskRef}-${joinNodeId}`,
                source: lastTaskRef,
                target: joinNodeId,
                animated: true
            });
        } else {
            // 空分支：直接从 FORK 连到 JOIN
            edges.push({
                id: `e-${task.taskReferenceName}-${joinNodeId}-branch-${branchIndex}`,
                source: task.taskReferenceName,
                target: joinNodeId,
                label: `分支 ${branchIndex + 1}`,
                animated: true,
                data: { mode: 'edit', forkIndex: branchIndex }, // 记录 fork 索引
                style: { stroke: '#10b981', strokeDasharray: '5,5' }
            });
        }
    });

    return {
        nodes,
        edges,
        taskMap: localTaskMap,
        nextId,
        joinNodeId
    };
}

/**
 * 解析 DO_WHILE 任务
 * 循环体任务作为循环节点的内部任务，不单独创建节点
 */
function parseDoWhileTask(task, startId, taskMap, direction = 'TB') {
    const nodes = [];
    const edges = [];
    let nextId = startId;
    const localTaskMap = {};

    // 创建循环节点，包含循环体信息
    const loopNode = {
        id: task.taskReferenceName,
        type: 'loopNode',
        data: {
            label: task.name,
            taskReferenceName: task.taskReferenceName,
            taskType: task.type,
            task: task,
            loopOver: task.loopOver, // 保存循环体任务信息
            loopCondition: task.loopCondition,
            layoutDirection: direction,
        },
        position: { x: 0, y: 0 },
        sourcePosition: direction === 'LR' ? 'right' : 'bottom',
        targetPosition: direction === 'LR' ? 'left' : 'top',
    };
    nodes.push(loopNode);
    localTaskMap[task.taskReferenceName] = task;

    // 将循环体中的任务也添加到 taskMap，但不创建节点
    // 这样点击循环节点时可以显示循环体的详细信息
    const loopOver = task.loopOver || [];
    loopOver.forEach(loopTask => {
        localTaskMap[loopTask.taskReferenceName] = loopTask;
    });

    return {
        nodes,
        edges,
        taskMap: localTaskMap,
        nextId
    };
}

/**
 * 解析 SUB_WORKFLOW 任务
 */
function parseSubWorkflowTask(task, startId, taskMap, direction = 'TB') {
    const node = {
        id: task.taskReferenceName,
        type: 'subWorkflowNode',
        data: {
            label: task.name,
            taskReferenceName: task.taskReferenceName,
            taskType: task.type,
            task: task,
            subWorkflowName: task.subWorkflowParam?.name || '子流程',
            layoutDirection: direction,
        },
        position: { x: 0, y: 0 },
        sourcePosition: direction === 'LR' ? 'right' : 'bottom',
        targetPosition: direction === 'LR' ? 'left' : 'top',
    };

    const localTaskMap = {
        [task.taskReferenceName]: task
    };

    return {
        nodes: [node],
        edges: [],
        taskMap: localTaskMap,
        nextId: startId + 1
    };
}

/**
 * 解析 JOIN 任务
 */
function parseJoinTask(task, startId, taskMap, direction = 'TB') {
    const node = {
        id: task.taskReferenceName,
        type: 'joinNode',
        data: {
            label: task.name || 'JOIN',
            taskReferenceName: task.taskReferenceName,
            taskType: task.type,
            task: task,
            layoutDirection: direction,
        },
        position: { x: 0, y: 0 },
        sourcePosition: direction === 'LR' ? 'right' : 'bottom',
        targetPosition: direction === 'LR' ? 'left' : 'top',
    };

    const localTaskMap = {
        [task.taskReferenceName]: task
    };

    return {
        nodes: [node],
        edges: [],
        taskMap: localTaskMap,
        nextId: startId + 1
    };
}

/**
 * 解析分支（用于 DECISION、FORK_JOIN 等的子任务）
 */
function parseBranch(tasks, startId, parentTaskMap, branchPrefix, direction = 'TB') {
    const nodes = [];
    const edges = [];
    let nextId = startId;
    const localTaskMap = {};

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const result = parseTask(task, nextId, parentTaskMap, direction);

        nodes.push(...result.nodes);
        edges.push(...result.edges);
        Object.assign(localTaskMap, result.taskMap);
        nextId = result.nextId;

        // 连接分支内的任务
        if (i > 0) {
            const prevTask = tasks[i - 1];
            connectTasks(prevTask, task, edges);
        }
    }

    return {
        nodes,
        edges,
        taskMap: localTaskMap,
        nextId
    };
}

/**
 * 连接两个任务
 */
function connectTasks(fromTask, toTask, edges) {
    const fromId = getLastNodeId(fromTask);
    const toId = toTask.taskReferenceName;

    // 避免重复边
    const edgeId = `e-${fromId}-${toId}`;
    if (!edges.find(e => e.id === edgeId)) {
        edges.push({
            id: edgeId,
            source: fromId,
            target: toId,
            animated: true
        });
    }
}

/**
 * 获取任务的最后一个节点 ID
 * 对于有 JOIN 节点的任务（DECISION, FORK_JOIN），返回 JOIN 节点 ID
 */
function getLastNodeId(task) {
    const taskType = task.type || 'SIMPLE';

    if (taskType === 'DECISION' || taskType === 'SWITCH') {
        return `${task.taskReferenceName}_join`;
    } else if (taskType === 'FORK_JOIN' || taskType === 'FORK_JOIN_DYNAMIC') {
        return `${task.taskReferenceName}_join`;
    } else {
        return task.taskReferenceName;
    }
}

/**
 * 别名，兼容旧代码
 */
export const parseWorkflow = parseConductorWorkflow;
