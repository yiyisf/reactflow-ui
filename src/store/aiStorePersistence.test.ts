import { describe, it, expect } from 'vitest';
import useAiStore, { pickPersistedAiConfig, mergePersistedAiState } from './aiStore';
import type { AiConfig } from '../services/ai/protocolAdapter';

describe('aiStore persistence (A4)', () => {
    it('persists only provider / baseUrl / model — never apiKey, transport or endpoint headers', () => {
        const config: AiConfig = {
            provider: 'openai',
            apiKey: 'sk-secret',
            baseUrl: 'https://api.deepseek.com/v1',
            model: 'deepseek-chat',
            transport: { type: 'endpoint', url: 'https://proxy.local/ai', headers: { 'X-Token': 'secret' } },
        };
        expect(pickPersistedAiConfig(config)).toEqual({
            provider: 'openai',
            baseUrl: 'https://api.deepseek.com/v1',
            model: 'deepseek-chat',
        });
    });

    it('drops a transport persisted by an older version when rehydrating', () => {
        const current = useAiStore.getState();
        const legacyPersisted = {
            config: {
                provider: 'anthropic',
                apiKey: '',
                model: 'claude-sonnet-4-6',
                // JSON round-trip of a custom transport loses `stream` — using it would throw
                transport: { type: 'custom' },
            },
            metrics: { totalProposals: 3 },
        };
        const merged = mergePersistedAiState(legacyPersisted, current);
        expect(merged.config.transport).toBeUndefined();
        expect(merged.config.provider).toBe('anthropic');
        expect(merged.config.model).toBe('claude-sonnet-4-6');
        expect(merged.metrics.totalProposals).toBe(3);
        expect(typeof merged.setConfig).toBe('function');
    });

    it('restores an interrupted ("running") checkpoint as paused so the recovery card shows', () => {
        useAiStore.getState().hydrateFromDraft([], null, {
            sessionId: 's', userPrompt: 'p', assistantMsgId: 'm', phase: 'topology', workingDraft: null,
            agentHistory: [], stepIndex: 2, selfHealCount: 0, status: 'running', updatedAt: 0,
        });
        expect(useAiStore.getState().durableCheckpoint?.status).toBe('paused');
        useAiStore.getState().clearMessages();
    });
});
