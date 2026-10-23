import type { IdeEvent, TelemetrySink } from './types';

/** 定时器注入点（测试用）；默认使用全局 setTimeout / clearTimeout */
export interface TelemetryTimers {
    set(fn: () => void, ms: number): unknown;
    clear(handle: unknown): void;
}

/** 最小事件目标接口（document / window 或测试替身） */
export interface TelemetryEventTarget {
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
}

export interface TelemetryBufferOptions {
    /** 距第一条待发送事件多久后 flush。默认 5000 */
    flushIntervalMs?: number;
    /** 累计多少条立即 flush。默认 20 */
    maxBatchSize?: number;
    timers?: TelemetryTimers;
    /** 监听 `visibilitychange`（读取 visibilityState）；默认取全局 document，非浏览器环境忽略 */
    document?: (TelemetryEventTarget & { visibilityState?: string }) | null;
    /** 监听 `pagehide`；默认取全局 window，非浏览器环境忽略 */
    window?: TelemetryEventTarget | null;
}

export interface TelemetryBuffer {
    /** 入队；sink 缺失时丢弃。永不抛出 */
    push(event: IdeEvent): void;
    /** 立即发送队列中的事件。永不抛出 */
    flush(): void;
    /** flush 并移除定时器与页面监听；之后 push 无效 */
    dispose(): void;
}

const DEFAULT_INTERVAL = 5000;
const DEFAULT_BATCH = 20;

const defaultTimers: TelemetryTimers = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * 创建埋点缓冲：批量发送、页面隐藏时 flush、吞掉 sink 的任何错误（只 warn 一次）。
 * sink 为空时 push 直接丢弃，不产生定时器与监听。
 */
export function createTelemetryBuffer(
    sink: TelemetrySink | undefined | null,
    opts: TelemetryBufferOptions = {},
): TelemetryBuffer {
    if (!sink) {
        return { push() {}, flush() {}, dispose() {} };
    }

    const interval = opts.flushIntervalMs ?? DEFAULT_INTERVAL;
    const maxBatch = Math.max(1, opts.maxBatchSize ?? DEFAULT_BATCH);
    const timers = opts.timers ?? defaultTimers;
    const doc = opts.document !== undefined ? opts.document : (typeof document !== 'undefined' ? document : null);
    const win = opts.window !== undefined ? opts.window : (typeof window !== 'undefined' ? window : null);

    let queue: IdeEvent[] = [];
    let timer: unknown = null;
    let disposed = false;
    let warned = false;

    const warnOnce = (err: unknown) => {
        if (warned) return;
        warned = true;
        console.warn('[reactflow-ui] 埋点 sink 调用失败，已忽略（后续同类错误不再提示）：', err);
    };

    const clearTimer = () => {
        if (timer !== null) {
            timers.clear(timer);
            timer = null;
        }
    };

    const flush = () => {
        clearTimer();
        if (queue.length === 0) return;
        const batch = queue;
        queue = [];
        try {
            const r = sink.track(batch);
            if (r && typeof (r as Promise<void>).then === 'function') {
                (r as Promise<void>).then(undefined, warnOnce);
            }
        } catch (err) {
            warnOnce(err);
        }
    };

    const onVisibility = () => {
        if (doc && doc.visibilityState === 'hidden') flush();
    };
    const onPageHide = () => flush();

    try {
        doc?.addEventListener('visibilitychange', onVisibility);
        win?.addEventListener('pagehide', onPageHide);
    } catch (err) {
        warnOnce(err);
    }

    return {
        push(event) {
            if (disposed) return;
            queue.push(event);
            if (queue.length >= maxBatch) {
                flush();
            } else if (timer === null) {
                timer = timers.set(flush, interval);
            }
        },
        flush,
        dispose() {
            if (disposed) return;
            flush();
            disposed = true;
            try {
                doc?.removeEventListener('visibilitychange', onVisibility);
                win?.removeEventListener('pagehide', onPageHide);
            } catch {
                /* 忽略 */
            }
        },
    };
}
