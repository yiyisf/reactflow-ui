import { useEffect, useMemo, useRef } from 'react';
import useWorkflowStore from '../store/workflowStore';
import { createTelemetryBuffer, type TelemetryBuffer } from './buffer';
import { createTracker } from './track';
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
