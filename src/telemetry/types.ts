/**
 * 接入埋点：事件与 Sink 契约（设计见 docs/design/v1.3.0-自助接入设计.md 第 5 节）。
 *
 * 只采集「用了什么功能」，不采集参数值、表达式、提示词、对话内容、执行数据。
 */

/**
 * 事件名清单（首批，与设计文档 5.2 节、接入指南「接入埋点」表一致；
 * 单测会校验三处同步，新增事件时请一并更新文档）。
 */
export const IDE_EVENT_NAMES = [
    'ide_opened',
    'trial_started',
    'workflow_created',
    'step_added',
    'api_imported',
    'sandbox_run',
    'workflow_saved',
    'promotion_requested',
    'promotion_state',
    'ai_event',
] as const;

export type IdeEventName = typeof IDE_EVENT_NAMES[number];

export interface IdeEvent {
    name: IdeEventName;
    /** epoch ms */
    at: number;
    ide: 'workflow' | 'ai';
    /** 不含任何参数值 */
    workflowName?: string;
    props?: Record<string, string | number | boolean>;
}

export interface TelemetrySink {
    /** SDK 侧批量调用（默认 5 秒或 20 条），页面隐藏时强制 flush */
    track(events: IdeEvent[]): void | Promise<void>;
}
