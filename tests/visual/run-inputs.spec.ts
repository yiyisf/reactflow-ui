import { expect, test } from '@playwright/test';

/**
 * R22：执行验证面板里必填的数字参数留空时被拦下（原来被转成 0 直接发出）。
 * 数字输入框本身不接受非数字文本，非法数字的提示由 coerceRunInputs 的单测覆盖。
 */
test('run panel · 必填数字留空被拦下，填了才发起执行', async ({ page }) => {
    await page.goto('/tests/visual/fixtures/run-notice.html?ide=classic&theme=dark&edited=0&inputs=1');
    await expect(page.locator('html[data-fixture-ready="1"]')).toBeAttached();
    const panel = page.locator('.wrp-panel');
    await expect(panel).toBeVisible();
    const submit = panel.getByRole('button', { name: /发起执行/ });
    const triggered = () => page.evaluate(() => (window as any).__triggered.length);

    await submit.click();
    await expect(panel).toContainText('请填写「qty」，它是必填参数');
    expect(await triggered()).toBe(0);

    const qty = panel.locator('input.wrp-input').first();
    await qty.fill('5');
    await submit.click();
    await expect.poll(triggered).toBe(1);
    expect(await page.evaluate(() => (window as any).__triggered[0])).toEqual({ qty: 5 });
});
