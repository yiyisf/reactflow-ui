/** 各格式解析器共用的收尾逻辑（纯函数）。 */

import type { ImportedOperation } from './types';
import type { ImportedParam } from './types';
import { inputPlaceholder, isSensitiveName, sanitizeHeaders } from './sensitive';
import { inferSchema, isPlainObject, safeDecode } from './util';

/** 收尾：替换固定请求头里的敏感值，并把提示并入接口的 warnings */
export function finishOperation(op: ImportedOperation): ImportedOperation {
    const { headers, warnings } = sanitizeHeaders(op.headers);
    return {
        ...op,
        headers,
        warnings: Array.from(new Set([...op.warnings, ...warnings])),
    };
}

/** 接口的展示标识：`GET /tickets/{id}` */
export function operationLabel(op: Pick<ImportedOperation, 'method' | 'path'>): string {
    return `${op.method} ${op.path}`;
}

/** 汇总所有接口的提示（带接口前缀，去重） */
export function collectWarnings(ops: ImportedOperation[], extra: string[] = []): string[] {
    const out: string[] = [...extra];
    const seen = new Set(out);
    for (const op of ops) {
        for (const w of op.warnings) {
            const line = `${operationLabel(op)}：${w}`;
            if (!seen.has(line)) {
                seen.add(line);
                out.push(line);
            }
        }
    }
    return out;
}

/**
 * 把 JSON 示例的顶层属性作为默认值写入 schema；敏感字段（任意层级，R7）的默认值换成占位。
 * 嵌套字段的占位名取路径（`credentials.password` → `${workflow.input.credentialsPassword}`）；
 * 敏感名下面的所有标量值都视为敏感（如 `credentials: { user, pass }`）。
 */
export function schemaWithDefaults(example: unknown, warnings: string[]): Record<string, any> {
    const schema = inferSchema(example);
    if (isPlainObject(example) && schema.properties) {
        for (const [k, v] of Object.entries(example)) {
            schema.properties[k].default = redactSensitive(v, [k], isSensitiveName(k), warnings);
        }
    }
    return schema;
}

/** 递归替换敏感值；返回新值，不修改入参 */
export function redactSensitive(value: unknown, path: string[], underSensitive: boolean, warnings: string[]): unknown {
    const name = path[path.length - 1] ?? '';
    const sensitive = underSensitive || isSensitiveName(name);
    if (Array.isArray(value)) {
        return value.map((item, i) => redactSensitive(item, [...path, String(i)], sensitive, warnings));
    }
    if (isPlainObject(value)) {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) out[k] = redactSensitive(v, [...path, k], sensitive, warnings);
        return out;
    }
    if (sensitive && (typeof value === 'string' || typeof value === 'number') && !String(value).includes('${')) {
        const placeholderName = path.filter((p) => !/^\d+$/.test(p)).join('_');
        const placeholder = inputPlaceholder(placeholderName);
        warnings.push(`请求体字段 ${path.join('.')} 疑似敏感信息，默认值已替换为 ${placeholder}`);
        return placeholder;
    }
    return value;
}

/** 把查询串解析为 query 参数（字面量作为默认值；敏感参数名的值替换为占位） */
export function queryParamsFromString(query: string, warnings: string[]): ImportedParam[] {
    const out: ImportedParam[] = [];
    if (!query) return out;
    for (const pair of query.split('&')) {
        if (!pair) continue;
        const eq = pair.indexOf('=');
        const name = safeDecode(eq >= 0 ? pair.slice(0, eq) : pair);
        const value = eq >= 0 ? safeDecode(pair.slice(eq + 1)) : '';
        if (!name) continue;
        let defaultValue = value;
        if (isSensitiveName(name) && !value.includes('${')) {
            defaultValue = inputPlaceholder(name);
            warnings.push(`查询参数 ${name} 疑似敏感信息，默认值已替换为 ${defaultValue}，请在流程入参中提供`);
        }
        out.push({ name, in: 'query', required: false, schema: { type: 'string' }, defaultValue: defaultValue || undefined });
    }
    return out;
}

/** Content-Type / Accept 由 body.contentType 与 accept 统一输出，不再作为固定头 */
export function dropContentHeaders(headers: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
        if (!/^(content-type|accept)$/i.test(k)) out[k] = v;
    }
    return out;
}


/** 不区分大小写取请求头的值 */
export function findHeader(headers: Record<string, string>, name: string): string | undefined {
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : headers[key];
}
