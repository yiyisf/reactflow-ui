import { expect, test } from '@playwright/test';
import { settle } from './helpers';

/**
 * The demo IDE (/app.html) in every theme and view mode. Preferences are seeded through the same localStorage key the
 * store persists ("conductor-ui-prefs"), so no clicking is needed and the shots do not depend on header markup.
 */
const THEMES = ['dark', 'light'] as const;
const VIEW_MODES = ['business', 'standard', 'developer'] as const;

for (const theme of THEMES) {
    for (const viewMode of VIEW_MODES) {
        test(`IDE · ${theme} · ${viewMode}`, async ({ page }) => {
            await page.addInitScript(
                ([t, v]) => {
                    localStorage.setItem(
                        'conductor-ui-prefs',
                        JSON.stringify({
                            state: { theme: t, themeColor: 'orange', viewMode: v, layoutDirection: 'TB', edgeType: 'smoothstep', nodesLocked: false, copiedTask: null },
                            version: 1,
                        }),
                    );
                },
                [theme, viewMode] as const,
            );
            await page.goto('/app.html');
            await expect(page.locator(`[data-mode="${theme}"]`).first()).toBeVisible();
            await settle(page);
            await expect(page).toHaveScreenshot(`ide-${theme}-${viewMode}.png`);
        });
    }
}

test('IDE · primary buttons keep readable text on hover', async ({ page }) => {
    // Regression guard for the CMASTER rule "global link styles must not apply to buttons":
    // hovering an orange button must not turn its label orange.
    await page.goto('/app.html');
    await settle(page);
    const buttons = page.locator('button, a');
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 40); i++) {
        const el = buttons.nth(i);
        if (!(await el.isVisible())) continue;
        const bg = await el.evaluate((n) => getComputedStyle(n).backgroundColor);
        if (!/rgb\(255, 106, 19\)|rgb\(229, 84, 10\)|rgb\(255, 138, 61\)/.test(bg)) continue;
        await el.hover();
        const [fg, hoverBg] = await el.evaluate((n) => [getComputedStyle(n).color, getComputedStyle(n).backgroundColor]);
        expect(fg, `label colour equals background on hover for button #${i}`).not.toBe(hoverBg);
    }
});
