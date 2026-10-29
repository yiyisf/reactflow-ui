import { describe, it, expect, beforeEach } from 'vitest';
import useWorkflowStore from '../store/workflowStore';
import { handOffSave } from './hostSave';

const store = () => useWorkflowStore.getState();

/** 测试跑在 Node 里；项目没有装 @types/node，这里只声明用到的两个方法 */
type RejectionListener = (reason: unknown) => void;
const nodeProcess = (globalThis as unknown as {
    process: { on: (e: 'unhandledRejection', l: RejectionListener) => void; off: (e: 'unhandledRejection', l: RejectionListener) => void };
}).process;

const LOADED = {
    name: 'order_flow', version: 3, schemaVersion: 2,
    tasks: [{ name: 'a', taskReferenceName: 'a', type: 'SIMPLE', inputParameters: {} }],
} as any;

describe('R19: 交给宿主保存后的已保存基线', () => {
    beforeEach(() => {
        store().setMode('edit');
        store().setWorkflow(LOADED);
        store().markWorkflowSaved();
        store().updateWorkflowProperties({ description: '本地修改' });
    });

    it('[R19-08] 宿主同步保存：交出即记为已保存', () => {
        expect(store().hasUnsavedChanges()).toBe(true);
        handOffSave(() => undefined, store().workflowDef!);
        expect(store().hasUnsavedChanges()).toBe(false);
    });

    it('[R19-09] 宿主异步保存成功：resolve 后才记为已保存', async () => {
        let resolve!: () => void;
        const pending = new Promise<void>((r) => { resolve = r; });
        handOffSave(() => pending, store().workflowDef!);
        expect(store().hasUnsavedChanges()).toBe(true);
        resolve();
        await pending;
        await Promise.resolve();
        expect(store().hasUnsavedChanges()).toBe(false);
    });

    it('[R19-10] 宿主异步保存失败：仍算未保存，错误不被吞掉', async () => {
        const failure = Promise.reject(new Error('网络错误'));
        let surfaced: unknown = null;
        const onUnhandled = (reason: unknown) => { surfaced = reason; };
        nodeProcess.on('unhandledRejection', onUnhandled);
        try {
            handOffSave(() => failure, store().workflowDef!);
            await new Promise((r) => setTimeout(r, 0));
        } finally {
            nodeProcess.off('unhandledRejection', onUnhandled);
        }
        expect(store().hasUnsavedChanges()).toBe(true);
        expect((surfaced as Error | null)?.message).toBe('网络错误');
    });
});
