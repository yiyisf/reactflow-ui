/**
 * 接入埋点：事件与 Sink 契约（设计见 docs/design/v1.3.0-自助接入设计.md 第 5 节）。
 *
 * 只采集「用了什么功能」，不采集参数值、表达式、提示词、对话内容、执行数据。
 */

/** 事件名（首批）。部分事件由后续批次接入，这里先保留在联合类型中。 */
export type IdeEventName =
    | 'ide_opened'
    | 'trial_started'
    | 'workflow_created'
    | 'step_added'
    | 'api_imported'
    | 'sandbox_run'
    | 'workflow_saved'
    | 'promotion_requested'
    | 'promotion_state'
    | 'ai_event';

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
