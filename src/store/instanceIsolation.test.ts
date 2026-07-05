import { describe, it, expect } from 'vitest';
import { createAiStore } from './aiStore';
import { createLibraryStore } from './libraryStore';
import { ToolRegistry } from '../services/ai/toolRegistry';

/**
 * M3.2's core claim: two <AiWorkflowIDE> instances on the same page must not share
 * conversation/library/custom-tool state. These tests verify that claim directly at
 * the factory level (no React needed — the isolation is a property of the factories
 * themselves, which is what IdeStoresContext wires one-per-mount).
 */
describe('createAiStore instance isolation', () => {
    it('two instances start with independent, non-shared message lists', () => {
        const a = createAiStore(false);
        const b = createAiStore(false);

        a.getState().addMessage({ role: 'user', content: 'only in A' });

        expect(a.getState().messages.some(m => m.content === 'only in A')).toBe(true);
        expect(b.getState().messages.some(m => m.content === 'only in A')).toBe(false);
    });

    it('a pending proposal in one instance is invisible to another', () => {
        const a = createAiStore(false);
        const b = createAiStore(false);

        a.getState().setProposal({
            proposedDef: { name: 'a_only', tasks: [] } as any,
            diff: { added: [], modified: [], removed: [], propsChanged: false },
            messageId: 'm1',
        });

        expect(a.getState().pendingProposal?.proposedDef.name).toBe('a_only');
        expect(b.getState().pendingProposal).toBeNull();
    });

    it('config changes in one instance do not leak into another', () => {
        const a = createAiStore(false);
        const b = createAiStore(false);

        a.getState().setConfig({ apiKey: 'sk-instance-a' });

        expect(a.getState().config.apiKey).toBe('sk-instance-a');
        expect(b.getState().config.apiKey).toBe('');
    });
});

describe('createLibraryStore instance isolation', () => {
    it('two instances hold independent library catalogs', () => {
        const a = createLibraryStore();
        const b = createLibraryStore();

        a.getState().setLibrary([{ workflowName: 'a_only', workflowLevel: 'L1', version: '1', description: '', tags: [] }]);

        expect(a.getState().items).toHaveLength(1);
        expect(b.getState().items).toHaveLength(0);
    });
});

describe('ToolRegistry instance isolation', () => {
    it('two instances hold independent custom tool sets', () => {
        const a = new ToolRegistry();
        const b = new ToolRegistry();

        a.setTools([{
            definition: { type: 'function', function: { name: 'only_in_a', description: '', parameters: {} } },
            execute: async () => 'ok',
        }]);

        expect(a.has('only_in_a')).toBe(true);
        expect(b.has('only_in_a')).toBe(false);
    });
});
