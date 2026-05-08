/**
 * AI Protocol Adapter — OpenAI / Anthropic 双协议统一适配
 *
 * 将两种 API 协议统一为相同的 StreamEvent 流，支持 Tool Use (Function Calling)。
 */

// ─── 公共类型 ────────────────────────────────────────────────────────────────

export interface AiConfig {
    provider: 'openai' | 'anthropic' | 'auto';
    apiKey: string;
    baseUrl: string;
    model: string;
}

export interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
    name?: string;
}

export interface ToolDef {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    };
}

export type StreamEvent =
    | { type: 'text'; content: string }
    | { type: 'tool_call'; id: string; name: string; args: Record<string, any> }
    | { type: 'error'; message: string }
    | { type: 'done' };

// ─── Provider 检测 ──────────────────────────────────────────────────────────

function detectProvider(config: AiConfig): 'openai' | 'anthropic' {
    if (config.provider !== 'auto') return config.provider;
    if (config.baseUrl.includes('anthropic')) return 'anthropic';
    return 'openai';
}

// ─── OpenAI 流式处理 ────────────────────────────────────────────────────────

async function* streamOpenAI(
    messages: Message[],
    tools: ToolDef[],
    config: AiConfig,
    signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
    const body: Record<string, any> = {
        model: config.model || 'gpt-4o',
        messages,
        temperature: 0.7,
        stream: true,
    };

    if (tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
        yield { type: 'error', message: err.error?.message || `HTTP ${response.status}` };
        return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'error', message: 'ReadableStream not supported' }; return; }

    const decoder = new TextDecoder();
    // Accumulate partial tool calls by index
    const toolCalls: Record<number, { id: string; name: string; args: string }> = {};

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') break;

            try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                if (!delta) continue;

                // Text content
                if (delta.content) {
                    yield { type: 'text', content: delta.content };
                }

                // Tool calls (may arrive in chunks)
                if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index ?? 0;
                        if (!toolCalls[idx]) {
                            toolCalls[idx] = { id: tc.id || '', name: '', args: '' };
                        }
                        if (tc.id) toolCalls[idx].id = tc.id;
                        if (tc.function?.name) toolCalls[idx].name += tc.function.name;
                        if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
                    }
                }
            } catch {
                // skip malformed SSE chunks
            }
        }
    }

    // Emit accumulated tool calls
    for (const tc of Object.values(toolCalls)) {
        try {
            const args = JSON.parse(tc.args);
            yield { type: 'tool_call', id: tc.id, name: tc.name, args };
        } catch {
            yield { type: 'error', message: `Failed to parse tool call args for ${tc.name}` };
        }
    }

    yield { type: 'done' };
}

// ─── Anthropic 流式处理 ─────────────────────────────────────────────────────

async function* streamAnthropic(
    messages: Message[],
    tools: ToolDef[],
    config: AiConfig,
    signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
    // Anthropic 需要把 system message 分离出来
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
            role: m.role === 'tool' ? 'user' as const : m.role as 'user' | 'assistant',
            content: m.role === 'tool'
                ? [{ type: 'tool_result' as const, tool_use_id: m.tool_call_id, content: m.content }]
                : m.content,
        }));

    // 转换 tool 定义到 Anthropic 格式
    const anthropicTools = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
    }));

    const body: Record<string, any> = {
        model: config.model || 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: chatMessages,
        stream: true,
    };
    if (systemMsg) body.system = systemMsg.content;
    if (anthropicTools.length > 0) body.tools = anthropicTools;

    const response = await fetch(`${config.baseUrl}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal,
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
        yield { type: 'error', message: err.error?.message || `HTTP ${response.status}` };
        return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'error', message: 'ReadableStream not supported' }; return; }

    const decoder = new TextDecoder();
    let currentToolId = '';
    let currentToolName = '';
    let currentToolArgs = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;

            try {
                const parsed = JSON.parse(trimmed.slice(6));

                switch (parsed.type) {
                    case 'content_block_start':
                        if (parsed.content_block?.type === 'tool_use') {
                            currentToolId = parsed.content_block.id;
                            currentToolName = parsed.content_block.name;
                            currentToolArgs = '';
                        }
                        break;

                    case 'content_block_delta':
                        if (parsed.delta?.type === 'text_delta') {
                            yield { type: 'text', content: parsed.delta.text };
                        } else if (parsed.delta?.type === 'input_json_delta') {
                            currentToolArgs += parsed.delta.partial_json;
                        }
                        break;

                    case 'content_block_stop':
                        if (currentToolName) {
                            try {
                                const args = JSON.parse(currentToolArgs || '{}');
                                yield { type: 'tool_call', id: currentToolId, name: currentToolName, args };
                            } catch {
                                yield { type: 'error', message: `Failed to parse tool args for ${currentToolName}` };
                            }
                            currentToolName = '';
                            currentToolArgs = '';
                        }
                        break;

                    case 'message_stop':
                        break;
                }
            } catch {
                // skip
            }
        }
    }

    yield { type: 'done' };
}

// ─── 统一入口 ───────────────────────────────────────────────────────────────

export async function* streamChat(
    messages: Message[],
    tools: ToolDef[],
    config: AiConfig,
    signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
    if (!config.apiKey) {
        yield { type: 'error', message: 'Please configure AI API Key.' };
        yield { type: 'done' };
        return;
    }

    const provider = detectProvider(config);

    if (provider === 'anthropic') {
        yield* streamAnthropic(messages, tools, config, signal);
    } else {
        yield* streamOpenAI(messages, tools, config, signal);
    }
}
