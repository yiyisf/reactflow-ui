/**
 * AI Interaction Service (OpenAI Standard)
 */

export interface AIServiceConfig {
    apiKey: string;
    baseUrl: string;
    model: string;
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

const DEFAULT_CONFIG: AIServiceConfig = {
    apiKey: '', // To be provided by user
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o' // Default model
};

/**
 * 非流式调用（兼容旧逻辑）
 */
export const callAICopilot = async (
    messages: ChatMessage[],
    config: Partial<AIServiceConfig> = {},
    signal?: AbortSignal
) => {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };

    if (!finalConfig.apiKey) {
        throw new Error('Please configure AI API Key in settings.');
    }

    const response = await fetch(`${finalConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${finalConfig.apiKey}`
        },
        body: JSON.stringify({
            model: finalConfig.model,
            messages,
            temperature: 0.7,
            stream: false
        }),
        signal
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'AI request failed');
    }

    const data = await response.json();
    return data.choices[0].message.content;
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
) => {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };

    if (!finalConfig.apiKey) {
        throw new Error('Please configure AI API Key in settings.');
    }

    const response = await fetch(`${finalConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${finalConfig.apiKey}`
        },
        body: JSON.stringify({
            model: finalConfig.model,
            messages,
            temperature: 0.7,
            stream: true
        }),
        signal
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'AI request failed');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('ReadableStream not supported');

    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                    onDone?.();
                    return fullContent;
                }

                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        fullContent += content;
                        onToken(content);
                    }
                } catch {
                    console.warn('[AI SSE] malformed chunk:', data);
                }
            }
        }
    }

    onDone?.();
    return fullContent;
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
    return JSON.parse(cleaned);
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
