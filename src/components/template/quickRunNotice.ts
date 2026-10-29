import type { WorkflowInstance } from '../../types/conductor';
import { getStatusMeta } from '../../utils/statusMeta';

export interface QuickRunNotice {
    /** 用于取「图标 + 中文 + 颜色」的状态（statusMeta） */
    status: string;
    text: string;
}

const FAILED = new Set(['FAILED', 'FAILED_WITH_TERMINAL_ERROR', 'TIMED_OUT', 'TERMINATED']);

/**
 * U1：模板中心「试跑演示」的结果提示，按真实状态写，失败时说明哪个任务、为什么。
 * 原来不管结果都写「试跑通过！」并用成功色。
 */
export function describeQuickRun(title: string, instance: Pick<WorkflowInstance, 'status' | 'tasks' | 'reasonForIncompletion'>): QuickRunNotice {
    const label = getStatusMeta(instance.status).label;
    const count = instance.tasks?.length ?? 0;
    if (instance.status === 'COMPLETED') {
        return { status: 'COMPLETED', text: `《${title}》本地试跑${label}：共执行 ${count} 个任务。点击「使用此模板」填空后开始编辑。` };
    }
    const failedTask = (instance.tasks ?? []).find((t) => FAILED.has(String(t.status)));
    const reason = failedTask?.reasonForIncompletion || instance.reasonForIncompletion;
    const where = failedTask ? `任务「${failedTask.referenceTaskName}」${getStatusMeta(failedTask.status).label}` : `流程${label}`;
    return {
        status: String(instance.status),
        text: `《${title}》本地试跑${label}：${where}${reason ? `，原因：${reason}` : ''}。可以在「使用此模板」的向导里调整参数后再试。`,
    };
}

/** 试跑本身出错（没有得到实例） */
export function describeQuickRunError(title: string, err: unknown): QuickRunNotice {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'FAILED', text: `《${title}》试跑出错：${msg}。检查模板定义后重试。` };
}
