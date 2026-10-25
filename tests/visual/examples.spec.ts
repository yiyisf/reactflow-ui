import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { settle } from './helpers';

/**
 * Golden examples in design/examples render only from src/styles/cmaster-tokens.css and design/reference/components.css.
 * A diff here means a token or reference-style change altered the look of a published pattern: confirm it is intended.
 */
const EXAMPLES = readdirSync(join(process.cwd(), 'design/examples')).filter((f) => f.endsWith('.html'));

for (const file of EXAMPLES) {
    test(`example · ${file}`, async ({ page }) => {
        await page.goto(`/design/examples/${file}`);
        await settle(page);
        await expect(page).toHaveScreenshot(file.replace(/\.html$/, '.png'), { fullPage: true });
    });
}
