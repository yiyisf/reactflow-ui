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
    // AI 设计器 (the AI panel: chat, cards, canvas drawer)
    ai: async (page) => {
        await page.getByRole('group', { name: '设计器模式' }).getByRole('button', { name: /AI/ }).click();
        await page.locator('.ai-cc-messages').first().waitFor();
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

test('IDE · light theme icons are not near-white', async ({ page }) => {
    // Regression guard: the light IDE once inherited the dark default text colour from the host body,
    // so every currentColor icon on white cards vanished. Pixel-ratio screenshots miss a few small icons.
    await page.addInitScript(() => {
        localStorage.setItem('conductor-ui-prefs', JSON.stringify({ state: { theme: 'light', themeColor: 'orange' }, version: 1 }));
    });
    await page.goto('/app.html');
    await settle(page);
    const pale: string[] = [];
    for (const view of ['business-cards', 'ai'] as const) {
        await VIEWS[view](page);
        await settle(page);
        pale.push(...await page.locator('[data-mode="light"] svg.lucide').evaluateAll((svgs) => {
            const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
            const light = (c: string) => {
                const [r, g, b] = rgb(c);
                return r > 225 && g > 225 && b > 225;
            };
            // first ancestor with an opaque-ish background; white icons on red/orange fills are fine
            const groundOf = (el: Element | null): string => {
                for (; el; el = el.parentElement) {
                    // a gradient or image fill: ground colour unknown, treat as dark so the icon is not flagged
                    if (getComputedStyle(el).backgroundImage !== 'none') return 'rgb(0, 0, 0)';
                    const bg = getComputedStyle(el).backgroundColor;
                    const a = rgb(bg)[3];
                    if (bg !== 'transparent' && (a === undefined || a > 0.5)) return bg;
                }
                return 'rgb(255, 255, 255)';
            };
            return svgs
                .filter((s) => s.getBoundingClientRect().width > 0)
                .filter((s) => light(getComputedStyle(s).color) && light(groundOf(s.parentElement)))
                .map((s) => `${s.getAttribute('class')} in ${s.parentElement?.textContent?.trim().slice(0, 20)}`);
        }));
    }
    expect(pale, 'near-white icons on light grounds in light theme').toEqual([]);
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
