import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { streamChat } from './protocolAdapter';
import type { StreamEvent } from './protocolAdapter';

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
    const out: StreamEvent[] = [];
    for await (const e of gen) out.push(e);
    return out;
}

function listen(server: http.Server): Promise<number> {
    return new Promise(resolve => {
        server.listen(0, () => resolve((server.address() as any).port));
    });
}

describe('transport / endpoint mode', () => {
    let server: http.Server | null = null;
    afterEach(() => {
        server?.close();
        server = null;
    });

    it('parses SSE frames split across chunk boundaries', async () => {
        server = http.createServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            const frame = `data: ${JSON.stringify({ type: 'text', content: 'hello' })}\n\n`;
            res.write(frame.slice(0, 10));
            setTimeout(() => {
                res.write(frame.slice(10));
                res.end();
            }, 5);
        });
        const port = await listen(server);

        const events = await collect(streamChat([{ role: 'user', content: 'hi' }], [], {
            apiKey: '',
            transport: { type: 'endpoint', url: `http://localhost:${port}` },
        }));
        expect(events).toEqual([{ type: 'text', content: 'hello' }]);
    });

    it('flushes a trailing frame that lacks the final blank line', async () => {
        server = http.createServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.write(`data: ${JSON.stringify({ type: 'done' })}`); // no trailing \n\n
            res.end();
        });
        const port = await listen(server);

        const events = await collect(streamChat([{ role: 'user', content: 'hi' }], [], {
            apiKey: '',
            transport: { type: 'endpoint', url: `http://localhost:${port}` },
        }));
        expect(events).toEqual([{ type: 'done' }]);
    });

    it('surfaces the response body error message on non-2xx status', async () => {
        server = http.createServer((_req, res) => {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'invalid session' } }));
        });
        const port = await listen(server);

        const events = await collect(streamChat([{ role: 'user', content: 'hi' }], [], {
            apiKey: '',
            transport: { type: 'endpoint', url: `http://localhost:${port}` },
        }));
        expect(events).toContainEqual({ type: 'error', message: 'invalid session' });
        expect(events).toContainEqual({ type: 'done' });
    });

    it('surfaces a network-failure message when the endpoint is unreachable', async () => {
        const events = await collect(streamChat([{ role: 'user', content: 'hi' }], [], {
            apiKey: '',
            transport: { type: 'endpoint', url: 'http://localhost:1' }, // nothing listens on port 1
        }));
        expect(events[0].type).toBe('error');
        expect(events).toContainEqual({ type: 'done' });
    });

    it('forwards the AgentRequest (messages + tools) and custom headers', async () => {
        let receivedBody: any = null;
        let receivedHeaders: http.IncomingHttpHeaders | null = null;
        server = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                receivedBody = JSON.parse(body);
                receivedHeaders = req.headers;
                res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                res.end(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            });
        });
        const port = await listen(server);

        await collect(streamChat(
            [{ role: 'user', content: 'hi' }],
            [{ type: 'function', function: { name: 'foo', description: '', parameters: {} } }],
            { apiKey: '', transport: { type: 'endpoint', url: `http://localhost:${port}`, headers: { 'X-Session': 'abc' } } },
        ));

        expect(receivedBody.messages[0].content).toBe('hi');
        expect(receivedBody.tools[0].function.name).toBe('foo');
        expect(receivedHeaders?.['x-session']).toBe('abc');
    });
});

describe('transport / custom mode', () => {
    it('passes AgentRequest through and forwards a real AbortSignal', async () => {
        let receivedSignal: AbortSignal | null = null;
        const events = await collect(streamChat([{ role: 'user', content: 'hi' }], [], {
            apiKey: '',
            transport: {
                type: 'custom',
                stream: async function* (req, signal) {
                    receivedSignal = signal;
                    expect(req.messages[0].content).toBe('hi');
                    yield { type: 'text', content: 'from custom' };
                    yield { type: 'done' };
                },
            },
        }));
        expect(events).toEqual([{ type: 'text', content: 'from custom' }, { type: 'done' }]);
        expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });
});
