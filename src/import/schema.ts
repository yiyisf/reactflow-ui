/**
 * JSON Schema 本地 `$ref` 解析（OpenAPI 3 `#/components/schemas/...`、Swagger 2 `#/definitions/...`）。
 * 防循环引用，最大展开深度 6；不处理远程引用。
 */

import type { JsonSchema } from './types';
import { isPlainObject, schemaType } from './util';

export const MAX_SCHEMA_DEPTH = 6;

/** 按 JSON Pointer（`#/a/b`）取值，找不到返回 undefined */
export function resolvePointer(root: unknown, ref: string): unknown {
    if (!ref.startsWith('#/')) return undefined;
    let cur: any = root;
    for (const raw of ref.slice(2).split('/')) {
        const seg = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
        if (cur === null || typeof cur !== 'object') return undefined;
        cur = cur[seg];
    }
    return cur;
}

/** 解开非 schema 对象（parameter / requestBody / response）上的 `$ref`，最多跳 10 次 */
export function derefObject<T = any>(node: unknown, root: unknown): T | undefined {
    let cur: any = node;
    for (let i = 0; i < 10; i++) {
        if (isPlainObject(cur) && typeof cur.$ref === 'string') {
            cur = resolvePointer(root, cur.$ref);
        } else {
            break;
        }
    }
    return isPlainObject(cur) && typeof cur.$ref !== 'string' ? (cur as T) : undefined;
}

const SCALAR_KEYS = [
    'type', 'title', 'description', 'enum', 'default', 'format', 'example', 'examples',
    'maxLength', 'minLength', 'minimum', 'maximum', 'pattern', 'nullable',
];

/**
 * 解析 schema：展开本地 `$ref` 与 allOf，oneOf / anyOf 取第一个分支。
 * 超过深度上限的节点只保留类型；循环引用处截断为 `{ type: 'object' }` 并在 warnings 中提示一次。
 */
export function resolveSchema(
    schema: unknown,
    root: unknown,
    warnings: string[] = [],
    maxDepth: number = MAX_SCHEMA_DEPTH,
): JsonSchema {
    let cycleWarned = false;

    const walk = (node: unknown, depth: number, stack: string[]): JsonSchema => {
        if (!isPlainObject(node)) return {};

        if (typeof node.$ref === 'string') {
            const ref = node.$ref;
            const name = ref.split('/').pop() || ref;
            if (stack.includes(ref)) {
                if (!cycleWarned) {
                    cycleWarned = true;
                    warnings.push(`存在循环引用（${name}），循环处已截断`);
                }
                return { type: 'object', description: `循环引用：${name}` };
            }
            const target = resolvePointer(root, ref);
            if (target === undefined) {
                warnings.push(`无法解析引用 ${ref}，已忽略`);
                return {};
            }
            return walk(target, depth, [...stack, ref]);
        }

        if (depth > maxDepth) {
            return { type: schemaType(node), ...(typeof node.description === 'string' ? { description: node.description } : {}) };
        }

        const out: JsonSchema = {};
        for (const k of SCALAR_KEYS) {
            if (node[k] !== undefined) out[k] = node[k];
        }

        // allOf：合并各子 schema；oneOf / anyOf：取第一个非 null 分支
        const merged: unknown[] = [];
        if (Array.isArray(node.allOf)) merged.push(...node.allOf);
        for (const key of ['oneOf', 'anyOf'] as const) {
            const alts = node[key];
            if (Array.isArray(alts) && alts.length > 0) {
                const first = alts.find((a) => !(isPlainObject(a) && a.type === 'null')) ?? alts[0];
                merged.push(first);
            }
        }
        let properties: Record<string, JsonSchema> | undefined;
        let required: string[] = Array.isArray(node.required) ? [...node.required] : [];
        for (const sub of merged) {
            const r = walk(sub, depth, stack);
            for (const k of SCALAR_KEYS) {
                if (out[k] === undefined && r[k] !== undefined) out[k] = r[k];
            }
            if (r.properties) properties = { ...(properties || {}), ...r.properties };
            if (Array.isArray(r.required)) required = required.concat(r.required);
            if (r.items && !out.items) out.items = r.items;
        }

        if (isPlainObject(node.properties)) {
            properties = { ...(properties || {}) };
            for (const [k, v] of Object.entries(node.properties)) {
                properties[k] = walk(v, depth + 1, stack);
            }
        }
        if (properties) {
            out.properties = properties;
            if (!out.type) out.type = 'object';
        }
        if (required.length > 0) out.required = Array.from(new Set(required));
        if (node.items !== undefined) out.items = walk(node.items, depth + 1, stack);
        return out;
    };

    return walk(schema, 0, []);
}
