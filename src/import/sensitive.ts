/**
 * 敏感信息处理：请求头 / 查询参数 / 请求体字段里的凭据不落入流程定义，
 * 一律替换为 `${workflow.input.xxx}` 占位，并给出提示。
 */

import { camelName } from './util';

/** 固定视为敏感的请求头 */
const SENSITIVE_HEADER_RE = /^(authorization|cookie|set-cookie|proxy-authorization|x-api-key)$/i;
/**
 * 名称含这些词的头 / 参数 / 字段视为敏感（R14 补 access key、签名、订阅密钥、凭据、会话）。
 * `session` 只在名称以 session / session_id / session-token / session_key 结尾时命中，
 * 避免把 sessionTimeout、sessionCount 这类普通参数当成凭据。
 */
const SENSITIVE_NAME_RE = /token|secret|api[-_]?key|passw(or)?d|access[-_]?key|signature|subscription[-_]?key|credential|session(?:[-_]?(?:id|token|key))?$/i;

export function isSensitiveHeader(name: string): boolean {
    return SENSITIVE_HEADER_RE.test(name.trim()) || SENSITIVE_NAME_RE.test(name);
}

/** 查询参数 / 请求体字段名是否敏感 */
export function isSensitiveName(name: string): boolean {
    return SENSITIVE_NAME_RE.test(name);
}

/** 占位表达式：`${workflow.input.<camelName>}` */
export function inputPlaceholder(name: string): string {
    return '${workflow.input.' + camelName(name) + '}';
}

export function sensitiveHeaderWarning(name: string): string {
    return `请求头 ${name} 含敏感信息，已替换为 ${inputPlaceholder(name)}；请在流程入参中提供（值需包含完整头内容，如 Bearer xxx），或改用凭据管理，不会写入流程定义`;
}

/**
 * 替换请求头中的敏感值。已是 `${...}` 表达式的值视为已处理，原样保留。
 * 返回新对象，不修改入参。
 */
export function sanitizeHeaders(headers: Record<string, string>): {
    headers: Record<string, string>;
    warnings: string[];
} {
    const out: Record<string, string> = {};
    const warnings: string[] = [];
    for (const [name, value] of Object.entries(headers)) {
        if (isSensitiveHeader(name) && !String(value).includes('${')) {
            out[name] = inputPlaceholder(name);
            warnings.push(sensitiveHeaderWarning(name));
        } else {
            out[name] = value;
        }
    }
    return { headers: out, warnings };
}
