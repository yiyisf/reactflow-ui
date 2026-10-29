import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { temporal } from 'zundo';
import { applyNodeChanges, applyEdgeChanges, Connection, EdgeChange, NodeChange } from 'reactflow';
import { parseWorkflow } from '../parser/conductorParser';
import { getLayoutedElements } from '../layout/autoLayout';
import {
    removeTaskFromDef,
    insertTaskAfter,
    findTaskByRef,
    insertFirstTaskIntoBranch,
    syncForkJoinOn,
    findContainerList,
    findJoinForFork,
    findForkForJoin,
    findPairedJoinRef,
    collectTaskRefs,
    normalizeLegacyTaskFields,
} from '../parser/conductorGenerator';
import {
    createDefaultTask,
    createJoinTaskFor,
    prepareTaskForPaste,
    validateBranchName,
    validateTaskRefName,
} from '../utils/taskEditing';
import { validateWorkflow } from '../utils/validator';
import {
    WorkflowStore,
    LayoutDirection,
    EditorMode,
    ThemeMode,
    ThemeColor,
    ExecutionStatus,
    TaskExecutionData,
    ViewMode,
    RunState
} from '../types/workflow';
import { WorkflowDef, TaskDef, WorkflowInstance, TaskInstance } from '../types/conductor';
import { buildExecutionWaves } from '../utils/simulateWorkflow';
import { refactorTaskReferenceName } from '../services/wlsp/workflowLsp';
import { executeLocalSandboxDryRunAsync } from '../utils/localSandboxEngine';
import { notifySandboxRun, notifyStepAdded } from './sandboxRunObserver';
import { buildExecutionData, collectDynamicForkChildren } from '../utils/executionImport';

/**
 * Recursively find all FORK_JOIN_DYNAMIC -> JOIN / EXCLUSIVE_JOIN pairs at any nesting level
 */
function collectForkJoinDynamicPairs(
    taskList: any[],
    pairs: Array<{ forkRef: string; joinRef: string }> = []
): Array<{ forkRef: string; joinRef: string }> {
    if (!Array.isArray(taskList)) return pairs;
    taskList.forEach((t: any, i: number) => {
        if (!t) return;
        if (t.type === 'FORK_JOIN_DYNAMIC') {
            for (let j = i + 1; j < taskList.length; j++) {
                if (taskList[j]?.type === 'JOIN' || taskList[j]?.type === 'EXCLUSIVE_JOIN') {
                    pairs.push({
                        forkRef: t.taskReferenceName,
                        joinRef: taskList[j].taskReferenceName,
                    });
                    break;
                }
            }
        }
        if (t.decisionCases) {
            Object.values(t.decisionCases).forEach((branch: any) =>
                collectForkJoinDynamicPairs(branch, pairs)
            );
        }
        if (t.defaultCase) {
            collectForkJoinDynamicPairs(t.defaultCase, pairs);
        }
        if (Array.isArray(t.forkTasks)) {
            t.forkTasks.forEach((branch: any) => collectForkJoinDynamicPairs(branch, pairs));
        }
        if (Array.isArray(t.loopOver)) {
            collectForkJoinDynamicPairs(t.loopOver, pairs);
        }
    });
    return pairs;
}

/**
 * 撤销历史快照里的节点需要去掉 selected 状态。
 * partialize 在每次 set（含拖拽）时都会被调用，这里按输入引用缓存结果，避免无谓的 O(n) 分配。
 */
let lastNodesIn: WorkflowStore['nodes'] | null = null;
let lastNodesOut: WorkflowStore['nodes'] = [];
function stripSelected(nodes: WorkflowStore['nodes']): WorkflowStore['nodes'] {
    if (nodes === lastNodesIn) return lastNodesOut;
    lastNodesIn = nodes;
    lastNodesOut = nodes.map(n => Object.assign({}, n, { selected: false }) as typeof n);
    return lastNodesOut;
}

/** 撤销历史最大条数（zundo 默认不限制，长时间编辑会持续占用内存） */
const MAX_UNDO_HISTORY = 100;

/**
 * 文本字段编辑的撤销合并（P2）：同一任务同一字段的连续修改（间隔小于窗口）只记一条撤销记录，
 * 而不是每次按键一条。中间插入了其他会记录历史的操作时不合并。
 */
const COALESCE_WINDOW_MS = 1500;
let lastCoalesce: { key: string; at: number; anchor: unknown } | null = null;

type TemporalApi = {
    pastStates: unknown[];
    isTracking: boolean;
    pause: () => void;
    resume: () => void;
};

function getTemporal(): TemporalApi | null {
    const api = (useWorkflowStore as unknown as { temporal?: { getState: () => TemporalApi } }).temporal;
    return api ? api.getState() : null;
}

function runCoalesced(key: string | null, apply: () => void) {
    const t = getTemporal();
    if (!t) {
        apply();
        return;
    }
    const now = Date.now();
    const anchor = t.pastStates[t.pastStates.length - 1];
    const canMerge =
        !!key &&
        !!lastCoalesce &&
        lastCoalesce.key === key &&
        now - lastCoalesce.at < COALESCE_WINDOW_MS &&
        lastCoalesce.anchor === anchor &&
        anchor !== undefined &&
        t.isTracking;
    if (canMerge) {
        t.pause();
        try {
            apply();
        } finally {
            getTemporal()?.resume();
        }
        lastCoalesce!.at = now;
        return;
    }
    apply();
    if (key) {
        const after = getTemporal();
        lastCoalesce = { key, at: now, anchor: after?.pastStates[after.pastStates.length - 1] };
    } else {
        lastCoalesce = null;
    }
}

/** 计算撤销合并键：只有非结构性字段编辑才合并；对象字段细化到子键（如 inputParameters.http_request） */
function coalesceKeyFor(taskRef: string, oldTask: TaskDef | null, patch: Record<string, any>, structural: boolean): string | null {
    if (structural || !oldTask) return null;
    const parts: string[] = [];
    Object.keys(patch).sort().forEach(k => {
        const next = patch[k];
        const prev = (oldTask as any)[k];
        if (next && prev && typeof next === 'object' && typeof prev === 'object' && !Array.isArray(next)) {
            const sub = Array.from(new Set([...Object.keys(next), ...Object.keys(prev)]))
                .filter(sk => JSON.stringify(next[sk]) !== JSON.stringify(prev[sk]))
                .sort();
            parts.push(`${k}.${sub.join('+')}`);
        } else {
            parts.push(k);
        }
    });
    return `${taskRef}:${parts.join(',')}`;
}

/** 按定义重新解析画布、布局与校验（结构性编辑后统一走这里） */
function rebuildFromDef(def: WorkflowDef, state: Pick<WorkflowStore, 'layoutDirection' | 'mode'>) {
    const { nodes, edges, taskMap } = parseWorkflow(def, state.layoutDirection, { hideEmptyBranches: state.mode !== 'edit' });
    const laid = getLayoutedElements(nodes, edges, { direction: state.layoutDirection, mode: state.mode });
    return {
        workflowDef: def,
        nodes: laid.nodes,
        edges: laid.edges,
        taskMap,
        validationResults: validateWorkflow(def),
    };
}

/**
 * R19：在不记录撤销历史的情况下执行一次状态变更。
 * 运行态切换展示的定义、离开运行态恢复编辑中的定义，都不是用户的编辑，不应进入 ⌘Z 历史。
 */
function withoutHistory(apply: () => void) {
    const t = getTemporal();
    if (!t || !t.isTracking) {
        apply();
        return;
    }
    t.pause();
    try {
        apply();
    } finally {
        getTemporal()?.resume();
    }
}

/**
 * 加载一份定义：规范化旧字段、补齐缺失的 joinOn，并重新解析画布与布局。
 * 返回要写入 store 的字段，由调用方和其它字段一起一次 set 完成。
 */
function loadWorkflowPatch(workflowJson: any, dir: LayoutDirection, state: Pick<WorkflowStore, 'mode' | 'workflowLoadKey'>) {
    const def = JSON.parse(JSON.stringify(workflowJson)) as WorkflowDef;
    normalizeLegacyTaskFields(def.tasks);
    // 加载时只补齐缺失的 joinOn，导入的部分 joinOn 原样保留（E5）
    syncForkJoinOn(def.tasks);

    const { nodes, edges, taskMap } = parseWorkflow(def, dir, { hideEmptyBranches: state.mode !== 'edit' });
    const laid = getLayoutedElements(nodes, edges, { direction: dir, mode: state.mode });
    return {
        workflowDef: def,
        nodes: laid.nodes,
        edges: laid.edges,
        taskMap,
        validationResults: validateWorkflow(def),
        layoutDirection: dir,
        workflowLoadKey: state.workflowLoadKey + 1,
        graphStale: false,
    };
}

/** 选中的任务在新定义里已不存在时，清空选中并关闭详情面板（E12） */
function selectionPatch(state: Pick<WorkflowStore, 'selectedTask'>, taskMap: Record<string, TaskDef>) {
    const ref = state.selectedTask?.taskReferenceName;
    if (ref && !taskMap[ref]) return { selectedTask: null, isDetailPanelOpen: false };
    return {};
}

/**
 * 本地偏好（localStorage `conductor-ui-prefs`）的版本迁移。
 * - v0 → v1：默认连线从贝塞尔曲线改为折线
 * - v1 → v2（R20）：删除旧版本写进去的剪贴板任务 `copiedTask`
 */
export function migratePersistedPrefs(persisted: any, version: number) {
    if (!persisted || typeof persisted !== 'object') return persisted;
    if (version < 1 && persisted.edgeType === 'default') {
        persisted.edgeType = 'smoothstep';
    }
    if (version < 2) {
        delete persisted.copiedTask;
    }
    return persisted;
}

/**
 * R19：离开运行态时，把运行期间暂存的编辑中定义换回来（不记撤销历史）。
 * 没有暂存（运行的就是当前定义，或宿主只给了运行实例）时什么都不做。
 */
function restoreEditDefAfterRun(nextMode: EditorMode) {
    const state = useWorkflowStore.getState();
    const stash = state.editWorkflowDefStash;
    if (!stash) {
        if (state.runWorkflowDef) useWorkflowStore.setState({ runWorkflowDef: null });
        return;
    }
    withoutHistory(() => {
        const rebuilt = rebuildFromDef(stash, { layoutDirection: state.layoutDirection, mode: nextMode });
        useWorkflowStore.setState({
            ...rebuilt,
            ...selectionPatch(state, rebuilt.taskMap),
            graphStale: false,
            runWorkflowDef: null,
            editWorkflowDefStash: null,
            workflowLoadKey: state.workflowLoadKey + 1,
        });
    });
}

/**
 * R20：早期版本的 ⌘C 把整个任务写进 localStorage['conductor-clipboard']，这里在加载时清掉残留。
 * 剪贴板现在只放在内存里（store.copiedTask）。
 */
try {
    globalThis.localStorage?.removeItem('conductor-clipboard');
} catch {
    // 隐私模式等环境下 localStorage 不可用，忽略
}

const useWorkflowStore = create<WorkflowStore>()(
    persist(
        temporal(
            (set, get) => ({
                mode: 'view',
                workflowDef: null as WorkflowDef | null,
                workflowInstance: null as WorkflowInstance | null,
                runWorkflowDef: null as WorkflowDef | null,
                editWorkflowDefStash: null as WorkflowDef | null,
                savedWorkflowJson: null as string | null,
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
                viewMode: 'business' as ViewMode,

                // 模拟执行状态
                simState: {} as Record<string, 'idle' | 'running' | 'done'>,
                isSimRunning: false,

                // 工作流加载版本号：每次调用 setWorkflow 时递增，
                // WorkflowDesigner 监听此值以触发 fitView，与 updateTask 等增量操作区分
                workflowLoadKey: 0,
                graphStale: false,

                // P4.2 执行触发状态
                runState: 'idle' as RunState,
                pendingExecutionId: null as string | null,
                executionError: null as string | null,
                showRunPanel: false,
                showAnalysisPanel: false,

                // P4.1 聚焦参数字段
                focusedParamKey: null as string | null,

                // Pillar 1: W-LSP 数据血缘与重构通知
                showDataLineage: false,
                lastRefactorNotice: null,

                sandboxRunning: false,
                sandboxNotice: null,

                // Pillar 2: 瀑布流时间轴、时间旅行指针与循环迭代选择
                showWaterfallPanel: false,
                timeTravelTimestamp: null,
                activeLoopIterations: {},

                // Pillar 3: 画布级 Cmd+K 内联 Copilot
                inlineCopilotTaskRef: null,

                // 初始化或更新工作流并执行布局
                setWorkflow: (workflowJson: any, direction?: LayoutDirection) => {
                    set({
                        ...loadWorkflowPatch(workflowJson, direction || get().layoutDirection, get()),
                        // 宿主或用户换了流程：之前暂存的编辑定义作废，不能在离开运行态时再恢复回来
                        runWorkflowDef: null,
                        editWorkflowDefStash: null,
                    });
                },

                setWorkflowDefOnly: (workflowJson: any) => {
                    const workflowWithSync = JSON.parse(JSON.stringify(workflowJson)) as WorkflowDef;
                    normalizeLegacyTaskFields(workflowWithSync.tasks);
                    syncForkJoinOn(workflowWithSync.tasks);
                    set({
                        workflowDef: workflowWithSync,
                        validationResults: validateWorkflow(workflowWithSync),
                        graphStale: true,
                    });
                },

                refreshGraph: () => {
                    const { graphStale, workflowDef, layoutDirection, mode } = get();
                    if (!graphStale || !workflowDef) return;
                    const { nodes, edges, taskMap } = parseWorkflow(workflowDef, layoutDirection, { hideEmptyBranches: mode !== 'edit' });
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode });
                    set({ nodes: layoutedNodes, edges: layoutedEdges, taskMap, graphStale: false });
                },

                setMode: (mode: EditorMode) => {
                    const currentMode = get().mode;
                    // 如果从运行模式退出，清空执行数据
                    if (currentMode === 'run' && mode !== 'run') {
                        set({
                            executionData: null,
                            workflowInstance: null,
                            dynamicRuntimeTasksByFork: {},
                            timeTravelTimestamp: null,
                            showWaterfallPanel: false,
                            activeLoopIterations: {},
                        });
                        restoreEditDefAfterRun(mode);
                    }
                    set({ mode });

                    // 切换模式后重新解析工作流（空分支显示策略依赖 mode）
                    const { workflowDef, layoutDirection } = get();
                    if (workflowDef) {
                        const { nodes, edges, taskMap } = parseWorkflow(workflowDef, layoutDirection, { hideEmptyBranches: mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode });
                        set({ nodes: layoutedNodes, edges: layoutedEdges, taskMap, graphStale: false });
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
                        const response = await fetch(`${(import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}sample-workflows/sample-execution.json`);
                        const data = await response.json();
                        get().importExecutionJSON(data);
                    } catch (err) {
                        console.error('Failed to load sample execution:', err);
                        alert('加载示例运行数据失败');
                    }
                },

                importExecutionJSON: (json: any) => {
                    if (!json) return;

                    let tasks: any[] = [];
                    let workflowInstance: WorkflowInstance | null = null;
                    let workflowDef: WorkflowDef | null = get().workflowDef;

                    if (Array.isArray(json.tasks)) {
                        tasks = json.tasks;
                        if (json.workflowId && json.status) {
                            workflowInstance = json as WorkflowInstance;
                            if (json.workflowDefinition) {
                                workflowDef = json.workflowDefinition;
                            }
                        }
                    } else if (Array.isArray(json)) {
                        tasks = json;
                    }

                    if (tasks.length === 0) return;

                    // R19：实例里的定义与当前定义不同时（服务端补了默认字段、键序不同，或运行的是已保存的旧版本），
                    // 只用它渲染运行视图；编辑中的定义暂存起来，离开运行态时原样恢复，不会被服务端版本替换。
                    const current = get().workflowDef;
                    if (workflowDef && JSON.stringify(workflowDef) !== JSON.stringify(current)) {
                        const stash = get().editWorkflowDefStash ?? current;
                        // 一次 set 同时写入实例定义和暂存：同步订阅者（WorkflowIDE 的 onWorkflowChange）
                        // 不能看到"实例定义 + 没有暂存"的中间状态，否则会把实例定义当成用户修改推给宿主
                        withoutHistory(() => {
                            const patch = loadWorkflowPatch(workflowDef, get().layoutDirection, get());
                            set({
                                ...patch,
                                runWorkflowDef: patch.workflowDef,
                                editWorkflowDefStash: stash,
                            });
                        });
                    }

                    // R5 / R9: group `ref__N` loop records under their base ref once; pair dynamic forks per iteration.
                    const finalTaskMap = get().taskMap;
                    const executionData = buildExecutionData(tasks as TaskInstance[], finalTaskMap);
                    const forkJoinPairs = collectForkJoinDynamicPairs(get().workflowDef?.tasks || []);
                    const dynamicRuntimeTasksByFork = collectDynamicForkChildren(tasks as TaskInstance[], forkJoinPairs, finalTaskMap);

                    set({
                        executionData,
                        dynamicRuntimeTasksByFork,
                        workflowInstance,
                        timeTravelTimestamp: null,
                        activeLoopIterations: {},
                    });
                    // 经 setMode 进入运行态：重新解析画布（隐藏空分支和"+"占位节点）
                    if (get().mode !== 'run') get().setMode('run');
                },

                // R4: a different task must not keep the previous task's selected attempt.
                setSelectedTask: (task: TaskDef | null) => set((state) => ({
                    selectedTask: task ? { ...task } : null,
                    selectedTaskInstance: task && state.selectedTask?.taskReferenceName === task.taskReferenceName
                        ? state.selectedTaskInstance
                        : null,
                })),

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

                // E11：连线由定义推导，手拉的连线无法写回 Conductor 定义，因此不再接受。保留空实现以兼容旧调用方。
                onConnect: (_connection: Connection) => {},

                checkTaskRefUniqueness: (newRef: string, currentRef: string) => {
                    if (newRef === currentRef) return true;
                    return !collectTaskRefs(get().workflowDef?.tasks).has(newRef);
                },

                updateTask: (taskRef: string, field: string | Record<string, any>, value?: any) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    let newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;
                    let refactorNotice = get().lastRefactorNotice;
                    const patch: Record<string, any> = typeof field === 'object' ? field : { [field]: value };

                    const changedKeys = Object.keys(patch);
                    const nextRefCandidate = patch.taskReferenceName;

                    let effectiveRef = taskRef;
                    if (
                        typeof nextRefCandidate === 'string' &&
                        nextRefCandidate.trim() !== taskRef
                    ) {
                        const trimmedRef = nextRefCandidate.trim();
                        // E7：重复、非法或保留的引用名直接拒绝，不做任何改动
                        const refError = validateTaskRefName(newDef, trimmedRef, taskRef);
                        if (refError) {
                            console.warn(`[workflowStore] ${refError}`);
                            return;
                        }
                        const refactorRes = refactorTaskReferenceName(newDef, taskRef, trimmedRef);
                        newDef = refactorRes.updatedDef;
                        effectiveRef = trimmedRef;
                        if (refactorRes.replacedCount > 0) {
                            refactorNotice = {
                                oldRef: taskRef,
                                newRef: trimmedRef,
                                replacedCount: refactorRes.replacedCount,
                                affectedTasks: refactorRes.affectedTaskRefs,
                                timestamp: Date.now(),
                            };
                        }
                    }

                    // 改名后的定义作为 joinOn 同步的"编辑前"基线，避免把改名误判成结构变化
                    const baselineTasks = JSON.parse(JSON.stringify(newDef.tasks)) as TaskDef[];
                    const oldTask = findTaskByRef(workflowDef.tasks, taskRef);
                    const task = findTaskByRef(newDef.tasks, effectiveRef);
                    if (!task) return;

                    Object.assign(task, patch, { taskReferenceName: effectiveRef });

                    syncForkJoinOn(newDef.tasks, baselineTasks);
                    const validationResults = validateWorkflow(newDef);

                    const STRUCTURAL_FIELDS = new Set([
                        'taskReferenceName',
                        'type',
                        'decisionCases',
                        'defaultCase',
                        'forkTasks',
                        'loopOver',
                        'joinOn',
                    ]);
                    const isStructuralChange = changedKeys.some(k => STRUCTURAL_FIELDS.has(k) && (k !== 'taskReferenceName' || effectiveRef !== taskRef));
                    const coalesceKey = coalesceKeyFor(taskRef, oldTask, patch, isStructuralChange);

                    runCoalesced(coalesceKey, () => {
                        if (isStructuralChange) {
                            const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
                            const nextSelected = get().selectedTask?.taskReferenceName === taskRef ? task : get().selectedTask;

                            set({
                                workflowDef: newDef,
                                nodes: layoutedNodes,
                                edges: layoutedEdges,
                                taskMap,
                                selectedTask: nextSelected,
                                validationResults,
                                lastRefactorNotice: refactorNotice,
                            });
                        } else {
                            // 非拓扑结构变更（如入参、描述、名称、超时、重试、表达式等）：原地更新节点数据，保留用户拖拽后的节点坐标
                            const updatedNodes = get().nodes.map(n => {
                                if (n.data?.taskReferenceName === taskRef) {
                                    return {
                                        ...n,
                                        data: {
                                            ...n.data,
                                            label: task.name || n.data.label,
                                            task,
                                            loopCondition: task.loopCondition ?? n.data.loopCondition,
                                            subWorkflowName: task.subWorkflowParam?.name ?? n.data.subWorkflowName,
                                        },
                                    };
                                }
                                return n;
                            });
                            const updatedTaskMap = { ...get().taskMap, [taskRef]: task };
                            const nextSelected = get().selectedTask?.taskReferenceName === taskRef ? task : get().selectedTask;

                            set({
                                workflowDef: newDef,
                                nodes: updatedNodes,
                                taskMap: updatedTaskMap,
                                selectedTask: nextSelected,
                                validationResults,
                            });
                        }
                    });
                },

                replaceTask: (taskRef: string, nextTask: TaskDef) => {
                    const { workflowDef } = get();
                    if (!workflowDef) return '当前没有打开的工作流：请先加载或新建一个工作流';
                    if (!nextTask || typeof nextTask !== 'object' || Array.isArray(nextTask)) {
                        return '任务 JSON 必须是一个对象：请检查最外层是否为 { ... }';
                    }
                    let newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;
                    const nextRef = typeof nextTask.taskReferenceName === 'string' ? nextTask.taskReferenceName.trim() : '';
                    if (nextRef !== taskRef) {
                        const refError = validateTaskRefName(newDef, nextRef, taskRef);
                        if (refError) return refError;
                        newDef = refactorTaskReferenceName(newDef, taskRef, nextRef).updatedDef;
                    }
                    const baselineTasks = JSON.parse(JSON.stringify(newDef.tasks)) as TaskDef[];
                    const container = findContainerList(newDef.tasks, nextRef);
                    const idx = container ? container.findIndex(t => t.taskReferenceName === nextRef) : -1;
                    if (!container || idx < 0) return `没有找到任务 "${taskRef}"：它可能已被删除，请刷新后重试`;

                    // E23：整体替换任务对象，JSON 里删掉的键在定义里也会被删掉
                    const replacement = { ...(JSON.parse(JSON.stringify(nextTask)) as TaskDef), taskReferenceName: nextRef };
                    container[idx] = replacement;
                    syncForkJoinOn(newDef.tasks, baselineTasks);

                    const rebuilt = rebuildFromDef(newDef, get());
                    const selected = get().selectedTask;
                    set({
                        ...rebuilt,
                        selectedTask: selected?.taskReferenceName === taskRef ? replacement : selected,
                    });
                    return null;
                },

                updateWorkflowProperties: (properties: Partial<WorkflowDef>) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    Object.assign(newDef, properties);
                    syncForkJoinOn(newDef.tasks, workflowDef.tasks);
                    const validationResults = validateWorkflow(newDef);

                    if ('tasks' in properties) {
                        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
                        set({
                            workflowDef: newDef,
                            nodes: layoutedNodes,
                            edges: layoutedEdges,
                            taskMap,
                            validationResults
                        });
                    } else {
                        set({
                            workflowDef: newDef,
                            validationResults,
                        });
                    }
                },

                addNode: (newNode: any, sourceIdIn: string, _targetId: string, _edgeId: string, edgeDataIn: any = {}) => {
                    const { workflowDef } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    let sourceId = sourceIdIn;
                    let edgeData: any = edgeDataIn || {};
                    if (edgeData.exitOf) {
                        // E16：SWITCH 出口边上的 "+"：插到 SWITCH 之后（同层），而不是分支内部
                        sourceId = edgeData.exitOf;
                        edgeData = {};
                    } else if (edgeData.branchParentRef !== undefined && edgeData.forkIndex !== undefined) {
                        // E6：空 FORK 分支占位 → JOIN 的边：插入到该分支
                        sourceId = edgeData.branchParentRef;
                        edgeData = { forkIndex: edgeData.forkIndex };
                    }

                    const existingRefs = collectTaskRefs(newDef.tasks);
                    let ref: string = newNode.data.taskReferenceName;
                    if (existingRefs.has(ref)) {
                        let n = 2;
                        while (existingRefs.has(`${ref}_${n}`)) n++;
                        ref = `${ref}_${n}`;
                    }
                    const newTask = createDefaultTask(newNode.data.taskType || 'SIMPLE', newNode.data.label, ref);
                    const isFork = newTask.type === 'FORK_JOIN' || newTask.type === 'FORK_JOIN_DYNAMIC';
                    const joinTask = isFork ? createJoinTaskFor(newTask, new Set([...existingRefs, ref])) : null;

                    const isBranchInsert = edgeData.branchCase !== undefined || edgeData.forkIndex !== undefined || edgeData.isLoopAdd;
                    if (!isBranchInsert && !edgeData.isWorkflowStart && !edgeData.isLoopBodyStart) {
                        // 不能插在 FORK 与配对 JOIN 之间：改为插到 JOIN 之后
                        const src = findTaskByRef(newDef.tasks, sourceId);
                        if (src && (src.type === 'FORK_JOIN' || src.type === 'FORK_JOIN_DYNAMIC')) {
                            sourceId = findPairedJoinRef(newDef.tasks, sourceId) ?? sourceId;
                        }
                    }

                    let inserted = false;
                    if (edgeData.isWorkflowStart) {
                        newDef.tasks.unshift(newTask);
                        inserted = true;
                    } else if (edgeData.isLoopBodyStart) {
                        // 在循环体第一个任务前插入（sourceId = loopNodeId = DO_WHILE taskRef）
                        const loopTask = findTaskByRef(newDef.tasks, sourceId);
                        if (loopTask) {
                            if (!loopTask.loopOver) loopTask.loopOver = [];
                            loopTask.loopOver.unshift(newTask);
                            inserted = true;
                        }
                    } else if (isBranchInsert) {
                        inserted = insertFirstTaskIntoBranch(newDef.tasks, sourceId, edgeData, newTask);
                    } else if (newDef.tasks.length === 0) {
                        newDef.tasks.push(newTask);
                        inserted = true;
                    } else {
                        inserted = insertTaskAfter(newDef.tasks, sourceId, newTask);
                    }
                    if (!inserted) {
                        console.warn(`[workflowStore] 未找到插入位置 "${sourceId}"，没有添加任务`);
                        return;
                    }
                    if (joinTask) insertTaskAfter(newDef.tasks, newTask.taskReferenceName, joinTask);

                    syncForkJoinOn(newDef.tasks, workflowDef.tasks);
                    set(rebuildFromDef(newDef, get()));
                    // 埋点：专业模式新增步骤（画布「+」与 Cmd+K 内联 Copilot 都经此处）
                    notifyStepAdded('builtin');
                },

                removeNode: (nodeId: string) => {
                    const { workflowDef } = get();
                    if (!workflowDef) return;

                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    // Fork/Join 成组删除：FORK_JOIN* 删除时同时删配对 JOIN，反之亦然（确认文案见 describeTaskRemoval）
                    const container = findContainerList(newDef.tasks, nodeId);
                    if (container) {
                        const taskType = container.find(t => t.taskReferenceName === nodeId)?.type as string | undefined;
                        if (taskType === 'FORK_JOIN' || taskType === 'FORK_JOIN_DYNAMIC') {
                            const joinRef = findJoinForFork(container, nodeId);
                            if (joinRef) removeTaskFromDef(newDef.tasks, joinRef);
                        } else if (taskType === 'JOIN' || taskType === 'EXCLUSIVE_JOIN') {
                            const forkRef = findForkForJoin(container, nodeId);
                            if (forkRef) removeTaskFromDef(newDef.tasks, forkRef);
                        }
                    }

                    if (!removeTaskFromDef(newDef.tasks, nodeId)) return;
                    syncForkJoinOn(newDef.tasks, workflowDef.tasks);

                    const rebuilt = rebuildFromDef(newDef, get());
                    set({ ...rebuilt, ...selectionPatch(get(), rebuilt.taskMap) });
                },

                addLoopTask: (loopRef: string, taskType: string) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    const loopTask = findTaskByRef(newDef.tasks, loopRef);
                    if (loopTask && loopTask.type === 'DO_WHILE') {
                        if (!loopTask.loopOver) loopTask.loopOver = [];
                        const newTask = createDefaultTask(taskType, `new_${taskType.toLowerCase()}`, `${loopRef}_sub_${Date.now()}`);
                        loopTask.loopOver.push(newTask);
                        if (newTask.type === 'FORK_JOIN' || newTask.type === 'FORK_JOIN_DYNAMIC') {
                            loopTask.loopOver.push(createJoinTaskFor(newTask, collectTaskRefs(newDef.tasks)));
                        }
                        syncForkJoinOn(newDef.tasks, workflowDef.tasks);
                        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
                        const validationResults = validateWorkflow(newDef);
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap, validationResults });
                    }
                },

                removeLoopTask: (loopRef: string, taskRef: string) => {
                    const { workflowDef } = get();
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
                        syncForkJoinOn(newDef.tasks, workflowDef.tasks);
                        const rebuilt = rebuildFromDef(newDef, get());
                        set({ ...rebuilt, ...selectionPatch(get(), rebuilt.taskMap) });
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
                            const branchError = validateBranchName(task, caseName);
                            if (branchError) {
                                console.warn(`[workflowStore] ${branchError}`);
                                return;
                            }
                            if (!task.decisionCases) task.decisionCases = {};
                            task.decisionCases[caseName.trim()] = [];
                        }
                        syncForkJoinOn(newDef.tasks, workflowDef.tasks);
                        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
                        const validationResults = validateWorkflow(newDef);
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap, validationResults });
                    }
                },

                removeDecisionBranch: (taskRef: string, caseName: string) => {
                    const { workflowDef } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    const task = findTaskByRef(newDef.tasks, taskRef);
                    if (task && (task.type === 'DECISION' || task.type === 'SWITCH')) {
                        if (caseName === 'default') {
                            task.defaultCase = [];
                        } else if (task.decisionCases) {
                            delete task.decisionCases[caseName];
                        }
                        syncForkJoinOn(newDef.tasks, workflowDef.tasks);
                        const rebuilt = rebuildFromDef(newDef, get());
                        set({ ...rebuilt, ...selectionPatch(get(), rebuilt.taskMap) });
                    }
                },

                renameDecisionBranch: (taskRef: string, oldName: string, newName: string) => {
                    const { workflowDef } = get();
                    if (!workflowDef) return false;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    const task = findTaskByRef(newDef.tasks, taskRef);
                    if (!task || (task.type !== 'DECISION' && task.type !== 'SWITCH')) return false;
                    if (!task.decisionCases || !task.decisionCases[oldName]) return false;
                    const trimmed = (newName ?? '').trim();
                    if (trimmed === oldName) return true;
                    // E14：拒绝空名、保留字 default 与已存在的分支名（否则会覆盖原分支）
                    const branchError = validateBranchName(task, trimmed, oldName);
                    if (branchError) {
                        console.warn(`[workflowStore] ${branchError}`);
                        return false;
                    }
                    // 保持分支顺序不变地改键名，重新解析会自动更新连线 label
                    const renamed: Record<string, TaskDef[]> = {};
                    Object.entries(task.decisionCases).forEach(([k, v]) => {
                        renamed[k === oldName ? trimmed : k] = v;
                    });
                    task.decisionCases = renamed;
                    syncForkJoinOn(newDef.tasks, workflowDef.tasks);
                    set(rebuildFromDef(newDef, get()));
                    return true;
                },

                addForkBranch: (taskRef: string) => {
                    const { workflowDef, layoutDirection } = get();
                    if (!workflowDef) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;

                    const task = findTaskByRef(newDef.tasks, taskRef);
                    if (task && task.type === 'FORK_JOIN') {
                        if (!task.forkTasks) task.forkTasks = [];
                        task.forkTasks.push([]);
                        syncForkJoinOn(newDef.tasks, workflowDef.tasks);
                        const { nodes, edges, taskMap } = parseWorkflow(newDef, layoutDirection, { hideEmptyBranches: get().mode !== 'edit' });
                        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: get().mode });
                        const validationResults = validateWorkflow(newDef);
                        set({ workflowDef: newDef, nodes: layoutedNodes, edges: layoutedEdges, taskMap, validationResults });
                    }
                },

                copyTask: (task: TaskDef) => set({ copiedTask: task }),

                pasteTask: (task: TaskDef) => {
                    const { workflowDef, selectedTask } = get();
                    if (!workflowDef || !task) return;
                    const newDef = JSON.parse(JSON.stringify(workflowDef)) as WorkflowDef;
                    const existingRefs = collectTaskRefs(newDef.tasks);

                    // E15：子树内引用名统一改名（含 loopCondition / ${兄弟.output} / joinOn），FORK 类任务补配对 JOIN
                    const { task: newTask, join: joinTask } = prepareTaskForPaste(task, existingRefs, `_copy_${Date.now()}`);

                    let sourceRef = selectedTask && existingRefs.has(selectedTask.taskReferenceName)
                        ? selectedTask.taskReferenceName
                        : (newDef.tasks.length > 0 ? newDef.tasks[newDef.tasks.length - 1].taskReferenceName : 'start');
                    // E8：选中 FORK 时插到配对 JOIN 之后，不能插进 FORK 与 JOIN 之间
                    const sourceTask = findTaskByRef(newDef.tasks, sourceRef);
                    if (sourceTask && (sourceTask.type === 'FORK_JOIN' || sourceTask.type === 'FORK_JOIN_DYNAMIC')) {
                        sourceRef = findPairedJoinRef(newDef.tasks, sourceRef) ?? sourceRef;
                    }

                    if (newDef.tasks.length === 0) {
                        newDef.tasks.push(newTask);
                    } else if (!insertTaskAfter(newDef.tasks, sourceRef, newTask)) {
                        newDef.tasks.push(newTask);
                    }
                    if (joinTask) insertTaskAfter(newDef.tasks, newTask.taskReferenceName, joinTask);

                    syncForkJoinOn(newDef.tasks, workflowDef.tasks);
                    set(rebuildFromDef(newDef, get()));
                },

                flashNodes: (refs: string[]) => {
                    if (refs.length === 0) return;

                    // Cancel any in-flight flash so rapid re-accepts don't cross-deselect
                    const prev = (get() as any).__flashTimeout;
                    if (prev) clearTimeout(prev);

                    const refSet = new Set(refs);

                    // Snapshot pre-flash selection so the timeout restores original state
                    // rather than unconditionally deselecting (which would stomp user selections)
                    const preFlash: Record<string, boolean> = {};
                    get().nodes.forEach(n => { if (refSet.has(n.id)) preFlash[n.id] = n.selected ?? false; });

                    set(s => ({
                        nodes: s.nodes.map(n => refSet.has(n.id) ? { ...n, selected: true } : n),
                    }));

                    const timeout = setTimeout(() => {
                        set(s => ({
                            nodes: s.nodes.map(n =>
                                refSet.has(n.id) ? { ...n, selected: preFlash[n.id] ?? false } : n
                            ),
                        }));
                    }, 2500);

                    (get() as any).__flashTimeout = timeout;
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
                            // 流转预览结束：清除高亮，画布回到编辑态外观
                            set({ isSimRunning: false, simState: {} });
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
                    // R19：新建的流程还没有保存过的版本，之前流程的保存基线作废
                    set({ mode: 'edit', savedWorkflowJson: null });
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
                },

                // P4.2: 显示/隐藏执行触发面板
                setShowRunPanel: (show: boolean) => set({ showRunPanel: show }),

                // P4.2: 显示/隐藏执行分析面板
                setShowAnalysisPanel: (show: boolean) => set({ showAnalysisPanel: show }),

                // P4.2: 更新执行触发状态
                setRunState: (state: RunState, execId?: string | null, error?: string | null) => {
                    set({
                        runState: state,
                        pendingExecutionId: execId !== undefined ? execId : get().pendingExecutionId,
                        executionError: error !== undefined ? error : get().executionError,
                    });
                },

                // P4.3: 切回 edit 模式，选中任务并聚焦到指定参数字段
                switchToEditAndFocusParam: (taskRef: string, paramKey?: string) => {
                    // R19：从运行视图跳回编辑时，先换回编辑中的定义，再定位任务
                    if (get().mode === 'run') restoreEditDefAfterRun('edit');
                    const { workflowDef, layoutDirection, taskMap } = get();
                    if (!workflowDef) return;

                    // 切换到 edit 模式
                    set({ mode: 'edit', focusedParamKey: paramKey ?? null });

                    // 重新解析图（edit 模式下空分支可见）
                    const { nodes, edges, taskMap: newTaskMap } = parseWorkflow(workflowDef, layoutDirection, { hideEmptyBranches: false });
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { direction: layoutDirection, mode: 'edit' });
                    set({ nodes: layoutedNodes, edges: layoutedEdges, taskMap: newTaskMap });

                    // 选中目标任务并打开详情面板
                    const task = taskMap[taskRef] || newTaskMap[taskRef];
                    if (task) {
                        set({
                            selectedTask: { ...task },
                            isDetailPanelOpen: true,
                            showAnalysisPanel: false,
                        });
                    }
                },

                getEditingWorkflowDef: () => get().editWorkflowDefStash ?? get().workflowDef,
                markWorkflowSaved: (saved?: WorkflowDef | null) => {
                    const def = saved === undefined ? (get().editWorkflowDefStash ?? get().workflowDef) : saved;
                    set({ savedWorkflowJson: def ? JSON.stringify(def) : null });
                },
                hasUnsavedChanges: () => {
                    const { savedWorkflowJson } = get();
                    const def = get().editWorkflowDefStash ?? get().workflowDef;
                    if (!def) return false;
                    return savedWorkflowJson === null || savedWorkflowJson !== JSON.stringify(def);
                },

                // Pillar 1: W-LSP 数据血缘开关与重构提示清除
                setShowDataLineage: (show: boolean) => set({ showDataLineage: show }),
                clearRefactorNotice: () => set({ lastRefactorNotice: null }),

                // Pillar 2: 瀑布流面板、时间旅行指针、循环迭代切换与浏览器沙箱试运行
                setShowWaterfallPanel: (show: boolean) => set({ showWaterfallPanel: show }),
                setTimeTravelTimestamp: (ts: number | null) => set({ timeTravelTimestamp: ts }),
                setLoopIteration: (loopTaskRef: string, iteration: number) =>
                    set({
                        activeLoopIterations: {
                            ...get().activeLoopIterations,
                            [loopTaskRef]: iteration,
                        },
                    }),
                clearSandboxNotice: () => set({ sandboxNotice: null }),
                runLocalSandboxDryRun: async (
                    mockInput?: Record<string, any>,
                    taskMocks?: Record<string, any>,
                    maxLoopIterations?: number
                ) => {
                    const { workflowDef, sandboxRunning } = get();
                    if (!workflowDef || sandboxRunning) return;
                    if (!workflowDef.tasks?.length) {
                        set({ sandboxNotice: { text: '流程里还没有步骤，先添加步骤再试运行', type: 'error', timestamp: Date.now() } });
                        return;
                    }
                    set({ sandboxRunning: true, sandboxNotice: null });
                    let instance;
                    try {
                        instance = await executeLocalSandboxDryRunAsync(workflowDef, {
                            workflowInput: mockInput,
                            taskMocks,
                            maxLoopIterations,
                        });
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        set({
                            sandboxRunning: false,
                            sandboxNotice: { text: `沙箱试运行出错：${msg}。检查流程定义和模拟数据后再试`, type: 'error', timestamp: Date.now() },
                        });
                        notifySandboxRun('error');
                        return;
                    }
                    set({ sandboxRunning: false });
                    get().importExecutionJSON(instance);
                    set({ showWaterfallPanel: true });
                    // 埋点：专业模式试跑的统一出口（只传最终状态）
                    notifySandboxRun(String(instance.status));
                },

                // Pillar 3: 画布级 Cmd+K 内联 Copilot
                setInlineCopilotTaskRef: (taskRef: string | null) =>
                    set({ inlineCopilotTaskRef: taskRef }),
            }),
            {
                // E9：撤销快照只含流程数据。主题、模式、连线样式、布局方向、锁定状态、剪贴板等偏好不进历史，
                // ⌘Z 不会把它们一起撤回（zundo 撤销时按部分状态合并，缺省的字段保持当前值）。
                partialize: (state: WorkflowStore) => ({
                    workflowDef: state.workflowDef,
                    // Strip `selected` so flash-selection is never captured in undo history.
                    nodes: stripSelected(state.nodes),
                    edges: state.edges,
                    taskMap: state.taskMap,
                    // 与 nodes 一起快照：撤销到"画布数据过期"的历史点时，仍会在回到画布前被刷新
                    graphStale: state.graphStale,
                }),
                // 等值检查：只有当核心业务逻辑 (workflowDef) 发生变化时才记录 Undo
                // 这样可以忽略 节点拖拽(仅坐标变化)、缩放、主题切换等非业务操作
                equality: (a, b) => {
                    // 引用相同必然相等（拖拽、缩放、选中等不改定义的操作走这条快速路径，免去序列化）
                    if (a.workflowDef === b.workflowDef) return true;
                    return JSON.stringify(a.workflowDef) === JSON.stringify(b.workflowDef);
                },
                limit: MAX_UNDO_HISTORY,
            }
        ),
        {
            name: 'conductor-ui-prefs',
            version: 2,
            storage: createJSONStorage(() => localStorage),
            migrate: migratePersistedPrefs,
            partialize: (state: WorkflowStore) => ({
                theme: state.theme,
                themeColor: state.themeColor,
                layoutDirection: state.layoutDirection,
                edgeType: state.edgeType,
                nodesLocked: state.nodesLocked,
                // R20：复制的任务只留在内存里，不写 localStorage（HTTP 任务可能带手写的 Authorization 等请求头）
                viewMode: state.viewMode,
            }),
        }
    )
);

/**
 * E12：撤销 / 重做 / 删除后，若选中的任务已不在定义里，清空选中并关闭详情面板；
 * 若还在但内容变了（例如撤销了它的修改），让面板显示最新内容。
 */
let lastSeenTaskMap: WorkflowStore['taskMap'] | null = null;
useWorkflowStore.subscribe((state: WorkflowStore) => {
    if (state.taskMap === lastSeenTaskMap) return;
    lastSeenTaskMap = state.taskMap;
    if (state.mode !== 'edit' || state.graphStale || !state.selectedTask) return;
    const fresh = state.taskMap[state.selectedTask.taskReferenceName];
    if (!fresh) {
        useWorkflowStore.setState({ selectedTask: null, isDetailPanelOpen: false });
    } else if (fresh !== state.selectedTask && JSON.stringify(fresh) !== JSON.stringify(state.selectedTask)) {
        useWorkflowStore.setState({ selectedTask: { ...fresh } });
    }
});

export default useWorkflowStore;
