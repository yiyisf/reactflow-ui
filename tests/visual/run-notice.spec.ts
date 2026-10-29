import { expect, test, type Page } from '@playwright/test';
import { settle } from './helpers';

/**
 * R19：画布有未保存的修改时，执行验证面板（WorkflowIDE）和 AI 运行卡片（AiWorkflowIDE）提示「将运行已保存的版本」。
 * demo 不接执行回调，所以用 fixtures/run-notice.html 挂载真实组件。两套主题都检查：
 * 没有修改时不出现；有修改时出现，颜色是警告色，带图标和中文说明；再各截一张图。
 */
const THEMES = ['dark', 'light'] as const;
const IDES = ['classic', 'ai'] as const;

async function open(page: Page, ide: (typeof IDES)[number], theme: (typeof THEMES)[number], edited: boolean) {
    await page.goto(`/tests/visual/fixtures/run-notice.html?ide=${ide}&theme=${theme}&edited=${edited ? 1 : 0}`);
    await expect(page.locator('html[data-fixture-ready="1"]')).toBeAttached();
    await expect(page.locator(`[data-mode="${theme}"]`).first()).toBeAttached();
    if (ide === 'ai') await page.getByTitle('执行当前工作流').click();
    const container = ide === 'ai'
        ? page.getByText('运行工作流', { exact: true }).locator('xpath=ancestor::div[2]')
        : page.locator('.wrp-panel');
    await expect(container).toBeVisible();
    return container;
}

for (const theme of THEMES) {
    for (const ide of IDES) {
        test(`run notice · ${theme} · ${ide} · 没有修改时不提示`, async ({ page }) => {
            await open(page, ide, theme, false);
            await expect(page.getByTestId('unsaved-run-notice')).toHaveCount(0);
        });

        test(`run notice · ${theme} · ${ide} · 有修改时提示`, async ({ page }) => {
            const container = await open(page, ide, theme, true);
            const notice = page.getByTestId('unsaved-run-notice');
            await expect(notice).toBeVisible();
            await expect(notice).toHaveAttribute('role', 'status');
            await expect(notice).toContainText('将运行已保存的版本');
            await expect(notice.locator('svg')).toHaveCount(1);
            // 颜色来自 --cm-status-warning（规则 5：颜色 + 图标 + 中文）
            const [color, warning] = await notice.evaluate((el) => [
                getComputedStyle(el).color,
                (() => {
                    const probe = document.createElement('span');
                    probe.style.color = 'var(--cm-status-warning)';
                    el.appendChild(probe);
                    const c = getComputedStyle(probe).color;
                    probe.remove();
                    return c;
                })(),
            ]);
            expect(color).toBe(warning);
            await settle(page);
            await expect(container).toHaveScreenshot(`run-notice-${theme}-${ide}.png`);
        });
    }
}
