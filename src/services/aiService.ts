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

export const callAICopilot = async (
    messages: ChatMessage[],
    config: Partial<AIServiceConfig> = {}
) => {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };

    if (!finalConfig.apiKey) {
        throw new Error('Please configure AI API Key in settings.');
    }

    try {
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
                stream: false // Simplified for prototype, but implementation plan mentioned SSE
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'AI request failed');
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (err: any) {
        console.error('AI Service Error:', err);
        throw err;
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
