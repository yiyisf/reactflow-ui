import { describe, expect, it } from 'vitest';
import { cmasterTokens } from './cmasterTokens';

/**
 * Guards the CMASTER design rules that can be checked from tokens alone (WCAG 2 contrast).
 * If a token edit breaks one of these, fix the token in design/tokens.json, not the test.
 */

const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
    const n = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

const GROUNDS = ['canvas', 'surface-0', 'surface-1', 'surface-2', 'surface-3'] as const;
const TEXT = ['text-primary', 'text-secondary', 'text-muted', 'brand-text', 'data', 'ai'] as const;
const MARKS = ['status-success', 'status-failed', 'status-warning', 'focus-ring', 'border-strong'] as const;

describe.each(cmasterTokens.themes)('CMASTER tokens · %s theme', (theme) => {
    const c = cmasterTokens.color[theme] as Record<string, string>;

    it.each(TEXT.flatMap((fg) => GROUNDS.map((bg) => [fg, bg] as const)))(
        'text %s on %s meets 4.5:1',
        (fg, bg) => {
            expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
        },
    );

    it.each(MARKS.flatMap((fg) => (['surface-1', 'surface-2'] as const).map((bg) => [fg, bg] as const)))(
        'mark %s on %s meets 3:1',
        (fg, bg) => {
            expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(3);
        },
    );

    it.each(['brand-500', 'brand-400', 'brand-600'] as const)('on-brand text on %s meets 4.5:1', (fill) => {
        expect(contrast(c['on-brand'], c[fill])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(Object.entries(cmasterTokens.campaign[theme]))(
        'campaign %s: button text and accent on canvas meet 4.5:1',
        (_name, p) => {
            expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(p.accent, c.canvas)).toBeGreaterThanOrEqual(4.5);
        },
    );
});

describe('CMASTER brand invariants', () => {
    it('logo orange is identical in every theme', () => {
        const values = cmasterTokens.themes.map((t) => cmasterTokens.color[t]['brand-500']);
        expect(new Set(values)).toEqual(new Set(['#ff6a13']));
    });
});
