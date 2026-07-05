import { describe, it, expect } from 'vitest';
import { humanizeAiError } from './errorMessages';

describe('humanizeAiError', () => {
    const cases: Array<[string, RegExp]> = [
        ['HTTP 401', /未授权/],
        ['Incorrect API key provided', /未授权/],
        ['HTTP 403', /拒绝/],
        ['HTTP 429', /频繁/],
        ['Rate limit exceeded', /频繁/],
        ['TimeoutError: signal timed out', /超时/],
        ['Failed to fetch', /无法连接/],
        ['NetworkError when attempting to fetch resource', /无法连接/],
        ['HTTP 500', /暂时不可用/],
        ['HTTP 503', /暂时不可用/],
        ['some totally unrecognized garbage', /异常/],
    ];

    it.each(cases)('humanizes "%s"', (raw, expectedPattern) => {
        const { display, raw: rawOut } = humanizeAiError(raw);
        expect(display).toMatch(expectedPattern);
        expect(rawOut).toBe(raw);
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
