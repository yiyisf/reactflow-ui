/**
 * AI Transport — 传输层反转
 *
 * 背景：默认的 direct 模式让 API Key 直接留存在终端用户浏览器中，直连大模型服务商
 * （参见 protocolAdapter.ts 的 streamOpenAI/streamAnthropic）。这仅适合开发调试，
 * 生产环境应通过集成方自己的后端转发模型请求，密钥、计费、限流、审计都留在后端完成。
 *
 * 本文件提供两种反转方案：
 * - `endpoint`：把统一的 AgentRequest POST 给集成方后端，后端以 SSE 帧协议回传 StreamEvent。
 *   后端参考实现（Node/Express，约 30 行）：
 *
 *   ```js
 *   app.post('/api/ai/chat', async (req, res) => {
 *     res.setHeader('Content-Type', 'text/event-stream');
 *     res.setHeader('Cache-Control', 'no-cache');
 *     res.setHeader('Connection', 'keep-alive');
 *     // req.body = { messages, tools, meta } —— 按需转发给 OpenAI/Anthropic，
 *     // 或直接复用本仓库的 streamOpenAI/streamAnthropic 实现（Node 端可直接 import 使用）。
 *     for await (const event of callYourLlmProvider(req.body)) {
 *       res.write(`data: ${JSON.stringify(event)}\n\n`);
 *     }
 *     res.end();
 *   });
 *   ```
 *
 * - `custom`：完全自定义的流式函数，适合已有网关/SDK 的集成方直接接入。
 *
 * 不设置 `transport` 时，AiConfig 的 provider/apiKey/baseUrl/model 视为 direct 模式
 * （向后兼容现状），仅建议用于开发调试或内部可信环境。
 */

import type { Message, ToolDef, StreamEvent } from './protocolAdapter';

/** endpoint / custom 传输统一入参：与 direct 模式内部构造的请求体等价 */
export interface AgentRequest {
    messages: Message[];
    tools: ToolDef[];
    meta?: { sessionId?: string };
}

export type AiTransport =
    | {
        type: 'endpoint';
        /** 集成方后端代理地址，POST AgentRequest，响应为 `data: <JSON StreamEvent>\n\n` 的 SSE 流 */
        url: string;
        /** 附加请求头（如后端会话鉴权 Cookie/Token 之外的自定义头） */
        headers?: Record<string, string>;
    }
    | {
        type: 'custom';
        /** 完全自定义的流式实现，直接产出统一的 StreamEvent */
        stream: (req: AgentRequest, signal: AbortSignal) => AsyncIterable<StreamEvent>;
    };

/** endpoint 模式的错误文案：区分网络失败 / HTTP 错误 / 响应体解析失败 */
function describeFetchError(e: any): string {
    if (e?.name === 'AbortError') return '请求已取消';
    if (e instanceof TypeError) return '无法连接 AI 代理服务，请检查网络或 endpoint 配置';
    return e?.message || '请求失败';
}

/**
 * endpoint 模式：POST AgentRequest，解析 SSE 帧（`data: <JSON>\n\n`）为 StreamEvent。
 * 帧解析逻辑与 protocolAdapter 的 OpenAI/Anthropic 流解析一致地处理跨 chunk 边界，
 * 避免 JSON 被截断在两次 read() 之间。
 */
export async function* streamEndpoint(
    transport: Extract<AiTransport, { type: 'endpoint' }>,
    req: AgentRequest,
    signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
    let response: Response;
    try {
        response = await fetch(transport.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(transport.headers ?? {}),
            },
            body: JSON.stringify(req),
            signal,
        });
    } catch (e: any) {
        yield { type: 'error', message: describeFetchError(e) };
        yield { type: 'done' };
        return;
    }

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        let message = `HTTP ${response.status}`;
        try {
            const parsed = JSON.parse(text);
            message = parsed.error?.message || parsed.message || message;
        } catch {
            // response body wasn't JSON — keep the HTTP status message
        }
        yield { type: 'error', message };
        yield { type: 'done' };
        return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
        yield { type: 'error', message: 'ReadableStream not supported' };
        yield { type: 'done' };
        return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? ''; // last (possibly incomplete) frame carries over

            for (const frame of frames) {
                const line = frame.trim();
                if (!line.startsWith('data:')) continue;
                const data = line.slice(5).trim();
                if (!data) continue;
                try {
                    yield JSON.parse(data) as StreamEvent;
                } catch {
                    // skip malformed frame rather than aborting the whole stream
                }
            }
        }
    } finally {
        reader.cancel().catch(() => {});
    }

    // Flush a trailing frame that wasn't terminated by a final blank line
    const trailing = buffer.trim();
    if (trailing.startsWith('data:')) {
        const data = trailing.slice(5).trim();
        if (data) {
            try {
                yield JSON.parse(data) as StreamEvent;
            } catch {
                // ignore malformed trailing frame
            }
        }
    }
}
