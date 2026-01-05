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
    ThemeColor,
    ExecutionStatus,
    TaskExecutionData
} from '../types/workflow';
import { WorkflowDef, TaskDef } from '../types/conductor';

const useWorkflowStore = create<WorkflowStore>()(
    persist(
        temporal(
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

                setMode: (mode: EditorMode) => {
                    const currentMode = get().mode;
                    // 如果从运行模式退出，清空执行数据
                    if (currentMode === 'run' && mode !== 'run') {
                        set({ executionData: null });
                    }
                    set({ mode });
                },

                setExecutionData: (data: Record<string, TaskExecutionData> | null) => set({ executionData: data }),

                updateTaskStatus: (taskRef: string, status: ExecutionStatus) => {
                    const { executionData } = get();
                    if (!executionData) return;

                    const newData = { ...executionData };
                    if (newData[taskRef]) {
                        newData[taskRef] = { ...newData[taskRef], status };
                        set({ executionData: newData });
                    }
                },

                simulateExecution: () => {
                    const { taskMap, workflowDef } = get();
                    if (!workflowDef) return;

                    // 创建初始模拟数据
                    const simulationData: Record<string, TaskExecutionData> = {};
                    const refs = Object.keys(taskMap);

                    // 1. 设置一些已完成的任务
                    const completedCount = Math.floor(refs.length * 0.4);
                    for (let i = 0; i < completedCount; i++) {
                        simulationData[refs[i]] = {
                            taskId: `sim_${refs[i]}`,
                            taskReferenceName: refs[i],
                            status: 'COMPLETED',
                            startTime: Date.now() - 10000,
                            endTime: Date.now() - 5000
                        };
                    }

                    // 2. 设置一个正在执行的任务
                    if (refs.length > completedCount) {
                        const runningRef = refs[completedCount];
                        simulationData[runningRef] = {
                            taskId: `sim_${runningRef}`,
                            taskReferenceName: runningRef,
                            status: 'IN_PROGRESS',
                            startTime: Date.now() - 2000
                        };
                    }

                    // 3. 设置一个失败的任务（可选）
                    if (refs.length > completedCount + 2) {
                        const failedRef = refs[completedCount + 1];
                        simulationData[failedRef] = {
                            taskId: `sim_${failedRef}`,
                            taskReferenceName: failedRef,
                            status: 'FAILED',
                            startTime: Date.now() - 5000,
                            endTime: Date.now() - 4000
                        };
                    }

                    // 4. 其余设为 SCHEDULED
                    refs.forEach(ref => {
                        if (!simulationData[ref]) {
                            simulationData[ref] = {
                                taskId: `sim_${ref}`,
                                taskReferenceName: ref,
                                status: 'SCHEDULED'
                            };
                        }
                    });

                    set({ executionData: simulationData, mode: 'run' });
                },

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
                    const newNodes = applyNodeChanges(changes, get().nodes);
                    // 仅当节点真的发生变化时才更新，减少噪音
                    if (JSON.stringify(newNodes) !== JSON.stringify(get().nodes)) {
                        set({ nodes: newNodes });
                    }
                },

                onEdgesChange: (changes: EdgeChange[]) => {
                    const newEdges = applyEdgeChanges(changes, get().edges);
                    if (JSON.stringify(newEdges) !== JSON.stringify(get().edges)) {
                        set({ edges: newEdges });
                    }
                },

                onConnect: (connection: Connection) => {
                    const { edges, layoutDirection } = get();
                    const updatedEdges = addEdge(connection, edges);
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(get().nodes, updatedEdges, { direction: layoutDirection });
                    set({ edges: layoutedEdges, nodes: layoutedNodes });
                },

                setSelectedTask: (task: TaskDef | null) => set({ selectedTask: task }),

                checkTaskRefUniqueness: (newRef: string, currentRef: string) => {
                    if (newRef === currentRef) return true;
                    const { taskMap } = get();
                    return !taskMap[newRef];
                },

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

                addNode: (newNode: any, sourceId: string, _targetId: string, _edgeId: string, edgeData: any = {}) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    const newTask: TaskDef = {
                        name: newNode.data.label,
                        taskReferenceName: newNode.data.taskReferenceName,
                        type: newNode.data.taskType || 'SIMPLE',
                        inputParameters: {}
                    };

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
                            joinOn: []
                        };
                        if (edgeData.branchCase !== undefined || edgeData.forkIndex !== undefined) {
                            insertFirstTaskIntoBranch(newDef.tasks, sourceId, edgeData, newTask);
                            insertTaskAfter(newDef.tasks, newTask.taskReferenceName, joinTask);
                        } else {
                            insertTaskAfter(newDef.tasks, sourceId, newTask);
                            insertTaskAfter(newDef.tasks, newTask.taskReferenceName, joinTask);
                        }
                    } else {
                        if (newTask.type === 'DECISION') {
                            newTask.caseValueParam = 'case_param';
                            newTask.decisionCases = { "case1": [] };
                            newTask.defaultCase = [];
                        } else if (newTask.type === 'DO_WHILE') {
                            newTask.loopCondition = "$.taskReferenceName.output.value < 10";
                            newTask.loopOver = [];
                        }

                        if (edgeData.branchCase !== undefined || edgeData.forkIndex !== undefined) {
                            insertFirstTaskIntoBranch(newDef.tasks, sourceId, edgeData, newTask);
                        } else {
                            insertTaskAfter(newDef.tasks, sourceId, newTask);
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
                },

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
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap });
                    }
                },

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
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap });
                    }
                },

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
                            if (!task.decisionCases[caseName]) task.decisionCases[caseName] = [];
                        }
                        syncForkJoinOn(newDef.tasks);
                        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection);
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection });
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap });
                    }
                },

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
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap });
                    }
                },

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
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap });
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
                        if (t.decisionCases) Object.values(t.decisionCases).forEach(branch => branch.forEach(deepRename));
                        if (t.defaultCase) t.defaultCase.forEach(deepRename);
                        if (t.forkTasks) t.forkTasks.forEach(branch => branch.forEach(deepRename));
                        if (t.loopOver) t.loopOver.forEach(deepRename);
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
                limit: 50,
                // 只记录业务定义相关的状态，过滤掉运行时的 UI 状态（如 selected, dragging）
                // 重点：排除 width 和 height，因为它们在 undo 时会重新测量，可能导致 zundo 误判为新状态
                partialize: (state: WorkflowStore) => ({
                    workflowDef: state.workflowDef,
                    layoutDirection: state.layoutDirection,
                    nodes: state.nodes.map(n => {
                        const {
                            selected,
                            dragging,
                            width,
                            height,
                            draggingHandle,
                            // @ts-ignore
                            measured,
                            ...rest
                        } = n as any;
                        return {
                            ...rest,
                            data: {
                                ...rest.data,
                                layoutDirection: rest.data.layoutDirection || state.layoutDirection
                            }
                        };
                    }),
                    edges: state.edges,
                    taskMap: state.taskMap,
                }),
                // 等值检查：只有当核心业务结构变化时才记录
                equality: (a, b) => JSON.stringify(a) === JSON.stringify(b)
            }
        ),
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
    )
);

export default useWorkflowStore;
