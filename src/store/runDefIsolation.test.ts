import { describe, it, expect, beforeEach, vi } from 'vitest';
import useWorkflowStore, { migratePersistedPrefs } from './workflowStore';

const store = () => useWorkflowStore.getState();
const temporal = () => useWorkflowStore.temporal.getState();

const SAVED = {
    name: 'order_flow', version: 3, schemaVersion: 2,
    tasks: [
        { name: 'a', taskReferenceName: 'a', type: 'SIMPLE', inputParameters: {} },
    ],
} as any;

/** 服务端返回的定义：键序不同、补了默认字段（与本地序列化不一致，但内容是已保存的版本） */
const SERVER_DEF = {
    schemaVersion: 2, version: 3, name: 'order_flow',
    ownerEmail: 'svc@example.com', timeoutSeconds: 0,
    tasks: [
        { taskReferenceName: 'a', name: 'a', type: 'SIMPLE', inputParameters: {}, optional: false },
    ],
} as any;

const instance = (status = 'RUNNING') => ({
    workflowId: 'wf-r19', status, workflowDefinition: SERVER_DEF,
    tasks: [{ taskId: 't1', referenceTaskName: 'a', taskType: 'SIMPLE', status: 'COMPLETED' }],
});

describe('R19: 运行态不替换编辑中的定义', () => {
    beforeEach(() => {
        store().setMode('edit');
        store().setWorkflow(SAVED);
        store().markWorkflowSaved();
        temporal().clear();
    });

    it('[R19-01] 执行验证轮询后回到编辑态，本地未保存的修改仍在', () => {
        store().updateWorkflowProperties({ description: '本地未保存的修改' });
        expect(store().hasUnsavedChanges()).toBe(true);

        store().importExecutionJSON(instance('RUNNING'));
        store().importExecutionJSON(instance('COMPLETED'));
        expect(store().mode).toBe('run');
        // 运行视图用实例里的定义渲染
        expect(store().workflowDef?.ownerEmail).toBe('svc@example.com');
        expect(store().runWorkflowDef?.ownerEmail).toBe('svc@example.com');
        expect(store().editWorkflowDefStash?.description).toBe('本地未保存的修改');
        // 运行态下保存 / 宿主读取拿到的是编辑中的定义，不是服务端实例定义
        expect(store().getEditingWorkflowDef()?.description).toBe('本地未保存的修改');
        expect(store().hasUnsavedChanges()).toBe(true);

        store().setMode('edit');
        expect(store().workflowDef?.description).toBe('本地未保存的修改');
        expect(store().workflowDef?.ownerEmail).toBeUndefined();
        expect(store().runWorkflowDef).toBeNull();
        expect(store().editWorkflowDefStash).toBeNull();
        expect(store().taskMap.a).toBeDefined();
        // 修改仍算未保存
        expect(store().hasUnsavedChanges()).toBe(true);
    });

    it('[R19-02] 运行期间的定义切换不进撤销历史，⌘Z 撤回的是用户自己的修改', () => {
        store().updateWorkflowProperties({ description: 'edit-1' });
        const pastBefore = temporal().pastStates.length;
        store().importExecutionJSON(instance());
        store().setMode('edit');
        expect(temporal().pastStates.length).toBe(pastBefore);
        temporal().undo();
        expect(store().workflowDef?.description).toBeUndefined();
        expect(store().workflowDef?.name).toBe('order_flow');
    });

    it('[R19-03] 从运行视图跳到参数编辑时，换回编辑中的定义', () => {
        store().updateWorkflowProperties({ description: 'keep-me' });
        store().importExecutionJSON(instance());
        store().switchToEditAndFocusParam('a', 'x');
        expect(store().mode).toBe('edit');
        expect(store().workflowDef?.description).toBe('keep-me');
        expect(store().selectedTask?.taskReferenceName).toBe('a');
    });

    it('[R19-04] 运行期间宿主换了流程时，不会把旧的编辑定义恢复回来', () => {
        store().importExecutionJSON(instance());
        store().setWorkflow({ name: 'other', version: 1, tasks: [] });
        store().setMode('edit');
        expect(store().workflowDef?.name).toBe('other');
    });

    it('[R19-05] 未保存判断：加载即已保存；修改后为未保存；保存后恢复', () => {
        expect(store().hasUnsavedChanges()).toBe(false);
        store().updateWorkflowProperties({ description: 'x' });
        expect(store().hasUnsavedChanges()).toBe(true);
        store().markWorkflowSaved(store().workflowDef);
        expect(store().hasUnsavedChanges()).toBe(false);
    });

    it('[R19-06] 运行的就是当前定义时，不暂存也不换定义', () => {
        const sameDef = JSON.parse(JSON.stringify(store().workflowDef));
        store().importExecutionJSON({ ...instance(), workflowDefinition: sameDef });
        expect(store().editWorkflowDefStash).toBeNull();
        expect(store().runWorkflowDef).toBeNull();
    });

    it('[R19-07] 编辑态直接导入执行数据时，同步订阅者看不到"实例定义 + 没有暂存"的中间状态', () => {
        store().updateWorkflowProperties({ description: '本地未保存的修改' });
        // 与 WorkflowIDE 通知 onWorkflowChange 的条件一致：定义变了、没有暂存、不在运行态
        const leaked: unknown[] = [];
        let prevDef = store().workflowDef;
        const unsub = useWorkflowStore.subscribe((s) => {
            if (s.workflowDef === prevDef) return;
            prevDef = s.workflowDef;
            if (!s.editWorkflowDefStash && s.mode !== 'run') leaked.push(s.workflowDef);
        });
        try {
            expect(store().mode).toBe('edit');
            store().importExecutionJSON(instance('COMPLETED'));
            store().setMode('edit');
        } finally {
            unsub();
        }
        expect(leaked).toEqual([]);
        expect(store().workflowDef?.description).toBe('本地未保存的修改');
    });
});

describe('R20: 剪贴板任务不落盘', () => {
    it('[R20-01] 复制带 Authorization 头的 HTTP 任务后，localStorage 里没有任务内容', () => {
        store().copyTask({
            name: 'call', taskReferenceName: 'call', type: 'HTTP',
            inputParameters: { http_request: { uri: 'https://x', method: 'GET', headers: { Authorization: 'Bearer secret-token' } } },
        } as any);
        // 任意一次偏好变更都会触发持久化写入
        store().setEdgeType('step');
        const raw = localStorage.getItem('conductor-ui-prefs') ?? '';
        expect(raw).not.toBe('');
        expect(raw).not.toContain('copiedTask');
        expect(raw).not.toContain('secret-token');
        // 内存里仍可粘贴
        expect(store().copiedTask?.taskReferenceName).toBe('call');
    });

    it('[R20-02] 旧版本已落盘的 copiedTask 在迁移时被清除，其他偏好保留', () => {
        const migrated = migratePersistedPrefs(
            { theme: 'light', edgeType: 'default', copiedTask: { name: 'leak', headers: { Authorization: 'x' } } },
            1,
        );
        expect(migrated.copiedTask).toBeUndefined();
        expect(migrated.theme).toBe('light');
        // v1 起已是折线，不再重复迁移连线
        expect(migrated.edgeType).toBe('default');
        expect(migratePersistedPrefs({ edgeType: 'default', copiedTask: {} }, 0)).toEqual({ edgeType: 'smoothstep' });
    });

    it('[R20-03] 早期 ⌘C 写下的 conductor-clipboard 在加载时被清除', async () => {
        localStorage.setItem('conductor-clipboard', JSON.stringify({ headers: { Authorization: 'Bearer old' } }));
        vi.resetModules();
        await import('./workflowStore');
        expect(localStorage.getItem('conductor-clipboard')).toBeNull();
    });
});
