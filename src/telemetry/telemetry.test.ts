import { describe, it, expect } from 'vitest';
import { createTelemetryBuffer, type TelemetryTimers, type TelemetryEventTarget } from './buffer';
import { createTracker, sanitizeProps } from './track';
import type { IdeEvent, TelemetrySink } from './types';

/** 手动推进的假定时器 */
function fakeTimers() {
    let now = 0;
    let seq = 0;
    const pending = new Map<number, { at: number; fn: () => void }>();
    const timers: TelemetryTimers = {
        set(fn, ms) { const id = ++seq; pending.set(id, { at: now + ms, fn }); return id; },
        clear(h) { pending.delete(h as number); },
    };
    return {
        timers,
        get pending() { return pending.size; },
        advance(ms: number) {
            now += ms;
            for (const [id, t] of [...pending]) {
                if (t.at <= now) { pending.delete(id); t.fn(); }
            }
        },
    };
}

function fakeTarget() {
    const listeners = new Map<string, Set<() => void>>();
    const t: TelemetryEventTarget & { visibilityState?: string; fire(type: string): void; count(type: string): number } = {
        addEventListener(type, fn) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn); },
        removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
        fire(type) { [...(listeners.get(type) ?? [])].forEach((f) => f()); },
        count(type) { return listeners.get(type)?.size ?? 0; },
    };
    return t;
}

const ev = (n: number): IdeEvent => ({ name: 'step_added', at: n, ide: 'workflow' });

function recordingSink() {
    const batches: IdeEvent[][] = [];
    const sink: TelemetrySink = { track(events) { batches.push(events); } };
    return { sink, batches };
}

describe('createTelemetryBuffer', () => {
    it('累计达到上限（默认 20 条）立即发送一个批次', () => {
        const { sink, batches } = recordingSink();
        const ft = fakeTimers();
        const buf = createTelemetryBuffer(sink, { timers: ft.timers, document: null, window: null });
        for (let i = 0; i < 19; i++) buf.push(ev(i));
        expect(batches).toHaveLength(0);
        buf.push(ev(19));
        expect(batches).toHaveLength(1);
        expect(batches[0]).toHaveLength(20);
        expect(ft.pending).toBe(0);
    });

    it('maxBatchSize 可配置', () => {
        const { sink, batches } = recordingSink();
        const buf = createTelemetryBuffer(sink, { maxBatchSize: 2, timers: fakeTimers().timers, document: null, window: null });
        buf.push(ev(1)); buf.push(ev(2)); buf.push(ev(3));
        expect(batches).toHaveLength(1);
        expect(batches[0]).toHaveLength(2);
    });

    it('未达上限时按定时器（默认 5 秒）发送', () => {
        const { sink, batches } = recordingSink();
        const ft = fakeTimers();
        const buf = createTelemetryBuffer(sink, { timers: ft.timers, document: null, window: null });
        buf.push(ev(1));
        buf.push(ev(2));
        ft.advance(4999);
        expect(batches).toHaveLength(0);
        ft.advance(1);
        expect(batches).toHaveLength(1);
        expect(batches[0]).toHaveLength(2);
        // 下一条事件重新开始计时
        buf.push(ev(3));
        ft.advance(5000);
        expect(batches).toHaveLength(2);
    });

    it('flushIntervalMs 可配置', () => {
        const { sink, batches } = recordingSink();
        const ft = fakeTimers();
        const buf = createTelemetryBuffer(sink, { flushIntervalMs: 1000, timers: ft.timers, document: null, window: null });
        buf.push(ev(1));
        ft.advance(1000);
        expect(batches).toHaveLength(1);
    });

    it('flush() 立即发送并取消定时器；空队列不调用 sink', () => {
        const { sink, batches } = recordingSink();
        const ft = fakeTimers();
        const buf = createTelemetryBuffer(sink, { timers: ft.timers, document: null, window: null });
        buf.flush();
        expect(batches).toHaveLength(0);
        buf.push(ev(1));
        buf.flush();
        expect(batches).toHaveLength(1);
        expect(ft.pending).toBe(0);
    });

    it('页面隐藏（visibilitychange=hidden）与 pagehide 时 flush；可见时不 flush', () => {
        const { sink, batches } = recordingSink();
        const doc = fakeTarget();
        const win = fakeTarget();
        const buf = createTelemetryBuffer(sink, { timers: fakeTimers().timers, document: doc, window: win });
        buf.push(ev(1));
        doc.visibilityState = 'visible';
        doc.fire('visibilitychange');
        expect(batches).toHaveLength(0);
        doc.visibilityState = 'hidden';
        doc.fire('visibilitychange');
        expect(batches).toHaveLength(1);
        buf.push(ev(2));
        win.fire('pagehide');
        expect(batches).toHaveLength(2);
    });

    it('dispose 会 flush 并移除监听，之后 push 无效', () => {
        const { sink, batches } = recordingSink();
        const doc = fakeTarget();
        const win = fakeTarget();
        const buf = createTelemetryBuffer(sink, { timers: fakeTimers().timers, document: doc, window: win });
        expect(doc.count('visibilitychange')).toBe(1);
        buf.push(ev(1));
        buf.dispose();
        expect(batches).toHaveLength(1);
        expect(doc.count('visibilitychange')).toBe(0);
        expect(win.count('pagehide')).toBe(0);
        buf.push(ev(2));
        buf.flush();
        expect(batches).toHaveLength(1);
    });

    it('sink 同步抛错 / 异步拒绝都不会抛到调用方，且只 warn 一次', async () => {
        const warns: unknown[][] = [];
        const orig = console.warn;
        console.warn = (...a: unknown[]) => { warns.push(a); };
        try {
            const sink: TelemetrySink = {
                track(events) {
                    if (events[0].at === 1) throw new Error('sync boom');
                    return Promise.reject(new Error('async boom'));
                },
            };
            const buf = createTelemetryBuffer(sink, { maxBatchSize: 1, timers: fakeTimers().timers, document: null, window: null });
            buf.push(ev(1));
            buf.push(ev(2));
            buf.push(ev(3));
            await Promise.resolve();
            await Promise.resolve();
            expect(warns).toHaveLength(1);
        } finally {
            console.warn = orig;
        }
    });

    it('没有 sink → 全部为空操作（不建定时器、不挂监听）', () => {
        const ft = fakeTimers();
        const doc = fakeTarget();
        const buf = createTelemetryBuffer(undefined, { timers: ft.timers, document: doc, window: null });
        buf.push(ev(1));
        buf.flush();
        buf.dispose();
        expect(ft.pending).toBe(0);
        expect(doc.count('visibilitychange')).toBe(0);
    });

    it('非浏览器环境（无 document / window）不报错', () => {
        const { sink, batches } = recordingSink();
        const buf = createTelemetryBuffer(sink);
        buf.push(ev(1));
        buf.dispose();
        expect(batches).toHaveLength(1);
    });
});

describe('sanitizeProps', () => {
    it('只保留 string / number / boolean', () => {
        const out = sanitizeProps({
            s: 'a', n: 1, b: false,
            o: { x: 1 }, arr: [1], f: () => 1, nul: null, u: undefined, nan: NaN, inf: Infinity,
        });
        expect(out).toEqual({ s: 'a', n: 1, b: false });
    });

    it('全部被剔除或为空 → undefined', () => {
        expect(sanitizeProps({ o: {} })).toBeUndefined();
        expect(sanitizeProps({})).toBeUndefined();
        expect(sanitizeProps(undefined)).toBeUndefined();
    });
});

describe('createTracker', () => {
    it('补齐 at / ide / workflowName 并清洗 props', () => {
        const got: IdeEvent[] = [];
        const track = createTracker({
            ide: 'ai', now: () => 42,
            getWorkflowName: () => 'tmp-L1-ecs-demo-create',
            push: (e) => got.push(e),
        });
        track('step_added', { source: 'library', payload: { secret: 1 } });
        expect(got).toHaveLength(1);
        expect(got[0]).toEqual({
            name: 'step_added', at: 42, ide: 'ai', workflowName: 'tmp-L1-ecs-demo-create', props: { source: 'library' },
        });
    });

    it('没有流程名 / 没有有效 props 时省略对应字段', () => {
        const got: IdeEvent[] = [];
        const track = createTracker({ ide: 'workflow', now: () => 1, getWorkflowName: () => undefined, push: (e) => got.push(e) });
        track('ide_opened', { x: {} });
        expect(got[0]).toEqual({ name: 'ide_opened', at: 1, ide: 'workflow' });
    });

    it('push 或 getWorkflowName 抛错不外泄', () => {
        const orig = console.warn;
        console.warn = () => {};
        try {
            const track = createTracker({ ide: 'workflow', getWorkflowName: () => { throw new Error('x'); }, push: () => {} });
            track('ide_opened');
            expect(true).toBe(true);
        } finally {
            console.warn = orig;
        }
    });
});
