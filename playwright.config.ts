import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression for the CMASTER design system.
 *
 * Baselines are only valid when produced by the same browser build and fonts that compare them, so they are generated
 * and checked inside the official Playwright container (see .github/workflows/visual.yml and visual-baselines.yml).
 * @playwright/test is installed ad hoc in CI (`npm i --no-save`), keeping package-lock.json unchanged.
 */
const PORT = 4173;

export default defineConfig({
    testDir: 'tests/visual',
    snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
    expect: {
        toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
    },
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        reducedMotion: 'reduce',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
        },
    ],
    webServer: {
        command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
        url: `http://127.0.0.1:${PORT}/app.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
