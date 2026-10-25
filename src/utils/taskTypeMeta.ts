/**
 * Task Type Meta — business-friendly labels for Conductor task types
 *
 * Used by ProposalPreviewCard so AI proposals speak business language for each
 * task type (originally extracted from the former BusinessCanvas, which the AI IDE
 * business view replaced with StepFlowEditor in 1.2.x).
 */

export interface TaskTypeMeta {
    label: string;
    /** CMASTER icon name (see components/icons/iconRegistry.ts), rendered with <CmIcon>. */
    icon: string;
    who: string;
    color: string;
}

export const TASK_TYPE_LABELS: Record<string, TaskTypeMeta> = {
    SIMPLE:              { label: '自动任务',   icon: 'settings',  who: '系统自动执行', color: 'var(--cm-cat-task)' },
    HTTP:                { label: '接口调用',   icon: 'globe',  who: '调用外部服务', color: 'var(--cm-cat-task)' },
    SWITCH:              { label: '条件判断',   icon: 'shuffle',  who: '系统判断',     color: 'var(--cm-cat-control)' },
    FORK_JOIN:           { label: '并行处理',   icon: 'zap',  who: '并行执行',     color: 'var(--cm-cat-control)' },
    FORK_JOIN_DYNAMIC:   { label: '动态并行',   icon: 'zap',  who: '并行执行',     color: 'var(--cm-cat-control)' },
    DO_WHILE:            { label: '循环处理',   icon: 'repeat',  who: '系统循环',     color: 'var(--cm-cat-control)' },
    SUB_WORKFLOW:        { label: '子流程',     icon: 'package',  who: '调用子流程',   color: 'var(--cm-cat-task)' },
    EVENT:               { label: '发送事件',   icon: 'radio',  who: '系统发送',     color: 'var(--cm-cat-task)' },
    WAIT:                { label: '等待',       icon: 'hourglass',  who: '系统等待',     color: 'var(--cm-cat-control)' },
    HUMAN:               { label: '人工处理',   icon: 'user',  who: '需要人工操作', color: 'var(--cm-cat-human)' },
    INLINE:              { label: '数据处理',   icon: 'braces',  who: '系统计算',     color: 'var(--cm-cat-data)' },
    TERMINATE:           { label: '终止流程',   icon: 'stop-circle',  who: '结束执行',     color: 'var(--cm-status-failed)' },
    SET_VARIABLE:        { label: '设置变量',   icon: 'pencil',  who: '系统记录',     color: 'var(--cm-cat-data)' },
    KAFKA_PUBLISH:       { label: '消息发布',   icon: 'send',  who: '发布消息',     color: 'var(--cm-cat-task)' },
    JSON_JQ_TRANSFORM:   { label: '数据转换',   icon: 'shuffle',  who: '格式转换',     color: 'var(--cm-cat-data)' },
    START_WORKFLOW:      { label: '启动子流程', icon: 'play',  who: '触发子流程',   color: 'var(--cm-cat-task)' },
    NOOP:                { label: '占位步骤',   icon: 'circle',   who: '无操作',       color: 'var(--cm-cat-control)' },
    JOIN:                { label: '并行合并',   icon: 'merge',  who: '等待所有分支', color: 'var(--cm-cat-control)' },
};

const DEFAULT_META: TaskTypeMeta = { label: '', icon: 'settings', who: '执行', color: 'var(--cm-cat-task)' };

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
