import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { streamChat, testConnection } from './protocolAdapter';
import type { StreamEvent, Message } from './protocolAdapter';

function sseResponse(chunks: string[], status = 200): Response {
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const encoder = new TextEncoder();
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    });
    return new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

function jsonErrorResponse(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: { message } }), { status });
}

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
    const out: StreamEvent[] = [];
    for await (const e of gen) out.push(e);
    return out;
}

const USER_MSG: Message[] = [{ role: 'user', content: 'hi' }];

describe('protocolAdapter / streamChat', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('direct mode — OpenAI', () => {
        it('reconstructs a text delta split across two chunk boundaries', async () => {
            const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: 'hello' } }] })}\n\n`;
            fetchMock.mockResolvedValue(sseResponse([frame.slice(0, 15), frame.slice(15), 'data: [DONE]\n\n']));

            const events = await collect(streamChat(USER_MSG, [], { apiKey: 'sk-test', provider: 'openai' }));
            expect(events).toContainEqual({ type: 'text', content: 'hello' });
            expect(events.at(-1)).toEqual({ type: 'done' });
        });

        it('reconstructs a tool_call whose name/arguments arrive across multiple deltas', async () => {
            const chunks = [
                `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'search_wo' } }] } }] })}\n\n`,
                `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'rkflow' } }] } }] })}\n\n`,
                `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"q":' } }] } }] })}\n\n`,
                `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"foo"}' } }] } }] })}\n\n`,
                'data: [DONE]\n\n',
            ];
            fetchMock.mockResolvedValue(sseResponse(chunks));

            const events = await collect(streamChat(USER_MSG, [], { apiKey: 'sk-test', provider: 'openai' }));
            const toolCall = events.find(e => e.type === 'tool_call');
            expect(toolCall).toEqual({ type: 'tool_call', id: 'call_1', name: 'search_workflow', args: { q: 'foo' } });
        });

        it('injects a __truncated__ sentinel when tool_call arguments are malformed JSON', async () => {
            const chunks = [
                `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_2', function: { name: 'replace_workflow', arguments: '{"workflow": {"name": "x", "tasks": [' } }] } }] })}\n\n`,
                'data: [DONE]\n\n',
            ];
            fetchMock.mockResolvedValue(sseResponse(chunks));

            const events = await collect(streamChat(USER_MSG, [], { apiKey: 'sk-test', provider: 'openai' }));
            const toolCall = events.find(e => e.type === 'tool_call') as any;
            expect(toolCall.args).toEqual({ __truncated__: true });
        });

        it('flushes a trailing tool_call frame that has no terminating [DONE]/newline', async () => {
            // Some providers close the stream right after the last data frame without a
            // final blank line — the trailing-buffer flush path must still parse it.
            const frame = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_3', function: { name: 'get_workflow_state', arguments: '{}' } }] } }] })}`;
            fetchMock.mockResolvedValue(sseResponse([frame]));

            const events = await collect(streamChat(USER_MSG, [], { apiKey: 'sk-test', provider: 'openai' }));
            expect(events.find(e => e.type === 'tool_call')).toEqual({ type: 'tool_call', id: 'call_3', name: 'get_workflow_state', args: {} });
        });

        it('surfaces the provider error message on non-2xx responses', async () => {
            fetchMock.mockResolvedValue(jsonErrorResponse(401, 'Incorrect API key provided'));
            const events = await collect(streamChat(USER_MSG, [], { apiKey: 'bad-key', provider: 'openai' }));
            expect(events[0]).toEqual({ type: 'error', message: 'Incorrect API key provided' });
        });

        it('requests stream_options.include_usage and emits a usage event from the trailing empty-choices chunk', async () => {
            const chunks = [
                `data: ${JSON.stringify({ choices: [{ delta: { content: 'hi' } }] })}\n\n`,
                `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 42, completion_tokens: 7 } })}\n\n`,
                'data: [DONE]\n\n',
            ];
            fetchMock.mockResolvedValue(sseResponse(chunks));

            const events = await collect(streamChat(USER_MSG, [], { apiKey: 'sk-test', provider: 'openai' }));
            expect(events).toContainEqual({ type: 'usage', promptTokens: 42, completionTokens: 7 });

            const [, init] = fetchMock.mock.calls[0];
            const body = JSON.parse(init.body);
            expect(body.stream_options).toEqual({ include_usage: true });
        });
    });

    describe('direct mode — Anthropic', () => {
        it('reconstructs text_delta and tool_use blocks', async () => {
            const chunks = [
                `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi there' } })}\n\n`,
                `data: ${JSON.stringify({ type: 'content_block_start', content_block: { type: 'tool_use', id: 'toolu_1', name: 'validate_workflow' } })}\n\n`,
                `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"stric' } })}\n\n`,
                `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: 't":true}' } })}\n\n`,
                `data: ${JSON.stringify({ type: 'content_block_stop' })}\n\n`,
            ];
            fetchMock.mockResolvedValue(sseResponse(chunks));

            const events = await collect(streamChat(USER_MSG, [], { apiKey: 'sk-ant-test', provider: 'anthropic' }));
            expect(events).toContainEqual({ type: 'text', content: 'hi there' });
            expect(events).toContainEqual({ type: 'tool_call', id: 'toolu_1', name: 'validate_workflow', args: { strict: true } });
        });

        it('sets the anthropic-dangerous-direct-browser-access header only for direct anthropic calls', async () => {
            fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n\n']));
            await collect(streamChat(USER_MSG, [], { apiKey: 'sk-ant-test', provider: 'anthropic' }));
            const [, init] = fetchMock.mock.calls[0];
            expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
        });

        it('auto-detects anthropic provider from baseUrl when provider is unset', async () => {
            fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n\n']));
            await collect(streamChat(USER_MSG, [], { apiKey: 'k', baseUrl: 'https://api.anthropic.com' }));
            const [url] = fetchMock.mock.calls[0];
            expect(url).toContain('/messages');
        });

        it('combines message_start prompt tokens with message_delta completion tokens into a usage event', async () => {
            const chunks = [
                `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 0 } } })}\n\n`,
                `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } })}\n\n`,
                `data: ${JSON.stringify({ type: 'message_delta', delta: {}, usage: { output_tokens: 15 } })}\n\n`,
            ];
            fetchMock.mockResolvedValue(sseResponse(chunks));

            const events = await collect(streamChat(USER_MSG, [], { apiKey: 'sk-ant-test', provider: 'anthropic' }));
            expect(events).toContainEqual({ type: 'usage', promptTokens: 100, completionTokens: 15 });
        });
    });

    describe('guards and transport precedence', () => {
        it('errors immediately when no apiKey and no transport are configured', async () => {
            const events = await collect(streamChat(USER_MSG, [], { apiKey: '' }));
            expect(events[0].type).toBe('error');
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('does not require apiKey when a transport is configured', async () => {
            const events = await collect(streamChat(USER_MSG, [], {
                apiKey: '',
                transport: { type: 'custom', stream: async function* () { yield { type: 'done' }; } },
            }));
            expect(events).toEqual([{ type: 'done' }]);
        });

        it('prefers transport over direct-mode fields even when apiKey is present', async () => {
            const events = await collect(streamChat(USER_MSG, [], {
                apiKey: 'sk-should-be-ignored',
                transport: { type: 'custom', stream: async function* () { yield { type: 'text', content: 'from custom' }; } },
            }));
            expect(events).toEqual([{ type: 'text', content: 'from custom' }]);
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('testConnection', () => {
        it('rejects immediately with no apiKey, without calling fetch', async () => {
            const result = await testConnection({ apiKey: '' });
            expect(result.ok).toBe(false);
            expect(result.message).toContain('API Key');
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('reports success for a 2xx OpenAI response', async () => {
            fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
            const result = await testConnection({ apiKey: 'sk-test', provider: 'openai' });
            expect(result.ok).toBe(true);
            expect(result.message).toContain('openai');
        });

        it('reports success for a 2xx Anthropic response and hits the /messages endpoint', async () => {
            fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
            const result = await testConnection({ apiKey: 'sk-ant-test', provider: 'anthropic' });
            expect(result.ok).toBe(true);
            expect(result.message).toContain('anthropic');
            expect(fetchMock.mock.calls[0][0]).toContain('/messages');
        });

        it('surfaces the provider error message on failure', async () => {
            fetchMock.mockResolvedValue(jsonErrorResponse(401, 'Incorrect API key provided'));
            const result = await testConnection({ apiKey: 'bad-key', provider: 'openai' });
            expect(result.ok).toBe(false);
            expect(result.message).toBe('Incorrect API key provided');
        });

        it('reports a network-failure message when fetch throws a TypeError', async () => {
            fetchMock.mockRejectedValue(new TypeError('fetch failed'));
            const result = await testConnection({ apiKey: 'sk-test', provider: 'openai' });
            expect(result.ok).toBe(false);
            expect(result.message).toContain('网络');
        });
    });
});
