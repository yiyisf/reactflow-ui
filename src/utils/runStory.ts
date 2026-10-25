import type { TaskInstance, WorkflowInstance } from '../types/conductor';
import { getStatusMeta, type StatusTone } from './statusMeta';

/**
 * Run story sentences (B11, B12). Built only from what the run actually returned: when a value is missing the clause
 * is left out, never filled with a made-up default.
 */

const present = (v: unknown): boolean => v !== undefined && v !== null && v !== '';
const str = (v: unknown): string => (typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Sentence for a step that did not complete normally, or null when it completed. */
function statusSentence(status: string): string | null {
    switch (status) {
        case 'COMPLETED':
            return null;
        case 'COMPLETED_WITH_ERRORS':
            return '已完成，但有部分错误，请查看数据。';
        case 'FAILED':
        case 'FAILED_WITH_TERMINAL_ERROR':
            return '运行在此步骤中断，原因见下方诊断。';
        case 'TIMED_OUT':
            return '此步骤已超时，原因见下方诊断。';
        case 'IN_PROGRESS':
            return '正在执行。';
        case 'SCHEDULED':
            return '等待执行。';
        case 'SKIPPED':
            return '已跳过此步骤。';
        case 'CANCELED':
            return '此步骤已取消。';
        default:
            return `状态：${getStatusMeta(status).label}。`;
    }
}

function joinSentence(task: TaskInstance, all: TaskInstance[]): string {
    const joinOn = task.inputData?.joinOn;
    if (!Array.isArray(joinOn) || joinOn.length === 0) return '并行分支已汇合。';
    const latest = (ref: string) => {
        const matches = all.filter((t) => t.referenceTaskName === ref);
        return matches[matches.length - 1];
    };
    const states = joinOn.map((ref: string) => latest(ref)?.status);
    const known = states.filter((s): s is TaskInstance['status'] => !!s);
    const failed = known.filter((s) => getStatusMeta(s).isFailure).length;
    const ok = known.filter((s) => s === 'COMPLETED').length;
    let tail = '';
    if (known.length === joinOn.length && ok === joinOn.length) tail = '，全部成功';
    else if (failed > 0) tail = `，其中 ${failed} 个失败`;
    else if (known.length < joinOn.length) tail = `，${joinOn.length - known.length} 个没有运行记录`;
    return `${joinOn.length} 个并行分支已汇合${tail}。`;
}

/**
 * One sentence describing what a step did in this run.
 * @param actionName display name of the step's action (falls back to task names)
 * @param allTasks all tasks of the run (used for JOIN summaries)
 */
export function generateStorySentence(
    task: TaskInstance,
    options: { actionId?: string; actionName?: string; allTasks?: TaskInstance[] } = {},
): string {
    const fromStatus = statusSentence(task.status);
    if (fromStatus) return fromStatus;

    const out: Record<string, unknown> = task.outputData ?? {};
    const { actionId } = options;
    const name = options.actionName || task.taskDefName || task.referenceTaskName;
    const parts = (head: string, clauses: Array<[unknown, (v: unknown) => string]>) =>
        head + clauses.filter(([v]) => present(v)).map(([v, f]) => f(v)).join('') + '。';

    switch (actionId) {
        case 'ecs.create_instance':
            return parts('已创建云主机', [[out.instanceId, (v) => `，实例 ID ${str(v)}`], [out.privateIp, (v) => `，内网 IP ${str(v)}`]]);
        case 'ecs.query_instance':
            return parts('已查询主机状态', [[out.status, (v) => `：${str(v)}`], [out.publicIp, (v) => `，公网 IP ${str(v)}`]]);
        case 'ecs.run_command': {
            const exit = out.exitCode;
            return parts('远程命令已执行', [
                [out.commandId, (v) => `，命令批次 ${str(v)}`],
                [exit, (v) => (Number(v) === 0 ? '，退出码 0' : `，退出码 ${str(v)}（非 0，请查看输出）`)],
            ]);
        }
        case 'ecs.create_snapshot':
            return parts('已创建快照', [[out.snapshotId, (v) => `，快照 ID ${str(v)}`]]);
        case 'ecs.stop_instance':
            return parts('已关闭云主机', [[out.status, (v) => `，当前状态 ${str(v)}`]]);
        case 'ecs.start_instance':
            return parts('已启动云主机', [[out.status, (v) => `，当前状态 ${str(v)}`]]);
        case 'ecs.modify_spec':
            if (present(out.oldSpec) && present(out.newSpec)) return `已变更规格（${str(out.oldSpec)} → ${str(out.newSpec)}）。`;
            return parts('已变更规格', [[out.newSpec, (v) => `为 ${str(v)}`]]);
        case 'ecs.get_monitor_metrics': {
            const metrics: Array<[unknown, (v: unknown) => string]> = [
                [out.cpuUsagePercent, (v) => `CPU 利用率 ${str(v)}%`],
                [out.memoryUsagePercent, (v) => `内存利用率 ${str(v)}%`],
            ];
            const got = metrics.filter(([v]) => present(v)).map(([v, f]) => f(v));
            return got.length ? `采集到负载：${got.join('，')}。` : '已采集监控指标。';
        }
        case 'notify.send_message':
            return parts('已发送通知', [[out.status, (v) => `，状态 ${str(v)}`]]);
        default:
            break;
    }

    if (actionId === 'control.wait' || task.taskType === 'WAIT') return '等待结束。';

    if (actionId === 'human.approval' || task.taskType === 'HUMAN') {
        const who = present(out.reviewer) ? `${str(out.reviewer)} ` : '';
        if (out.approved === false) return `${who}已驳回${present(out.comment) ? `：${str(out.comment)}` : ''}。`;
        if (out.approved === true) return `${who}已批准${present(out.comment) ? `：${str(out.comment)}` : ''}。`;
        return `${who ? `${who}已处理` : '人工步骤已完成'}。`;
    }

    if (task.taskType === 'DECISION' || task.taskType === 'SWITCH') {
        const evaluated = Array.isArray(out.evaluationResult) ? out.evaluationResult[0] : undefined;
        const hit = out.selectedCase ?? evaluated ?? out.caseOutput ?? out.case;
        return present(hit) ? `条件判断命中分支 ${str(hit)}。` : '已完成条件判断。';
    }

    if (task.taskType === 'FORK_JOIN' || task.taskType === 'FORK_JOIN_DYNAMIC' || task.taskType === 'FORK') {
        const forkedTasks = task.inputData?.forkedTasks;
        const forked = Array.isArray(forkedTasks) ? forkedTasks.length : undefined;
        return forked ? `已启动 ${forked} 个并行分支。` : '已启动并行分支。';
    }

    if (task.taskType === 'JOIN') return joinSentence(task, options.allTasks ?? []);

    if (task.taskType === 'DO_WHILE') {
        const iter = task.iteration ?? out.iteration;
        return present(iter) ? `循环结束，共执行 ${str(iter)} 轮。` : '循环已结束。';
    }

    return `${name} 已完成。`;
}

export interface RunHeadline {
    title: string;
    tone: StatusTone;
    /** Duration in seconds when the run has both start and end, else undefined. */
    durationSec?: string;
}

/** Banner title for the whole run (B11): one wording per workflow status, never "all done" for a running run. */
export function runHeadline(instance: Pick<WorkflowInstance, 'status' | 'startTime' | 'endTime'>): RunHeadline {
    const meta = getStatusMeta(instance.status);
    const titles: Record<string, string> = {
        COMPLETED: '全部步骤已完成',
        FAILED: '运行失败',
        TIMED_OUT: '运行已超时',
        TERMINATED: '运行已终止',
        RUNNING: '正在运行',
        PAUSED: '运行已暂停',
    };
    const start = instance.startTime;
    const end = instance.endTime;
    return {
        title: titles[meta.status] ?? `运行状态：${meta.label}`,
        tone: meta.tone,
        durationSec: start && end && end >= start ? ((end - start) / 1000).toFixed(1) : undefined,
    };
}
