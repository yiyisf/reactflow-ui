/**
 * Error Messages — 面向业务用户的两段式错误文案（M1.5）
 *
 * 原始错误（HTTP 状态码、provider 报错原文、网络异常类名等）对不熟悉 Conductor/LLM
 * 的业务用户没有意义，且直接把它们塞进聊天气泡会让人不知道发生了什么、更不知道怎么办。
 *
 * 这里把常见错误模式翻译成"发生了什么 + 你能做什么"的中文提示；原始文本只通过
 * `onAiEvent({ type: 'ai:error', rawMessage })` 提供给审计/日志，绝不进入聊天 UI。
 */

export interface HumanizedError {
    /** 展示给用户的两段式文案（发生了什么 + 能做什么） */
    display: string;
    /** 原始错误文本，仅用于审计事件，不展示给用户 */
    raw: string;
}

export function humanizeAiError(rawMessage: string | undefined | null): HumanizedError {
    const raw = rawMessage || '未知错误';
    const lower = raw.toLowerCase();

    if (/\b401\b/.test(raw) || lower.includes('unauthorized') || lower.includes('invalid api key') || lower.includes('incorrect api key')) {
        return { display: 'AI 服务未授权，请联系管理员检查 API Key 配置。', raw };
    }
    if (/\b403\b/.test(raw) || lower.includes('forbidden')) {
        return { display: 'AI 服务拒绝了此次请求，请联系管理员检查权限配置。', raw };
    }
    if (/\b429\b/.test(raw) || lower.includes('rate limit') || lower.includes('too many requests')) {
        return { display: '请求过于频繁，请稍等片刻后重试。', raw };
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
        return { display: '连接超时，请检查网络后重试。', raw };
    }
    if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network error') || lower.includes('无法连接')) {
        return { display: '无法连接 AI 服务，请检查网络连接后重试。', raw };
    }
    if (/\b5\d{2}\b/.test(raw) || lower.includes('internal server error') || lower.includes('bad gateway') || lower.includes('service unavailable')) {
        return { display: 'AI 服务暂时不可用，请稍后重试。', raw };
    }
    return { display: 'AI 服务出现异常，请重试；如持续出现请联系管理员。', raw };
}
