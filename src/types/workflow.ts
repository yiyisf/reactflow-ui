import { Node, Edge, Position } from 'reactflow';
import { WorkflowDef, TaskDef, WorkflowInstance, TaskInstance } from './conductor';

// ─── 视图模式 ───────────────────────────────────────────────────────────────

/**
 * 视图详情级别（独立于编辑模式）
 * - `business`：仅展示核心业务节点，控制/数据节点折叠为边标签
 * - `standard`：业务 + 控制流节点
 * - `developer`：全部节点（含数据转换等）
 */
export type ViewMode = 'business' | 'standard' | 'developer';

// ─── AI Diff 类型 ─────────────────────────────────────────────────────────

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
 * 工作流存储状态
 */
export interface WorkflowState {
    mode: EditorMode;
    viewMode: ViewMode;
    workflowDef: WorkflowDef | null;
    workflowInstance: WorkflowInstance | null;
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
}

/**
 * 工作流操作接口
 */
export interface WorkflowActions {
    setWorkflow: (workflowJson: any, direction?: LayoutDirection) => void;
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
    updateTask: (taskRef: string, field: string | Record<string, any>, value?: any) => void;
    updateWorkflowProperties: (properties: Partial<WorkflowDef>) => void;
    addNode: (newNode: any, sourceId: string, targetId: string, edgeId: string, edgeData?: any) => void;
    removeNode: (nodeId: string) => void;
    addLoopTask: (loopRef: string, taskType: string) => void;
    removeLoopTask: (loopRef: string, taskRef: string) => void;
    addDecisionBranch: (taskRef: string, caseName: string) => void;
    removeDecisionBranch: (taskRef: string, caseName: string) => void;
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
}

/**
 * 运行态操作回调
 * 集成方通过此接口注入工作流执行操作（暂停/恢复/停止/重试/重启）的回调函数。
 * 未传入的回调对应的按钮不会渲染。
 */
export interface ExecutionActions {
    onRestart?: (workflowId: string) => void;
    onPause?: (workflowId: string) => void;
    onResume?: (workflowId: string) => void;
    onTerminate?: (workflowId: string) => void;
    onRetry?: (workflowId: string) => void;
}

/**
 * 组合 Store 类型
 */
export type WorkflowStore = WorkflowState & WorkflowActions;
