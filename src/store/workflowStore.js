import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import { parseWorkflow } from '../parser/conductorParser';
import { getLayoutedElements } from '../layout/autoLayout';
import { removeTaskFromDef, insertTaskAfter, findTaskByRef, insertFirstTaskIntoBranch, syncForkJoinOn } from '../parser/conductorGenerator';
import { validateWorkflow } from '../utils/validator';

const useWorkflowStore = create((set, get) => ({
    mode: 'view',
    workflowDef: null,
    nodes: [],
    edges: [],
    taskMap: {},
    layoutDirection: 'TB',
    selectedTask: null,
    executionData: null,
    validationResults: { isValid: true, errors: [], warnings: [] },

    // 初始化或更新工作流并执行布局
    setWorkflow: (workflowJson, direction) => {
        const dir = direction || get().layoutDirection;
        const workflowWithSync = JSON.parse(JSON.stringify(workflowJson));
        syncForkJoinOn(workflowWithSync.tasks);

        const { nodes, edges, taskMap } = parseWorkflow(workflowWithSync, dir);
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: dir });
        const validationResults = validateWorkflow(workflowWithSync);

        set({
            workflowDef: workflowWithSync,
            nodes: layoutedNodes,
            edges: layoutedEdges,
            taskMap,
            layoutDirection: dir,
            selectedTask: null,
            validationResults
        });
    },

    setMode: (mode) => set({ mode }),

    setLayoutDirection: (direction) => {
        const { workflowDef } = get();
        if (workflowDef) {
            const { nodes, edges, taskMap } = parseWorkflow(workflowDef, direction);
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction });
            set({ nodes: layoutedNodes, edges: layoutedEdges, taskMap, layoutDirection: direction });
        } else {
            set({ layoutDirection: direction });
        }
    },

    onNodesChange: (changes) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
        });
    },

    onEdgesChange: (changes) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
    },

    onConnect: (connection) => {
        const { edges, layoutDirection } = get();
        const updatedEdges = addEdge(connection, edges);
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(get().nodes, updatedEdges, { direction: layoutDirection });
        set({ edges: layoutedEdges, nodes: layoutedNodes });
    },

    setSelectedTask: (task) => set({ selectedTask: task }),

    // 检查任务引用名是否唯一
    checkTaskRefUniqueness: (newRef, currentRef) => {
        if (newRef === currentRef) return true;
        const { taskMap } = get();
        return !taskMap[newRef];
    },

    // 更新任务属性，同步更新 workflowDef
    updateTask: (taskRef, field, value) => {
        const { workflowDef, layoutDirection } = get();
        const newDef = JSON.parse(JSON.stringify(workflowDef));

        const task = findTaskByRef(newDef.tasks, taskRef);
        if (task) {
            if (typeof field === 'object') {
                Object.assign(task, field);
            } else {
                task[field] = value;
            }

            syncForkJoinOn(newDef.tasks);

            const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection });
            const validationResults = validateWorkflow(newDef);

            set({
                workflowDef: newDef,
                nodes: layoutedNodes,
                edges: layoutedEdges,
                taskMap,
                validationResults
            });
        }
    },

    // 添加任务，同步更新 workflowDef
    addNode: (newNode, sourceId, targetId, edgeId, edgeData = {}) => {
        const { workflowDef, layoutDirection } = get();
        const newDef = JSON.parse(JSON.stringify(workflowDef));

        // 创建 Conductor 格式的任务
        const newTask = {
            name: newNode.data.label,
            taskReferenceName: newNode.data.taskReferenceName,
            type: newNode.data.taskType || 'SIMPLE',
            inputParameters: {}
        };

        // 如果插入的是并行节点，需要联动创建 JOIN 节点
        if (newTask.type === 'FORK_JOIN' || newTask.type === 'FORK_JOIN_DYNAMIC') {
            if (newTask.type === 'FORK_JOIN') {
                newTask.forkTasks = [[], []];
            } else {
                newTask.dynamicForkTasksParam = 'dynamic_tasks';
                newTask.dynamicForkTasksInputParamName = 'input';
            }

            const joinTask = {
                name: `${newTask.name}_join`,
                taskReferenceName: `${newTask.taskReferenceName}_join`,
                type: 'JOIN',
                joinOn: [] // 初始为空，由子任务添加后同步
            };

            // 更新 JSON 定义
            if (edgeData.branchCase !== undefined || edgeData.forkIndex !== undefined) {
                insertFirstTaskIntoBranch(newDef.tasks, sourceId, edgeData, newTask);
                insertTaskAfter(newDef.tasks, newTask.taskReferenceName, joinTask);
            } else {
                insertTaskAfter(newDef.tasks, sourceId, newTask);
                insertTaskAfter(newDef.tasks, newTask.taskReferenceName, joinTask);
            }
        } else {
            // 普通节点插入
            if (newTask.type === 'DECISION') {
                newTask.caseValueParam = 'case_param';
                newTask.decisionCases = { "case1": [] };
                newTask.defaultCase = [];
            } else if (newTask.type === 'DO_WHILE') {
                newTask.loopCondition = "$.taskReferenceName.output.value < 10";
                newTask.loopOver = [];
            } else if (newTask.type === 'HTTP') {
                newTask.inputParameters = {
                    http_request: {
                        method: 'GET',
                        url: 'http://localhost:8080/api',
                        headers: { "Content-Type": "application/json" }
                    }
                };
            } else if (newTask.type === 'LAMBDA') {
                newTask.inputParameters = {
                    scriptExpression: "if ($.input.value > 10) { return true; } else { return false; }"
                };
            }

            if (edgeData.branchCase !== undefined || edgeData.forkIndex !== undefined) {
                insertFirstTaskIntoBranch(newDef.tasks, sourceId, edgeData, newTask);
            } else {
                insertTaskAfter(newDef.tasks, sourceId, newTask);
            }
        }

        syncForkJoinOn(newDef.tasks);

        // 重新解析整个工作流以确保所有内部连接正确
        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection });
        const validationResults = validateWorkflow(newDef);

        set({
            workflowDef: newDef,
            nodes: layoutedNodes,
            edges: layoutedEdges,
            taskMap,
            validationResults
        });
    },

    // 删除节点，同步更新 workflowDef
    removeNode: (nodeId) => {
        const { workflowDef, layoutDirection } = get();
        if (nodeId === 'start' || nodeId === 'end') return;

        const newDef = JSON.parse(JSON.stringify(workflowDef));
        removeTaskFromDef(newDef.tasks, nodeId);

        syncForkJoinOn(newDef.tasks);

        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection });
        const validationResults = validateWorkflow(newDef);

        set({
            workflowDef: newDef,
            nodes: layoutedNodes,
            edges: layoutedEdges,
            taskMap,
            validationResults
        });
    },

    // 快捷方式：为循环添加任务
    addLoopTask: (loopRef, task) => {
        const { workflowDef, layoutDirection } = get();
        const newDef = JSON.parse(JSON.stringify(workflowDef));

        const loopTask = findTaskByRef(newDef.tasks, loopRef);
        if (loopTask && loopTask.type === 'DO_WHILE') {
            if (!loopTask.loopOver) loopTask.loopOver = [];
            loopTask.loopOver.push(task);

            syncForkJoinOn(newDef.tasks);

            const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection });
            const validationResults = validateWorkflow(newDef);

            set({
                workflowDef: newDef,
                nodes: layoutedNodes,
                edges: layoutedEdges,
                taskMap,
                validationResults
            });
        }
    },

    // 快捷方式：删除循环内的任务
    removeLoopTask: (loopRef, taskRef) => {
        const { workflowDef, layoutDirection } = get();
        const newDef = JSON.parse(JSON.stringify(workflowDef));

        const loopTask = findTaskByRef(newDef.tasks, loopRef);
        if (loopTask && loopTask.type === 'DO_WHILE' && loopTask.loopOver) {
            loopTask.loopOver = loopTask.loopOver.filter(t => t.taskReferenceName !== taskRef);

            syncForkJoinOn(newDef.tasks);

            const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection });
            const validationResults = validateWorkflow(newDef);

            set({
                workflowDef: newDef,
                nodes: layoutedNodes,
                edges: layoutedEdges,
                taskMap,
                validationResults
            });
        }
    },

    // 添加决策分支
    addDecisionBranch: (taskRef, caseName) => {
        const { workflowDef, layoutDirection } = get();
        const newDef = JSON.parse(JSON.stringify(workflowDef));

        const task = findTaskByRef(newDef.tasks, taskRef);
        if (task && (task.type === 'DECISION' || task.type === 'SWITCH')) {
            if (caseName === 'default') {
                if (!task.defaultCase) task.defaultCase = [];
            } else {
                if (!task.decisionCases) task.decisionCases = {};
                if (!task.decisionCases[caseName]) {
                    task.decisionCases[caseName] = [];
                }
            }

            syncForkJoinOn(newDef.tasks);

            const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection });
            const validationResults = validateWorkflow(newDef);

            set({
                workflowDef: newDef,
                nodes: layoutedNodes,
                edges: layoutedEdges,
                taskMap,
                validationResults
            });
        }
    },

    // 删除决策分支
    removeDecisionBranch: (taskRef, caseName) => {
        const { workflowDef, layoutDirection } = get();
        const newDef = JSON.parse(JSON.stringify(workflowDef));

        const task = findTaskByRef(newDef.tasks, taskRef);
        if (task && (task.type === 'DECISION' || task.type === 'SWITCH')) {
            if (caseName === 'default') {
                task.defaultCase = [];
            } else if (task.decisionCases) {
                delete task.decisionCases[caseName];
            }

            syncForkJoinOn(newDef.tasks);

            const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection });
            const validationResults = validateWorkflow(newDef);

            set({
                workflowDef: newDef,
                nodes: layoutedNodes,
                edges: layoutedEdges,
                taskMap,
                validationResults
            });
        }
    },

    // 添加并行分支
    addForkBranch: (taskRef) => {
        const { workflowDef, layoutDirection } = get();
        const newDef = JSON.parse(JSON.stringify(workflowDef));

        const task = findTaskByRef(newDef.tasks, taskRef);
        if (task && task.type === 'FORK_JOIN') {
            if (!task.forkTasks) task.forkTasks = [];
            task.forkTasks.push([]);

            syncForkJoinOn(newDef.tasks);

            const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection });
            const validationResults = validateWorkflow(newDef);

            set({
                workflowDef: newDef,
                nodes: layoutedNodes,
                edges: layoutedEdges,
                taskMap,
                validationResults
            });
        }
    },
}));

export default useWorkflowStore;
