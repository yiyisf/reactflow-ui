import { Node, Edge, Position } from 'reactflow';
import { WorkflowDef, TaskDef, WorkflowInstance, TaskInstance } from './conductor';

// ─── 视图模式 ───────────────────────────────────────────────────────────────────────────

/**
 * 视图详情级别（独立于编辑模式）
 * - `business`：仅展示核心业务节点，控制/数据节点折叠为边标签
 * - `standard`：业务 + 控制流节点
 * - `developer`：全部节点（含数据转换等）
 */
export type ViewMode = 'business' | 'standard' | 'developer';

// ─── 运行态输入 ─────────────────────────────────────────────────────────────────────────

/**
 * `workflowExecution` prop 的公共类型（WorkflowIDE 与 AiWorkflowIDE 共用）。
 * 兼容两种形态：完整 Conductor Workflow 实例，或裸的任务实例数组（旧兼容模式）。
 */
export type WorkflowExecutionInput = WorkflowInstance | TaskInstance[];

// ─── AI Diff 类型 ─────────────────────────────────────────────────────────────────────

export interface WorkflowDiffRow {
    kind: 'add' | 'mod' | 'del';
    desc: string;
}

export type WorkflowPatchOp =
    | { op: 'patchTask'; ref: string; set: Partial<TaskDef> }
    | { op: 'insertAfter'; after: string; edgeTo: string; task: TaskDef }
    | { op: 'insertBefore'; before: string; task: TaskDef }
    | { op: 'addTask'; task: TaskDef; extraEdges?: Array<{ from: string; to: string; label?: string }>; removeEdges?: Array<{ from: string; to: string }> }
    | { op: 'removeTask'; ref: string }
    | { op: 'addEdge'; from: string; to: string; label?: string }
    | { op: 'removeEdge'; from: string; to: string };

export interface WorkflowDiff {
    kind: 'add' | 'mod' | 'del' | 'replace';
    summary: string;
    rows: WorkflowDiffRow[];
    patch?: WorkflowPatchOp[];
    payload?: WorkflowDef; // 全量替换时使用
}

export interface AIChatMessage {
    id: string;
    role: 'user' | 'ai';
    content?: string;
    thinking?: boolean;
    diff?: WorkflowDiff;
    applied?: boolean;
    inverse?: WorkflowDiff;
    /** Special card types rendered inline in the chat stream */
    cardType?: 'run_card';
}

/**
 * 布局方向
 */
export type LayoutDirection = 'TB' | 'LR';

/**
 * 编辑模式
 */
export type EditorMode = 'view' | 'edit' | 'run';

/**
 * 执行状态（Conductor OSS TaskStatus）
 */
export type ExecutionStatus =
    | 'SCHEDULED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'COMPLETED_WITH_ERRORS'
    | 'FAILED'
    | 'FAILED_WITH_TERMINAL_ERROR'
    | 'TIMED_OUT'
    | 'SKIPPED'
    | 'CANCELED';

/**
 * 任务执行数据
 */
export interface TaskExecutionData {
    taskReferenceName: string;
    status: ExecutionStatus;
    attempts: TaskInstance[]; // 存储所有尝试 (计算 retries)
    startTime?: number;
    endTime?: number;
    output?: any;
    input?: any;
    reasonForIncompletion?: string;
    iteration?: number;
    totalIterations?: number; // DO_WHILE 循环总迭代次数
}
/**
 * 解析结果
 */
export interface ParserResult {
    nodes: WorkflowNode[];
    edges: Edge[];
    taskMap: Record<string, TaskDef>;
    nextId: number;
}

/**
 * 校验条目
 */
export interface ValidationItem {
    type: 'TASK' | 'GLOBAL';
    ref: string;
    message: string;
}

/**
 * 校验结果
 */
export interface ValidationResults {
    isValid: boolean;
    errors: ValidationItem[];
    warnings: ValidationItem[];
}

/**
 * 节点数据结构
 */
export interface WorkflowNodeData {
    label: string;
    taskReferenceName: string;
    taskType: string;
    task?: TaskDef;
    layoutDirection: LayoutDirection;
    isHighlighted?: boolean;
    isError?: boolean;
    hasWarning?: boolean;
    isDynamic?: boolean; // Fork 任务专用
    subWorkflowName?: string; // SubWorkflow 专用
    loopOver?: TaskDef[]; // Loop 任务专用
    loopCondition?: string; // Loop 任务专用
    decisionCases?: Record<string, TaskDef[]>; // Decision 任务专用
    sourcePosition?: Position; // 动态布局专用 (如蛇形布局)
    targetPosition?: Position; // 动态布局专用 (如蛇形布局)
    parentRef?: string; // 父节点引用名（用于 Join/plusNode 查找上游节点）
    edgeData?: Record<string, any>; // plusNode 专用：携带边的附加信息
    isDynamicRuntime?: boolean; // FORK_JOIN_DYNAMIC 运行时动态生成的子任务节点
    simRunning?: boolean; // 模拟执行中：蓝色脉冲
    simDone?: boolean;    // 模拟执行完成：绿色
    /** AI diff overlay: which change category this node belongs to in the pending proposal */
    proposalStatus?: 'added' | 'modified' | 'removed';
    _layoutWidth?: number;  // 循环容器预计算宽度（由 layoutLoopChildren 设置）
    _layoutHeight?: number; // 循环容器预计算高度（由 layoutLoopChildren 设置）
}

/**
 * 强类型节点
 */
export type WorkflowNode = Node<WorkflowNodeData>;

/**
 * 应用主题模式
 * - `dark`: 暗色模式
 * - `light`: 亮色模式
 */
export type ThemeMode = 'dark' | 'light';

/**
 * 品牌主色调
 * - `blue`: 科技蓝
 * - `orange`: 活力橙
 */
export type ThemeColor = 'blue' | 'orange';

/**
 * 执行触发状态机
 * - `idle`: 未触发
 * - `triggering`: 正在调用 onTriggerExecution
 * - `polling`: 已获得 workflowId，正在轮询执行结果
 * - `done`: 执行到达终态（COMPLETED/FAILED/TIMED_OUT/TERMINATED）
 * - `error`: 触发或轮询过程中发生错误
 */
export type RunState = 'idle' | 'triggering' | 'polling' | 'done' | 'error';

/**
 * 工作流存储状态
 */
export interface WorkflowState {
    mode: EditorMode;
    viewMode: ViewMode;
    workflowDef: WorkflowDef | null;
    workflowInstance: WorkflowInstance | null;
    /**
     * R19：运行态展示的实例定义（与编辑中的定义不同时才有值）。
     * 运行实例里的定义只用于渲染运行视图，不会替换编辑中的定义。
     */
    runWorkflowDef: WorkflowDef | null;
    /** R19：运行态展示实例定义期间，暂存的编辑中定义；离开运行态时原样恢复 */
    editWorkflowDefStash: WorkflowDef | null;
    /**
     * R19：最近一次加载或保存时的定义（序列化后），用于判断画布是否有未保存的修改。
     * 为 null 表示 IDE 不知道服务端保存过哪个版本。
     */
    savedWorkflowJson: string | null;
    nodes: WorkflowNode[];
    edges: Edge[];
    taskMap: Record<string, TaskDef>;
    layoutDirection: LayoutDirection;
    selectedTask: TaskDef | null;
    selectedTaskInstance: TaskInstance | null; // 当前选中的运行时任务实例
    executionData: Record<string, TaskExecutionData> | null;
    dynamicRuntimeTasksByFork: Record<string, TaskInstance[]>; // key=forkRef，FORK_JOIN_DYNAMIC 按 fork 归属的运行时子任务
    validationResults: ValidationResults;
    theme: ThemeMode;
    themeColor: ThemeColor;
    edgeType: string;
    nodesLocked: boolean;
    copiedTask: TaskDef | null;
    isDetailPanelOpen: boolean;
    simState: Record<string, 'idle' | 'running' | 'done'>;
    isSimRunning: boolean;
    /** 每次 setWorkflow() 调用时递增，用于触发 WorkflowDesigner 的 fitView */
    workflowLoadKey: number;
    /**
     * 画布数据（nodes/edges/taskMap）是否落后于 workflowDef。
     * 业务卡片视图下画布未挂载，编辑只更新定义（setWorkflowDefOnly），切回画布前再 refreshGraph()。
     */
    graphStale: boolean;
    /** P4.2 执行触发状态 */
    runState: RunState;
    pendingExecutionId: string | null;
    executionError: string | null;
    showRunPanel: boolean;
    showAnalysisPanel: boolean;
    /** P4.1 聚焦参数字段（"去修复"跳转时使用） */
    focusedParamKey: string | null;
    /** W-LSP: 是否在画布叠加显示数据血缘飞线 (Data Lineage DFG) */
    showDataLineage: boolean;
    /** W-LSP: 最近一次引用名重构提示结构 */
    lastRefactorNotice: {
        oldRef: string;
        newRef: string;
        replacedCount: number;
        affectedTasks: string[];
        timestamp: number;
    } | null;
    /** 本地沙箱：试运行进行中（脚本在 Web Worker 中异步执行） */
    sandboxRunning: boolean;
    /** 本地沙箱：最近一次需要提示用户的消息（空流程、执行出错），界面显示后调用 clearSandboxNotice */
    sandboxNotice: { text: string; type: 'error' | 'info'; timestamp: number } | null;
    /** 运行态：是否显示底部并发瀑布流与时空回放面板 */
    showWaterfallPanel: boolean;
    /** 运行态：时空旅行回放游标时间戳 (ms)，为 null 表示展示最终实时态 */
    timeTravelTimestamp: number | null;
    /** 运行态：每个 DO_WHILE 循环容器当前选中的迭代轮次 (loopRef -> iteration) */
    activeLoopIterations: Record<string, number>;
    /** AI 共驾：画布原位 Cmd+K 浮窗当前锚定的任务引用名 */
    inlineCopilotTaskRef: string | null;
}

/**
 * 工作流操作接口
 */
export interface WorkflowActions {
    setWorkflow: (workflowJson: any, direction?: LayoutDirection) => void;
    /** 仅更新定义与校验结果，不重建画布（业务卡片视图下的高频编辑使用）；画布数据标记为过期 */
    setWorkflowDefOnly: (workflowJson: any) => void;
    /** 画布数据过期时，按当前定义重新解析并布局；未过期则什么都不做 */
    refreshGraph: () => void;
    setMode: (mode: EditorMode) => void;
    setExecutionData: (data: Record<string, TaskExecutionData> | null) => void;
    updateTaskStatus: (taskRef: string, status: ExecutionStatus) => void;
    loadSampleExecution: () => Promise<void>;
    importExecutionJSON: (json: any) => void;
    setLayoutDirection: (direction: LayoutDirection) => void;
    onNodesChange: (changes: any) => void;
    onEdgesChange: (changes: any) => void;
    onConnect: (connection: any) => void;
    setSelectedTask: (task: TaskDef | null) => void;
    setSelectedTaskInstance: (instance: TaskInstance | null) => void;
    checkTaskRefUniqueness: (newRef: string, currentRef: string) => boolean;
    /** 按字段合并更新任务；引用名改成重复 / 非法值时整次更新被拒绝 */
    updateTask: (taskRef: string, field: string | Record<string, any>, value?: any) => void;
    /** 用新的任务对象整体替换（JSON 面板“应用到画布”使用，删掉的键会真正删除）；成功返回 null，失败返回原因 */
    replaceTask: (taskRef: string, nextTask: TaskDef) => string | null;
    updateWorkflowProperties: (properties: Partial<WorkflowDef>) => void;
    addNode: (newNode: any, sourceId: string, targetId: string, edgeId: string, edgeData?: any) => void;
    removeNode: (nodeId: string) => void;
    addLoopTask: (loopRef: string, taskType: string) => void;
    removeLoopTask: (loopRef: string, taskRef: string) => void;
    addDecisionBranch: (taskRef: string, caseName: string) => void;
    removeDecisionBranch: (taskRef: string, caseName: string) => void;
    /** 重命名分支；新名称为空、为保留字 default 或与已有分支重名时拒绝并返回 false */
    renameDecisionBranch: (taskRef: string, oldName: string, newName: string) => boolean;
    addForkBranch: (taskRef: string) => void;
    copyTask: (task: TaskDef) => void;
    pasteTask: (task: TaskDef) => void;
    setTheme: (theme: ThemeMode) => void;
    setThemeColor: (color: ThemeColor) => void;
    setEdgeType: (edgeType: string) => void;
    setNodesLocked: (nodesLocked: boolean) => void;
    createBlankWorkflow: (name?: string) => void;
    applyAIGeneratedWorkflow: (workflowJson: any) => void;
    setIsDetailPanelOpen: (isOpen: boolean) => void;
    selectTaskAction: (task: TaskDef | null, openPanel?: boolean) => void;
    setViewMode: (viewMode: ViewMode) => void;
    startSimulation: () => void;
    stopSimulation: () => void;
    /** 短暂高亮指定节点（如 AI 提案接受后标记新增/修改的节点），到时自动恢复原选中态 */
    flashNodes: (refs: string[]) => void;
    /** P4.2: 显示/隐藏执行触发面板 */
    setShowRunPanel: (show: boolean) => void;
    /** P4.2: 显示/隐藏执行分析面板 */
    setShowAnalysisPanel: (show: boolean) => void;
    /** P4.2: 更新执行触发状态 */
    setRunState: (state: RunState, execId?: string | null, error?: string | null) => void;
    /** P4.3: 切回 edit 模式并聚焦到指定任务的指定参数字段 */
    switchToEditAndFocusParam: (taskRef: string, paramKey?: string) => void;
    /** R19：把定义记为已保存（宿主加载定义、或交给 onSave 后调用）；不传时取编辑中的定义 */
    markWorkflowSaved: (def?: WorkflowDef | null) => void;
    /** R19：编辑中的定义（运行态展示实例定义时取暂存的编辑定义）。保存、导出、宿主读取都用它 */
    getEditingWorkflowDef: () => WorkflowDef | null;
    /** R19：当前定义与最近一次加载 / 保存的版本不同（或从未记录过保存版本）时返回 true */
    hasUnsavedChanges: () => boolean;
    /** W-LSP: 切换数据血缘飞线叠加显示 */
    setShowDataLineage: (show: boolean) => void;
    /** W-LSP: 清除重构提示文案 */
    clearRefactorNotice: () => void;
    /** 本地沙箱：清除提示消息 */
    clearSandboxNotice: () => void;
    /** 运行态：切换底部并发瀑布流面板 */
    setShowWaterfallPanel: (show: boolean) => void;
    /** 运行态：设置时空旅行时间戳 */
    setTimeTravelTimestamp: (ts: number | null) => void;
    /** 运行态：切换指定 DO_WHILE 循环容器的展示迭代轮次 */
    setLoopIteration: (loopRef: string, iteration: number) => void;
    /** AI 共驾：打开/关闭画布原位 Cmd+K 浮窗 */
    setInlineCopilotTaskRef: (taskRef: string | null) => void;
    /**
     * 本地沙箱：在浏览器内试运行并进入运行视图。INLINE / JQ / SWITCH / DO_WHILE 等无外部依赖的任务真实执行，
     * 调用外部系统的任务使用模拟数据。脚本在隔离的 Web Worker 中运行，因此是异步的。
     */
    runLocalSandboxDryRun: (
        mockInput?: Record<string, any>,
        taskMocks?: Record<string, any>,
        maxLoopIterations?: number
    ) => Promise<void>;
}

/**
 * 重启选项
 * - `useLatestDef: true`  使用当前最新工作流定义版本重启
 * - `useLatestDef: false` 使用本次执行时的定义版本重启（默认）
 */
export interface RestartOptions {
    useLatestDef?: boolean;
}

/**
 * 运行态操作回调
 * 集成方通过此接口注入工作流执行操作的回调函数；未传入的回调对应的按钮不会渲染。
 *
 * 工作流级别操作：暂停、继续、终止、重试、重新运行（支持版本选择）
 * 任务级别操作：从指定任务重新运行、跳过任务
 */
export interface ExecutionActions {
    /**
     * 是否允许操作。
     * - `true`（默认）：所有操作按钮正常可用。
     * - `false`：所有操作按钮置灰并提示"操作权限受限"。
     * @default true
     */
    allowOperations?: boolean;

    /** 暂停工作流（RUNNING → PAUSED） */
    onPause?: (workflowId: string) => void;
    /** 继续执行暂停中的工作流（PAUSED → RUNNING） */
    onResume?: (workflowId: string) => void;
    /** 终止工作流（RUNNING/PAUSED → TERMINATED） */
    onTerminate?: (workflowId: string) => void;
    /** 重试失败的工作流（FAILED/TIMED_OUT/TERMINATED） */
    onRetry?: (workflowId: string) => void;
    /**
     * 重新运行工作流（需要 workflowDef.restartable = true）
     * @param options.useLatestDef true=使用最新定义版本；false=使用执行时的版本（默认）
     */
    onRestart?: (workflowId: string, options?: RestartOptions) => void;
    /**
     * 从指定任务重新运行（工作流须处于终态：FAILED/TERMINATED/COMPLETED）
     *
     * 对应 Conductor OSS API：POST /workflow/{workflowId}/rerun
     * - body: { reRunFromTaskId: taskId, taskInput: {} }
     *
     * @param workflowId    工作流实例 ID
     * @param taskReferenceName 目标任务的引用名（taskReferenceName）
     * @param taskId        目标任务实例 ID（对应 Conductor API 的 reRunFromTaskId）
     */
    onRerunFromTask?: (workflowId: string, taskReferenceName: string, taskId?: string) => void;
    /**
     * 跳过指定任务（任务须处于 SCHEDULED 或 IN_PROGRESS 状态）
     *
     * 对应 Conductor OSS API：PUT /workflow/{workflowId}/skiptask/{taskReferenceName}
     *
     * @param workflowId        工作流实例 ID
     * @param taskReferenceName 目标任务的引用名（URL path 参数）
     * @param taskId            目标任务实例 ID（可用于请求体附加校验）
     */
    onSkipTask?: (workflowId: string, taskReferenceName: string, taskId?: string) => void;
}

/**
 * 组合 Store 类型
 */
export type WorkflowStore = WorkflowState & WorkflowActions;
