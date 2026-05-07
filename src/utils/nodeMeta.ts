import { ViewMode, WorkflowNodeData } from '../types/workflow';

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) + '…' : s;
}

/**
 * Returns the meta subtitle for a node based on the current viewMode.
 * - business:  task.description (fallback to label)
 * - standard:  unchanged (returns fallback)
 * - developer: key config field for the task type
 */
export function getNodeMeta(
    taskType: string,
    data: WorkflowNodeData,
    viewMode: ViewMode,
    fallback: string,
): string {
    if (viewMode === 'business') {
        return data.task?.description?.trim() || fallback;
    }

    if (viewMode === 'standard') {
        return fallback;
    }

    // developer mode — extract key config field
    const task = data.task;
    if (!task) return fallback;

    // Conductor DSL 中部分字段可能存放在 inputParameters 内（如 http_request）
    // 因此每个 case 同时兼容两种位置
    const inp = task.inputParameters || {};

    switch (taskType) {
        case 'HTTP':
        case 'HTTP_POLL': {
            // 实际 Conductor DSL: inputParameters.http_request.{method,uri}
            // 也兼容直接写在 httpRequest 顶层的格式
            const req: any = task.httpRequest || inp.http_request;
            if (!req) return fallback;
            const method = (req.method || 'GET').toUpperCase();
            const uri = req.uri ? truncate(String(req.uri), 28) : '';
            return uri ? `${method} ${uri}` : method;
        }
        case 'SWITCH': {
            // expression 可直接在 task 上，也可在 inputParameters.expression
            const expr = task.caseExpression || (inp.expression as string);
            const evalType = task.evaluatorType || (inp.evaluatorType as string);
            return expr ? truncate(expr, 35) : (evalType || fallback);
        }
        case 'DECISION':
            return task.caseValueParam ? `param: ${task.caseValueParam}` : fallback;
        case 'SIMPLE':
            return task.name ? `worker: ${truncate(task.name, 28)}` : fallback;
        case 'INLINE':
        case 'LAMBDA': {
            // evaluatorType 可在 task 上或 inputParameters.evaluatorType
            const evalType = task.evaluatorType || (inp.evaluatorType as string);
            return evalType ? `${evalType} script` : fallback;
        }
        case 'SUB_WORKFLOW': {
            const sub = task.subWorkflowParam;
            return sub ? `${sub.name}${sub.version ? ` v${sub.version}` : ''}` : fallback;
        }
        case 'DO_WHILE': {
            const cond = task.loopCondition;
            return cond ? truncate(cond, 35) : fallback;
        }
        case 'JSON_JQ_TRANSFORM': {
            // queryExpression 通常在 inputParameters.queryExpression
            const expr = (inp.queryExpression as string) || (inp.query_expression as string);
            return expr ? truncate(expr, 35) : fallback;
        }
        case 'SET_VARIABLE': {
            const keys = Object.keys(inp);
            if (!keys.length) return fallback;
            return `set: ${keys.slice(0, 2).join(', ')}${keys.length > 2 ? '…' : ''}`;
        }
        case 'EVENT': {
            // sink 可在 task.sink 或 inputParameters.sink
            const sink = task.sink || (inp.sink as string);
            return sink ? `→ ${truncate(sink, 32)}` : fallback;
        }
        case 'KAFKA_PUBLISH': {
            const topic = (inp.topic as string) || (inp.kafka_request as any)?.topic;
            return topic ? `topic: ${truncate(topic, 28)}` : fallback;
        }
        case 'START_WORKFLOW': {
            const sw = (task as any).startWorkflow?.name
                ?? (inp.startWorkflow as any)?.name
                ?? (inp.start_workflow as any)?.name;
            return sw ? `→ ${sw}` : fallback;
        }
        default:
            return fallback;
    }
}

/** Truncate helper exported for use in node components (e.g. DecisionNode). */
export { truncate };
