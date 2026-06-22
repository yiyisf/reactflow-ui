/**
 * AI Context Engine — 从 workflowStore 实时构建 AI 上下文
 *
 * 生成精简的结构化上下文，避免全量 JSON dump 消耗过多 token。
 */

import useWorkflowStore from '../../store/workflowStore';

export interface ExecutionContext {
    /** 实例 ID（截短） */
    instanceId?: string;
    /** 工作流整体状态 */
    workflowStatus?: string;
    /** 失败任务 */
    failedTasks: Array<{ ref: string; type: string; reason?: string }>;
    /** 进行中的任务 */
    inProgressTasks: string[];
    /** 已完成任务数 */
    completedCount: number;
    /** 总任务数 */
    totalCount: number;
}

export interface WorkflowContext {
    /** 一句话摘要 */
    summary: string;
    /** 拓扑关系（文字表达） */
    topology: string;
    /** 任务列表摘要 */
    tasks: Array<{ ref: string; name: string; type: string }>;
    /** 当前选中任务的上下文 */
    focusTask?: FocusTaskContext;
    /** 校验问题 */
    validationIssues: string[];
    /** 运行态执行上下文（run 模式下注入） */
    execution?: ExecutionContext;
    /** 完整工作流 JSON (仅在需要全量信息时提供) */
    fullDef?: any;
}

interface FocusTaskContext {
    task: { ref: string; name: string; type: string; inputParameters?: any };
    upstreamRefs: string[];
    downstreamRefs: string[];
    /** 运行态：该任务的执行状态和失败原因 */
    executionStatus?: string;
    executionFailureReason?: string;
}

/**
 * 构建工作流上下文摘要
 */
export function buildContext(options?: { includeFull?: boolean }): WorkflowContext {
    const state = useWorkflowStore.getState();
    const def = state.workflowDef;

    if (!def) {
        return {
            summary: '当前没有加载任何工作流。画布为空。',
            topology: '',
            tasks: [],
            validationIssues: [],
        };
    }

    const tasks = def.tasks.map(t => ({
        ref: t.taskReferenceName,
        name: t.name,
        type: t.type,
    }));

    // Build topology string from edges
    const edges = state.edges;
    const adjList: Record<string, string[]> = {};
    edges.forEach(e => {
        if (!adjList[e.source]) adjList[e.source] = [];
        adjList[e.source].push(e.target);
    });

    const topoLines: string[] = [];
    edges.forEach(e => {
        const label = e.label ? ` [${e.label}]` : '';
        topoLines.push(`${e.source} → ${e.target}${label}`);
    });
    const topology = topoLines.length > 0
        ? topoLines.join('\n')
        : def.tasks.map(t => t.taskReferenceName).join(' → ');

    // Summary
    const taskTypes = new Map<string, number>();
    def.tasks.forEach(t => taskTypes.set(t.type, (taskTypes.get(t.type) || 0) + 1));
    const typesSummary = Array.from(taskTypes.entries())
        .map(([type, count]) => `${count}×${type}`)
        .join(', ');
    const summary = `工作流「${def.name}」包含 ${def.tasks.length} 个任务 (${typesSummary})。`;

    // Focus task
    let focusTask: FocusTaskContext | undefined;
    if (state.selectedTask) {
        const ref = state.selectedTask.taskReferenceName;
        const upstreamRefs = edges.filter(e => e.target === ref).map(e => e.source);
        const downstreamRefs = edges.filter(e => e.source === ref).map(e => e.target);
        const execData = state.executionData?.[ref];
        focusTask = {
            task: {
                ref,
                name: state.selectedTask.name,
                type: state.selectedTask.type,
                inputParameters: state.selectedTask.inputParameters,
            },
            upstreamRefs,
            downstreamRefs,
            executionStatus: execData?.status,
            executionFailureReason: execData?.reasonForIncompletion,
        };
    }

    // Validation issues
    const validationIssues: string[] = [];
    state.validationResults.errors.forEach(e => validationIssues.push(`❌ ${e.message}`));
    state.validationResults.warnings.forEach(w => validationIssues.push(`⚠️ ${w.message}`));

    // Execution context (run mode only)
    let execution: ExecutionContext | undefined;
    if (state.mode === 'run' && state.executionData) {
        const execMap = state.executionData;
        const allRefs = Object.keys(execMap);
        const failed = allRefs
            .filter(r => execMap[r].status === 'FAILED' || execMap[r].status === 'FAILED_WITH_TERMINAL_ERROR' || execMap[r].status === 'TIMED_OUT')
            .map(r => ({
                ref: r,
                type: state.taskMap[r]?.type ?? 'UNKNOWN',
                reason: execMap[r].reasonForIncompletion,
            }));
        const inProgress = allRefs.filter(r => execMap[r].status === 'IN_PROGRESS' || execMap[r].status === 'SCHEDULED');
        const completed = allRefs.filter(r => execMap[r].status === 'COMPLETED' || execMap[r].status === 'COMPLETED_WITH_ERRORS');
        execution = {
            instanceId: state.workflowInstance?.workflowId?.slice(0, 16),
            workflowStatus: state.workflowInstance?.status,
            failedTasks: failed,
            inProgressTasks: inProgress,
            completedCount: completed.length,
            totalCount: def.tasks.length,
        };
    }

    const result: WorkflowContext = {
        summary,
        topology,
        tasks,
        focusTask,
        validationIssues,
        execution,
    };

    if (options?.includeFull) {
        result.fullDef = def;
    }

    return result;
}

/**
 * 将 WorkflowContext 格式化为 system prompt 中的上下文段落
 */
export function formatContextForPrompt(ctx: WorkflowContext): string {
    const parts: string[] = [];

    // Timestamp helps LLM treat this as authoritative over stale conversation history
    parts.push(`## 当前工作流状态（实时读取，以此为准）\n> ⚠️ 以下数据直接从画布实时获取，若与对话历史中的工作流描述有冲突，**以此处为准**。\n\n${ctx.summary}`);

    if (ctx.tasks.length > 0) {
        parts.push(`### 任务列表\n${ctx.tasks.map(t => `- ${t.ref} (${t.type}): ${t.name}`).join('\n')}`);
    }

    if (ctx.topology) {
        parts.push(`### 拓扑关系\n${ctx.topology}`);
    }

    if (ctx.focusTask) {
        const ft = ctx.focusTask;
        const execLine = ft.executionStatus
            ? `\n- 执行状态: ${ft.executionStatus}${ft.executionFailureReason ? `（原因: ${ft.executionFailureReason}）` : ''}`
            : '';
        parts.push(
            `### 当前选中任务\n` +
            `- 引用名: ${ft.task.ref}\n` +
            `- 类型: ${ft.task.type}\n` +
            `- 上游: ${ft.upstreamRefs.join(', ') || '无'}\n` +
            `- 下游: ${ft.downstreamRefs.join(', ') || '无'}` +
            execLine +
            (ft.task.inputParameters
                ? `\n- 参数: ${JSON.stringify(ft.task.inputParameters)}`
                : '')
        );
    }

    if (ctx.validationIssues.length > 0) {
        parts.push(`### 当前校验问题\n${ctx.validationIssues.join('\n')}`);
    }

    // Full workflow JSON — only injected when includeFull is requested (VISUALIZE / REFACTOR / etc.)
    // This is the authoritative source for the AI; any diagram or analysis MUST be based on this.
    if (ctx.fullDef) {
        parts.push(
            `### 画布工作流完整 JSON（以此为权威数据源，生成流程图或分析必须基于此）\n` +
            `\`\`\`json\n${JSON.stringify(ctx.fullDef, null, 2)}\n\`\`\``
        );
    }

    if (ctx.execution) {
        const ex = ctx.execution;
        const statusLine = ex.workflowStatus ? `工作流状态：**${ex.workflowStatus}**` : '';
        const progressLine = `完成 ${ex.completedCount}/${ex.totalCount} 个任务`;
        const failedLines = ex.failedTasks.length > 0
            ? `\n**失败任务（${ex.failedTasks.length}个）：**\n` +
              ex.failedTasks.map(t => `- ${t.ref} (${t.type})${t.reason ? `：${t.reason}` : ''}`).join('\n')
            : '';
        const inProgressLine = ex.inProgressTasks.length > 0
            ? `\n**进行中：** ${ex.inProgressTasks.join(', ')}`
            : '';
        parts.push(
            `## 运行态执行信息（实时）\n` +
            [statusLine, progressLine].filter(Boolean).join('　') +
            failedLines +
            inProgressLine
        );
    }

    return parts.join('\n\n');
}
