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

    switch (taskType) {
        case 'HTTP':
        case 'HTTP_POLL': {
            const req = task.httpRequest;
            if (!req) return fallback;
            const method = req.method || 'GET';
            const uri = req.uri ? truncate(req.uri, 28) : '';
            return uri ? `${method} ${uri}` : method;
        }
        case 'SWITCH': {
            const expr = task.caseExpression;
            return expr ? truncate(expr, 35) : (task.evaluatorType || fallback);
        }
        case 'DECISION':
            return task.caseValueParam ? `param: ${task.caseValueParam}` : fallback;
        case 'SIMPLE':
            return task.name ? `worker: ${truncate(task.name, 28)}` : fallback;
        case 'INLINE':
        case 'LAMBDA':
            return task.evaluatorType ? `${task.evaluatorType} script` : fallback;
        case 'SUB_WORKFLOW': {
            const sub = task.subWorkflowParam;
            return sub ? `${sub.name}${sub.version ? ` v${sub.version}` : ''}` : fallback;
        }
        case 'DO_WHILE': {
            const cond = task.loopCondition;
            return cond ? truncate(cond, 35) : fallback;
        }
        case 'JSON_JQ_TRANSFORM': {
            const expr = task.inputParameters?.queryExpression as string;
            return expr ? truncate(expr, 35) : fallback;
        }
        case 'SET_VARIABLE': {
            const keys = Object.keys(task.inputParameters || {});
            if (!keys.length) return fallback;
            return `set: ${keys.slice(0, 2).join(', ')}${keys.length > 2 ? '…' : ''}`;
        }
        case 'EVENT':
            return task.sink ? `→ ${truncate(task.sink, 32)}` : fallback;
        case 'KAFKA_PUBLISH': {
            const topic = task.inputParameters?.topic as string;
            return topic ? `topic: ${truncate(topic, 28)}` : fallback;
        }
        case 'START_WORKFLOW': {
            const sw = (task as any).startWorkflow?.name
                ?? (task.inputParameters?.startWorkflow as any)?.name;
            return sw ? `→ ${sw}` : fallback;
        }
        default:
            return fallback;
    }
}

/** Truncate helper exported for use in node components (e.g. DecisionNode). */
export { truncate };
