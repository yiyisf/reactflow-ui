/**
 * Runs Conductor JavaScript expressions (INLINE, SWITCH / DECISION javascript evaluators, DO_WHILE loop conditions)
 * for the in-browser sandbox.
 *
 * The expression is workflow content, possibly written by someone else, so it never runs on the page itself: it runs in a
 * dedicated Web Worker with network, storage and messaging APIs removed, and the worker is terminated when a script
 * exceeds its time budget (an infinite loop cannot freeze the IDE).
 */

export type ScriptResult =
    | { ok: true; value: unknown }
    | { ok: false; error: string; notExecuted?: boolean };

/** Evaluate `expression` with `$` bound to `input`; the value of the last expression statement is the result. */
export type ScriptEvaluator = (expression: string, input: Record<string, unknown>) => Promise<ScriptResult>;

export interface WorkerScriptEvaluator {
    evaluate: ScriptEvaluator;
    /** Stop the worker. Further calls start a new one. */
    dispose: () => void;
}

export const DEFAULT_SCRIPT_TIMEOUT_MS = 2000;

/**
 * Body of the worker. Kept as a plain function so it can be stringified; it must not reference anything outside itself.
 * Globals that reach the network, storage or other contexts are removed before any workflow script runs.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function workerMain(): void {
    const g = self as any;
    const blocked = [
        'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches',
        'BroadcastChannel', 'MessageChannel', 'Worker', 'SharedWorker', 'navigator', 'location', 'Request', 'Response',
        'WebTransport', 'RTCPeerConnection', 'FileReaderSync',
    ];
    const post = g.postMessage.bind(g);
    for (const name of blocked) {
        try {
            for (let o = g; o; o = Object.getPrototypeOf(o)) {
                if (Object.prototype.hasOwnProperty.call(o, name)) {
                    Object.defineProperty(o, name, { value: undefined, configurable: false, writable: false });
                }
            }
        } catch {
            /* some globals are not configurable; scripts still cannot post results without the captured `post` */
        }
    }
    g.onmessage = (e: MessageEvent) => {
        const { id, expression, input } = e.data as { id: number; expression: string; input: unknown };
        try {
            // Non-strict on purpose: Conductor scripts are often `function f(){...} f();` and rely on sloppy-mode eval.
            const run = new Function('$', '__src', 'return eval(__src);');
            const value = run(input, expression);
            let safe: unknown;
            try {
                safe = value === undefined ? null : JSON.parse(JSON.stringify(value));
            } catch {
                safe = String(value);
            }
            post({ id, ok: true, value: safe });
        } catch (err) {
            post({ id, ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
        }
    };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Create an evaluator backed by an isolated Web Worker.
 * Returns an evaluator that reports `notExecuted` when the page cannot create workers (no Worker API, or a CSP that
 * forbids blob: workers), so the sandbox can say why a script did not run instead of guessing a result.
 */
export function createWorkerScriptEvaluator(options: { timeoutMs?: number } = {}): WorkerScriptEvaluator {
    const timeoutMs = options.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS;
    let worker: Worker | null = null;
    let url: string | null = null;
    let seq = 0;
    const pending = new Map<number, (r: ScriptResult) => void>();

    const stop = () => {
        worker?.terminate();
        worker = null;
        if (url) URL.revokeObjectURL(url);
        url = null;
    };

    const start = (): Worker | string => {
        if (worker) return worker;
        if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
            return '当前环境不支持 Web Worker，脚本没有执行';
        }
        try {
            url = URL.createObjectURL(new Blob([`(${workerMain.toString()})();`], { type: 'text/javascript' }));
            worker = new Worker(url);
        } catch (e) {
            stop();
            return `页面不允许创建脚本沙箱（可能是 CSP 限制了 blob: Worker），脚本没有执行：${e instanceof Error ? e.message : String(e)}`;
        }
        worker.onmessage = (e: MessageEvent) => {
            const { id, ...rest } = e.data as { id: number } & ScriptResult;
            pending.get(id)?.(rest as ScriptResult);
            pending.delete(id);
        };
        worker.onerror = (e) => {
            const msg = e.message || '脚本沙箱异常';
            for (const resolve of pending.values()) resolve({ ok: false, error: msg });
            pending.clear();
            stop();
        };
        return worker;
    };

    const evaluate: ScriptEvaluator = (expression, input) =>
        new Promise((resolve) => {
            const w = start();
            if (typeof w === 'string') {
                resolve({ ok: false, error: w, notExecuted: true });
                return;
            }
            const id = ++seq;
            const timer = setTimeout(() => {
                if (!pending.has(id)) return;
                pending.delete(id);
                // the script may be stuck in a loop: kill the worker; the next call starts a fresh one
                for (const other of pending.values()) other({ ok: false, error: '同一沙箱中的另一个脚本超时，本脚本被一并终止' });
                pending.clear();
                stop();
                resolve({ ok: false, error: `脚本运行超过 ${timeoutMs} ms 被终止（可能存在死循环）` });
            }, timeoutMs);
            pending.set(id, (r) => {
                clearTimeout(timer);
                resolve(r);
            });
            let payload: unknown;
            try {
                payload = JSON.parse(JSON.stringify(input ?? {}));
            } catch {
                payload = {};
            }
            w.postMessage({ id, expression, input: payload });
        });

    return { evaluate, dispose: stop };
}

/** Evaluator used by the synchronous API: never runs scripts, says so. */
export const notExecutedEvaluator: (expression: string) => ScriptResult = () => ({
    ok: false,
    notExecuted: true,
    error: '同步接口不执行脚本；请改用 executeLocalSandboxDryRunAsync()',
});
