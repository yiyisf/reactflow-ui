import { Edge, Position } from 'reactflow';
import { WorkflowDef, TaskDef } from '../types/conductor';
import { WorkflowNode, LayoutDirection, ParserResult } from '../types/workflow';

/**
 * Conductor 工作流解析器
 * 将 Conductor 工作流 JSON 转换为 React Flow 的 nodes 和 edges
 */

/**
 * 解析 Conductor 工作流定义
 * @param {WorkflowDef} workflowDef - Conductor 工作流定义 JSON
 * @param {LayoutDirection} direction - 布局方向 'TB' | 'LR'
 * @returns {Object} { nodes, edges, taskMap } - React Flow 所需的数据结构
 */
export function parseConductorWorkflow(workflowDef: WorkflowDef, direction: LayoutDirection = 'TB', options?: { hideEmptyBranches?: boolean }) {
    const hideEmptyBranches = options?.hideEmptyBranches ?? false;
    if (!workflowDef || !workflowDef.tasks) {
        return { nodes: [] as WorkflowNode[], edges: [] as Edge[], taskMap: {} as Record<string, TaskDef> };
    }

    const nodes: WorkflowNode[] = [];
    const edges: Edge[] = [];
    const taskMap: Record<string, TaskDef> = {}; // 用于快速查找任务
    let nodeIdCounter = 0;


    // 解析所有任务
    const tasks = workflowDef.tasks;

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const result = parseTask(task, nodeIdCounter, taskMap, direction, tasks, hideEmptyBranches);

        nodes.push(...result.nodes);
        edges.push(...result.edges);
        nodeIdCounter = result.nextId;

        // 连接到前一个任务
        if (i > 0) {
            const prevTask = tasks[i - 1];
            // 对于并行任务，由 JOIN 逻辑处理多入连线，connectTasks 仅处理顺序流
            connectTasks(prevTask, task, edges, hideEmptyBranches);
        }

        // 更新 taskMap
        Object.assign(taskMap, result.taskMap);
    }

    // 编辑模式：在流程末尾添加 "+" 引导节点，解决单任务节点无法添加后续节点的问题
    if (!hideEmptyBranches && tasks.length > 0) {
        const lastTask = tasks[tasks.length - 1];
        const plusNodeId = '__workflow_end__';
        nodes.push({
            id: plusNodeId,
            type: 'plusNode',
            data: {
                label: '+',
                taskReferenceName: plusNodeId,
                taskType: 'PLUS',
                parentRef: lastTask.taskReferenceName,
                layoutDirection: direction,
            },
            position: { x: 0, y: 0 },
            sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
            targetPosition: direction === 'LR' ? Position.Left : Position.Top,
        });

        // 将所有末尾任务连接到 "+" 节点
        connectTasks(lastTask, { taskReferenceName: plusNodeId } as any, edges, hideEmptyBranches);
    }

    return { nodes, edges, taskMap };
}

/**
 * 解析单个任务
 */
function parseTask(task: TaskDef, startId: number, taskMap: Record<string, TaskDef>, direction: LayoutDirection = 'TB', allTasks: TaskDef[] = [], hideEmptyBranches = false): ParserResult {
    const taskType = task.type || 'SIMPLE';

    switch (taskType) {
        case 'DECISION':
        case 'SWITCH':
            return parseDecisionTask(task, startId, taskMap, direction, hideEmptyBranches);

        case 'FORK_JOIN':
        case 'FORK_JOIN_DYNAMIC':
            return parseForkJoinTask(task, startId, taskMap, direction);

        case 'JOIN':
        case 'EXCLUSIVE_JOIN':
            return parseJoinTask(task, startId, taskMap, direction, allTasks, hideEmptyBranches);

        case 'DO_WHILE':
            return parseDoWhileTask(task, startId, taskMap, direction);

        case 'SUB_WORKFLOW':
            return parseSubWorkflowTask(task, startId, taskMap, direction);

        default:
            // 常规任务 (SIMPLE, HTTP, INLINE, LAMBDA, JSON_JQ_TRANSFORM, EVENT, WAIT,
            //           SET_VARIABLE, TERMINATE, KAFKA_PUBLISH, DYNAMIC, HUMAN,
            //           START_WORKFLOW, NOOP, USER_DEFINED, etc.)
            return parseSimpleTask(task, startId, taskMap, direction);
    }
}

/**
 * 解析简单任务
 */
function parseSimpleTask(task: TaskDef, startId: number, _taskMap: Record<string, TaskDef>, direction: LayoutDirection = 'TB'): ParserResult {
    const node: WorkflowNode = {
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
        sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
        targetPosition: direction === 'LR' ? Position.Left : Position.Top,
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
function parseDecisionTask(task: TaskDef, startId: number, taskMap: Record<string, TaskDef>, direction: LayoutDirection = 'TB', hideEmptyBranches = false): ParserResult {
    const nodes: WorkflowNode[] = [];
    const edges: Edge[] = [];
    let nextId = startId;
    const localTaskMap: Record<string, TaskDef> = {};

    // 创建决策节点
    const decisionNode: WorkflowNode = {
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
        sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
        targetPosition: direction === 'LR' ? Position.Left : Position.Top,
    };
    nodes.push(decisionNode);
    localTaskMap[task.taskReferenceName] = task;

    // 解析决策映射
    const decisionCases = task.decisionCases || {};
    const defaultCase = task.defaultCase || [];
    const caseKeys = Object.keys(decisionCases);

    // 分配 Handle 的辅助函数
    const getSourceHandle = (index: number, total: number) => {
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
            const branchResult = parseBranch(caseTasks, nextId, { ...taskMap, ...localTaskMap }, direction);
            nodes.push(...branchResult.nodes);
            edges.push(...branchResult.edges);
            Object.assign(localTaskMap, branchResult.taskMap);
            nextId = branchResult.nextId;

            // 连接决策节点到分支第一个任务
            const firstTaskRef = caseTasks[0].taskReferenceName;
            edges.push({
                id: `e-${task.taskReferenceName}-${firstTaskRef}`,
                source: task.taskReferenceName,
                sourceHandle: sourceHandle || undefined,
                target: firstTaskRef,
                label: caseKey,
                animated: true,
                data: { branchCase: caseKey }, // 即使不为空也标记，方便在起始连线插入
                style: { stroke: '#3b82f6' }
            });
        } else if (!hideEmptyBranches) {
            // 编辑模式：创建占位引导节点
            const placeholderId = `${task.taskReferenceName}_empty_${caseKey}`;
            nodes.push({
                id: placeholderId,
                type: 'plusNode',
                data: {
                    label: `${caseKey} (空)`,
                    parentRef: task.taskReferenceName,
                    edgeData: { branchCase: caseKey },
                    layoutDirection: direction,
                    taskReferenceName: placeholderId,
                    taskType: 'EMPTY_BRANCH',
                },
                position: { x: 0, y: 0 },
                sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
                targetPosition: direction === 'LR' ? Position.Left : Position.Top,
                style: {
                    background: 'transparent',
                    border: '2px dashed var(--border-secondary, #64748b)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '11px',
                    color: 'var(--text-tertiary, #94a3b8)',
                    minWidth: '80px',
                    textAlign: 'center',
                } as React.CSSProperties,
            });
            edges.push({
                id: `e-${task.taskReferenceName}-${placeholderId}`,
                source: task.taskReferenceName,
                sourceHandle: sourceHandle || undefined,
                target: placeholderId,
                label: caseKey,
                animated: true,
                data: { branchCase: caseKey },
                style: { stroke: '#3b82f6', strokeDasharray: '5,5' },
            });
        }
    });

    // 处理默认分支
    if (defaultCase && defaultCase.length > 0) {
        const branchResult = parseBranch(defaultCase, nextId, { ...taskMap, ...localTaskMap }, direction);
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
    } else if (!hideEmptyBranches) {
        // 编辑模式：创建默认分支占位节点
        const placeholderId = `${task.taskReferenceName}_empty_default`;
        nodes.push({
            id: placeholderId,
            type: 'plusNode',
            data: {
                label: 'default (空)',
                parentRef: task.taskReferenceName,
                edgeData: { branchCase: 'default' },
                layoutDirection: direction,
                taskReferenceName: placeholderId,
                taskType: 'EMPTY_BRANCH',
            },
            position: { x: 0, y: 0 },
            sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
            targetPosition: direction === 'LR' ? Position.Left : Position.Top,
            style: {
                background: 'transparent',
                border: '2px dashed var(--border-secondary, #64748b)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '11px',
                color: 'var(--text-tertiary, #94a3b8)',
                minWidth: '80px',
                textAlign: 'center',
            } as React.CSSProperties,
        });
        edges.push({
            id: `e-${task.taskReferenceName}-${placeholderId}`,
            source: task.taskReferenceName,
            target: placeholderId,
            label: 'default',
            animated: true,
            data: { branchCase: 'default' },
            style: { stroke: '#f59e0b', strokeDasharray: '5,5' },
        });
    }

    return {
        nodes,
        edges,
        taskMap: localTaskMap,
        nextId
    };
}

/**
 * 解析 FORK_JOIN 或 FORK_JOIN_DYNAMIC 任务
 */
function parseForkJoinTask(task: TaskDef, startId: number, taskMap: Record<string, TaskDef>, direction: LayoutDirection = 'TB'): ParserResult {
    const nodes: WorkflowNode[] = [];
    const edges: Edge[] = [];
    let nextId = startId;
    const localTaskMap: Record<string, TaskDef> = {};
    const isDynamic = task.type === 'FORK_JOIN_DYNAMIC';

    // 创建 FORK 节点
    const forkNode: WorkflowNode = {
        id: task.taskReferenceName,
        type: 'forkNode',
        data: {
            label: task.name,
            taskReferenceName: task.taskReferenceName,
            taskType: task.type,
            task: task,
            isDynamic: isDynamic,
            layoutDirection: direction,
        },
        position: { x: 0, y: 0 },
        sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
        targetPosition: direction === 'LR' ? Position.Left : Position.Top,
    };
    nodes.push(forkNode);
    localTaskMap[task.taskReferenceName] = task;

    if (isDynamic) {
        // 动态并行：在 Fork 与 Join 之间插入占位节点，运行时由实际任务替换
        const placeholderId = `${task.taskReferenceName}_dynamic_placeholder`;
        nodes.push({
            id: placeholderId,
            type: 'dynamicPlaceholderNode',
            data: {
                label: '动态分支',
                taskReferenceName: placeholderId,
                taskType: 'DYNAMIC_PLACEHOLDER',
                layoutDirection: direction,
            },
            position: { x: 0, y: 0 },
            sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
            targetPosition: direction === 'LR' ? Position.Left : Position.Top,
        });
        edges.push({
            id: `e-${task.taskReferenceName}-${placeholderId}`,
            source: task.taskReferenceName,
            target: placeholderId,
            animated: true,
            style: { stroke: '#10b981', strokeDasharray: '5,5', strokeWidth: 2 },
        });
        localTaskMap[placeholderId] = {
            taskReferenceName: placeholderId,
            type: 'DYNAMIC_PLACEHOLDER',
        } as any;
    }

    if (!isDynamic) {
        // 静态并行：解析并行分支
        const forkTasks = task.forkTasks || [];

        forkTasks.forEach((branch, branchIndex) => {
            if (branch && branch.length > 0) {
                const branchResult = parseBranch(branch, nextId, { ...taskMap, ...localTaskMap }, direction);
                nodes.push(...branchResult.nodes);
                edges.push(...branchResult.edges);
                Object.assign(localTaskMap, branchResult.taskMap);
                nextId = branchResult.nextId;

                // 连接 FORK 到分支第一个任务
                const firstTaskRef = branch[0].taskReferenceName;
                edges.push({
                    id: `e-${task.taskReferenceName}-${firstTaskRef}`,
                    source: task.taskReferenceName,
                    sourceHandle: `branch_${branchIndex}`, // 分配唯一的 Handle ID
                    target: firstTaskRef,
                    label: `分支 ${branchIndex + 1}`,
                    animated: true,
                    data: { forkIndex: branchIndex },
                    style: { stroke: '#10b981' }
                });
            }
        });
    }

    return {
        nodes,
        edges,
        taskMap: localTaskMap,
        nextId
    };
}

/**
 * 解析 DO_WHILE 任务
 * 循环体任务作为循环节点的内部任务，不单独创建节点
 */
function parseDoWhileTask(task: TaskDef, startId: number, _taskMap: Record<string, TaskDef>, direction: LayoutDirection = 'TB'): ParserResult {
    const localTaskMap: Record<string, TaskDef> = {};

    // 创建循环节点，包含循环体信息
    const loopNode: WorkflowNode = {
        id: task.taskReferenceName,
        type: 'loopNode',
        data: {
            label: task.name,
            taskReferenceName: task.taskReferenceName,
            taskType: task.type,
            task: task,
            layoutDirection: direction,
        },
        position: { x: 0, y: 0 },
        sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
        targetPosition: direction === 'LR' ? Position.Left : Position.Top,
    };

    localTaskMap[task.taskReferenceName] = task;

    // 将循环体中的任务也添加到 taskMap，但不创建节点
    // 这样点击循环节点时可以显示循环体的详细信息
    const loopOver = task.loopOver || [];
    loopOver.forEach(loopTask => {
        localTaskMap[loopTask.taskReferenceName] = loopTask;
    });

    return {
        nodes: [loopNode],
        edges: [],
        taskMap: localTaskMap,
        nextId: startId + 1
    };
}

/**
 * 解析 SUB_WORKFLOW 任务
 */
function parseSubWorkflowTask(task: TaskDef, startId: number, _taskMap: Record<string, TaskDef>, direction: LayoutDirection = 'TB'): ParserResult {
    const node: WorkflowNode = {
        id: task.taskReferenceName,
        type: 'subWorkflowNode',
        data: {
            label: task.name,
            taskReferenceName: task.taskReferenceName,
            taskType: task.type,
            task: task,
            layoutDirection: direction,
        },
        position: { x: 0, y: 0 },
        sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
        targetPosition: direction === 'LR' ? Position.Left : Position.Top,
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
function parseJoinTask(task: TaskDef, startId: number, taskMap: Record<string, TaskDef>, direction: LayoutDirection = 'TB', allTasks: TaskDef[] = [], hideEmptyBranches = false): ParserResult {
    const node: WorkflowNode = {
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
        sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
        targetPosition: direction === 'LR' ? Position.Left : Position.Top,
    };

    const localTaskMap = {
        [task.taskReferenceName]: task
    };

    const nodes: WorkflowNode[] = [];
    const edges: Edge[] = [];
    const joinOn = task.joinOn || [];

    // 处理显式连接 (joinOn)
    joinOn.forEach(sourceRef => {
        // 寻找该引用对应的任务
        const sourceTask = allTasks.find(t => t.taskReferenceName === sourceRef) || taskMap[sourceRef];
        if (sourceTask) {
            const lastNodeIds = getLastNodeIds(sourceTask, hideEmptyBranches);
            lastNodeIds.forEach(lastNodeId => {
                edges.push({
                    id: `e-${lastNodeId}-${task.taskReferenceName}`,
                    source: lastNodeId,
                    target: task.taskReferenceName,
                    animated: true
                });
            });
        }
    });

    // 处理特殊情况：如果 joinOn 为空且前一个任务是 FORK_JOIN_DYNAMIC
    // 或者需要补齐空分支的连接
    const taskIdx = allTasks.findIndex(t => t.taskReferenceName === task.taskReferenceName);
    if (taskIdx > 0) {
        const prevTask = allTasks[taskIdx - 1];
        if (prevTask.type === 'FORK_JOIN_DYNAMIC') {
            const placeholderId = `${prevTask.taskReferenceName}_dynamic_placeholder`;
            edges.push({
                id: `e-${placeholderId}-${task.taskReferenceName}-dynamic`,
                source: placeholderId,
                target: task.taskReferenceName,
                animated: true,
                style: {
                    stroke: '#10b981',
                    strokeWidth: 2,
                    strokeDasharray: '5,5',
                    opacity: 0.8
                }
            });
        } else if (prevTask.type === 'FORK_JOIN') {
            // 对于静态 Fork，如果分支中有空分支（即 joinOn 没涵盖的部分），需要处理
            const forkTasks = prevTask.forkTasks || [];
            forkTasks.forEach((branch, idx) => {
                if (!branch || branch.length === 0) {
                    if (!hideEmptyBranches) {
                        // 编辑模式：创建占位节点
                        const placeholderId = `${prevTask.taskReferenceName}_empty_branch_${idx}`;
                        nodes.push({
                            id: placeholderId,
                            type: 'default',
                            data: {
                                label: `分支 ${idx + 1} (空)`,
                                layoutDirection: direction,
                                taskReferenceName: placeholderId,
                                taskType: 'EMPTY_BRANCH',
                            },
                            position: { x: 0, y: 0 },
                            sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
                            targetPosition: direction === 'LR' ? Position.Left : Position.Top,
                            style: {
                                background: 'transparent',
                                border: '2px dashed var(--border-secondary, #64748b)',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                fontSize: '11px',
                                color: 'var(--text-tertiary, #94a3b8)',
                                minWidth: '80px',
                                textAlign: 'center',
                            } as React.CSSProperties,
                        });
                        edges.push({
                            id: `e-${prevTask.taskReferenceName}-${placeholderId}`,
                            source: prevTask.taskReferenceName,
                            sourceHandle: `branch_${idx}`,
                            target: placeholderId,
                            label: `分支 ${idx + 1}`,
                            animated: true,
                            data: { forkIndex: idx },
                            style: { stroke: '#10b981', strokeDasharray: '5,5' },
                        });
                        edges.push({
                            id: `e-${placeholderId}-${task.taskReferenceName}`,
                            source: placeholderId,
                            target: task.taskReferenceName,
                            animated: true,
                            style: { strokeDasharray: '5,5' },
                        });
                    }
                    // hideEmptyBranches=true: 不创建任何边或节点
                }
            });
        }
    }

    return {
        nodes: [node, ...nodes],
        edges,
        taskMap: localTaskMap,
        nextId: startId + 1
    };
}

/**
 * 解析分支（用于 DECISION、FORK_JOIN 等的子任务）
 */
function parseBranch(tasks: TaskDef[], startId: number, parentTaskMap: Record<string, TaskDef>, direction: LayoutDirection = 'TB'): ParserResult {
    const nodes: WorkflowNode[] = [];
    const edges: Edge[] = [];
    let nextId = startId;
    const localTaskMap: Record<string, TaskDef> = {};

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        // 传递包含已解析同级任务和上层任务的完整 map
        const currentTaskMap = { ...parentTaskMap, ...localTaskMap };
        const result = parseTask(task, nextId, currentTaskMap, direction, tasks);

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
function connectTasks(fromTask: TaskDef, toTask: TaskDef, edges: Edge[], hideEmptyBranches = false) {
    // 并行任务的输出由分支 and JOIN 逻辑控制，不产生直接的顺序连线
    if (fromTask.type === 'FORK_JOIN' || fromTask.type === 'FORK_JOIN_DYNAMIC') {
        return;
    }

    const fromIds = getLastNodeIds(fromTask, hideEmptyBranches);
    const toId = toTask.taskReferenceName;

    fromIds.forEach(fromId => {
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
    });
}

/**
 * 获取任务的最后一个节点 ID
 * 对于有 JOIN 节点的任务（DECISION, FORK_JOIN），返回 JOIN 节点 ID
 */
function getLastNodeIds(task: TaskDef, hideEmptyBranches = false): string[] {
    const taskType = task.type || 'SIMPLE';

    if (taskType === 'DECISION' || taskType === 'SWITCH') {
        const exits: string[] = [];
        const decisionCases = task.decisionCases || {};
        const defaultCase = task.defaultCase || [];

        // 各 case 分支
        Object.entries(decisionCases).forEach(([caseKey, caseTasks]) => {
            if (caseTasks && caseTasks.length > 0) {
                const lastTask = caseTasks[caseTasks.length - 1];
                exits.push(...getLastNodeIds(lastTask, hideEmptyBranches));
            } else if (!hideEmptyBranches) {
                exits.push(`${task.taskReferenceName}_empty_${caseKey}`);
            }
        });

        // default 分支
        if (defaultCase.length > 0) {
            const lastTask = defaultCase[defaultCase.length - 1];
            exits.push(...getLastNodeIds(lastTask, hideEmptyBranches));
        } else if (!hideEmptyBranches) {
            exits.push(`${task.taskReferenceName}_empty_default`);
        }

        // 如果所有分支都为空（hide 模式），fallback 到 SWITCH 节点自身
        return exits.length > 0 ? exits : [task.taskReferenceName];
    }

    return [task.taskReferenceName];
}

/**
 * 别名，兼容旧代码
 */
export const parseWorkflow = parseConductorWorkflow;
