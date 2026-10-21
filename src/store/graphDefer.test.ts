import { describe, it, expect, beforeEach } from 'vitest';
import useWorkflowStore from './workflowStore';

const simple = (ref: string, description = '') =>
    ({ name: ref, taskReferenceName: ref, type: 'SIMPLE', description, inputParameters: {} });

const makeDef = (refs: string[], description = '') =>
    ({ name: 'wf', version: 1, schemaVersion: 2, tasks: refs.map((r) => simple(r, description)) }) as any;

const store = () => useWorkflowStore.getState();

describe('业务卡片视图：定义与画布数据解耦（setWorkflowDefOnly / refreshGraph）', () => {
    beforeEach(() => {
        store().setWorkflow(makeDef(['a']));
        useWorkflowStore.temporal.getState().clear();
    });

    it('setWorkflow 后画布数据是新鲜的', () => {
        expect(store().graphStale).toBe(false);
        expect(store().nodes.length).toBeGreaterThan(0);
    });

    it('setWorkflowDefOnly 只更新定义与校验，不重建画布，并标记过期', () => {
        const nodesBefore = store().nodes;
        store().setWorkflowDefOnly(makeDef(['a', 'b']));

        expect(store().workflowDef?.tasks.map((t) => t.taskReferenceName)).toEqual(['a', 'b']);
        expect(store().graphStale).toBe(true);
        expect(store().nodes).toBe(nodesBefore);
        expect(store().validationResults).toBeDefined();
    });

    it('refreshGraph 按当前定义补建画布；未过期时是空操作', () => {
        store().setWorkflowDefOnly(makeDef(['a', 'b']));
        store().refreshGraph();

        expect(store().graphStale).toBe(false);
        expect(Object.keys(store().taskMap)).toContain('b');

        const nodesAfter = store().nodes;
        store().refreshGraph();
        expect(store().nodes).toBe(nodesAfter);
    });
});

describe('撤销历史', () => {
    beforeEach(() => {
        store().setWorkflow(makeDef(['a']));
        useWorkflowStore.temporal.getState().clear();
    });

    it('定义内容未变化时不记录历史（引用不同但内容相同）', () => {
        store().setWorkflowDefOnly(makeDef(['a']));
        expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(0);
    });

    it('定义内容变化时记录一条历史', () => {
        store().setWorkflowDefOnly(makeDef(['a', 'b']));
        expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(1);
    });

    it('历史条数有上限，不会无限增长', () => {
        for (let i = 0; i < 150; i++) {
            store().setWorkflowDefOnly(makeDef(['a'], `rev-${i}`));
        }
        expect(useWorkflowStore.temporal.getState().pastStates.length).toBeLessThanOrEqual(100);
    });
});
