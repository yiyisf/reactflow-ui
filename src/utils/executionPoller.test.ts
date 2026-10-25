import { describe, it, expect } from 'vitest';
import { startExecutionPolling } from './executionPoller';

/** Manual timer: run() fires the pending callback. */
function manualTimer() {
    let pending: (() => void) | null = null;
    const delays: number[] = [];
    return {
        delays,
        setTimer: (fn: () => void, ms: number) => { pending = fn; delays.push(ms); return 1; },
        clearTimer: () => { pending = null; },
        async run() {
            const fn = pending;
            pending = null;
            fn?.();
            await new Promise((r) => setTimeout(r, 0));
        },
        get hasPending() { return pending !== null; },
    };
}

describe('startExecutionPolling (R2)', () => {
    it('stops on a terminal status and reports done', async () => {
        const t = manualTimer();
        const seen: string[] = [];
        let done = 0;
        const statuses = ['RUNNING', 'RUNNING', 'COMPLETED'];
        startExecutionPolling({
            workflowId: 'w1',
            poll: async () => ({ status: statuses.shift()! }),
            onInstance: (i) => seen.push(i.status),
            onDone: () => { done += 1; },
            interval: 100, maxInterval: 200,
            setTimer: t.setTimer, clearTimer: t.clearTimer,
        });
        await t.run(); await t.run(); await t.run();
        expect(seen).toEqual(['RUNNING', 'RUNNING', 'COMPLETED']);
        expect(done).toBe(1);
        expect(t.hasPending).toBe(false);
        expect(t.delays).toEqual([100, 150, 200]);
    });

    it('gives up after N consecutive failures with a message (errors and null both count)', async () => {
        const t = manualTimer();
        let gaveUp = '';
        let calls = 0;
        startExecutionPolling({
            workflowId: 'w2',
            poll: async () => { calls += 1; if (calls % 2) throw new Error('boom'); return null; },
            onInstance: () => { throw new Error('should not deliver'); },
            onGiveUp: (m) => { gaveUp = m; },
            maxFailures: 3,
            setTimer: t.setTimer, clearTimer: t.clearTimer,
        });
        await t.run(); await t.run(); await t.run();
        expect(calls).toBe(3);
        expect(gaveUp).toContain('w2');
        expect(gaveUp).toContain('已停止刷新');
        expect(t.hasPending).toBe(false);
    });

    it('a success resets the failure count', async () => {
        const t = manualTimer();
        let gaveUp = false;
        const seq: Array<'ok' | 'fail'> = ['fail', 'ok', 'fail', 'ok', 'fail'];
        startExecutionPolling({
            workflowId: 'w3',
            poll: async () => { if (seq.shift() === 'fail') throw new Error('x'); return { status: 'RUNNING' }; },
            onInstance: () => {},
            onGiveUp: () => { gaveUp = true; },
            maxFailures: 2,
            setTimer: t.setTimer, clearTimer: t.clearTimer,
        });
        for (let i = 0; i < 5; i++) await t.run();
        expect(gaveUp).toBe(false);
        expect(t.hasPending).toBe(true);
    });

    it('cancel() stops further polls and drops an in-flight result', async () => {
        const t = manualTimer();
        let resolve: (v: { status: string }) => void = () => {};
        const delivered: string[] = [];
        const p = startExecutionPolling({
            workflowId: 'w4',
            poll: () => new Promise((r) => { resolve = r; }),
            onInstance: (i) => delivered.push(i.status),
            setTimer: t.setTimer, clearTimer: t.clearTimer,
        });
        await t.run();
        p.cancel();
        resolve({ status: 'RUNNING' });
        await new Promise((r) => setTimeout(r, 0));
        expect(delivered).toEqual([]);
        expect(p.cancelled).toBe(true);
        expect(t.hasPending).toBe(false);
    });

    it('stops quietly when shouldContinue() turns false (user left run mode)', async () => {
        const t = manualTimer();
        let inRun = true;
        const delivered: string[] = [];
        let gaveUp = false;
        startExecutionPolling({
            workflowId: 'w5',
            poll: async () => ({ status: 'RUNNING' }),
            onInstance: (i) => delivered.push(i.status),
            onGiveUp: () => { gaveUp = true; },
            shouldContinue: () => inRun,
            setTimer: t.setTimer, clearTimer: t.clearTimer,
        });
        await t.run();
        inRun = false;
        await t.run();
        expect(delivered).toEqual(['RUNNING']);
        expect(gaveUp).toBe(false);
        expect(t.hasPending).toBe(false);
    });

    it('an aborted signal stops the poller', async () => {
        const t = manualTimer();
        const ac = new AbortController();
        const p = startExecutionPolling({
            workflowId: 'w6', poll: async () => ({ status: 'RUNNING' }), onInstance: () => {},
            signal: ac.signal, setTimer: t.setTimer, clearTimer: t.clearTimer,
        });
        ac.abort();
        expect(p.cancelled).toBe(true);
        expect(t.hasPending).toBe(false);
    });
});
