import { describe, it, expect } from 'vitest';
import { humanizeAiError, DIRECT_FETCH_FAILED } from './errorMessages';

describe('humanizeAiError', () => {
    const cases: Array<[string, RegExp]> = [
        ['HTTP 401', /API Key 无效/],
        ['HTTP 401: Incorrect API key provided', /API Key 无效/],
        // Anthropic / DeepSeek 的鉴权报错原文
        ['HTTP 401: invalid x-api-key', /API Key 无效/],
        ['HTTP 401: Authentication Fails (no such user)', /API Key 无效/],
        ['HTTP 403', /没有权限/],
        ['HTTP 429', /频繁/],
        ['Rate limit exceeded', /频繁/],
        // 余额不足：DeepSeek 402、OpenAI 的 insufficient_quota（同为 429，但不是限流）
        ['HTTP 402: Insufficient Balance', /余额或额度不足/],
        ['HTTP 429: You exceeded your current quota, please check your plan and billing details.', /余额或额度不足/],
        // 模型不存在
        ['HTTP 404: The model `gpt-9` does not exist or you do not have access to it.', /找不到所配置的模型/],
        ['HTTP 404: model: claude-nope', /找不到所配置的模型/],
        ['HTTP 404', /地址不存在/],
        // o 系列推理模型拒绝 temperature
        ["HTTP 400: Unsupported value: 'temperature' does not support 0.7 with this model. Only the default (1) value is supported.", /temperature/],
        ['TimeoutError: signal timed out', /超时/],
        [`${DIRECT_FETCH_FAILED}: Failed to fetch`, /CORS/],
        ['Failed to fetch', /无法连接/],
        ['NetworkError when attempting to fetch resource', /无法连接/],
        ['HTTP 500', /暂时不可用/],
        ['HTTP 503', /暂时不可用/],
        ['some totally unrecognized garbage', /无法识别/],
    ];

    it.each(cases)('humanizes "%s"', (raw, expectedPattern) => {
        const { display, raw: rawOut } = humanizeAiError(raw);
        expect(display).toMatch(expectedPattern);
        expect(rawOut).toBe(raw);
    });

    it('tells direct-mode users to check their own key, not to contact an admin', () => {
        const { display } = humanizeAiError('HTTP 401: invalid x-api-key');
        expect(display).toContain('AI 设置');
        expect(display).not.toContain('联系管理员');
    });

    it('points endpoint-mode users at the proxy administrator for auth failures', () => {
        const { display } = humanizeAiError('HTTP 401', { mode: 'endpoint' });
        expect(display).toContain('代理');
        expect(display).toContain('管理员');
    });

    it('never leaks the raw technical string into the user-facing display', () => {
        for (const [raw] of cases) {
            const { display } = humanizeAiError(raw);
            if (raw.length >= 6) expect(display).not.toContain(raw);
        }
    });

    it('handles undefined/null/empty input without throwing', () => {
        expect(humanizeAiError(undefined).display.length).toBeGreaterThan(0);
        expect(humanizeAiError(null).display.length).toBeGreaterThan(0);
        expect(humanizeAiError('').display.length).toBeGreaterThan(0);
    });
});
