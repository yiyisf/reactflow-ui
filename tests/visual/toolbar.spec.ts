import { expect, test } from '@playwright/test';

/**
 * U5：工具栏
 * - 宿主没接 onTriggerExecution 时不显示「执行验证」；接了才显示
 * - 「复制 DSL」复制后提示结果；失败时说明原因和替代办法
 */
test('toolbar · 没接执行回调时不显示「执行验证」', async ({ page }) => {
    await page.goto('/tests/visual/fixtures/sandbox-config.html?theme=dark');
    await page.waitForFunction(() => (window as any).__store?.getState().workflowDef?.name === 'sandbox_fixture');
    await expect(page.getByRole('button', { name: /模板中心/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '执行验证' })).toHaveCount(0);

    await page.goto('/tests/visual/fixtures/run-notice.html?ide=classic&theme=dark&edited=0');
    await expect(page.locator('html[data-fixture-ready="1"]')).toBeAttached();
    await expect(page.getByRole('button', { name: '执行验证' })).toHaveCount(1);
});

test('toolbar · 复制 DSL 成功后提示，并复制编辑中的定义', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/tests/visual/fixtures/sandbox-config.html?theme=dark');
    await page.waitForFunction(() => (window as any).__store?.getState().workflowDef?.name === 'sandbox_fixture');
    await page.getByRole('button', { name: /复制 DSL/ }).click();
    await expect(page.getByText('已复制「sandbox_fixture」的 Conductor DSL（JSON）')).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(JSON.parse(copied).name).toBe('sandbox_fixture');
});

test('toolbar · 复制 DSL 被浏览器拒绝时说明原因与替代办法', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
        });
    });
    await page.goto('/tests/visual/fixtures/sandbox-config.html?theme=dark');
    await page.waitForFunction(() => (window as any).__store?.getState().workflowDef?.name === 'sandbox_fixture');
    await page.getByRole('button', { name: /复制 DSL/ }).click();
    await expect(page.getByText(/复制失败：浏览器没有授予剪贴板权限.*可以改用「导出 JSON」下载文件/)).toBeVisible();
});
