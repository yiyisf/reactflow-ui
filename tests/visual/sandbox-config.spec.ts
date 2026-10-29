import { expect, test } from '@playwright/test';
import { settle } from './helpers';

/**
 * 沙箱配置台（v1.3.2 批次 2）：深浅两套主题下
 * - 标题徽标写「本地试运行」（U4）；启动按钮是主按钮，文字用 on-accent（橙色主题下即 --cm-on-brand，规则 6）
 * - SWITCH value-param + expression 的写法能识别入参，给出一键切换（S14）
 * - 任务列表的模拟状态徽标是图标 + 中文（U3，规则 5）
 */
const THEMES = ['dark', 'light'] as const;

for (const theme of THEMES) {
    test(`sandbox config · ${theme}`, async ({ page }) => {
        await page.goto(`/tests/visual/fixtures/sandbox-config.html?theme=${theme}`);
        await expect(page.locator(`[data-mode="${theme}"]`).first()).toBeAttached();
        await page.getByTitle(/人工模拟数据配置台/).first().click();
        const dialog = page.getByRole('dialog', { name: '本地沙箱试运行配置台' });
        await expect(dialog).toBeVisible();

        await expect(dialog).toContainText('本地试运行');
        await expect(dialog).not.toContainText('0ms');
        await expect(dialog.getByRole('button', { name: 'customerLevel = "vip"' })).toBeVisible();

        const start = dialog.getByRole('button', { name: /应用模拟数据并启动沙箱试运行/ });
        const [color, onAccent] = await start.evaluate((el) => {
            const probe = document.createElement('span');
            probe.style.color = 'var(--color-on-accent)';
            el.appendChild(probe);
            const c = getComputedStyle(probe).color;
            probe.remove();
            return [getComputedStyle(el).color, c];
        });
        expect(color).toBe(onAccent);

        await settle(page);
        await expect(dialog).toHaveScreenshot(`sandbox-config-${theme}-input.png`);

        await dialog.getByRole('button', { name: /2\. 节点级人工 Mock/ }).click();
        const badges = dialog.getByTestId('sandbox-mock-badge');
        await expect(badges).toHaveText(['模拟失败', '模拟已超时']);
        await expect(badges.first().locator('svg')).toHaveCount(1);
        await settle(page);
        await expect(dialog).toHaveScreenshot(`sandbox-config-${theme}-tasks.png`);
    });
}
