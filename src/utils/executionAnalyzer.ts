import { TaskExecutionData, ExecutionStatus } from '../types/workflow';
import { WorkflowInstance } from '../types/conductor';

export interface DiagnosticResult {
    category: 'parameter' | 'timeout' | 'auth' | 'network' | 'logic';
    title: string;
    explanation: string;
    suggestEditParam?: string;
}

export interface StepInfo {
    taskRef: string;
    status: ExecutionStatus;
    startTime?: number;
    endTime?: number;
    durationMs?: number;
    retryCount: number;
    reasonForIncompletion?: string;
    diagnostics: DiagnosticResult[];
}

export interface ExecutionSummary {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    skippedTasks: number;
    totalDurationMs: number;
    steps: StepInfo[];
    hasFailed: boolean;
}

interface DiagnosticRule {
    pattern: RegExp;
    category: DiagnosticResult['category'];
    title: string;
    explanation: string;
    suggestEditParam?: string;
}

const DIAGNOSTIC_RULES: DiagnosticRule[] = [
    {
        pattern: /NullPointerException|null.*inputData|inputData.*null/i,
        category: 'parameter',
        title: '参数引用为空',
        explanation: '某个 inputParameters 字段引用的上游任务输出为 null。请检查 JSONPath 表达式，确认前序任务确实返回了对应字段。',
        suggestEditParam: 'inputParameters',
    },
    {
        pattern: /PathNotFoundException|No results for path|path not found/i,
        category: 'parameter',
        title: 'JSONPath 路径不存在',
        explanation: '参数中的 JSONPath 表达式（如 ${task.output.field}）在实际执行数据中找不到对应路径。请核查前序任务的实际输出结构。',
        suggestEditParam: 'inputParameters',
    },
    {
        pattern: /ClassCastException|cannot cast|type mismatch/i,
        category: 'parameter',
        title: '参数类型不匹配',
        explanation: '输入参数的数据类型与任务期望不符（如将字符串传给了数字类型参数）。请检查参数值的类型。',
        suggestEditParam: 'inputParameters',
    },
    {
        pattern: /Connection refused|connect.*timeout|SocketException/i,
        category: 'network',
        title: '网络连接失败',
        explanation: '无法连接到目标服务器。请检查 HTTP 任务的 uri 是否正确，以及目标服务是否可访问。',
        suggestEditParam: 'uri',
    },
    {
        pattern: /HTTP.*4\d\d|status.*4\d\d|4\d\d.*status/i,
        category: 'network',
        title: 'HTTP 客户端错误',
        explanation: 'HTTP 请求返回 4xx 错误，通常由请求参数、认证或权限问题引起。请检查 uri、headers、body 配置。',
        suggestEditParam: 'inputParameters',
    },
    {
        pattern: /HTTP.*5\d\d|status.*5\d\d|5\d\d.*status/i,
        category: 'network',
        title: 'HTTP 服务端错误',
        explanation: '目标服务返回 5xx 错误，服务端发生异常。可尝试重试，或检查传入的请求体是否符合服务端期望。',
        suggestEditParam: 'inputParameters',
    },
    {
        pattern: /Unauthorized|401|authentication|auth.*failed/i,
        category: 'auth',
        title: '认证失败',
        explanation: '请求被拒绝，认证信息无效或缺失。请检查 headers 中的 Authorization 或 token 参数配置。',
        suggestEditParam: 'inputParameters',
    },
    {
        pattern: /timeout|timed.?out|TIMED_OUT/i,
        category: 'timeout',
        title: '任务超时',
        explanation: '任务执行时间超过配置的超时阈值。可考虑增大 timeoutSeconds，或优化被调用服务的响应速度。',
        suggestEditParam: 'timeoutSeconds',
    },
    {
        pattern: /loopCondition|loop.*condition|condition.*false/i,
        category: 'logic',
        title: '循环条件配置问题',
        explanation: 'DO_WHILE 的 loopCondition 表达式可能无法正常求值。请检查条件表达式引用的变量是否正确。',
        suggestEditParam: 'loopCondition',
    },
    {
        pattern: /expression.*error|script.*error|evaluator.*failed/i,
        category: 'logic',
        title: '脚本表达式错误',
        explanation: 'INLINE/LAMBDA 任务的脚本表达式执行时出错。请检查 expression 或 scriptExpression 的语法和逻辑。',
        suggestEditParam: 'inputParameters',
    },
];

export function diagnoseTask(taskRef: string, executionData: Record<string, TaskExecutionData>): DiagnosticResult[] {
    const data = executionData[taskRef];
    if (!data) return [];

    const reason = data.reasonForIncompletion || '';
    if (!reason) return [];

    const results: DiagnosticResult[] = [];
    for (const rule of DIAGNOSTIC_RULES) {
        if (rule.pattern.test(reason)) {
            results.push({
                category: rule.category,
                title: rule.title,
                explanation: rule.explanation,
                suggestEditParam: rule.suggestEditParam,
            });
        }
    }

    // 通用兜底：有 reasonForIncompletion 但没匹配到规则
    if (results.length === 0 && reason.length > 0) {
        results.push({
            category: 'logic',
            title: '执行异常',
            explanation: `任务执行失败，原因：${reason.slice(0, 200)}${reason.length > 200 ? '...' : ''}`,
        });
    }

    return results;
}

export function analyzeExecution(
    executionData: Record<string, TaskExecutionData>,
    workflowInstance: WorkflowInstance | null
): ExecutionSummary {
    const steps: StepInfo[] = Object.values(executionData)
        .map(data => {
            const durationMs =
                data.startTime && data.endTime ? data.endTime - data.startTime : undefined;
            const retryCount = Math.max(0, (data.attempts?.length ?? 1) - 1);
            return {
                taskRef: data.taskReferenceName,
                status: data.status,
                startTime: data.startTime,
                endTime: data.endTime,
                durationMs,
                retryCount,
                reasonForIncompletion: data.reasonForIncompletion,
                diagnostics: diagnoseTask(data.taskReferenceName, executionData),
            } as StepInfo;
        })
        .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

    const failedStatuses: ExecutionStatus[] = ['FAILED', 'FAILED_WITH_TERMINAL_ERROR', 'TIMED_OUT'];

    const completedTasks = steps.filter(s => s.status === 'COMPLETED' || s.status === 'COMPLETED_WITH_ERRORS').length;
    const failedTasks = steps.filter(s => failedStatuses.includes(s.status)).length;
    const skippedTasks = steps.filter(s => s.status === 'SKIPPED').length;

    const allTimes = steps.flatMap(s => [s.startTime, s.endTime]).filter((t): t is number => !!t);
    const minTime = allTimes.length ? Math.min(...allTimes) : 0;
    const maxTime = allTimes.length ? Math.max(...allTimes) : 0;
    const totalDurationMs = maxTime - minTime;

    const instanceStatus = workflowInstance?.status;
    const hasFailed = instanceStatus === 'FAILED' || instanceStatus === 'TIMED_OUT' || instanceStatus === 'TERMINATED'
        || failedTasks > 0;

    return {
        totalTasks: steps.length,
        completedTasks,
        failedTasks,
        skippedTasks,
        totalDurationMs,
        steps,
        hasFailed,
    };
}

export function formatDuration(ms?: number): string {
    if (ms === undefined || ms < 0) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function getCategoryIcon(category: DiagnosticResult['category']): string {
    const icons: Record<DiagnosticResult['category'], string> = {
        parameter: '⚙️',
        timeout: '⏱️',
        auth: '🔐',
        network: '🌐',
        logic: '🔧',
    };
    return icons[category] ?? '⚠️';
}

export function getCategoryColor(category: DiagnosticResult['category']): string {
    const colors: Record<DiagnosticResult['category'], string> = {
        parameter: '#f59e0b',
        timeout: '#8b5cf6',
        auth: '#ef4444',
        network: '#3b82f6',
        logic: '#10b981',
    };
    return colors[category] ?? '#6b7280';
}
