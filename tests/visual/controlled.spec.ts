import { expect, test } from '@playwright/test';

/**
 * R21：宿主用 onWorkflowChange 回写 workflowDef（受控用法）时，每次编辑不再重新加载画布、清空撤销历史。
 */
test('controlled · 连续编辑 10 次后仍可逐步撤销，画布不重新加载', async ({ page }) => {
    await page.goto('/tests/visual/fixtures/controlled.html');
    await expect(page.locator('html[data-fixture-ready="1"]')).toBeAttached();
    await page.waitForFunction(() => (window as any).__store.getState().workflowDef?.name === 'controlled_flow');

    const result = await page.evaluate(async () => {
        const store = (window as any).__store;
        const tick = () => new Promise((r) => setTimeout(r, 30));
        await tick();
        const loadKeyBefore = store.getState().workflowLoadKey;
        for (let i = 1; i <= 10; i++) {
            store.getState().updateWorkflowProperties({ description: `v${i}` });
            await tick();
        }
        const hostDescription = (window as any).__hostDef.description;
        const loadKeyAfter = store.getState().workflowLoadKey;
        const undone: (string | null)[] = [];
        for (let i = 0; i < 10; i++) {
            store.temporal.getState().undo();
            await tick();
            undone.push(store.getState().workflowDef?.description ?? null);
        }
        return { hostDescription, loadKeyBefore, loadKeyAfter, undone };
    });

    expect(result.hostDescription).toBe('v10');
    expect(result.loadKeyAfter).toBe(result.loadKeyBefore);
    expect(result.undone).toEqual(['v9', 'v8', 'v7', 'v6', 'v5', 'v4', 'v3', 'v2', 'v1', null]);
});

test('controlled · 宿主换成另一个流程时重新加载并清空撤销历史', async ({ page }) => {
    await page.goto('/tests/visual/fixtures/controlled.html');
    await page.waitForFunction(() => (window as any).__store?.getState().workflowDef?.name === 'controlled_flow');
    const result = await page.evaluate(async () => {
        const store = (window as any).__store;
        const tick = () => new Promise((r) => setTimeout(r, 30));
        store.getState().updateWorkflowProperties({ description: 'edited' });
        await tick();
        const loadKeyBefore = store.getState().workflowLoadKey;
        (window as any).__loadFlow({ name: 'another_flow', version: 1, tasks: [{ name: 'b', taskReferenceName: 'b', type: 'NOOP' }] });
        await tick();
        return {
            name: store.getState().workflowDef?.name,
            reloaded: store.getState().workflowLoadKey > loadKeyBefore,
            canUndo: store.temporal.getState().pastStates.length > 0,
        };
    });
    expect(result).toEqual({ name: 'another_flow', reloaded: true, canUndo: false });
});
