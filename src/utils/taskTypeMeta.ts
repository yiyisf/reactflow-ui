/**
 * Task Type Meta — business-friendly labels for Conductor task types
 *
 * Shared by BusinessCanvas and ProposalPreviewCard so both surfaces speak the
 * same business language for the same task type (extracted from BusinessCanvas
 * during the UX Phase A proposal-preview work).
 */

export interface TaskTypeMeta {
    label: string;
    icon: string;
    who: string;
    color: string;
}

export const TASK_TYPE_LABELS: Record<string, TaskTypeMeta> = {
    SIMPLE:              { label: '自动任务',   icon: '⚙️',  who: '系统自动执行', color: '#6366f1' },
    HTTP:                { label: '接口调用',   icon: '🌐',  who: '调用外部服务', color: '#3b82f6' },
    SWITCH:              { label: '条件判断',   icon: '🔀',  who: '系统判断',     color: '#f59e0b' },
    FORK_JOIN:           { label: '并行处理',   icon: '⚡',  who: '并行执行',     color: '#8b5cf6' },
    FORK_JOIN_DYNAMIC:   { label: '动态并行',   icon: '⚡',  who: '并行执行',     color: '#8b5cf6' },
    DO_WHILE:            { label: '循环处理',   icon: '🔁',  who: '系统循环',     color: '#6366f1' },
    SUB_WORKFLOW:        { label: '子流程',     icon: '📦',  who: '调用子流程',   color: '#0ea5e9' },
    EVENT:               { label: '发送事件',   icon: '📡',  who: '系统发送',     color: '#10b981' },
    WAIT:                { label: '等待',       icon: '⏳',  who: '系统等待',     color: '#94a3b8' },
    HUMAN:               { label: '人工处理',   icon: '👤',  who: '需要人工操作', color: '#ec4899' },
    INLINE:              { label: '数据处理',   icon: '📊',  who: '系统计算',     color: '#6366f1' },
    TERMINATE:           { label: '终止流程',   icon: '🛑',  who: '结束执行',     color: '#ef4444' },
    SET_VARIABLE:        { label: '设置变量',   icon: '📝',  who: '系统记录',     color: '#64748b' },
    KAFKA_PUBLISH:       { label: '消息发布',   icon: '📨',  who: '发布消息',     color: '#f97316' },
    JSON_JQ_TRANSFORM:   { label: '数据转换',   icon: '🔄',  who: '格式转换',     color: '#6366f1' },
    START_WORKFLOW:      { label: '启动子流程', icon: '▶️',  who: '触发子流程',   color: '#3b82f6' },
    NOOP:                { label: '占位步骤',   icon: '○',   who: '无操作',       color: '#94a3b8' },
    JOIN:                { label: '并行合并',   icon: '🔗',  who: '等待所有分支', color: '#8b5cf6' },
};

const DEFAULT_META: TaskTypeMeta = { label: '', icon: '⚙️', who: '执行', color: '#64748b' };

/** Looks up business-friendly metadata for a task type, falling back to the type name itself as the label. */
export function getTaskTypeMeta(taskType: string): TaskTypeMeta {
    const meta = TASK_TYPE_LABELS[taskType];
    if (meta) return meta;
    return { ...DEFAULT_META, label: taskType };
}

/** Converts a taskReferenceName (e.g. "send_email") into a human-readable name ("Send Email"). */
export function toBusinessName(ref: string): string {
    return ref
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
}
