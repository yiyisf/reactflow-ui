/**
 * Runs Conductor JavaScript expressions (INLINE, SWITCH / DECISION javascript evaluators, DO_WHILE loop conditions)
 * for the in-browser sandbox.
 *
 * The expression is workflow content, possibly written by someone else, so it never runs on the page itself (S10):
 * - it runs in a Web Worker started from a hidden sandboxed iframe (opaque origin) whose Content-Security-Policy is
 *   `default-src 'none'`. The worker inherits that policy, so `import()`, `FontFace`, `fetch`, WebSocket and the like
 *   cannot reach the network whatever globals the script finds;
 * - network, storage and messaging globals are also removed inside the worker (defence in depth);
 * - every evaluation gets a fresh worker, so one script cannot see or change another script's input or result;
 * - a script that exceeds its time budget is stopped (an infinite loop cannot freeze the IDE).
 */

export type ScriptResult =
    | { ok: true; value: unknown }
    | { ok: false; error: string; notExecuted?: boolean };

/** Evaluate `expression` with `$` bound to `input`; the value of the last expression statement is the result. */
export type ScriptEvaluator = (expression: string, input: Record<string, unknown>) => Promise<ScriptResult>;

export interface WorkerScriptEvaluator {
    evaluate: ScriptEvaluator;
    /** Stop the sandbox. Further calls start a new one. */
    dispose: () => void;
}

export const DEFAULT_SCRIPT_TIMEOUT_MS = 2000;

/**
 * Body of the worker. Kept as a plain function so it can be stringified; it must not reference anything outside itself.
 * Globals that reach the network, storage or other contexts are removed before any workflow script runs (the frame's
 * CSP already blocks the network; this is defence in depth).
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
        // one evaluation per worker: the frame starts a fresh worker for every script and terminates it afterwards
        g.onmessage = null;
        const { expression, input } = e.data as { expression: string; input: unknown };
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
            post({ ok: true, value: safe });
        } catch (err) {
            post({ ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
        }
    };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Script of the sandbox iframe. Kept as a plain function so it can be stringified; it must not reference anything
 * outside itself. It receives a MessagePort from the page, then for every request starts a fresh worker from
 * `workerSource`, enforces the time budget and forwards exactly one result.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function frameMain(workerSource: string): void {
    const w = window as any;
    let port: MessagePort | null = null;
    let workerUrl: string | null = null;
    const workerFor = (): Worker => {
        if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
        return new Worker(workerUrl);
    };
    w.addEventListener('message', (e: MessageEvent) => {
        if (e.source !== w.parent || !e.data || e.data.type !== 'cm-script-sandbox-port' || port) return;
        port = e.ports[0];
        port.onmessage = (ev: MessageEvent) => {
            const { id, expression, input, timeoutMs } = ev.data as { id: number; expression: string; input: unknown; timeoutMs: number };
            let settled = false;
            let worker: Worker | null = null;
            const reply = (r: Record<string, unknown>) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                worker?.terminate();
                port!.postMessage({ id, ...r });
            };
            const timer = setTimeout(() => reply({ ok: false, timedOut: true }), timeoutMs);
            try {
                worker = workerFor();
            } catch (err) {
                reply({ ok: false, notExecuted: true, error: '页面不允许创建脚本沙箱（可能是 CSP 限制了 blob: Worker），脚本没有执行：' + (err instanceof Error ? err.message : String(err)) });
                return;
            }
            // only the first message counts: a script posting its own messages can at most change its own result
            worker.onmessage = (m: MessageEvent) => {
                const d = m.data || {};
                if (d.ok === true) reply({ ok: true, value: d.value });
                else reply({ ok: false, error: typeof d.error === 'string' ? d.error : '脚本执行失败' });
            };
            worker.onerror = (m: ErrorEvent) => {
                m.preventDefault();
                reply({ ok: false, error: m.message || '脚本沙箱异常' });
            };
            worker.postMessage({ expression, input });
        };
        port.postMessage({ type: 'ready' });
    });
    w.parent.postMessage({ type: 'cm-script-sandbox-loaded' }, '*');
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** CSP of the sandbox iframe; workers created from it inherit this policy. */
const FRAME_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:";

function frameSrcdoc(): string {
    const workerSource = `(${workerMain.toString()})();`;
    const script = `(${frameMain.toString()})(${JSON.stringify(workerSource)});`.replace(/<\/script/gi, '<\\/script');
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"></head><body><script>${script}</script></body></html>`;
}

/**
 * Create an evaluator backed by the sandbox described at the top of this file.
 * Reports `notExecuted` when the page cannot host it (no DOM or Web Worker API, or a CSP that forbids the sandbox),
 * so the sandbox can say why a script did not run instead of guessing a result.
 */
export function createWorkerScriptEvaluator(options: { timeoutMs?: number } = {}): WorkerScriptEvaluator {
    const timeoutMs = options.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS;
    /** how long the frame may take to load before the sandbox counts as unavailable */
    const loadTimeoutMs = Math.max(3000, timeoutMs);
    let frame: HTMLIFrameElement | null = null;
    let port: Promise<MessagePort | string> | null = null;
    let onWindowMessage: ((e: MessageEvent) => void) | null = null;
    let seq = 0;
    const pending = new Map<number, (r: ScriptResult) => void>();

    const stop = () => {
        for (const resolve of pending.values()) resolve({ ok: false, error: '脚本沙箱已关闭' });
        pending.clear();
        if (onWindowMessage) window.removeEventListener('message', onWindowMessage);
        onWindowMessage = null;
        port?.then((p) => { if (typeof p !== 'string') p.close(); });
        port = null;
        frame?.remove();
        frame = null;
    };

    const start = (): Promise<MessagePort | string> => {
        if (port) return port;
        if (typeof document === 'undefined' || typeof window === 'undefined' || typeof Worker === 'undefined'
            || typeof Blob === 'undefined' || typeof MessageChannel === 'undefined' || !document.body) {
            return Promise.resolve('当前环境不支持 Web Worker，脚本没有执行');
        }
        port = new Promise<MessagePort | string>((resolve) => {
            const el = document.createElement('iframe');
            el.setAttribute('sandbox', 'allow-scripts');
            el.setAttribute('aria-hidden', 'true');
            el.setAttribute('tabindex', '-1');
            el.title = '脚本沙箱';
            el.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;';
            const failTimer = setTimeout(() => {
                resolve('脚本沙箱没有启动（页面的 CSP 可能不允许内嵌 iframe 或 blob: Worker），脚本没有执行');
            }, loadTimeoutMs);
            onWindowMessage = (e: MessageEvent) => {
                if (e.source !== el.contentWindow || !e.data || e.data.type !== 'cm-script-sandbox-loaded') return;
                const channel = new MessageChannel();
                channel.port1.onmessage = (ev: MessageEvent) => {
                    const d = ev.data as { type?: string; id?: number } & Record<string, unknown>;
                    if (d.type === 'ready') {
                        clearTimeout(failTimer);
                        resolve(channel.port1);
                        return;
                    }
                    if (typeof d.id !== 'number') return;
                    const done = pending.get(d.id);
                    if (!done) return;
                    pending.delete(d.id);
                    if (d.ok === true) done({ ok: true, value: d.value });
                    else if (d.timedOut) done({ ok: false, error: `脚本运行超过 ${timeoutMs} ms 被终止（可能存在死循环）` });
                    else done({ ok: false, error: String(d.error ?? '脚本执行失败'), ...(d.notExecuted ? { notExecuted: true } : {}) });
                };
                el.contentWindow!.postMessage({ type: 'cm-script-sandbox-port' }, '*', [channel.port2]);
            };
            window.addEventListener('message', onWindowMessage);
            el.srcdoc = frameSrcdoc();
            document.body.appendChild(el);
            frame = el;
        });
        return port;
    };

    const evaluate: ScriptEvaluator = async (expression, input) => {
        const p = await start();
        if (typeof p === 'string') {
            stop();
            return { ok: false, error: p, notExecuted: true };
        }
        let payload: unknown;
        try {
            payload = JSON.parse(JSON.stringify(input ?? {}));
        } catch {
            payload = {};
        }
        const id = ++seq;
        return new Promise<ScriptResult>((resolve) => {
            // backstop in case the frame itself stops answering; the frame enforces the budget first
            const backstop = setTimeout(() => {
                if (!pending.has(id)) return;
                pending.delete(id);
                stop();
                resolve({ ok: false, error: `脚本运行超过 ${timeoutMs} ms 被终止（可能存在死循环）` });
            }, timeoutMs + 2000);
            pending.set(id, (r) => {
                clearTimeout(backstop);
                resolve(r);
            });
            p.postMessage({ id, expression, input: payload, timeoutMs });
        });
    };

    return { evaluate, dispose: stop };
}

/** Evaluator used by the synchronous API: never runs scripts, says so. */
export const notExecutedEvaluator: (expression: string) => ScriptResult = () => ({
    ok: false,
    notExecuted: true,
    error: '同步接口不执行脚本；请改用 executeLocalSandboxDryRunAsync()',
});
