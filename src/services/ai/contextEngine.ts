/**
 * AI Context Engine — 从 workflowStore 实时构建 AI 上下文
 *
 * 生成精简的结构化上下文，避免全量 JSON dump 消耗过多 token。
 */

import useWorkflowStore from '../../store/workflowStore';


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
    /** 完整工作流 JSON (仅在需要全量信息时提供) */
    fullDef?: any;
}

interface FocusTaskContext {
    task: { ref: string; name: string; type: string; inputParameters?: any };
    upstreamRefs: string[];
    downstreamRefs: string[];
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
        focusTask = {
            task: {
                ref,
                name: state.selectedTask.name,
                type: state.selectedTask.type,
                inputParameters: state.selectedTask.inputParameters,
            },
            upstreamRefs,
            downstreamRefs,
        };
    }

    // Validation issues
    const validationIssues: string[] = [];
    state.validationResults.errors.forEach(e => validationIssues.push(`❌ ${e.message}`));
    state.validationResults.warnings.forEach(w => validationIssues.push(`⚠️ ${w.message}`));

    const result: WorkflowContext = {
        summary,
        topology,
        tasks,
        focusTask,
        validationIssues,
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

    parts.push(`## 当前工作流状态\n${ctx.summary}`);

    if (ctx.tasks.length > 0) {
        parts.push(`### 任务列表\n${ctx.tasks.map(t => `- ${t.ref} (${t.type}): ${t.name}`).join('\n')}`);
    }

    if (ctx.topology) {
        parts.push(`### 拓扑关系\n${ctx.topology}`);
    }

    if (ctx.focusTask) {
        const ft = ctx.focusTask;
        parts.push(
            `### 当前选中任务\n` +
            `- 引用名: ${ft.task.ref}\n` +
            `- 类型: ${ft.task.type}\n` +
            `- 上游: ${ft.upstreamRefs.join(', ') || '无'}\n` +
            `- 下游: ${ft.downstreamRefs.join(', ') || '无'}\n` +
            (ft.task.inputParameters
                ? `- 参数: ${JSON.stringify(ft.task.inputParameters)}`
                : '')
        );
    }

    if (ctx.validationIssues.length > 0) {
        parts.push(`### 当前校验问题\n${ctx.validationIssues.join('\n')}`);
    }

    return parts.join('\n\n');
}
