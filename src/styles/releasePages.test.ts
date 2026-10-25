import { describe, expect, it } from 'vitest';

/**
 * Release pages (index.html = current version, v1-*.html = history) follow the CMASTER marketing rules
 * (design/guidelines/marketing.md, CLAUDE.md rules 7 and 10): one campaign palette per page, a different palette
 * from the previous version, colours from tokens, no emoji.
 */
const pages = import.meta.glob('../../{index,v1-*}.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const CAMPAIGNS = ['ember', 'glacier', 'nebula', 'signal', 'solar'];
/** The logo is the only artwork with literal colours: logo orange and the dark node centre of cmaster-mark-dark. */
const LOGO_LITERALS = new Set(['#ff6a13', '#0b0a09']);

const versionOf = (path: string, html: string): string => {
    const m = /v1-(\d+)\.html$/.exec(path);
    if (m) return `1.${m[1]}`;
    return /CMASTER v(\d+\.\d+)/.exec(html)?.[1] ?? 'latest';
};

const entries = Object.entries(pages)
    .map(([path, html]) => ({ path, html, version: versionOf(path, html) }))
    .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));

describe('release pages', () => {
    it('are found', () => expect(entries.length).toBeGreaterThanOrEqual(4));

    it.each(entries)('$path declares one campaign palette and loads the tokens', ({ html }) => {
        const campaign = /<html[^>]*data-campaign="([a-z]+)"/.exec(html)?.[1];
        expect(CAMPAIGNS).toContain(campaign);
        expect(html).toMatch(/<html[^>]*data-mode="dark"/);
        expect(html).toContain('/src/styles/cmaster-tokens.css');
        expect(html).toContain('/src/marketing/campaign.css');
    });

    it('consecutive versions use different palettes', () => {
        const palettes = entries.map((e) => /data-campaign="([a-z]+)"/.exec(e.html)?.[1]);
        for (let i = 1; i < palettes.length; i++) {
            expect(palettes[i], `${entries[i].path} repeats the palette of ${entries[i - 1].path}`).not.toBe(palettes[i - 1]);
        }
    });

    it.each(entries)('$path has no emoji', ({ html }) => {
        const hits = html
            .split('\n')
            .map((line, i) => [i + 1, line] as const)
            .filter(([, line]) => /(?![©®™])\p{Extended_Pictographic}|[✓✔✕✖✗✘↺↻▶⏭⏩⚠✦↕↵]/u.test(line))
            .map(([n, line]) => `${n}: ${line.trim().slice(0, 120)}`);
        expect(hits).toEqual([]);
    });

    it.each(entries)('$path takes its colours from tokens', ({ html }) => {
        const code = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const hits = [...code.matchAll(/#[0-9a-fA-F]{3,8}\b(?![-\w])|rgba?\(\s*\d[^)]*\)/g)]
            .map((m) => m[0])
            .filter((lit) => !LOGO_LITERALS.has(lit.toLowerCase()));
        // Use var(--a) for the campaign accent, --cm-* tokens for everything else (src/marketing/campaign.css).
        expect(hits).toEqual([]);
    });
});
