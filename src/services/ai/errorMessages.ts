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

/** 错误发生时使用的传输方式：决定"怎么修"该找谁（自己的 API Key，还是代理服务的管理员） */
export type AiTransportMode = 'direct' | 'endpoint' | 'custom';

export interface HumanizeOptions {
    /** 缺省视为 direct（浏览器直连模型服务商） */
    mode?: AiTransportMode;
}

/** 直连模式下浏览器 fetch 抛出 TypeError 时的标记前缀（protocolAdapter 产生） */
export const DIRECT_FETCH_FAILED = 'DIRECT_FETCH_FAILED';

export function humanizeAiError(rawMessage: string | undefined | null, options: HumanizeOptions = {}): HumanizedError {
    const raw = rawMessage || '未知错误';
    const lower = raw.toLowerCase();
    const mode = options.mode ?? 'direct';
    const direct = mode === 'direct';

    // ── 鉴权失败：OpenAI "Incorrect API key"、Anthropic "invalid x-api-key"、DeepSeek "Authentication Fails" ──
    if (
        /\b401\b/.test(raw) || lower.includes('unauthorized') || lower.includes('invalid api key') ||
        lower.includes('incorrect api key') || lower.includes('invalid x-api-key') || lower.includes('authentication fail') ||
        lower.includes('authentication_error') || lower.includes('invalid_api_key')
    ) {
        return {
            display: direct
                ? 'API Key 无效或已过期，AI 服务拒绝了请求。请在 AI 设置中检查 API Key 是否完整、是否属于当前服务商（Base URL），然后重试。'
                : 'AI 代理服务未通过鉴权。请联系管理员检查代理服务的登录状态或鉴权配置。',
            raw,
        };
    }

    // ── 余额 / 额度不足（OpenAI 的 insufficient_quota 也是 429，需在限流之前判断） ──
    if (
        /\b402\b/.test(raw) || lower.includes('insufficient balance') || lower.includes('insufficient_quota') ||
        lower.includes('exceeded your current quota') || lower.includes('credit balance is too low') || lower.includes('余额不足')
    ) {
        return {
            display: direct
                ? 'AI 服务账户余额或额度不足。请到服务商控制台充值或提高额度，或在 AI 设置中换一个可用的 API Key。'
                : 'AI 服务账户余额或额度不足。请联系管理员为代理服务使用的账户充值。',
            raw,
        };
    }

    // ── 模型不存在 / 无权使用 ──
    if (
        lower.includes('model_not_found') || /model .*(does not exist|not found)/.test(lower) ||
        /the model .* does not exist/.test(lower) || (lower.includes('not_found_error') && lower.includes('model')) ||
        /\bmodel:\s/.test(lower) || lower.includes('unknown model') || lower.includes('model not exist')
    ) {
        return {
            display: direct
                ? '找不到所配置的模型，或当前 API Key 无权使用它。请在 AI 设置中检查模型名称（留空则使用服务商默认模型）。'
                : '代理服务找不到所配置的模型。请联系管理员检查代理服务的模型配置。',
            raw,
        };
    }

    if (/\b404\b/.test(raw)) {
        return {
            display: direct
                ? 'AI 服务地址不存在（404）。请在 AI 设置中检查 Base URL 是否正确（OpenAI 兼容服务通常以 /v1 结尾）。'
                : 'AI 代理服务地址不存在（404）。请联系管理员检查 endpoint 配置。',
            raw,
        };
    }

    // ── 模型不支持 temperature 等采样参数（o 系列推理模型） ──
    if (lower.includes('temperature') && (lower.includes('unsupported') || lower.includes('not support') || lower.includes('does not support'))) {
        return {
            display: '当前模型不支持自定义 temperature 参数。请在 AI 设置中换用其他模型；如使用代理服务，请让管理员在代理中去掉该参数。',
            raw,
        };
    }

    if (/\b403\b/.test(raw) || lower.includes('forbidden') || lower.includes('permission_error')) {
        return {
            display: direct
                ? 'AI 服务拒绝了此次请求（没有权限）。请确认 API Key 有权访问该模型和地区，或在 AI 设置中更换 API Key。'
                : 'AI 代理服务拒绝了此次请求。请联系管理员检查你的使用权限。',
            raw,
        };
    }
    if (/\b429\b/.test(raw) || lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('rate_limit')) {
        return { display: '请求过于频繁，AI 服务暂时限流。请等待片刻后点击重试。', raw };
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
        return { display: '连接 AI 服务超时。请检查网络后重试。', raw };
    }

    // ── 直连模式下浏览器请求失败：网络不通，或服务不允许浏览器跨域直连（CORS） ──
    if (raw.startsWith(DIRECT_FETCH_FAILED)) {
        return {
            display: '浏览器无法连接到 AI 服务：可能是网络不通、Base URL 填写有误，或该服务不允许浏览器直接访问（跨域 CORS 限制）。' +
                '请检查 Base URL 与网络；若服务不支持浏览器直连，请改用集成方后端代理（transport: endpoint）。',
            raw,
        };
    }
    if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network error') || lower.includes('无法连接') || lower.includes('load failed')) {
        return {
            display: direct
                ? '无法连接 AI 服务：可能是网络不通，或该服务不允许浏览器直接访问（跨域 CORS 限制）。请检查网络和 Base URL 后重试。'
                : '无法连接 AI 代理服务。请检查网络后重试；如持续出现，请联系管理员确认代理服务地址。',
            raw,
        };
    }
    if (/\b5\d{2}\b/.test(raw) || lower.includes('internal server error') || lower.includes('bad gateway') || lower.includes('service unavailable') || lower.includes('overloaded')) {
        return { display: 'AI 服务暂时不可用。请稍后点击重试。', raw };
    }
    return { display: 'AI 服务返回了无法识别的错误。请点击重试；如持续出现，请联系管理员并提供错误时间。', raw };
}
