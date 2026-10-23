import { useEffect, useMemo, useRef } from 'react';
import useWorkflowStore from '../store/workflowStore';
import { createTelemetryBuffer, type TelemetryBuffer } from './buffer';
import { createTracker } from './track';
import { createOnceGuard, type OnceGuard } from './once';
import { subscribeSandboxRun, subscribeStepAdded } from '../store/sandboxRunObserver';
import type { IdeEventName, TelemetrySink } from './types';

/**
 * IDE 内部使用：按解析后的 sink 维护一个缓冲，返回稳定的 `track(name, props?)`。
 * - `at` / `ide` / `workflowName`（取当前画布流程名）自动补齐；
 * - `props` 只保留 string / number / boolean；
 * - sink 变化时先把旧缓冲 flush 给旧 sink；卸载时 flush；
 * - 没有 sink 时 track 为空操作。
 */
export function useTelemetry(
    ide: 'workflow' | 'ai',
    sink: TelemetrySink | undefined,
): (name: IdeEventName, props?: Record<string, unknown>) => void {
    const bufferRef = useRef<TelemetryBuffer | null>(null);

    useEffect(() => {
        const buf = createTelemetryBuffer(sink);
        bufferRef.current = buf;
        return () => {
            buf.dispose();
            if (bufferRef.current === buf) bufferRef.current = null;
        };
    }, [sink]);

    return useMemo(
        () => createTracker({
            ide,
            getWorkflowName: () => useWorkflowStore.getState().workflowDef?.name || undefined,
            push: (e) => bufferRef.current?.push(e),
        }),
        [ide],
    );
}

type Track = (name: IdeEventName, props?: Record<string, unknown>) => void;

/**
 * 挂载时上报一次 `ide_opened`。守卫放在 ref 里：StrictMode 的「执行 → 清理 → 再执行」不会重复上报；
 * 真正重新挂载（新实例）会得到新的守卫。
 */
export function useIdeOpenedOnce(track: Track): void {
    const guardRef = useRef<OnceGuard | null>(null);
    if (guardRef.current === null) guardRef.current = createOnceGuard();
    useEffect(() => {
        if (guardRef.current?.take()) track('ide_opened');
    }, [track]);
}

/**
 * 专业模式经 store 的操作统一上报：
 * - 本地试跑（`runLocalSandboxDryRun`）→ `sandbox_run`，`entry: 'pro'`
 * - 画布新增步骤（`addNode`）→ `step_added`，`source: 'builtin'`
 */
export function useProStoreTelemetry(track: Track): void {
    useEffect(() => {
        const offRun = subscribeSandboxRun((result) => track('sandbox_run', { result, entry: 'pro' }));
        const offAdd = subscribeStepAdded((source) => track('step_added', { source }));
        return () => {
            offRun();
            offAdd();
        };
    }, [track]);
}
