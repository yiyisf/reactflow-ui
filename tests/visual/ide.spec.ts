import { expect, test, type Page } from '@playwright/test';
import { settle } from './helpers';

/**
 * The demo IDE (/app.html) in both themes and its three distinct views. Theme and brand colour are seeded through the
 * store's persisted key ("conductor-ui-prefs"); the view is chosen by clicking the same controls a user would, because
 * the demo keeps uiMode / layout in component state (seeding viewMode alone does not change what is on screen).
 */
const THEMES = ['dark', 'light'] as const;

const VIEWS: Record<string, (page: Page) => Promise<void>> = {
    // 业务模式 · 业务卡片流 (default)
    'business-cards': async () => {},
    // 业务模式 · 全景画布
    'business-canvas': async (page) => {
        await page.getByRole('button', { name: /全景画布/ }).click();
        await page.locator('.react-flow').first().waitFor();
    },
    // 专业模式 (DAG)
    pro: async (page) => {
        await page.getByRole('group', { name: '使用模式' }).getByRole('button', { name: /专业/ }).click();
        await page.locator('.react-flow').first().waitFor();
    },
};

for (const theme of THEMES) {
    for (const [view, open] of Object.entries(VIEWS)) {
        test(`IDE · ${theme} · ${view}`, async ({ page }) => {
            await page.addInitScript((t) => {
                localStorage.setItem(
                    'conductor-ui-prefs',
                    JSON.stringify({ state: { theme: t, themeColor: 'orange' }, version: 1 }),
                );
            }, theme);
            await page.goto('/app.html');
            await expect(page.locator(`[data-mode="${theme}"]`).first()).toBeVisible();
            await open(page);
            await settle(page);
            await expect(page).toHaveScreenshot(`ide-${theme}-${view}.png`);
        });
    }
}

test('IDE · the three views really differ', async ({ page }) => {
    // Guards this spec itself: if a view switch silently stops working, the shots above would all look alike.
    await page.goto('/app.html');
    await settle(page);
    const cards = await page.screenshot();
    await VIEWS['business-canvas'](page);
    await settle(page);
    const canvas = await page.screenshot();
    await VIEWS.pro(page);
    await settle(page);
    const pro = await page.screenshot();
    expect(cards.equals(canvas)).toBe(false);
    expect(canvas.equals(pro)).toBe(false);
});

test('IDE · primary buttons keep readable text on hover', async ({ page }) => {
    // Regression guard for the CMASTER rule "global link styles must not apply to buttons":
    // hovering an orange button must not turn its label orange.
    await page.addInitScript(() => {
        localStorage.setItem('conductor-ui-prefs', JSON.stringify({ state: { themeColor: 'orange' }, version: 1 }));
    });
    await page.goto('/app.html');
    await settle(page);
    const buttons = page.locator('button, a');
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 60); i++) {
        const el = buttons.nth(i);
        if (!(await el.isVisible())) continue;
        const bg = await el.evaluate((n) => getComputedStyle(n).backgroundColor);
        if (!/rgb\(255, 106, 19\)|rgb\(229, 84, 10\)|rgb\(255, 138, 61\)/.test(bg)) continue;
        await el.hover();
        const [fg, hoverBg] = await el.evaluate((n) => [getComputedStyle(n).color, getComputedStyle(n).backgroundColor]);
        expect(fg, `label colour equals background on hover for button #${i}`).not.toBe(hoverBg);
    }
});
