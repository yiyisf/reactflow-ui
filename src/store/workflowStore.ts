import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { temporal } from 'zundo';
import { addEdge, applyNodeChanges, applyEdgeChanges, Connection, EdgeChange, NodeChange } from 'reactflow';
import { parseWorkflow } from '../parser/conductorParser';
import { getLayoutedElements } from '../layout/autoLayout';
import { removeTaskFromDef, insertTaskAfter, findTaskByRef, insertFirstTaskIntoBranch, syncForkJoinOn } from '../parser/conductorGenerator';
import { validateWorkflow } from '../utils/validator';
import {
    WorkflowStore,
    LayoutDirection,
    EditorMode,
    ThemeMode,
    ThemeColor
} from '../types/workflow';
import { WorkflowDef, TaskDef } from '../types/conductor';

const useWorkflowStore = create<WorkflowStore>()(
    temporal(
        persist(
            (set, get) => ({
                mode: 'view',
                workflowDef: null as WorkflowDef | null,
                nodes: [],
                edges: [],
                taskMap: {},
                layoutDirection: 'TB',
                selectedTask: null as TaskDef | null,
                executionData: null,
                validationResults: { isValid: true, errors: [], warnings: [] },

                // 用户喜好配置
                theme: 'dark' as ThemeMode,
                themeColor: 'blue' as ThemeColor,
                edgeType: 'default',
                nodesLocked: true,

                // 初始化或更新工作流并执行布局
                setWorkflow: (workflowJson: any, direction?: LayoutDirection) => {
                    const dir = direction || get().layoutDirection;
                    const workflowWithSync = JSON.parse(JSON.stringify(workflowJson)) as WorkflowDef;
                    syncForkJoinOn(workflowWithSync.tasks);

                    const { nodes, edges, taskMap } = parseWorkflow(workflowWithSync, dir);
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: dir });
                    const validationResults = validateWorkflow(workflowWithSync);

                    set({
                        workflowDef: workflowWithSync,
                        nodes: layoutedNodes,
                        edges: layoutedEdges,
                        taskMap,
                        validationResults,
                        layoutDirection: dir
                    });
                },

                setMode: (mode: EditorMode) => set({ mode }),

                setLayoutDirection: (direction: LayoutDirection) => {
                    const { workflowDef } = get();
                    if (workflowDef) {
                        const { nodes, edges, taskMap } = parseWorkflow(workflowDef, direction);
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction });
                        set({ nodes: layoutedNodes, edges: layoutedEdges, taskMap, layoutDirection: direction });
                    } else {
                        set({ layoutDirection: direction });
                    }
                },

                onNodesChange: (changes: NodeChange[]) => {
                    set({
                        nodes: applyNodeChanges(changes, get().nodes),
                    });
                },

                onEdgesChange: (changes: EdgeChange[]) => {
                    set({
                        edges: applyEdgeChanges(changes, get().edges),
                    });
                },

                onConnect: (connection: Connection) => {
                    const { edges, layoutDirection } = get();
                    const updatedEdges = addEdge(connection, edges);
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(get().nodes, updatedEdges, { direction: layoutDirection });
                    set({ edges: layoutedEdges, nodes: layoutedNodes });
                },

                setSelectedTask: (task: TaskDef | null) => set({ selectedTask: task }),

                // 检查任务引用名是否唯一
                checkTaskRefUniqueness: (newRef: string, currentRef: string) => {
                    if (newRef === currentRef) return true;
                    const { taskMap } = get();
                    return !taskMap[newRef];
                },

                // 更新任务属性，同步更新 workflowDef
                updateTask: (taskRef: string, field: string | Record<string, any>, value?: any) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    const task = findTaskByRef(newDef.tasks, taskRef);
                    if (task) {
                        if (typeof field === 'object') {
                            Object.assign(task, field);
                        } else {
                            (task as any)[field] = value;
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

                // 更新工作流全局属性
                updateWorkflowProperties: (properties: Partial<WorkflowDef>) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    Object.assign(newDef, properties);

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

                // 添加任务，同步更新 workflowDef
                addNode: (newNode: any, sourceId: string, _targetId: string, _edgeId: string, edgeData: any = {}) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    // 创建 Conductor 格式的任务
                    const newTask: TaskDef = {
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

                        const joinTask: TaskDef = {
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
                removeNode: (nodeId: string) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef || nodeId === 'start' || nodeId === 'end') return;

                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;
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
                addLoopTask: (loopRef: string, taskType: string) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    const loopTask = findTaskByRef(newDef.tasks, loopRef);
                    if (loopTask && loopTask.type === 'DO_WHILE') {
                        if (!loopTask.loopOver) loopTask.loopOver = [];

                        const newTask: TaskDef = {
                            name: `new_${taskType.toLowerCase()}`,
                            taskReferenceName: `${loopRef}_sub_${Date.now()}`,
                            type: taskType as any,
                            inputParameters: {}
                        };

                        loopTask.loopOver.push(newTask);

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
                removeLoopTask: (loopRef: string, taskRef: string) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

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
                addDecisionBranch: (taskRef: string, caseName: string) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

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
                removeDecisionBranch: (taskRef: string, caseName: string) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

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
                addForkBranch: (taskRef: string) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

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

                pasteTask: (task: TaskDef) => {
                    const { workflowDef, layoutDirection, selectedTask } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    const timestamp = Date.now();
                    const suffix = `_copy_${timestamp}`;
                    const newTask = JSON.parse(JSON.stringify(task)) as TaskDef;

                    const deepRename = (t: TaskDef) => {
                        t.taskReferenceName = `${t.taskReferenceName}${suffix}`;
                        if (t.decisionCases) {
                            Object.values(t.decisionCases).forEach(branch => branch.forEach(deepRename));
                        }
                        if (t.defaultCase) {
                            t.defaultCase.forEach(deepRename);
                        }
                        if (t.forkTasks) {
                            t.forkTasks.forEach(branch => branch.forEach(deepRename));
                        }
                        if (t.loopOver) {
                            t.loopOver.forEach(deepRename);
                        }
                    };

                    deepRename(newTask);

                    const sourceRef = selectedTask ? selectedTask.taskReferenceName : (
                        newDef.tasks.length > 0 ? newDef.tasks[newDef.tasks.length - 1].taskReferenceName : 'start'
                    );

                    if (newTask.type === 'FORK_JOIN') {
                        if (!newTask.forkTasks) newTask.forkTasks = [[], []];
                        const joinTask: TaskDef = {
                            name: `${newTask.name}_join`,
                            taskReferenceName: `${newTask.taskReferenceName}_join`,
                            type: 'JOIN',
                            joinOn: []
                        };

                        if (sourceRef === 'start' && newDef.tasks.length === 0) {
                            newDef.tasks.push(newTask, joinTask);
                        } else {
                            insertTaskAfter(newDef.tasks, sourceRef, newTask);
                            insertTaskAfter(newDef.tasks, newTask.taskReferenceName, joinTask);
                        }
                    } else {
                        if (sourceRef === 'start' && newDef.tasks.length === 0) {
                            newDef.tasks.push(newTask);
                        } else {
                            insertTaskAfter(newDef.tasks, sourceRef, newTask);
                        }
                    }

                    syncForkJoinOn(newDef.tasks);

                    const { nodes, edges, taskMap: newTaskMap } = parseWorkflow(newDef, layoutDirection);
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection });
                    const validationResults = validateWorkflow(newDef);

                    set({
                        workflowDef: newDef,
                        nodes: layoutedNodes,
                        edges: layoutedEdges,
                        taskMap: newTaskMap,
                        validationResults,
                    });
                },

                setTheme: (theme: 'dark' | 'light') => set({ theme }),
                setThemeColor: (themeColor: ThemeColor) => set({ themeColor }),
                setEdgeType: (edgeType: string) => set({ edgeType }),
                setNodesLocked: (nodesLocked: boolean) => set({ nodesLocked }),
            }),
            {
                name: 'conductor-ui-prefs',
                storage: createJSONStorage(() => localStorage),
                partialize: (state: WorkflowStore) => ({
                    theme: state.theme,
                    themeColor: state.themeColor,
                    layoutDirection: state.layoutDirection,
                    edgeType: state.edgeType,
                    nodesLocked: state.nodesLocked
                }),
            }
        ),
        {
            limit: 50,
            partialize: (state: WorkflowStore) => ({
                workflowDef: state.workflowDef,
                nodes: state.nodes,
                edges: state.edges,
                taskMap: state.taskMap,
                validationResults: state.validationResults,
            }),
        }
    )
);

export default useWorkflowStore;
