/**
 * AI Protocol Adapter — OpenAI / Anthropic 双协议统一适配
 *
 * 支持的协议：
 * - OpenAI Chat Completions API（/chat/completions）
 *   兼容提供商：OpenAI、Mistral、DeepSeek、Groq、Together.ai、Azure OpenAI、
 *              Ollama、LM Studio、vLLM 等任意 OpenAI 兼容服务
 * - Anthropic Messages API（/messages）
 *
 * baseUrl 和 model 均为可选，不填时自动使用各提供商默认值。
 */

// ─── 公共类型 ────────────────────────────────────────────────────────────────

export interface AiConfig {
    /**
     * 协议类型：
     * - 'openai'     — OpenAI Chat Completions 协议（Mistral/Groq/DeepSeek 等兼容服务也选此项）
     * - 'anthropic'  — Anthropic Messages 协议
     * - 'auto'       — 根据 baseUrl 自动判断（包含 anthropic.com → Anthropic，其余 → OpenAI）
     * @default 'auto'
     */
    provider?: 'openai' | 'anthropic' | 'auto';

    /** API Key */
    apiKey: string;

    /**
     * API 基础 URL（不含路径）。
     * 留空时使用各提供商标准地址：
     * - OpenAI:    https://api.openai.com/v1
     * - Anthropic: https://api.anthropic.com
     *
     * 常见第三方示例：
     * - Mistral:   https://api.mistral.ai/v1
     * - DeepSeek:  https://api.deepseek.com/v1
     * - Groq:      https://api.groq.com/openai/v1
     * - Ollama:    http://localhost:11434/v1
     * - Azure:     https://{resource}.openai.azure.com/openai/deployments/{deploy}
     */
    baseUrl?: string;

    /**
     * 模型名称。留空时使用各提供商默认模型：
     * - OpenAI:    gpt-4o
     * - Anthropic: claude-sonnet-4-6
     */
    model?: string;
}

export interface ToolCallRef {
    id: string;
    name: string;
    args: Record<string, any>;
}

export interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
    /** For assistant turns that issued tool calls — used to build the agentic history */
    tool_calls?: ToolCallRef[];
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

// ─── Provider 默认值 ─────────────────────────────────────────────────────────

export const PROVIDER_DEFAULTS = {
    openai: {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
    },
    anthropic: {
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-6',
    },
} as const;

/** 解析有效配置（填充所有默认值） */
function resolveConfig(config: AiConfig): Required<AiConfig> & { resolvedProvider: 'openai' | 'anthropic' } {
    // Detect provider
    let resolvedProvider: 'openai' | 'anthropic';
    if (!config.provider || config.provider === 'auto') {
        resolvedProvider = config.baseUrl?.includes('anthropic') ? 'anthropic' : 'openai';
    } else {
        resolvedProvider = config.provider;
    }

    const defaults = PROVIDER_DEFAULTS[resolvedProvider];

    return {
        provider: resolvedProvider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl?.replace(/\/$/, '') || defaults.baseUrl,
        model: config.model || defaults.model,
        resolvedProvider,
    };
}

// ─── Message format converters ───────────────────────────────────────────────

/**
 * Convert unified Messages to OpenAI Chat Completions format.
 * Handles assistant messages with tool_calls and role='tool' result messages.
 */
function toOpenAIMessages(messages: Message[]): any[] {
    return messages.map(m => {
        if (m.role === 'assistant' && m.tool_calls?.length) {
            return {
                role: 'assistant',
                content: m.content || null,
                tool_calls: m.tool_calls.map(tc => ({
                    id: tc.id,
                    type: 'function' as const,
                    function: { name: tc.name, arguments: JSON.stringify(tc.args) },
                })),
            };
        }
        const out: Record<string, any> = { role: m.role, content: m.content };
        if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
        return out;
    });
}

/**
 * Convert unified Messages to Anthropic Messages API format.
 * Handles: assistant tool_use blocks, grouped tool_result user messages.
 * Anthropic requires strict user/assistant alternation, so consecutive tool
 * result messages are merged into a single user message content array.
 */
function toAnthropicMessages(messages: Message[]): any[] {
    // Step 1: map each message to an intermediate form
    type Intermediate =
        | { _kind: 'msg'; role: 'user' | 'assistant'; content: any }
        | { _kind: 'tool_result'; tool_use_id: string; content: string };

    const intermediate: Intermediate[] = messages
        .filter(m => m.role !== 'system')
        .map(m => {
            if (m.role === 'tool') {
                return { _kind: 'tool_result' as const, tool_use_id: m.tool_call_id ?? '', content: m.content };
            }
            if (m.role === 'assistant' && m.tool_calls?.length) {
                const blocks: any[] = [];
                if (m.content) blocks.push({ type: 'text', text: m.content });
                m.tool_calls.forEach(tc =>
                    blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
                );
                return { _kind: 'msg' as const, role: 'assistant' as const, content: blocks };
            }
            return {
                _kind: 'msg' as const,
                role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
                content: m.content,
            };
        });

    // Step 2: group consecutive tool_result entries into a single user message
    const result: any[] = [];
    let i = 0;
    while (i < intermediate.length) {
        const item = intermediate[i];
        if (item._kind === 'tool_result') {
            const batch: any[] = [{ type: 'tool_result', tool_use_id: item.tool_use_id, content: item.content }];
            while (i + 1 < intermediate.length && intermediate[i + 1]._kind === 'tool_result') {
                i++;
                const next = intermediate[i] as Extract<Intermediate, { _kind: 'tool_result' }>;
                batch.push({ type: 'tool_result', tool_use_id: next.tool_use_id, content: next.content });
            }
            result.push({ role: 'user', content: batch });
        } else {
            result.push({ role: item.role, content: item.content });
        }
        i++;
    }
    return result;
}

// ─── OpenAI 流式处理（兼容任意 OpenAI Chat Completions API） ─────────────────

async function* streamOpenAI(
    messages: Message[],
    tools: ToolDef[],
    config: AiConfig,
    signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
    const resolved = resolveConfig(config);

    const body: Record<string, any> = {
        model: resolved.model,
        messages: toOpenAIMessages(messages),
        temperature: 0.7,
        stream: true,
    };

    if (tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    const response = await fetch(`${resolved.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resolved.apiKey}`,
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
    const toolCalls: Record<number, { id: string; name: string; args: string }> = {};
    let lineBuffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Carry incomplete lines across chunk boundaries to avoid split-JSON errors
        const chunk = decoder.decode(value, { stream: true });
        const rawLines = (lineBuffer + chunk).split('\n');
        lineBuffer = rawLines.pop() ?? '';

        for (const line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') break;

            try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                if (!delta) continue;

                if (delta.content) {
                    yield { type: 'text', content: delta.content };
                }

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

    // Flush any remaining lineBuffer content not terminated by \n (non-standard SSE or abrupt close)
    if (lineBuffer.trim().startsWith('data: ')) {
        const data = lineBuffer.trim().slice(6);
        if (data && data !== '[DONE]') {
            try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index ?? 0;
                        if (!toolCalls[idx]) toolCalls[idx] = { id: tc.id || '', name: '', args: '' };
                        if (tc.id) toolCalls[idx].id = tc.id;
                        if (tc.function?.name) toolCalls[idx].name += tc.function.name;
                        if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
                    }
                }
            } catch { /* ignore malformed trailing data */ }
        }
    }

    for (const tc of Object.values(toolCalls)) {
        let args: Record<string, any>;
        try {
            args = JSON.parse(tc.args || '{}');
        } catch {
            // Partial JSON from SSE truncation — fall back to {} so no-param tools
            // (e.g. validate_workflow) still execute; param-requiring tools will fail
            // gracefully at the executor level rather than aborting the entire turn.
            args = {};
        }
        yield { type: 'tool_call', id: tc.id, name: tc.name, args };
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
    const resolved = resolveConfig(config);

    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = toAnthropicMessages(messages);

    const anthropicTools = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
    }));

    const body: Record<string, any> = {
        model: resolved.model,
        max_tokens: 8192,
        messages: chatMessages,
        stream: true,
    };
    if (systemMsg) body.system = systemMsg.content;
    if (anthropicTools.length > 0) body.tools = anthropicTools;

    const response = await fetch(`${resolved.baseUrl}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': resolved.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
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
    let lineBuffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Carry incomplete lines across chunk boundaries to avoid split-JSON errors
        const chunk = decoder.decode(value, { stream: true });
        const rawLines = (lineBuffer + chunk).split('\n');
        lineBuffer = rawLines.pop() ?? '';

        for (const line of rawLines) {
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
                            let toolArgs: Record<string, any>;
                            try {
                                toolArgs = JSON.parse(currentToolArgs || '{}');
                            } catch {
                                toolArgs = {};
                            }
                            yield { type: 'tool_call', id: currentToolId, name: currentToolName, args: toolArgs };
                            currentToolName = '';
                            currentToolArgs = '';
                        }
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
        yield { type: 'error', message: '未配置 API Key，请在设置中填写。' };
        yield { type: 'done' };
        return;
    }

    const resolved = resolveConfig(config);

    if (resolved.resolvedProvider === 'anthropic') {
        yield* streamAnthropic(messages, tools, config, signal);
    } else {
        yield* streamOpenAI(messages, tools, config, signal);
    }
}

// ─── 连接测试 ────────────────────────────────────────────────────────────────

export interface TestConnectionResult {
    ok: boolean;
    message: string;
}

export async function testConnection(config: AiConfig): Promise<TestConnectionResult> {
    if (!config.apiKey?.trim()) {
        return { ok: false, message: '请先填写 API Key' };
    }
    const resolved = resolveConfig(config);
    try {
        let response: Response;
        if (resolved.resolvedProvider === 'anthropic') {
            response = await fetch(`${resolved.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': resolved.apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
                },
                body: JSON.stringify({
                    model: resolved.model,
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'Hi' }],
                }),
                signal: AbortSignal.timeout(12000),
            });
        } else {
            response = await fetch(`${resolved.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${resolved.apiKey}`,
                },
                body: JSON.stringify({
                    model: resolved.model,
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'Hi' }],
                }),
                signal: AbortSignal.timeout(12000),
            });
        }
        if (response.ok) return { ok: true, message: `连接成功（${resolved.resolvedProvider}）` };
        const err = await response.json().catch(() => ({}));
        return { ok: false, message: err.error?.message || `HTTP ${response.status}` };
    } catch (e: any) {
        if (e.name === 'TimeoutError' || e.name === 'AbortError') {
            return { ok: false, message: '连接超时，请检查 URL 是否正确' };
        }
        if (e instanceof TypeError) {
            return { ok: false, message: '网络连接失败，请检查 URL 和网络状态' };
        }
        return { ok: false, message: e.message || '连接失败' };
    }
}
