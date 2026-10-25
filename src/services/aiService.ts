/**
 * AI Interaction Service (OpenAI Standard)
 *
 * @deprecated 这是 WorkflowIDE 内置 AI Copilot 的遗留实现（仅 OpenAI 协议、文本解析 diff）。
 * 新代码请使用 `AiConfig` + `services/ai/protocolAdapter`（双协议、原生 tool-call、
 * 传输层反转）。两套实现将在后续版本收敛为一套，详见 `docs/design/` 下的架构规划。
 */

import type { AiConfig, Message } from './ai/protocolAdapter';
import { streamChat } from './ai/protocolAdapter';
import { humanizeAiError } from './ai/errorMessages';

/** @deprecated 使用 `AiConfig`（从 `services/ai/protocolAdapter` 或 `/ai` 入口导入）代替。保留为类型别名以避免破坏现有集成代码。 */
export type AIServiceConfig = AiConfig;

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/** 未配置 AI 服务时抛出的错误文案（调用方直接展示给用户） */
export const AI_NOT_CONFIGURED_MESSAGE = '未配置 AI 服务。请先填写 API Key（集成方通过 aiConfig 传入，或在 AI 设置中填写）后重试。';

/** 是否已配置可用的 AI 服务：direct 模式需要 apiKey，endpoint / custom 传输不需要 */
export function isAiConfigured(config: Partial<AIServiceConfig> | null | undefined): boolean {
    return !!(config?.transport || config?.apiKey?.trim());
}

/**
 * 统一走 protocolAdapter：按配置的 provider（OpenAI / Anthropic / 自动识别）或 transport
 * （endpoint 代理 / custom）发送，不再固定请求 api.openai.com。
 * 出错时抛出的 Error.message 已是面向用户的中文说明（发生了什么 + 怎么处理）。
 */
async function runText(
    messages: ChatMessage[],
    config: Partial<AIServiceConfig>,
    onToken?: (token: string) => void,
    signal?: AbortSignal,
): Promise<string> {
    if (!isAiConfigured(config)) {
        throw new Error(AI_NOT_CONFIGURED_MESSAGE);
    }
    const full: AiConfig = { provider: 'auto', ...config, apiKey: config.apiKey ?? '' };
    const mode = full.transport?.type ?? 'direct';
    let text = '';
    for await (const event of streamChat(messages as Message[], [], full, signal)) {
        if (event.type === 'text') {
            text += event.content;
            onToken?.(event.content);
        } else if (event.type === 'error') {
            const err = new Error(humanizeAiError(event.message, { mode }).display);
            (err as Error & { raw?: string }).raw = event.message;
            throw err;
        }
    }
    return text;
}

/**
 * 非流式调用（兼容旧逻辑）
 */
export const callAICopilot = async (
    messages: ChatMessage[],
    config: Partial<AIServiceConfig> = {},
    signal?: AbortSignal
): Promise<string> => {
    try {
        return await runText(messages, config, undefined, signal);
    } catch (e: any) {
        if (e?.name === 'AbortError' || e?.message === AI_NOT_CONFIGURED_MESSAGE || e?.raw) throw e;
        throw new Error(humanizeAiError(e?.message, { mode: config.transport?.type ?? 'direct' }).display);
    }
};

/**
 * 流式调用 - 通过 onToken 回调逐 token 返回内容
 */
export const callAICopilotStream = async (
    messages: ChatMessage[],
    config: Partial<AIServiceConfig> = {},
    onToken: (token: string) => void,
    onDone?: () => void,
    signal?: AbortSignal
): Promise<string> => {
    try {
        const text = await runText(messages, config, onToken, signal);
        onDone?.();
        return text;
    } catch (e: any) {
        if (e?.name === 'AbortError' || e?.message === AI_NOT_CONFIGURED_MESSAGE || e?.raw) throw e;
        throw new Error(humanizeAiError(e?.message, { mode: config.transport?.type ?? 'direct' }).display);
    }
};

/**
 * 生成任务 inputParameters 的 AI prompt（P4.1）
 */
export const generateTaskParametersPrompt = (
    taskType: string,
    taskRef: string,
    workflowInputParams: string[],
    upstreamTasks: Array<{ ref: string; type: string; name: string }>,
    currentParams: Record<string, any>
): string => `
You are a Netflix Conductor expert. Generate a complete "inputParameters" JSON object for the following task.

Task Type: ${taskType}
Task Reference Name: ${taskRef}
Current inputParameters (may be incomplete): ${JSON.stringify(currentParams, null, 2)}

Available workflow input parameters (accessible via \${workflow.input.XXX}):
${workflowInputParams.length > 0 ? workflowInputParams.map(p => `  - ${p}`).join('\n') : '  (none defined)'}

Upstream tasks (accessible via \${taskRef.output.XXX}):
${upstreamTasks.length > 0 ? upstreamTasks.map(t => `  - ${t.ref} (type: ${t.type})`).join('\n') : '  (no upstream tasks)'}

Rules:
1. Use JSONPath expressions like \${workflow.input.fieldName} or \${taskRef.output.result} for dynamic values.
2. For HTTP tasks, include uri, method, headers (Content-Type), and body if applicable.
3. For SIMPLE tasks, map likely upstream outputs to input fields.
4. For INLINE tasks, provide a meaningful expression or scriptExpression.
5. Keep the result focused — only include parameters that make sense for this task type.
6. Return ONLY the JSON object (no explanation, no markdown code block).

Return format: { "paramKey": "paramValue", ... }
`;

/**
 * System Prompt for execution analysis / fault diagnosis（P4.3）
 */
export const EXECUTION_ANALYSIS_SYSTEM_PROMPT = `
You are a Netflix Conductor workflow debugging expert.
When given a failed workflow execution, you analyze the task inputs, outputs, and errors to diagnose root causes.

Focus on:
1. JSONPath expressions that failed to resolve (NullPointerException, PathNotFoundException)
2. Wrong or missing parameter fields for the task type
3. Type mismatches between upstream output and task input
4. Timeout and retry configuration issues
5. HTTP error codes and what they imply about the request parameters

Always respond in Chinese. Be concise and actionable.
If you suggest a fix, describe specifically which task and which parameter field to change.
`;

/**
 * AI 自动生成任务 inputParameters（P4.1）
 */
export const generateTaskParameters = async (
    taskType: string,
    taskRef: string,
    workflowInputParams: string[],
    upstreamTasks: Array<{ ref: string; type: string; name: string }>,
    currentParams: Record<string, any>,
    config: Partial<AIServiceConfig> = {}
): Promise<Record<string, any>> => {
    const prompt = generateTaskParametersPrompt(taskType, taskRef, workflowInputParams, upstreamTasks, currentParams);
    const response = await callAICopilot(
        [
            { role: 'system', content: 'You are a Conductor expert. Return only valid JSON objects, no markdown.' },
            { role: 'user', content: prompt }
        ],
        config
    );

    // Strip potential markdown code blocks
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        throw new Error('AI 返回的内容不是有效的 JSON 参数。请重试，或在 AI 设置中换用更强的模型。');
    }
};

/**
 * System Prompt for Conductor Workflow Modeling
 */
export const CONDUCTOR_SYSTEM_PROMPT = `
You are an expert in Netflix Conductor Workflow modeling.
Your goal is to help users design JSON-based workflows.

CONSTRANTS:
1. Always output valid Conductor JSON within blocks if suggesting changes.
2. Use standard task types: SIMPLE, FORK_JOIN, SWITCH, DO_WHILE, SUB_WORKFLOW, EVENT, WAIT, TERMINATE.
3. Every task must have a unique 'taskReferenceName'.
4. For SWITCH/DECISION, ensure 'decisionCases' and 'defaultCase' are properly structured.
5. For FORK_JOIN, ensure a corresponding JOIN task follows.

Provide clear, enterprise-grade logic with proper error handling paths.
`;
