import type { WorkflowInputParam } from '../../types/conductor';

export interface CoercedRunInputs {
    input: Record<string, unknown>;
    /** 参数名 → 面向用户的错误说明（发生了什么 + 怎么填） */
    errors: Record<string, string>;
}

const TRUE_WORDS = new Set(['true', '1', 'yes', 'y', '是']);
const FALSE_WORDS = new Set(['false', '0', 'no', 'n', '否']);

/**
 * 把运行表单里的文本按声明类型转换成工作流输入（之前一律以字符串发送，数字 / 布尔 / JSON 参数全错）：
 * - number / boolean / object / array 按类型解析，解析不了就给出错误，不发送
 * - 未声明类型时，形如 JSON 对象或数组的文本按 JSON 解析，其余保持字符串
 * - 留空：有默认值用默认值；没有就不传该参数（必填参数给出错误）
 */
export function coerceRunInputs(params: WorkflowInputParam[], values: Record<string, string>): CoercedRunInputs {
    const input: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    for (const p of params) {
        const raw = (values[p.name] ?? '').trim();
        if (raw === '') {
            if (p.defaultValue !== undefined) input[p.name] = p.defaultValue;
            else if (p.required === true) errors[p.name] = `请填写「${p.name}」，它是必填参数`;
            continue;
        }
        switch (p.type) {
            case 'number': {
                const n = Number(raw);
                if (Number.isFinite(n)) input[p.name] = n;
                else errors[p.name] = `「${p.name}」需要数字，例如 10 或 3.5`;
                break;
            }
            case 'boolean': {
                const lower = raw.toLowerCase();
                if (TRUE_WORDS.has(lower)) input[p.name] = true;
                else if (FALSE_WORDS.has(lower)) input[p.name] = false;
                else errors[p.name] = `「${p.name}」需要 true 或 false`;
                break;
            }
            case 'object':
            case 'array': {
                try {
                    const parsed = JSON.parse(raw);
                    const ok = p.type === 'array' ? Array.isArray(parsed) : (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed));
                    if (ok) input[p.name] = parsed;
                    else errors[p.name] = p.type === 'array' ? `「${p.name}」需要 JSON 数组，例如 ["a", "b"]` : `「${p.name}」需要 JSON 对象，例如 {"key": "value"}`;
                } catch {
                    errors[p.name] = p.type === 'array' ? `「${p.name}」不是有效的 JSON 数组，例如 ["a", "b"]` : `「${p.name}」不是有效的 JSON 对象，例如 {"key": "value"}`;
                }
                break;
            }
            case 'string':
                input[p.name] = values[p.name];
                break;
            default: {
                if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
                    try {
                        input[p.name] = JSON.parse(raw);
                        break;
                    } catch {
                        // not JSON after all — send the text as typed
                    }
                }
                input[p.name] = values[p.name];
            }
        }
    }
    return { input, errors };
}
