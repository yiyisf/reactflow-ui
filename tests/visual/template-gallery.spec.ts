import { expect, test, type Page } from '@playwright/test';

/**
 * 模板中心（v1.3.2 批次 4）：
 * - R23：画布上已有流程时，选模板前先确认会替换哪个流程；取消不改画布，确认后可以撤销
 * - U1：「试跑演示」按真实状态显示（图标 + 中文 + 颜色）
 * - U2：「全部场景」的数量等于实际模板数
 */
async function openGallery(page: Page) {
    await page.goto('/tests/visual/fixtures/sandbox-config.html?theme=dark');
    await page.waitForFunction(() => (window as any).__store?.getState().workflowDef?.name === 'sandbox_fixture');
    await page.getByRole('button', { name: /模板中心/ }).first().click();
    await expect(page.getByRole('button', { name: /全部场景/ })).toBeVisible();
}

async function pickFirstTemplate(page: Page) {
    await page.getByRole('button', { name: /使用此模板/ }).first().click();
    await page.getByRole('button', { name: /下一步/ }).click();
    await page.getByRole('button', { name: /下一步/ }).click();
    await page.getByRole('button', { name: /注入参数并进入流程编辑器/ }).click();
}

const canvasName = (page: Page) => page.evaluate(() => (window as any).__store.getState().workflowDef?.name);

test('template gallery · R23 替换已有流程前先确认，取消不改画布，确认后可撤销', async ({ page }) => {
    await openGallery(page);
    await pickFirstTemplate(page);
    const dialog = page.getByText(/会替换当前画布上的「sandbox_fixture」/);
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/撤销（⌘Z \/ Ctrl\+Z）找回/)).toBeVisible();
    await page.getByRole('button', { name: '取消' }).click();
    expect(await canvasName(page)).toBe('sandbox_fixture');

    await page.getByRole('button', { name: /模板中心/ }).first().click();
    await pickFirstTemplate(page);
    await page.getByRole('button', { name: '替换当前流程' }).click();
    await expect.poll(() => canvasName(page)).not.toBe('sandbox_fixture');

    await page.evaluate(() => (window as any).__store.temporal.getState().undo());
    await expect.poll(() => canvasName(page)).toBe('sandbox_fixture');
});

test('template gallery · U1 试跑结果用图标 + 中文状态，U2 全部场景显示实际模板数', async ({ page }) => {
    await openGallery(page);
    const cards = await page.getByRole('button', { name: /使用此模板/ }).count();
    await expect(page.getByRole('button', { name: `全部场景 (${cards})` })).toBeVisible();

    await page.getByRole('button', { name: /试跑演示/ }).first().click();
    const notice = page.getByTestId('template-quick-run-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/本地试跑(成功|失败|带错完成|已超时|已终止)/);
    await expect(notice).not.toContainText('试跑通过');
    await expect(notice.locator('svg')).toHaveCount(1);
});
