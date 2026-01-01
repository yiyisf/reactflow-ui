/**
 * Conductor 任务类型枚举
 */
export type TaskType =
    | 'SIMPLE'
    | 'DYNAMIC'
    | 'FORK_JOIN'
    | 'FORK_JOIN_DYNAMIC'
    | 'DECISION'
    | 'SWITCH'
    | 'JOIN'
    | 'DO_WHILE'
    | 'SUB_WORKFLOW'
    | 'EVENT'
    | 'WAIT'
    | 'HUMAN'
    | 'USER_DEFINED'
    | 'HTTP'
    | 'LAMBDA'
    | 'EXCLUSIVE_JOIN'
    | 'TERMINATE'
    | 'KAFKA_PUBLISH'
    | 'JSON_JQ_TRANSFORM'
    | 'SET_VARIABLE';

/**
 * Conductor 任务定义
 */
export interface TaskDef {
    name: string;
    taskReferenceName: string;
    type: TaskType;
    description?: string;
    inputParameters?: Record<string, any>;
    // Decision 任务特有
    caseValueParam?: string;
    decisionCases?: Record<string, TaskDef[]>;
    defaultCase?: TaskDef[];
    // Fork 任务特有
    forkTasks?: TaskDef[][];
    // Dynamic Fork 特有
    dynamicForkTasksParam?: string;
    dynamicForkTasksInputParamName?: string;
    // Join 任务特有
    joinOn?: string[];
    // Loop 任务特有
    loopCondition?: string;
    loopOver?: TaskDef[];
    // Sub Workflow 特有
    subWorkflowParam?: {
        name: string;
        version?: number;
    };
    // 其他属性...
    optional?: boolean;
    asyncComplete?: boolean;
    startDelay?: number;
    // HTTP 任务特有
    httpRequest?: {
        method?: string;
        url?: string;
        headers?: Record<string, string>;
        body?: any;
    };
    // Event 任务特有
    sink?: string;
    // Decision 任务特有
    caseExpression?: string;
    // 通用运行属性
    retryCount?: number;
    timeoutSeconds?: number;
}

/**
 * Conductor 工作流定义
 */
export interface WorkflowDef {
    name: string;
    description?: string;
    version?: number;
    tasks: TaskDef[];
    inputParameters?: any[];
    outputParameters?: Record<string, any>;
    schemaVersion?: number;
    restartable?: boolean;
    workflowStatusListenerEnabled?: boolean;
    ownerEmail?: string;
    timeoutPolicy?: 'TERMINATE' | 'TIME_OUT_WF';
    timeoutSeconds?: number;
    variables?: Record<string, any>;
}
