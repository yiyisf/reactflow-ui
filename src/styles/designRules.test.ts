import { describe, expect, it } from 'vitest';

/**
 * Source-level guards for CMASTER design rules (CLAUDE.md "Hard rules"). They scan the source as text, like the
 * telemetry guard tests, so a regression fails `npm test` before anyone has to spot it on screen.
 */
const sources = import.meta.glob('../**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.entries(sources).filter(([path]) => !/\.test\.tsx?$/.test(path) && !/(^|\/)(cmaster-tokens\.css|cmasterTokens\.ts)$/.test(path));

describe('CMASTER rule 6: text on accent fills is never hard-coded white', () => {
    it('no style block pairs an accent background with #fff / white text', () => {
        const offenders: string[] = [];
        const white = /color:\s*['"]?(#fff|#ffffff|white)\b/gi;
        for (const [path, text] of files) {
            for (const m of text.matchAll(white)) {
                const start = text.lastIndexOf('{', m.index);
                const end = text.indexOf('}', m.index);
                const block = text.slice(start, end);
                const bg = /background(?:-color)?:\s*([^;,\n]+)/.exec(block)?.[1] ?? '';
                if (bg.includes('color-accent') && !bg.includes('?')) {
                    offenders.push(`${path}:${text.slice(0, m.index).split('\n').length}`);
                }
            }
        }
        // Use var(--color-on-accent) instead: dark on CMASTER orange, white on the deprecated blue brand.
        expect(offenders).toEqual([]);
    });
});

/**
 * Every UI source file is migrated to CMASTER: no emoji (rule 7) and no raw colour literals (rule 1).
 * The exceptions below are deliberate; anything else that regresses fails `npm test`.
 */
const COLOUR_EXCEPTIONS: Record<string, string> = {
    // import.meta.glob keys files next to this test as './x', everything else as '../dir/x'
    './tokens.css': 'bridge from legacy variables to --cm-* tokens, including the deprecated blue brand',
    '../components/BrandLogo.tsx': 'CMASTER logo: the logo orange is the one allowed literal (rule 1)',
    '../components/ThemeControls.tsx': 'brand swatch for the deprecated blue theme',
};
const EMOJI_EXCEPTIONS: Record<string, string> = {
    '../components/icons/iconRegistry.ts': 'maps legacy emoji from host data to icon names',
    '../services/ai/toolExecutor.ts': 'tool results read by the model, not shown in the UI',
    '../services/ai/contextEngine.ts': 'context text read by the model, not shown in the UI',
};
/** Generated token files hold the raw values by design. */
const isGenerated = (p: string) => /(^|\/)(cmaster-tokens\.css|cmasterTokens\.ts)$/.test(p);
const isUiSource = (p: string) => /\.(tsx?|css)$/.test(p) && !/\.test\./.test(p) && !isGenerated(p);

const EMOJI_FREE = Object.keys(sources).filter((p) => isUiSource(p) && !p.endsWith('.css') && !(p in EMOJI_EXCEPTIONS));

describe('CMASTER rule 7: no emoji in UI source', () => {
    it('covers the code base', () => expect(EMOJI_FREE.length).toBeGreaterThan(100));
    it.each(EMOJI_FREE)('%s contains no emoji', (path) => {
        const text = sources[path];
        expect(text, `${path} not found by the glob`).toBeTypeOf('string');
        const hits = text
            .split('\n')
            .map((line, i) => [i + 1, line] as const)
            // Extended_Pictographic misses text dingbats such as ✓ ✕ ✗ ↺ ▶ ⚠ that render as ad-hoc icons.
            .filter(([, line]) => /\p{Extended_Pictographic}|[✓✔✕✖✗✘↺↻▶⏭⏩⚠✦↕↵]/u.test(line))
            .map(([n, line]) => `${n}: ${line.trim()}`);
        expect(hits).toEqual([]);
    });
});

const TOKEN_ONLY = Object.keys(sources).filter((p) => isUiSource(p) && !(p in COLOUR_EXCEPTIONS));

describe('CMASTER rule 1: no raw colour literals in UI source', () => {
    it('covers the code base', () => expect(TOKEN_ONLY.length).toBeGreaterThan(100));
    it.each(TOKEN_ONLY)('%s uses tokens only', (path) => {
        const code = sources[path].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        const hits = code
            .split('\n')
            .map((line, i) => [i + 1, line] as const)
            .filter(([, line]) => /#[0-9a-fA-F]{3,8}\b(?![-\w])|rgba?\(\s*\d/.test(line))
            .map(([n, line]) => `${n}: ${line.trim()}`);
        // Use var(--cm-*) or a legacy alias; for transparency, color-mix(in srgb, var(--cm-x) N%, transparent).
        expect(hits).toEqual([]);
    });
});
