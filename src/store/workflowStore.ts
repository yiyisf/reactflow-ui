import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { temporal } from 'zundo';
import { addEdge, applyNodeChanges, applyEdgeChanges, Connection, EdgeChange, NodeChange } from 'reactflow';
import { parseWorkflow } from '../parser/conductorParser';
import { getLayoutedElements } from '../layout/autoLayout';
import { removeTaskFromDef, insertTaskAfter, findTaskByRef, insertFirstTaskIntoBranch, syncForkJoinOn, findContainerList, findJoinForFork, findForkForJoin } from '../parser/conductorGenerator';
import { validateWorkflow } from '../utils/validator';
import {
    WorkflowStore,
    LayoutDirection,
    EditorMode,
    ThemeMode,
    ThemeColor,
    ExecutionStatus,
    TaskExecutionData,
    ViewMode
} from '../types/workflow';
import { WorkflowDef, TaskDef, WorkflowInstance, TaskInstance } from '../types/conductor';
import { buildExecutionWaves } from '../utils/simulateWorkflow';

const useWorkflowStore = create<WorkflowStore>()(
    persist(
        temporal(
            (set, get) => ({
                mode: 'view',
                workflowDef: null as WorkflowDef | null,
                workflowInstance: null as WorkflowInstance | null,
                nodes: [],
                edges: [],
                taskMap: {},
                layoutDirection: 'TB',
                selectedTask: null as TaskDef | null,
                selectedTaskInstance: null as TaskInstance | null,
                isDetailPanelOpen: false,
                executionData: null,
                dynamicRuntimeTasksByFork: {} as Record<string, TaskInstance[]>,
                validationResults: { isValid: true, errors: [], warnings: [] },

                // 用户喜好配置
                theme: 'dark' as ThemeMode,
                themeColor: 'blue' as ThemeColor,
                edgeType: 'smoothstep',
                nodesLocked: true,
                copiedTask: null as TaskDef | null,
                viewMode: 'standard' as ViewMode,

                // 模拟执行状态
                simState: {} as Record<string, 'idle' | 'running' | 'done'>,
                isSimRunning: false,

                // 工作流加载版本号：每次调用 setWorkflow 时递增，
                // WorkflowDesigner 监听此值以触发 fitView，与 updateTask 等增量操作区分
                workflowLoadKey: 0,

                // 初始化或更新工作流并执行布局
                setWorkflow: (workflowJson: any, direction?: LayoutDirection) => {
                    const dir = direction || get().layoutDirection;
                    const workflowWithSync = JSON.parse(JSON.stringify(workflowJson)) as WorkflowDef;
                    syncForkJoinOn(workflowWithSync.tasks);

                    const { nodes, edges, taskMap } = parseWorkflow(workflowWithSync, dir, { hideEmptyBranches: get().mode !== 'edit' });
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: dir, mode: get().mode });
                    const validationResults = validateWorkflow(workflowWithSync);

                    set({
                        workflowDef: workflowWithSync,
                        nodes: layoutedNodes,
                        edges: layoutedEdges,
                        taskMap,
                        validationResults,
                        layoutDirection: dir,
                        workflowLoadKey: get().workflowLoadKey + 1,
                    });
                },

                setMode: (mode: EditorMode) => {
                    const currentMode = get().mode;
                    // 如果从运行模式退出，清空执行数据
                    if (currentMode === 'run' && mode !== 'run') {
                        set({ executionData: null, workflowInstance: null, dynamicRuntimeTasksByFork: {} });
                    }
                    set({ mode });

                    // 切换模式后重新解析工作流（空分支显示策略依赖 mode）
                    const { workflowDef, layoutDirection } = get();
                    if (workflowDef) {
                        const { nodes, edges, taskMap } = parseWorkflow(workflowDef, layoutDirection, { hideEmptyBranches: mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode });
                        set({ nodes: layoutedNodes, edges: layoutedEdges, taskMap });
                    }
                },

                setExecutionData: (data: Record<string, TaskExecutionData> | null) => set({
                    executionData: data,
                    dynamicRuntimeTasksByFork: data === null ? {} : get().dynamicRuntimeTasksByFork
                }),

                updateTaskStatus: (taskRef: string, status: ExecutionStatus) => {
                    const { executionData } = get();
                    if (!executionData) return;

                    const newData = { ...executionData };
                    if (newData[taskRef]) {
                        newData[taskRef] = { ...newData[taskRef], status };
                        set({ executionData: newData });
                    }
                },

                loadSampleExecution: async () => {
                    try {
                        const response = await fetch('/sample-workflows/sample-execution.json');
                        const data = await response.json();
                        get().importExecutionJSON(data);
                    } catch (err) {
                        console.error('Failed to load sample execution:', err);
                        alert('加载示例运行数据失败');
                    }
                },

                importExecutionJSON: (json: any) => {
                    if (!json) return;

                    // 处理两种情况：
                    // 1. 直传 tasks 数组 (旧兼容模式)
                    // 2. 传完整 Workflow 实例 (Conductor OSS 标准)

                    let tasks: any[] = [];
                    let workflowInstance: WorkflowInstance | null = null;
                    let workflowDef: WorkflowDef | null = get().workflowDef;

                    if (Array.isArray(json.tasks)) {
                        tasks = json.tasks;
                        // 如果是完整实例，提取元数据
                        if (json.workflowId && json.status) {
                            workflowInstance = json as WorkflowInstance;
                            // 如果 JSON 里带了定义，优先使用它渲染图表
                            if (json.workflowDefinition) {
                                workflowDef = json.workflowDefinition;
                            }
                        }
                    } else if (Array.isArray(json)) {
                        tasks = json; // 直接是任务数组
                    }

                    if (tasks.length === 0) return;

                    const executionData: Record<string, TaskExecutionData> = {};
                    tasks.forEach((task: any) => {
                        const ref = task.referenceTaskName;
                        if (ref) {
                            if (!executionData[ref]) {
                                executionData[ref] = {
                                    taskReferenceName: ref,
                                    status: task.status as ExecutionStatus,
                                    attempts: [],
                                    startTime: task.startTime,
                                    endTime: task.endTime,
                                    output: task.outputData,
                                    input: task.inputData,
                                    reasonForIncompletion: task.reasonForIncompletion,
                                    iteration: task.iteration
                                };
                            }
                            executionData[ref].attempts.push(task as TaskInstance);
                        }
                    });

                    // 后处理：对每个 ref 的 attempts 排序，并计算正确的状态和 totalIterations
                    Object.values(executionData).forEach(data => {
                        // 按 iteration（循环次序）排序，无 iteration 时按 retryCount 排序
                        const hasIterations = data.attempts.some(a => a.iteration !== undefined && a.iteration > 0);
                        if (hasIterations) {
                            data.attempts.sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0));
                            data.totalIterations = data.attempts.reduce((max, a) => Math.max(max, a.iteration ?? 0), 0);
                            // 开始时间取第一次迭代，结束时间取最后一次迭代
                            data.startTime = data.attempts[0]?.startTime;
                        } else {
                            data.attempts.sort((a, b) => (a.retryCount ?? 0) - (b.retryCount ?? 0));
                        }
                        // 状态/输出取最后一次尝试
                        const last = data.attempts[data.attempts.length - 1];
                        if (last) {
                            data.status = last.status as ExecutionStatus;
                            data.endTime = last.endTime;
                            data.output = last.outputData;
                            data.input = last.inputData;
                            data.reasonForIncompletion = last.reasonForIncompletion;
                            data.iteration = last.iteration;
                        }
                    });

                    // 如果探测到新的定义，先更新图表 (使用字符串化比较)
                    if (workflowDef && JSON.stringify(workflowDef) !== JSON.stringify(get().workflowDef)) {
                        get().setWorkflow(workflowDef);
                    }

                    // 按 fork 节点归属提取动态子任务：必须在 setWorkflow 之后，taskMap 已更新后再过滤
                    const finalTaskMap = get().taskMap;
                    const currentDef = get().workflowDef;
                    const allDefTasks = currentDef?.tasks || [];

                    // 找所有顶层 FORK_JOIN_DYNAMIC → JOIN 配对
                    const forkJoinPairs: Array<{ forkRef: string; joinRef: string }> = [];
                    allDefTasks.forEach((t: any, i: number) => {
                        if (t.type === 'FORK_JOIN_DYNAMIC') {
                            for (let j = i + 1; j < allDefTasks.length; j++) {
                                if (allDefTasks[j].type === 'JOIN' || allDefTasks[j].type === 'EXCLUSIVE_JOIN') {
                                    forkJoinPairs.push({ forkRef: t.taskReferenceName, joinRef: allDefTasks[j].taskReferenceName });
                                    break;
                                }
                            }
                        }
                    });

                    // 对每对，按执行顺序（数组索引）切片，过滤出动态任务并去重
                    const dynamicRuntimeTasksByFork: Record<string, TaskInstance[]> = {};
                    forkJoinPairs.forEach(({ forkRef, joinRef }) => {
                        const forkIdx = tasks.findIndex((t: any) => t.referenceTaskName === forkRef);
                        const joinIdx = tasks.findIndex((t: any) => t.referenceTaskName === joinRef);
                        if (forkIdx < 0 || joinIdx < 0) return;

                        const seenRefs = new Set<string>();
                        dynamicRuntimeTasksByFork[forkRef] = tasks
                            .slice(forkIdx + 1, joinIdx)
                            .filter((t: any) => {
                                if (!t.referenceTaskName || !t.taskId) return false;
                                if (finalTaskMap[t.referenceTaskName]) return false;
                                if (seenRefs.has(t.referenceTaskName)) return false;
                                seenRefs.add(t.referenceTaskName);
                                return true;
                            })
                            .map((t: any) => t as TaskInstance);
                    });

                    set({
                        executionData,
                        dynamicRuntimeTasksByFork,
                        workflowInstance,
                        mode: 'run'
                    });
                },

                setSelectedTask: (task: TaskDef | null) => set({ selectedTask: task ? { ...task } : null }),

                setIsDetailPanelOpen: (isOpen: boolean) => set({ isDetailPanelOpen: isOpen }),

                selectTaskAction: (task: TaskDef | null, openPanel: boolean = true) => {
                    set({
                        selectedTask: task ? { ...task } : null,
                        isDetailPanelOpen: task ? openPanel : false,
                        selectedTaskInstance: null // 清除运行时实例选中
                    });
                },

                setSelectedTaskInstance: (instance: TaskInstance | null) => set({ selectedTaskInstance: instance }),

                setLayoutDirection: (direction: LayoutDirection) => {
                    const { workflowDef } = get();
                    if (workflowDef) {
                        const { nodes, edges, taskMap } = parseWorkflow(workflowDef, direction, { hideEmptyBranches: get().mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction, mode: get().mode });
                        set({ nodes: layoutedNodes, edges: layoutedEdges, taskMap, layoutDirection: direction });
                    } else {
                        set({ layoutDirection: direction });
                    }
                },

                onNodesChange: (changes: NodeChange[]) => {
                    const currentNodes = get().nodes;
                    const nodeIds = new Set(currentNodes.map(n => n.id));
                    const relevantChanges = changes.filter(c => 'id' in c && nodeIds.has((c as any).id));
                    if (relevantChanges.length === 0) return;
                    set({ nodes: applyNodeChanges(relevantChanges, currentNodes) });
                },

                onEdgesChange: (changes: EdgeChange[]) => {
                    const currentEdges = get().edges;
                    const newEdges = applyEdgeChanges(changes, currentEdges);
                    if (newEdges !== currentEdges) {
                        set({ edges: newEdges });
                    }
                },

                onConnect: (connection: Connection) => {
                    const { edges, layoutDirection } = get();
                    const updatedEdges = addEdge(connection, edges);
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(get().nodes, updatedEdges, { direction: layoutDirection, mode: get().mode });
                    set({ edges: layoutedEdges, nodes: layoutedNodes });
                },

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

                        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
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

                    const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
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

                    // 初始化不同类型任务的默认参数
                    switch (newTask.type) {
                        case 'HTTP':
                            newTask.httpRequest = {
                                method: 'GET',
                                uri: 'https://example.com/api',
                                headers: { 'Content-Type': 'application/json' },
                                body: {}
                            };
                            break;
                        case 'KAFKA_PUBLISH':
                            newTask.inputParameters = {
                                topic: 'my_topic',
                                value: '${workflow.input.value}',
                                bootStrapServers: 'localhost:9092',
                                headers: {},
                                key: 'msg_key'
                            };
                            break;
                        case 'JSON_JQ_TRANSFORM':
                            newTask.inputParameters = {
                                queryExpression: '.name',
                                input: {}
                            };
                            break;
                        case 'SET_VARIABLE':
                            newTask.inputParameters = {
                                variableName: 'variableValue'
                            };
                            break;
                        case 'SUB_WORKFLOW':
                            newTask.subWorkflowParam = {
                                name: 'execution_workflow',
                                version: 1
                            };
                            break;
                        case 'EVENT':
                            newTask.sink = 'conductor';
                            break;
                        case 'WAIT':
                            // 默认等待 30秒
                            newTask.inputParameters = { duration: '30s' };
                            break;
                        case 'TERMINATE':
                            newTask.inputParameters = {
                                terminationStatus: 'COMPLETED',
                                workflowOutput: {}
                            };
                            break;
                    }

                    if (newTask.type === 'FORK_JOIN' || newTask.type === 'FORK_JOIN_DYNAMIC') {
                        if (newTask.type === 'FORK_JOIN') {
                            newTask.forkTasks = [[], []];
                        } else {
                            // 默认使用经典 dynamicForkTasksParam 模式
                            newTask.dynamicForkTasksParam = 'dynamic_tasks';
                            newTask.dynamicForkTasksInputParamName = 'input';
                        }
                        const joinTask: TaskDef = {
                            name: `${newTask.name}_join`,
                            taskReferenceName: `${newTask.taskReferenceName}_join`,
                            type: 'JOIN',
                            joinOn: []
                        };
                        if (edgeData.isWorkflowStart) {
                            // 在第一个任务前插入
                            newDef.tasks.unshift(joinTask);
                            newDef.tasks.unshift(newTask);
                        } else if (edgeData.isLoopBodyStart) {
                            // 在循环体第一个任务前插入（sourceId = loopNodeId = DO_WHILE taskRef）
                            const loopTask = findTaskByRef(newDef.tasks, sourceId);
                            if (loopTask) {
                                if (!loopTask.loopOver) loopTask.loopOver = [];
                                loopTask.loopOver.unshift(joinTask);
                                loopTask.loopOver.unshift(newTask);
                            }
                        } else if (edgeData.branchCase !== undefined || edgeData.forkIndex !== undefined || edgeData.isLoopAdd) {
                            insertFirstTaskIntoBranch(newDef.tasks, sourceId, edgeData, newTask);
                            insertTaskAfter(newDef.tasks, newTask.taskReferenceName, joinTask);
                        } else {
                            if (newDef.tasks.length === 0) {
                                newDef.tasks.push(newTask, joinTask);
                            } else {
                                insertTaskAfter(newDef.tasks, sourceId, newTask);
                                insertTaskAfter(newDef.tasks, newTask.taskReferenceName, joinTask);
                            }
                        }
                    } else {
                        if (newTask.type === 'DECISION' || newTask.type === 'SWITCH') {
                            newTask.evaluatorType = 'value-param';
                            newTask.caseValueParam = 'case_param';
                            newTask.decisionCases = { "case1": [] };
                            newTask.defaultCase = [];
                        } else if (newTask.type === 'DO_WHILE') {
                            newTask.loopCondition = "$.taskReferenceName.output.value < 10";
                            newTask.loopOver = [];
                        } else if (newTask.type === 'INLINE') {
                            newTask.evaluatorType = 'graaljs';
                            newTask.inputParameters = { expression: 'function execute(input) {\n  return { result: input };\n}\nexecute($.input);' };
                        } else if (newTask.type === 'DYNAMIC') {
                            newTask.dynamicTaskNameParam = 'taskToExecute';
                            newTask.inputParameters = { taskToExecute: '${workflow.input.taskName}' };
                        } else if (newTask.type === 'HUMAN') {
                            newTask.humanTaskDef = { userFormTemplate: '', assignmentCompletionStrategy: 'LEAVE_OPEN' };
                        } else if (newTask.type === 'START_WORKFLOW') {
                            newTask.inputParameters = { startWorkflow: { name: '', version: 1, input: {}, correlationId: '' } };
                        } else if (newTask.type === 'NOOP') {
                            newTask.inputParameters = {};
                        }

                        if (edgeData.isWorkflowStart) {
                            // 在第一个任务前插入
                            newDef.tasks.unshift(newTask);
                        } else if (edgeData.isLoopBodyStart) {
                            // 在循环体第一个任务前插入（sourceId = loopNodeId = DO_WHILE taskRef）
                            const loopTask = findTaskByRef(newDef.tasks, sourceId);
                            if (loopTask) {
                                if (!loopTask.loopOver) loopTask.loopOver = [];
                                loopTask.loopOver.unshift(newTask);
                            }
                        } else if (edgeData.branchCase !== undefined || edgeData.forkIndex !== undefined || edgeData.isLoopAdd) {
                            insertFirstTaskIntoBranch(newDef.tasks, sourceId, edgeData, newTask);
                        } else {
                            if (newDef.tasks.length === 0) {
                                newDef.tasks.push(newTask);
                            } else {
                                insertTaskAfter(newDef.tasks, sourceId, newTask);
                            }
                        }
                    }

                    syncForkJoinOn(newDef.tasks);
                    const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
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
                    const { workflowDef, layoutDirection, nodes: currentNodes } = get();
                    if (!workflowDef) return;

                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    // Fork/Join 成组删除：FORK_JOIN* 删除时同时删配对 JOIN，反之亦然
                    const container = findContainerList(newDef.tasks, nodeId);
                    if (container) {
                        const taskType = currentNodes.find(n => n.id === nodeId)?.data?.taskType as string | undefined;
                        if (taskType === 'FORK_JOIN' || taskType === 'FORK_JOIN_DYNAMIC') {
                            const joinRef = findJoinForFork(container, nodeId);
                            if (joinRef) removeTaskFromDef(newDef.tasks, joinRef);
                        } else if (taskType === 'JOIN' || taskType === 'EXCLUSIVE_JOIN') {
                            const forkRef = findForkForJoin(container, nodeId);
                            if (forkRef) removeTaskFromDef(newDef.tasks, forkRef);
                        }
                    }

                    removeTaskFromDef(newDef.tasks, nodeId);
                    syncForkJoinOn(newDef.tasks);

                    const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
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
                        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
                        const validationResults = validateWorkflow(newDef);
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap, validationResults });
                    }
                },

                removeLoopTask: (loopRef: string, taskRef: string) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    const loopTask = findTaskByRef(newDef.tasks, loopRef);
                    if (loopTask && loopTask.type === 'DO_WHILE' && loopTask.loopOver) {
                        // Also remove companion JOIN when removing a FORK task (and vice versa)
                        const container = findContainerList(loopTask.loopOver, taskRef);
                        if (container) {
                            const task = container.find(t => t.taskReferenceName === taskRef);
                            if (task?.type === 'FORK_JOIN' || task?.type === 'FORK_JOIN_DYNAMIC') {
                                const joinRef = findJoinForFork(container, taskRef);
                                if (joinRef) removeTaskFromDef(loopTask.loopOver, joinRef);
                            } else if (task?.type === 'JOIN' || task?.type === 'EXCLUSIVE_JOIN') {
                                const forkRef = findForkForJoin(container, taskRef);
                                if (forkRef) removeTaskFromDef(loopTask.loopOver, forkRef);
                            }
                        }
                        removeTaskFromDef(loopTask.loopOver, taskRef);
                        syncForkJoinOn(newDef.tasks);
                        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
                        const validationResults = validateWorkflow(newDef);
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap, validationResults });
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
                        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
                        const validationResults = validateWorkflow(newDef);
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap, validationResults });
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
                        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
                        const validationResults = validateWorkflow(newDef);
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap, validationResults });
                    }
                },

                renameDecisionBranch: (taskRef: string, oldName: string, newName: string) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef || !newName.trim() || oldName === newName) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    const task = findTaskByRef(newDef.tasks, taskRef);
                    if (task && (task.type === 'DECISION' || task.type === 'SWITCH')) {
                        if (!task.decisionCases || !task.decisionCases[oldName]) return;
                        // 将原分支任务列表迁移到新键名，重新解析会自动更新连线 label
                        task.decisionCases[newName.trim()] = task.decisionCases[oldName];
                        delete task.decisionCases[oldName];
                        syncForkJoinOn(newDef.tasks);
                        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
                        const validationResults = validateWorkflow(newDef);
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap, validationResults });
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
                        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
                        const validationResults = validateWorkflow(newDef);
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap, validationResults });
                    }
                },

                copyTask: (task: TaskDef) => set({ copiedTask: task }),

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
                        if (newDef.tasks.length === 0) {
                            newDef.tasks.push(newTask, joinTask);
                        } else {
                            insertTaskAfter(newDef.tasks, sourceRef, newTask);
                            insertTaskAfter(newDef.tasks, newTask.taskReferenceName, joinTask);
                        }
                    } else {
                        if (newDef.tasks.length === 0) {
                            newDef.tasks.push(newTask);
                        } else {
                            insertTaskAfter(newDef.tasks, sourceRef, newTask);
                        }
                    }

                    syncForkJoinOn(newDef.tasks);
                    const { nodes, edges, taskMap: newTaskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
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
                setViewMode: (viewMode: ViewMode) => set({ viewMode }),

                startSimulation: () => {
                    const { edges, nodes, isSimRunning } = get();
                    if (isSimRunning) return;

                    const taskRefs = nodes
                        .filter((n) => !['plusNode', 'dynamicPlaceholderNode'].includes(n.type ?? ''))
                        .map((n) => n.id);
                    const edgePairs = edges.map((e) => ({ source: e.source, target: e.target }));
                    const waves = buildExecutionWaves(taskRefs, edgePairs);

                    set({ isSimRunning: true, simState: {} });

                    // 用可变对象保存最新 timer ID，方便 stopSimulation 取消
                    const handle = { timer: null as ReturnType<typeof setTimeout> | null };
                    (get() as any).__simHandle = handle;

                    let idx = 0;
                    const tick = () => {
                        if (idx >= waves.length || !get().isSimRunning) {
                            set({ isSimRunning: false });
                            return;
                        }
                        const wave = waves[idx];
                        set((s) => {
                            const next = { ...s.simState };
                            wave.forEach((r) => (next[r] = 'running'));
                            return { simState: next };
                        });
                        handle.timer = setTimeout(() => {
                            if (!get().isSimRunning) return;
                            set((s) => {
                                const next = { ...s.simState };
                                wave.forEach((r) => (next[r] = 'done'));
                                return { simState: next };
                            });
                            idx++;
                            handle.timer = setTimeout(tick, 280);
                        }, 700);
                    };

                    tick();
                },

                stopSimulation: () => {
                    const handle = (get() as any).__simHandle as { timer: ReturnType<typeof setTimeout> | null } | undefined;
                    if (handle?.timer) clearTimeout(handle.timer);
                    set({ isSimRunning: false, simState: {} });
                },

                createBlankWorkflow: (name?: string) => {
                    const blankDef: WorkflowDef = {
                        name: name || 'new_workflow',
                        description: '',
                        tasks: [],
                        version: 1,
                        schemaVersion: 2
                    };
                    get().setWorkflow(blankDef);
                    set({ mode: 'edit' });
                },

                applyAIGeneratedWorkflow: (workflowJson: any) => {
                    const { tasks: rawTasks, ...rest } = workflowJson;
                    const newDef: WorkflowDef = {
                        ...rest,
                        name: workflowJson.name || 'AI_Generated_Workflow',
                        tasks: rawTasks || [],
                        version: workflowJson.version || 1,
                        schemaVersion: 2
                    };

                    get().setWorkflow(newDef);
                }
            }),
            {
                // 只记录业务定义相关的状态，过滤掉运行时的 UI 状态（如 selected, dragging）
                // 重点：排除 width 和 height，因为它们在 undo 时会重新测量，可能导致 zundo 误判为新状态
                // 修正：必须包含 theme/mode 等全局状态，否则 undo 时会因字段缺失导致 crash
                partialize: (state: WorkflowStore) => ({
                    workflowDef: state.workflowDef,
                    layoutDirection: state.layoutDirection,
                    nodes: state.nodes,
                    edges: state.edges,
                    taskMap: state.taskMap,
                    theme: state.theme,
                    themeColor: state.themeColor,
                    mode: state.mode,
                    edgeType: state.edgeType,
                    nodesLocked: state.nodesLocked,
                    copiedTask: state.copiedTask
                }),
                // 等值检查：只有当核心业务逻辑 (workflowDef) 发生变化时才记录 Undo
                // 这样可以忽略 节点拖拽(仅坐标变化)、缩放、主题切换等非业务操作
                equality: (a, b) => {
                    return JSON.stringify(a.workflowDef) === JSON.stringify(b.workflowDef);
                }
            }
        ),
        {
            name: 'conductor-ui-prefs',
            version: 1,
            storage: createJSONStorage(() => localStorage),
            migrate: (persisted: any, version: number) => {
                if (version === 0) {
                    // v0 → v1: 默认连线从贝塞尔曲线改为折线
                    if (persisted.edgeType === 'default') {
                        persisted.edgeType = 'smoothstep';
                    }
                }
                return persisted;
            },
            partialize: (state: WorkflowStore) => ({
                theme: state.theme,
                themeColor: state.themeColor,
                layoutDirection: state.layoutDirection,
                edgeType: state.edgeType,
                nodesLocked: state.nodesLocked,
                copiedTask: state.copiedTask,
                viewMode: state.viewMode,
            }),
        }
    )
);

export default useWorkflowStore;
