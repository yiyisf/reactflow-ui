import type { Page } from '@playwright/test';

/** Waits until web fonts and pending network work have settled, so screenshots are stable. */
export async function settle(page: Page) {
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    // One extra frame for layout that depends on font metrics.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
}
