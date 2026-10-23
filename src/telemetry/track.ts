import type { IdeEvent, IdeEventName } from './types';

export type IdeEventProps = Record<string, string | number | boolean>;

/**
 * 只保留 string / number（有限）/ boolean 的属性值，其余（对象、数组、函数、null、undefined、NaN）一律丢弃，
 * 避免上层误把参数、表达式等载荷塞进埋点。全部被丢弃时返回 undefined。
 */
export function sanitizeProps(props: Record<string, unknown> | undefined | null): IdeEventProps | undefined {
    if (!props || typeof props !== 'object') return undefined;
    const out: IdeEventProps = {};
    let n = 0;
    for (const key of Object.keys(props)) {
        const v = props[key];
        if (typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) {
            out[key] = v;
            n++;
        }
    }
    return n > 0 ? out : undefined;
}

export interface TrackerOptions {
    ide: 'workflow' | 'ai';
    /** 返回当前流程名；每次 track 时调用 */
    getWorkflowName: () => string | undefined;
    /** 事件发往的缓冲；返回 undefined 表示没有 sink */
    push: (event: IdeEvent) => void;
    now?: () => number;
}

/** 构造事件并交给 push：补齐 at / ide / workflowName，清洗 props。永不抛出。 */
export function createTracker(opts: TrackerOptions): (name: IdeEventName, props?: Record<string, unknown>) => void {
    const now = opts.now ?? Date.now;
    return (name, props) => {
        try {
            const event: IdeEvent = { name, at: now(), ide: opts.ide };
            const wf = opts.getWorkflowName();
            if (wf) event.workflowName = wf;
            const clean = sanitizeProps(props);
            if (clean) event.props = clean;
            opts.push(event);
        } catch (err) {
            console.warn('[reactflow-ui] 埋点失败，已忽略：', err);
        }
    };
}
