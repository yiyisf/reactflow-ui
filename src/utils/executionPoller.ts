/**
 * Cancellable execution polling with back-off and a failure cap (R2).
 *
 * - `cancel()` (or aborting `signal`) stops the loop: no further timers and no more `onInstance` calls, even if a
 *   request is in flight when it is cancelled.
 * - Thrown errors and `null` results count as failures; after `maxFailures` consecutive failures the loop stops and
 *   calls `onGiveUp` with a message that says what happened and how to fix it.
 * - `shouldContinue()` is checked before every request and before delivering a result (e.g. "the user is still in run
 *   mode"); when it returns false the loop stops quietly.
 */
export interface PollableInstance {
    status: string;
}

export interface ExecutionPollerOptions<T extends PollableInstance> {
    workflowId: string;
    poll: (workflowId: string, signal: AbortSignal) => Promise<T | null>;
    onInstance: (instance: T) => void;
    onDone?: (instance: T) => void;
    onGiveUp?: (message: string) => void;
    shouldContinue?: () => boolean;
    /** First delay in ms (default 3000). */
    interval?: number;
    /** Longest delay in ms (default 15000). */
    maxInterval?: number;
    /** Consecutive failures before giving up (default 5). */
    maxFailures?: number;
    signal?: AbortSignal;
    /** Injectable timer for tests. */
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
}

export const TERMINAL_WORKFLOW_STATUSES = new Set(['COMPLETED', 'FAILED', 'TIMED_OUT', 'TERMINATED']);

export interface ExecutionPoller {
    cancel: () => void;
    readonly cancelled: boolean;
}

export function startExecutionPolling<T extends PollableInstance>(opts: ExecutionPollerOptions<T>): ExecutionPoller {
    const {
        workflowId, poll, onInstance, onDone, onGiveUp,
        shouldContinue = () => true,
        maxInterval = 15000,
        maxFailures = 5,
        setTimer = (fn, ms) => setTimeout(fn, ms),
        clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    } = opts;
    let interval = opts.interval ?? 3000;
    let failures = 0;
    let timer: unknown = null;
    let stopped = false;
    const controller = new AbortController();

    const stop = () => {
        if (stopped) return;
        stopped = true;
        if (timer !== null) clearTimer(timer);
        timer = null;
        controller.abort();
    };
    if (opts.signal) {
        if (opts.signal.aborted) stop();
        else opts.signal.addEventListener('abort', stop, { once: true });
    }

    const schedule = () => {
        if (stopped) return;
        timer = setTimer(tick, interval);
        interval = Math.min(interval * 1.5, maxInterval);
    };

    const fail = (reason: string) => {
        failures += 1;
        if (failures >= maxFailures) {
            stop();
            onGiveUp?.(`连续 ${failures} 次没有拿到运行 ${workflowId} 的状态（${reason}），已停止刷新。请检查 Conductor 服务与网络后重新运行，或在 Conductor 控制台查看这次运行。`);
            return;
        }
        schedule();
    };

    async function tick() {
        timer = null;
        if (stopped) return;
        if (!shouldContinue()) { stop(); return; }
        let instance: T | null;
        try {
            instance = await poll(workflowId, controller.signal);
        } catch (err) {
            if (stopped) return;
            fail(err instanceof Error && err.message ? err.message : '请求失败');
            return;
        }
        if (stopped) return;
        if (!shouldContinue()) { stop(); return; }
        if (!instance) { fail('接口返回为空'); return; }
        failures = 0;
        onInstance(instance);
        if (TERMINAL_WORKFLOW_STATUSES.has(instance.status)) {
            stop();
            onDone?.(instance);
            return;
        }
        schedule();
    }

    schedule();
    return {
        cancel: stop,
        get cancelled() { return stopped; },
    };
}
