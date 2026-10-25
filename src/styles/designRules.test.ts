import { describe, expect, it } from 'vitest';

/**
 * Source-level guards for CMASTER design rules (CLAUDE.md "Hard rules"). They scan the source as text, like the
 * telemetry guard tests, so a regression fails `npm test` before anyone has to spot it on screen.
 */
const sources = import.meta.glob('../**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.entries(sources).filter(([path]) => !/\.test\.tsx?$/.test(path) && !path.includes('/styles/cmaster'));

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
 * UI code already migrated to CMASTER: no emoji (rule 7) and no raw colour literals (rule 1).
 * Add a directory or file here once it is clean, so regressions fail `npm test`.
 */
const MIGRATED = [
    '../components/AiNative/',
    '../components/business/',
    '../components/template/',
    '../components/onboarding/',
    '../components/import/',
    '../demo/',
    '../components/SandboxConfigModal.tsx',
    '../components/FullscreenEditor.tsx',
    '../components/PromptDialog.tsx',
    '../components/ConfirmDialog.tsx',
    '../components/Toast.tsx',
    '../components/EmptyStatePanel.tsx',
    '../components/EmptyStatePanel.css',
];
const isUiSource = (p: string) => /\.(tsx?|css)$/.test(p) && !/\.test\./.test(p);
const migrated = Object.keys(sources).filter((p) => isUiSource(p) && MIGRATED.some((m) => (m.endsWith('/') ? p.startsWith(m) : p === m)));

/** Files migrated to Lucide icons before the directory list above existed. */
const EMOJI_FREE = [
    '../components/Controls/ActionBar.tsx',
    '../components/Controls/ControlButton.tsx',
    '../components/ThemeControls.tsx',
    '../components/ExecutionStatusBar.tsx',
    '../components/WorkflowDesigner.tsx',
    '../WorkflowIDE.tsx',
    '../AiWorkflowIDE.tsx',
    '../actions/builtin/common.ts',
    '../actions/builtin/ecs.ts',
    '../actions/fromDefinitions.ts',
    '../template/builtin/templates.ts',
    '../utils/taskTypeMeta.ts',
    '../components/icons/CmIcon.tsx',
    ...migrated.filter((p) => !p.endsWith('.css')),
];

describe('CMASTER rule 7: no emoji in migrated UI files', () => {
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

const TOKEN_ONLY = migrated;

describe('CMASTER rule 1: no raw colour literals in tokenized files', () => {
    it('the list is not empty', () => expect(TOKEN_ONLY.length).toBeGreaterThan(0));
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
