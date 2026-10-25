import { describe, expect, it } from 'vitest';
import { CM_ICONS, EMOJI_ALIASES, resolveIconName } from './iconRegistry';
import { BUILTIN_COMMON_ACTIONS } from '../../actions/builtin/common';
import { BUILTIN_ECS_ACTIONS } from '../../actions/builtin/ecs';
import { BUILTIN_WORKFLOW_TEMPLATES } from '../../template/builtin/templates';
import { TASK_TYPE_LABELS } from '../../utils/taskTypeMeta';

describe('resolveIconName', () => {
    it('accepts registered names as-is', () => {
        expect(resolveIconName('server')).toBe('server');
    });

    it('maps legacy emoji (with or without the variation selector) to icon names', () => {
        expect(resolveIconName('🖥️')).toBe('server');
        expect(resolveIconName('🖥')).toBe('server');
        expect(resolveIconName('⚙️')).toBe('settings');
    });

    it('returns null for empty or unknown values', () => {
        expect(resolveIconName(undefined)).toBeNull();
        expect(resolveIconName('')).toBeNull();
        expect(resolveIconName('not-an-icon')).toBeNull();
    });

    it('every emoji alias points at a registered icon', () => {
        for (const [emoji, name] of Object.entries(EMOJI_ALIASES)) {
            expect(CM_ICONS[name], `${emoji} → ${name}`).toBeDefined();
        }
    });
});

describe('CMASTER rule 7: built-in data uses icon names, not emoji', () => {
    const cases: Array<[string, string]> = [
        ...[...BUILTIN_COMMON_ACTIONS, ...BUILTIN_ECS_ACTIONS].map((a) => [`action ${a.id}`, a.icon] as [string, string]),
        ...BUILTIN_WORKFLOW_TEMPLATES.map((t) => [`template ${t.id}`, t.icon] as [string, string]),
        ...Object.entries(TASK_TYPE_LABELS).map(([type, meta]) => [`task type ${type}`, meta.icon] as [string, string]),
    ];

    it.each(cases)('%s has a registered icon name', (_label, icon) => {
        expect(Object.keys(CM_ICONS)).toContain(icon);
    });
});
