import { Node, Edge } from 'reactflow';
import { WorkflowDef, TaskDef } from './conductor';

/**
 * 布局方向
 */
export type LayoutDirection = 'TB' | 'LR';

/**
 * 编辑模式
 */
export type EditorMode = 'view' | 'edit' | 'run';

/**
 * 解析结果
 */
export interface ParserResult {
    nodes: WorkflowNode[];
    edges: Edge[];
    taskMap: Record<string, TaskDef>;
    nextId: number;
    joinNodeId?: string; // Decision 任务专用
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
}

/**
 * 强类型节点
 */
export type WorkflowNode = Node<WorkflowNodeData>;

/**
 * 工作流存储状态
 */
export interface WorkflowState {
    mode: EditorMode;
    workflowDef: WorkflowDef | null;
    nodes: WorkflowNode[];
    edges: Edge[];
    taskMap: Record<string, TaskDef>;
    layoutDirection: LayoutDirection;
    selectedTask: TaskDef | null;
    executionData: any | null;
    validationResults: ValidationResults;
    theme: 'dark' | 'light';
    edgeType: string;
    nodesLocked: boolean;
}

/**
 * 工作流操作接口
 */
export interface WorkflowActions {
    setWorkflow: (workflowJson: any, direction?: LayoutDirection) => void;
    setMode: (mode: EditorMode) => void;
    setLayoutDirection: (direction: LayoutDirection) => void;
    onNodesChange: (changes: any) => void;
    onEdgesChange: (changes: any) => void;
    onConnect: (connection: any) => void;
    setSelectedTask: (task: TaskDef | null) => void;
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
    setTheme: (theme: 'dark' | 'light') => void;
    setEdgeType: (edgeType: string) => void;
    setNodesLocked: (nodesLocked: boolean) => void;
}

/**
 * 组合 Store 类型
 */
export type WorkflowStore = WorkflowState & WorkflowActions;
