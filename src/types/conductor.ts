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
    | 'EXCLUSIVE_JOIN'
    | 'DO_WHILE'
    | 'SUB_WORKFLOW'
    | 'EVENT'
    | 'WAIT'
    | 'HUMAN'
    | 'USER_DEFINED'
    | 'HTTP'
    | 'INLINE'
    | 'LAMBDA'
    | 'TERMINATE'
    | 'KAFKA_PUBLISH'
    | 'JSON_JQ_TRANSFORM'
    | 'SET_VARIABLE'
    | 'START_WORKFLOW'
    | 'NOOP';

/**
 * Conductor 任务定义
 */
/**
 * Conductor 任务定义
 */
export interface TaskDef {
    /** 任务名称 (必须唯一) */
    name: string;
    /** 任务引用名称 (在工作流内必须唯一) */
    taskReferenceName: string;
    /** 任务类型 */
    type: TaskType;
    /** 任务描述 */
    description?: string;
    /** 
     * 输入参数映射
     * 支持 JSONPath 表达式 (e.g. `${workflow.input.value}`)
     */
    inputParameters?: Record<string, any>;

    // Decision 任务特有
    /** Decision case key 参数名 */
    caseValueParam?: string;
    /** 分支定义映射 (caseValue -> Task List) */
    decisionCases?: Record<string, TaskDef[]>;
    /** 默认分支 */
    defaultCase?: TaskDef[];

    // Fork 任务特有
    /** 并行分支列表 */
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
        uri?: string;
        headers?: Record<string, string>;
        body?: any;
        contentType?: string;
        accept?: string;
        connectionTimeOut?: number;
        readTimeOut?: number;
    };

    // Event 任务特有
    sink?: string;

    // INLINE/LAMBDA 任务特有
    evaluatorType?: 'graaljs' | 'javascript' | 'value-param' | 'python';
    expression?: string;

    // Decision 任务特有
    caseExpression?: string;
    defaultExclusiveJoinTask?: string[];

    // DO_WHILE 任务特有
    keepLastN?: number;

    // Dynamic Fork 简化配置
    forkTaskType?: string;
    forkTaskName?: string;
    forkTaskWorkflow?: string;
    forkTaskWorkflowVersion?: string;

    // Dynamic 任务特有
    dynamicTaskNameParam?: string;

    // HUMAN 任务特有
    humanTaskDef?: {
        userFormTemplate?: string;
        assignmentCompletionStrategy?: string;
        displayName?: string;
    };

    /**
     * 内嵌任务定义（Conductor WorkflowTask.taskDefinition）。超时 / 重试策略等 TaskDef 字段只在这里或已注册的
     * 任务定义中生效；设置后 Conductor 用它代替同名的已注册任务定义。
     */
    taskDefinition?: Record<string, any>;

    // 通用运行属性
    /** WorkflowTask 自身支持 retryCount（覆盖任务定义里的值） */
    retryCount?: number;
    /** @deprecated 写在 WorkflowTask 顶层会被 Conductor 忽略，请改用 taskDefinition.retryLogic */
    retryLogic?: 'FIXED' | 'EXPONENTIAL_BACKOFF' | 'LINEAR_BACKOFF';
    /** @deprecated 请改用 taskDefinition.retryDelaySeconds */
    retryDelaySeconds?: number;
    /** @deprecated 请改用 taskDefinition.timeoutSeconds */
    timeoutSeconds?: number;
    /** @deprecated 请改用 taskDefinition.timeoutPolicy */
    timeoutPolicy?: 'RETRY' | 'TIME_OUT_WF' | 'ALERT_ONLY' | 'FAIL_WORKFLOW';
}

/**
 * Conductor 标准 Schema 定义（WorkflowDef / TaskDef 的 inputSchema / outputSchema）。
 * 仅 JSON 类型会被服务端真正校验；data 为 JSON Schema 文档本身。
 */
export interface SchemaDef {
    name?: string;
    version?: number;
    type?: 'JSON' | 'AVRO' | 'PROTOBUF' | string;
    data?: Record<string, any>;
    externalRef?: string;
}

/**
 * 工作流入参定义（结构化，向后兼容 string[] 旧格式）
 */
export interface WorkflowInputParam {
    /** 参数名 */
    name: string;
    /** 参数类型 */
    type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
    /** 用途说明 */
    description?: string;
    /** 是否必填 */
    required?: boolean;
    /** 默认值 */
    defaultValue?: any;
    /** 示例值（在执行验证表单中展示） */
    example?: any;
}

/**
 * 解析工作流入参声明：兼容 string[] 旧格式与 WorkflowInputParam[] 新格式
 */
export function parseWorkflowInputParams(
    raw: any[] | undefined,
    def?: Pick<WorkflowDef, 'inputSchema' | 'inputTemplate'> | null
): WorkflowInputParam[] {
    if (!raw || raw.length === 0) return [];
    if (typeof raw[0] !== 'string') {
        // 旧版编辑器写入的对象数组（Conductor 不接受，读取时仍兼容）
        return raw as WorkflowInputParam[];
    }
    const props: Record<string, any> =
        (def?.inputSchema?.data && typeof def.inputSchema.data.properties === 'object' && def.inputSchema.data.properties) || {};
    const required: string[] = Array.isArray(def?.inputSchema?.data?.required) ? def!.inputSchema!.data!.required : [];
    const template = def?.inputTemplate || {};
    return (raw as string[]).map(name => {
        const param: WorkflowInputParam = { name };
        const prop = props[name];
        if (prop && typeof prop === 'object') {
            const t = Array.isArray(prop.type) ? prop.type.find((x: string) => x !== 'null') : prop.type;
            if (t === 'integer') param.type = 'number';
            else if (['string', 'number', 'boolean', 'object', 'array'].includes(t)) param.type = t;
            if (typeof prop.description === 'string' && prop.description) param.description = prop.description;
            if (Array.isArray(prop.examples) && prop.examples.length > 0) param.example = prop.examples[0];
        }
        if (required.includes(name)) param.required = true;
        if (template[name] !== undefined) param.defaultValue = template[name];
        return param;
    });
}

const hasStructuredInfo = (p: WorkflowInputParam) =>
    (p.type !== undefined && p.type !== 'string') ||
    !!p.description ||
    !!p.required ||
    (p.example !== undefined && p.example !== '');

/**
 * 把结构化入参写回 Conductor 能接受的形态（E22）：
 * - `inputParameters` 只保留参数名（Conductor WorkflowDef 只接受 List<String>）
 * - 类型 / 说明 / 必填 / 示例写入 `inputSchema`（JSON Schema，Conductor 标准字段）
 * - 默认值写入 `inputTemplate`（Conductor 启动时用它补齐缺省入参）
 * 只改动由入参列表管理的键，用户手写的其他 schema 属性 / 模板键原样保留。
 */
export function serializeWorkflowInputParams(
    params: WorkflowInputParam[],
    def: Pick<WorkflowDef, 'name' | 'inputParameters' | 'inputSchema' | 'inputTemplate'>
): Pick<WorkflowDef, 'inputParameters' | 'inputSchema' | 'inputTemplate'> {
    const prevNames = parseWorkflowInputParams(def.inputParameters as any[] | undefined).map(p => p.name);
    const nextNames = params.map(p => p.name);
    const managed = new Set([...prevNames, ...nextNames]);
    const result: Pick<WorkflowDef, 'inputParameters' | 'inputSchema' | 'inputTemplate'> = {
        inputParameters: nextNames,
    };

    // 默认值 → inputTemplate
    const template: Record<string, any> = {};
    Object.entries(def.inputTemplate || {}).forEach(([k, v]) => {
        if (!managed.has(k)) template[k] = v;
    });
    params.forEach(p => {
        if (p.name && p.defaultValue !== undefined && p.defaultValue !== '') template[p.name] = p.defaultValue;
    });
    if (def.inputTemplate !== undefined || Object.keys(template).length > 0) result.inputTemplate = template;

    // 类型 / 说明 / 必填 / 示例 → inputSchema
    const existing = def.inputSchema;
    if (existing || params.some(hasStructuredInfo)) {
        const data: Record<string, any> = { type: 'object', ...(existing?.data || {}) };
        const prevProps: Record<string, any> = (data.properties && typeof data.properties === 'object') ? data.properties : {};
        const props: Record<string, any> = {};
        Object.entries(prevProps).forEach(([k, v]) => {
            if (!managed.has(k)) props[k] = v;
        });
        const prevRequired: string[] = Array.isArray(data.required) ? data.required : [];
        const required = prevRequired.filter(k => !managed.has(k));
        params.forEach(p => {
            if (!p.name) return;
            const prop: Record<string, any> = { ...(prevProps[p.name] || {}) };
            prop.type = p.type || 'string';
            if (p.description) prop.description = p.description; else delete prop.description;
            if (p.example !== undefined && p.example !== '') prop.examples = [p.example]; else delete prop.examples;
            props[p.name] = prop;
            if (p.required) required.push(p.name);
        });
        data.properties = props;
        data.required = required;
        result.inputSchema = {
            name: existing?.name || `${def.name || 'workflow'}_input`,
            version: existing?.version ?? 1,
            type: existing?.type || 'JSON',
            ...(existing?.externalRef ? { externalRef: existing.externalRef } : {}),
            data,
        };
    }
    return result;
}

/**
 * Conductor 工作流定义
 */
/**
 * Conductor 工作流定义
 */
export interface WorkflowDef {
    /** 工作流名称 */
    name: string;
    /** 工作流描述 */
    description?: string;
    /** 版本号 */
    version?: number;
    /** 任务列表 (DAG 定义) */
    tasks: TaskDef[];
    /** 输入参数定义：支持 string[]（旧格式）或 WorkflowInputParam[]（结构化新格式） */
    inputParameters?: string[] | WorkflowInputParam[];
    /** 输出参数映射 */
    outputParameters?: Record<string, any>;
    schemaVersion?: number;
    restartable?: boolean;
    workflowStatusListenerEnabled?: boolean;
    ownerEmail?: string;
    timeoutPolicy?: 'TIME_OUT_WF' | 'ALERT_ONLY';
    timeoutSeconds?: number;
    variables?: Record<string, any>;
    /** 失败时触发的补偿工作流名称 */
    failureWorkflow?: string;
    /** 默认输入模板 */
    inputTemplate?: Record<string, any>;
    /** 状态事件发送目标 */
    workflowStatusListenerSink?: string;
    /** 并发限流配置 */
    rateLimitConfig?: {
        rateLimitKey?: string;
        concurrentExecLimit?: number;
    };
    /** 输入 Schema 定义 */
    inputSchema?: SchemaDef;
    /** 输出 Schema 定义 */
    outputSchema?: SchemaDef;
    /** 是否强制 Schema 校验 */
    enforceSchema?: boolean;
}

/**
 * Conductor 任务实例 (运行时)
 */
export interface TaskInstance {
    taskType: string;
    status:
    | 'IN_PROGRESS'
    | 'CANCELED'
    | 'FAILED'
    | 'FAILED_WITH_TERMINAL_ERROR'
    | 'COMPLETED'
    | 'COMPLETED_WITH_ERRORS'
    | 'SCHEDULED'
    | 'TIMED_OUT'
    | 'SKIPPED';
    inputData?: Record<string, any>;
    outputData?: Record<string, any>;
    referenceTaskName: string;
    retryCount?: number;
    iteration?: number;
    seq?: number;
    correlationId?: string;
    pollCount?: number;
    taskDefName?: string;
    scheduledTime?: number;
    startTime?: number;
    endTime?: number;
    updateTime?: number;
    startDelayInSeconds?: number;
    retriedTaskId?: string;
    retried?: boolean;
    executed?: boolean;
    callbackFromWorker?: boolean;
    responseTimeoutSeconds?: number;
    workflowInstanceId?: string;
    workflowType?: string;
    taskId: string;
    reasonForIncompletion?: string;
    callbackAfterSeconds?: number;
    workerId?: string;
    externalInputPayloadStoragePath?: string;
    externalOutputPayloadStoragePath?: string;
    workflowTask?: TaskDef;
}

/**
 * Conductor 工作流实例 (运行时)
 */
export interface WorkflowInstance {
    status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMED_OUT' | 'TERMINATED' | 'PAUSED';
    endTime?: number;
    workflowId: string;
    workflowName?: string;
    workflowVersion?: number;
    parentWorkflowId?: string;
    parentWorkflowTaskId?: string;
    tasks: TaskInstance[];
    input?: Record<string, any>;
    output?: Record<string, any>;
    correlationId?: string;
    reRunFromWorkflowId?: string;
    reasonForIncompletion?: string;
    event?: string;
    taskToDomain?: Record<string, string>;
    failedReferenceTaskNames?: string[];
    failedTaskNames?: string[];
    workflowDefinition: WorkflowDef;
    externalInputPayloadStoragePath?: string;
    externalOutputPayloadStoragePath?: string;
    priority?: number;
    variables?: Record<string, any>;
    lastRetriedTime?: number;
    createTime: number;
    updateTime?: number;
    startTime?: number; // Added missing property
    createdBy?: string;
    updatedBy?: string;
}
