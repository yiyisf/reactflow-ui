import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { callAICopilot, callAICopilotStream, AI_NOT_CONFIGURED_MESSAGE, isAiConfigured } from './aiService';
import type { StreamEvent } from './ai/protocolAdapter';

function sse(lines: string[]): Response {
    const stream = new ReadableStream<Uint8Array>({
        start(c) { const enc = new TextEncoder(); for (const l of lines) c.enqueue(enc.encode(l)); c.close(); },
    });
    return new Response(stream, { status: 200 });
}

describe('legacy aiService routes through protocolAdapter (A16)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('sends Anthropic configs to the Anthropic Messages API, not api.openai.com', async () => {
        fetchMock.mockImplementation(async () => sse([
            `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: '你好' } })}\n`,
        ]));
        const text = await callAICopilot([{ role: 'user', content: 'hi' }], { provider: 'anthropic', apiKey: 'sk-ant' });
        expect(text).toBe('你好');
        expect(String(fetchMock.mock.calls[0][0])).toContain('api.anthropic.com');
    });

    it('uses an endpoint / custom transport without an apiKey', async () => {
        const stream = async function* (): AsyncGenerator<StreamEvent> {
            yield { type: 'text', content: 'a' };
            yield { type: 'text', content: 'b' };
            yield { type: 'done' };
        };
        const tokens: string[] = [];
        const text = await callAICopilotStream([{ role: 'user', content: 'hi' }], { apiKey: '', transport: { type: 'custom', stream } }, t => tokens.push(t));
        expect(text).toBe('ab');
        expect(tokens).toEqual(['a', 'b']);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws a human message (not the raw provider text) on HTTP errors', async () => {
        fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401 }));
        let message = '';
        try {
            await callAICopilot([{ role: 'user', content: 'hi' }], { provider: 'anthropic', apiKey: 'bad' });
        } catch (e: any) {
            message = e.message;
        }
        expect(message).toContain('API Key');
        expect(message).not.toContain('invalid x-api-key');
    });

    it('says how to configure when nothing is configured', async () => {
        expect(isAiConfigured({ apiKey: '' })).toBe(false);
        let message = '';
        try { await callAICopilot([{ role: 'user', content: 'hi' }], {}); } catch (e: any) { message = e.message; }
        expect(message).toBe(AI_NOT_CONFIGURED_MESSAGE);
    });
});
