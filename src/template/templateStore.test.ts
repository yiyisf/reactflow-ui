import { describe, it, expect } from 'vitest';
import { TemplateStore } from './templateStore';
import { BUILTIN_WORKFLOW_TEMPLATES } from './builtin/templates';

describe('TemplateStore change signal (R17)', () => {
    it('register bumps the version and notifies subscribers; unsubscribe stops it', () => {
        const store = new TemplateStore([]);
        const v0 = store.getVersion();
        let calls = 0;
        const off = store.subscribe(() => { calls += 1; });
        const tpl = { ...BUILTIN_WORKFLOW_TEMPLATES[0], id: 'tpl_new_from_run', title: '新提取的模板' };
        store.register(tpl);
        expect(store.getVersion()).toBe(v0 + 1);
        expect(calls).toBe(1);
        expect(store.search('新提取').map((t) => t.id)).toEqual(['tpl_new_from_run']);
        off();
        store.register({ ...tpl, id: 'tpl_other' });
        expect(calls).toBe(1);
        expect(store.getVersion()).toBe(v0 + 2);
    });

    it('methods work when passed around unbound (useSyncExternalStore calls them that way)', () => {
        const store = new TemplateStore([]);
        const { subscribe, getVersion } = store;
        let hit = false;
        const off = subscribe(() => { hit = true; });
        store.register({ ...BUILTIN_WORKFLOW_TEMPLATES[0], id: 'x' });
        expect(hit).toBe(true);
        expect(getVersion()).toBe(1);
        off();
    });
});
