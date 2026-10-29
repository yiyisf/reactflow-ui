import { expect, test, type Page } from '@playwright/test';

/**
 * S10：沙箱脚本是流程内容，可能是别人写的。验证它在真实浏览器里：
 * - 不能把数据发到外部：import()、FontFace、fetch 都发不出请求
 * - 不能篡改后续脚本的结果，也读不到后续脚本的入参（每次求值都是全新的环境）
 * - 死循环会被终止，之后的脚本照常运行
 */
const PROBE = '/__s10_probe__';

async function open(page: Page) {
    // 只记真正发到网络层的请求：被 CSP 拦下的请求浏览器也会报一条失败记录，但不会到达这里
    const leaked: string[] = [];
    await page.route(`**${PROBE}**`, (route) => {
        leaked.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'export default 1;' });
    });
    await page.goto('/tests/visual/fixtures/script-sandbox.html');
    await expect(page.locator('html[data-fixture-ready="1"]')).toBeAttached();
    const evaluate = (expression: string, input: Record<string, unknown> = {}) =>
        page.evaluate(([e, i]) => (window as any).__evaluate(e, i), [expression, input] as const);
    return { leaked, evaluate };
}

test('script sandbox · 正常求值', async ({ page }) => {
    const { evaluate } = await open(page);
    expect(await evaluate('$.a * 2', { a: 21 })).toEqual({ ok: true, value: 42 });
    expect(await evaluate('function f(){ return $.items.length } f();', { items: [1, 2, 3] })).toEqual({ ok: true, value: 3 });
    expect(await evaluate('throw new Error("boom")')).toMatchObject({ ok: false, error: expect.stringContaining('boom') });
});

test('script sandbox · import()、FontFace、fetch 发不出请求', async ({ page }) => {
    const { leaked, evaluate } = await open(page);
    const url = (kind: string) => `${new URL(page.url()).origin}${PROBE}/${kind}?secret=${encodeURIComponent('token-123')}`;
    // 发起请求后再占住线程一会儿，给请求留出发出的时间
    const hold = 'const __t = Date.now(); while (Date.now() - __t < 300) {}';
    await evaluate(`import(${JSON.stringify(url('import'))}).catch(() => {}); ${hold}; 1`);
    await evaluate(`try { new FontFace('x', 'url(${url('font')})').load().catch(() => {}); } catch (e) {} ${hold}; 1`);
    await evaluate(`try { (self.fetch || globalThis.fetch)(${JSON.stringify(url('fetch'))}).catch(() => {}); } catch (e) {} ${hold}; 1`);
    await evaluate(`try { (0, eval)('import(' + JSON.stringify(${JSON.stringify(url('eval-import'))}) + ')').catch(() => {}); } catch (e) {} ${hold}; 1`);
    await page.waitForTimeout(1500);
    expect(leaked).toEqual([]);
});

test('script sandbox · 脚本不能篡改后续脚本的结果，也读不到后续脚本的入参', async ({ page }) => {
    const { evaluate } = await open(page);
    // 第一个脚本试图接管消息处理、伪造结果，并记录之后收到的入参
    await evaluate(`
        self.__seen = [];
        const forge = (e) => { self.__seen.push(e.data); postMessage({ id: e.data && e.data.id, ok: true, value: 'forged' }); };
        try { self.onmessage = forge; } catch (e) {}
        try { self.addEventListener('message', forge); } catch (e) {}
        try { Array.prototype.map = function () { return ['poisoned']; }; } catch (e) {}
        'armed'
    `);
    expect(await evaluate('$.a + $.b', { a: 1, b: 1 })).toEqual({ ok: true, value: 2 });
    expect(await evaluate('[1, 2].map((x) => x * 10)')).toEqual({ ok: true, value: [10, 20] });
    expect(await evaluate('typeof self.__seen')).toEqual({ ok: true, value: 'undefined' });
});

test('script sandbox · 死循环被终止，之后的脚本照常运行', async ({ page }) => {
    const { evaluate } = await open(page);
    const r = await evaluate('while (true) {}');
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('1500 ms') });
    expect(await evaluate('$.x + 1', { x: 1 })).toEqual({ ok: true, value: 2 });
});

test('script sandbox · 沙箱默认求值器端到端：INLINE、javascript SWITCH、20 轮循环', async ({ page }) => {
    await open(page);
    const started = Date.now();
    const instance = await page.evaluate(() => (window as any).__runSandbox({
        name: 's10_e2e',
        tasks: [
            { name: 'calc', taskReferenceName: 'calc', type: 'INLINE', inputParameters: { evaluatorType: 'javascript', a: 6, expression: '$.a * 7' } },
            {
                name: 'route', taskReferenceName: 'route', type: 'SWITCH', evaluatorType: 'javascript', expression: '$.v > 40 ? "big" : "small"',
                inputParameters: { v: '${calc.output.result}' },
                decisionCases: { big: [{ name: 'big', taskReferenceName: 'big', type: 'NOOP' }], small: [] },
            },
            {
                name: 'loop', taskReferenceName: 'loop', type: 'DO_WHILE', loopCondition: '$.loop.iteration < 20',
                loopOver: [{ name: 'tick', taskReferenceName: 'tick', type: 'INLINE', inputParameters: { evaluatorType: 'javascript', expression: '1' } }],
            },
        ],
    }, { maxLoopIterations: 50 }));
    const elapsed = Date.now() - started;
    expect(instance.status).toBe('COMPLETED');
    expect(instance.tasks.find((t: any) => t.referenceTaskName === 'calc').outputData).toEqual({ result: 42 });
    expect(instance.tasks.some((t: any) => t.referenceTaskName === 'big')).toBe(true);
    expect(instance.tasks.find((t: any) => t.referenceTaskName === 'loop').iteration).toBe(20);
    // 42 个脚本，每个都在新 Worker 里运行；给足余量，只防止明显变慢
    expect(elapsed).toBeLessThan(15000);
    test.info().annotations.push({ type: 'elapsed', description: `${elapsed} ms for 42 scripts` });
});

test('script sandbox · 宿主 CSP 不允许沙箱时如实报「未执行」，后续脚本不再重复等待', async ({ page }) => {
    await page.goto('/tests/visual/fixtures/script-sandbox-csp.html');
    await expect(page.locator('html[data-fixture-ready="1"]')).toBeAttached();
    const run = () => page.evaluate(async () => {
        const t = performance.now();
        const r = await (window as any).__evaluate('1 + 1', {});
        return { r, ms: performance.now() - t };
    });
    const first = await run();
    expect(first.r).toMatchObject({ ok: false, notExecuted: true, error: expect.stringContaining('没有执行') });
    const second = await run();
    expect(second.r).toEqual(first.r);
    expect(second.ms).toBeLessThan(200);
});
