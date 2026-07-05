import { describe, it, expect } from 'vitest';
import { loadDraft, saveDraft, clearDraft, isMeaningfulDraft, type IdeDraft } from './draftPersistence';

const sampleDraft: IdeDraft = {
    workflowDef: { name: 'wf1', tasks: [] } as any,
    messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }],
    pendingProposal: null,
    savedAt: Date.now(),
};

describe('draftPersistence', () => {
    it('round-trips a draft through save/load', () => {
        saveDraft('k1', sampleDraft);
        const loaded = loadDraft('k1');
        expect(loaded?.workflowDef?.name).toBe('wf1');
        expect(loaded?.messages).toHaveLength(1);
    });

    it('returns null for a missing key', () => {
        expect(loadDraft('does-not-exist')).toBeNull();
    });

    it('returns null (not throw) for malformed JSON', () => {
        localStorage.setItem('bad', '{not json');
        expect(() => loadDraft('bad')).not.toThrow();
        expect(loadDraft('bad')).toBeNull();
    });

    it('returns null for a shape missing required fields', () => {
        localStorage.setItem('shapeless', JSON.stringify({ foo: 'bar' }));
        expect(loadDraft('shapeless')).toBeNull();
    });

    it('clearDraft removes the entry', () => {
        saveDraft('k2', sampleDraft);
        clearDraft('k2');
        expect(loadDraft('k2')).toBeNull();
    });

    describe('isMeaningfulDraft', () => {
        it('is false for welcome-only messages with no def or proposal', () => {
            expect(isMeaningfulDraft(null, [{ id: 'welcome', role: 'assistant', content: '', timestamp: 0 }], null)).toBe(false);
        });
        it('is true when a workflowDef is present', () => {
            expect(isMeaningfulDraft({ name: 'x', tasks: [] } as any, [], null)).toBe(true);
        });
        it('is true when a non-welcome message exists', () => {
            expect(isMeaningfulDraft(null, [{ id: 'm1', role: 'user', content: 'hi', timestamp: 0 }], null)).toBe(true);
        });
        it('is true when a pendingProposal exists', () => {
            expect(isMeaningfulDraft(null, [], { id: 'p1' } as any)).toBe(true);
        });
    });
});
