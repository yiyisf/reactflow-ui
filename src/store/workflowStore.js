import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import { parseWorkflow } from '../parser/conductorParser';
import { getLayoutedElements } from '../layout/autoLayout';
import { removeTaskFromDef, insertTaskAfter, findTaskByRef, insertFirstTaskIntoBranch } from '../parser/conductorGenerator';

const useWorkflowStore = create((set, get) => ({
    mode: 'view',
    workflowDef: null,
    nodes: [],
    edges: [],
    taskMap: {},
    layoutDirection: 'TB',
    selectedTask: null,
    executionData: null,

    // 初始化或更新工作流并执行布局
    setWorkflow: (workflowJson, direction) => {
        const dir = direction || get().layoutDirection;
        const { nodes, edges, taskMap } = parseWorkflow(workflowJson, dir);
        const layoutedNodes = getLayoutedElements(nodes, edges, { direction: dir });

        set({
            workflowDef: JSON.parse(JSON.stringify(workflowJson)), // 深拷贝
            nodes: layoutedNodes,
            edges,
            taskMap,
            layoutDirection: dir,
            selectedTask: null
        });
    },

    setMode: (mode) => set({ mode }),

    setLayoutDirection: (direction) => {
        const { workflowDef } = get();
        if (workflowDef) {
            const { nodes, edges, taskMap } = parseWorkflow(workflowDef, direction);
            const layoutedNodes = getLayoutedElements(nodes, edges, { direction });
            set({ nodes: layoutedNodes, edges, taskMap, layoutDirection: direction });
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
        const layoutedNodes = getLayoutedElements(get().nodes, updatedEdges, { direction: layoutDirection });
        set({ edges: updatedEdges, nodes: layoutedNodes });
    },

    setSelectedTask: (task) => set({ selectedTask: task }),

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

        // 如果插入的是复杂节点，初始化基本结构
        if (newTask.type === 'DECISION') {
            newTask.caseValueParam = 'case_param';
            newTask.decisionCases = { "case1": [] };
            newTask.defaultCase = [];
        } else if (newTask.type === 'FORK_JOIN') {
            newTask.forkTasks = [[], []];
        } else if (newTask.type === 'DO_WHILE') {
            newTask.loopCondition = "$.taskReferenceName.output.value < 10";
            newTask.loopOver = [];
        } else if (newTask.type === 'HTTP') {
            newTask.inputParameters = {
                http_request: {
                    method: 'GET',
                    url: 'http://localhost:8080/api', // Conductor supports both api and url depending on version, keeping it compatible
                    headers: { "Content-Type": "application/json" }
                }
            };
        } else if (newTask.type === 'LAMBDA') {
            newTask.inputParameters = {
                scriptExpression: "if ($.input.value > 10) { return true; } else { return false; }"
            };
        }

        // 更新 JSON 定义
        // 如果 edgeData 中包含分支信息，说明是在空分支连线上点击的
        if (edgeData.branchCase !== undefined || edgeData.forkIndex !== undefined) {
            insertFirstTaskIntoBranch(newDef.tasks, sourceId, edgeData, newTask);
        } else {
            insertTaskAfter(newDef.tasks, sourceId, newTask);
        }

        // 重新解析整个工作流以确保所有内部连接正确
        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
        const layoutedNodes = getLayoutedElements(nodes, edges, { direction: layoutDirection });

        set({
            workflowDef: newDef,
            nodes: layoutedNodes,
            edges,
            taskMap
        });
    },

    // 删除节点，同步更新 workflowDef
    removeNode: (nodeId) => {
        const { workflowDef, layoutDirection } = get();
        if (nodeId === 'start' || nodeId === 'end') return;

        const newDef = JSON.parse(JSON.stringify(workflowDef));
        removeTaskFromDef(newDef.tasks, nodeId);

        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
        const layoutedNodes = getLayoutedElements(nodes, edges, { direction: layoutDirection });

        set({
            workflowDef: newDef,
            nodes: layoutedNodes,
            edges,
            taskMap
        });
    },

    // --- Phase 2: 复杂节点操作 ---

    // 添加 Loop 任务
    addLoopTask: (loopRef, taskType = 'SIMPLE') => {
        const { workflowDef, layoutDirection } = get();
        const newDef = JSON.parse(JSON.stringify(workflowDef));

        const task = findTaskByRef(newDef.tasks, loopRef);
        if (task && task.type === 'DO_WHILE') {
            if (!task.loopOver) task.loopOver = [];

            const timestamp = Date.now();
            const newTask = {
                name: `新循环任务_${timestamp.toString().slice(-4)}`,
                taskReferenceName: `loop_task_${timestamp}`,
                type: taskType,
                inputParameters: {}
            };

            // 初始化复杂任务结构
            if (taskType === 'DECISION' || taskType === 'SWITCH') {
                newTask.caseValueParam = 'case_param';
                newTask.decisionCases = { "case1": [] };
                newTask.defaultCase = [];
            } else if (taskType === 'FORK_JOIN') {
                newTask.forkTasks = [[], []];
            } else if (taskType === 'DO_WHILE') {
                newTask.loopCondition = "true";
                newTask.loopOver = [];
            } else if (taskType === 'HTTP') {
                newTask.inputParameters = {
                    http_request: {
                        method: 'GET',
                        url: 'http://localhost:8080/api',
                        headers: { "Content-Type": "application/json" }
                    }
                };
            } else if (taskType === 'LAMBDA') {
                newTask.inputParameters = {
                    scriptExpression: "if ($.input.value > 10) { return true; } else { return false; }"
                };
            }

            task.loopOver.push(newTask);

            const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
            const layoutedNodes = getLayoutedElements(nodes, edges, { direction: layoutDirection });

            set({
                workflowDef: newDef,
                nodes: layoutedNodes,
                edges,
                taskMap
            });
        }
    },

    // 检查任务引用名是否唯一
    checkTaskRefUniqueness: (refName, excludeRef) => {
        const { taskMap } = get();
        if (!refName) return false;
        if (excludeRef && refName === excludeRef) return true;
        return !taskMap[refName];
    },

    // 更新任务
    updateTask: (taskRef, updates) => {
        const { workflowDef, layoutDirection } = get();
        const newDef = JSON.parse(JSON.stringify(workflowDef));

        // 如果修改了 taskReferenceName，需要检查唯一性
        if (updates.taskReferenceName && updates.taskReferenceName !== taskRef) {
            if (!get().checkTaskRefUniqueness(updates.taskReferenceName)) {
                console.warn(`Duplicate taskReferenceName: ${updates.taskReferenceName}`);
                return false;
            }
        }

        // 递归更新任务
        const updateInTasks = (tasks) => {
            for (let i = 0; i < tasks.length; i++) {
                if (tasks[i].taskReferenceName === taskRef) {
                    tasks[i] = { ...tasks[i], ...updates };
                    return true;
                }

                // 递归处理子任务
                if (tasks[i].decisionCases) {
                    for (const key of Object.keys(tasks[i].decisionCases)) {
                        if (updateInTasks(tasks[i].decisionCases[key])) return true;
                    }
                    if (tasks[i].defaultCase && updateInTasks(tasks[i].defaultCase)) return true;
                }
                if (tasks[i].forkTasks) {
                    for (const branch of tasks[i].forkTasks) {
                        if (updateInTasks(branch)) return true;
                    }
                }
                if (tasks[i].loopOver && updateInTasks(tasks[i].loopOver)) return true;
            }
            return false;
        };

        if (updateInTasks(newDef.tasks)) {
            // 重新解析以同步状态
            const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
            const layoutedNodes = getLayoutedElements(nodes, edges, { direction: layoutDirection });

            set({
                workflowDef: newDef,
                nodes: layoutedNodes,
                edges,
                taskMap,
                selectedTask: taskMap[updates.taskReferenceName || taskRef]
            });
            return true;
        }
        return false;
    },

    // 删除 Loop 任务
    removeLoopTask: (loopRef, taskRef) => {
        const { workflowDef, layoutDirection } = get();
        const newDef = JSON.parse(JSON.stringify(workflowDef));

        const task = findTaskByRef(newDef.tasks, loopRef);
        if (task && task.type === 'DO_WHILE' && task.loopOver) {
            task.loopOver = task.loopOver.filter(t => t.taskReferenceName !== taskRef);

            const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
            const layoutedNodes = getLayoutedElements(nodes, edges, { direction: layoutDirection });

            set({
                workflowDef: newDef,
                nodes: layoutedNodes,
                edges,
                taskMap
            });
        }
    },

    // 添加 Decision 分支
    addDecisionBranch: (taskRef, caseName) => {
        const { workflowDef, layoutDirection } = get();
        const newDef = JSON.parse(JSON.stringify(workflowDef));

        const task = findTaskByRef(newDef.tasks, taskRef);
        if (task && (task.type === 'DECISION' || task.type === 'SWITCH')) {
            if (!task.decisionCases) task.decisionCases = {};
            if (!task.decisionCases[caseName]) {
                task.decisionCases[caseName] = [];

                const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
                const layoutedNodes = getLayoutedElements(nodes, edges, { direction: layoutDirection });

                set({
                    workflowDef: newDef,
                    nodes: layoutedNodes,
                    edges,
                    taskMap
                });
            }
        }
    },

    // 删除 Decision 分支
    removeDecisionBranch: (taskRef, caseName) => {
        const { workflowDef, layoutDirection } = get();
        const newDef = JSON.parse(JSON.stringify(workflowDef));

        const task = findTaskByRef(newDef.tasks, taskRef);
        if (task && task.decisionCases && task.decisionCases[caseName]) {
            delete task.decisionCases[caseName];

            const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
            const layoutedNodes = getLayoutedElements(nodes, edges, { direction: layoutDirection });

            set({
                workflowDef: newDef,
                nodes: layoutedNodes,
                edges,
                taskMap
            });
        }
    },

    // 添加 Fork 分支
    addForkBranch: (taskRef) => {
        const { workflowDef, layoutDirection } = get();
        const newDef = JSON.parse(JSON.stringify(workflowDef));

        const task = findTaskByRef(newDef.tasks, taskRef);
        if (task && task.type === 'FORK_JOIN') {
            if (!task.forkTasks) task.forkTasks = [];
            task.forkTasks.push([]);

            const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
            const layoutedNodes = getLayoutedElements(nodes, edges, { direction: layoutDirection });
            set({
                workflowDef: newDef,
                nodes: layoutedNodes,
                edges,
                taskMap
            });
        }
    },

    // 更新整个工作流的全局属性（名称、版本、描述、输入/输出参数等）
    updateWorkflowProperties: (updates) => {
        const { workflowDef } = get();
        if (!workflowDef) return;

        const newDef = { ...workflowDef, ...updates };
        set({ workflowDef: newDef });
    }
}));

export default useWorkflowStore;
