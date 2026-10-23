/** 接口导入内部的小工具（纯函数）。 */

import type { JsonSchema } from './types';

export const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const;

export function isPlainObject(v: unknown): v is Record<string, any> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 去 BOM、首尾空白 */
export function normalizeText(text: string): string {
    return String(text ?? '').replace(/^﻿/, '').trim();
}

/** 把任意名称转为 snake_case 片段（只保留字母数字） */
export function slugify(raw: string, maxLen = 48): string {
    const s = raw
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
    return (s || 'api').slice(0, maxLen).replace(/_+$/g, '') || 'api';
}

/** 把名称转为 camelCase（用于 `${workflow.input.xxx}`） */
export function camelName(raw: string): string {
    const parts = raw.split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (parts.length === 0) return 'value';
    const joined = parts
        .map((seg, i) => {
            // 全大写片段（X_API_KEY）先转小写；混合大小写（accessToken）保持原样
            const p = seg === seg.toUpperCase() ? seg.toLowerCase() : seg;
            return i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1);
        })
        .join('');
    return /^[0-9]/.test(joined) ? `v${joined}` : joined;
}

/** 在已有 id 集合内取唯一 id（冲突时追加 _2、_3…），并登记到集合 */
export function uniqueId(base: string, used: Set<string>): string {
    let id = base;
    let n = 2;
    while (used.has(id)) {
        id = `${base}_${n}`;
        n += 1;
    }
    used.add(id);
    return id;
}

/** 由一个 JSON 示例值推断简单 schema（不含 default） */
export function inferSchema(value: unknown, depth = 0): JsonSchema {
    if (value === null || value === undefined) return { type: 'string' };
    if (Array.isArray(value)) {
        return depth >= 4 || value.length === 0
            ? { type: 'array' }
            : { type: 'array', items: inferSchema(value[0], depth + 1) };
    }
    switch (typeof value) {
        case 'number':
            return { type: Number.isInteger(value) ? 'integer' : 'number' };
        case 'boolean':
            return { type: 'boolean' };
        case 'object': {
            if (depth >= 4) return { type: 'object' };
            const properties: Record<string, JsonSchema> = {};
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
                properties[k] = inferSchema(v, depth + 1);
            }
            return { type: 'object', properties };
        }
        default:
            return { type: 'string' };
    }
}

/** 取 schema 的主类型（忽略 null） */
export function schemaType(schema: JsonSchema | undefined): string {
    if (!schema) return 'string';
    const t = Array.isArray(schema.type) ? schema.type.find((x: string) => x !== 'null') : schema.type;
    if (t) return t;
    if (schema.properties) return 'object';
    if (schema.items) return 'array';
    return 'string';
}

/** 简单的 URL 拆分：baseUrl（协议+主机 或 `${...}` 变量）、路径、查询串 */
export function splitUrl(raw: string): { baseUrl: string; path: string; query: string } {
    let rest = raw.trim();
    const hashAt = rest.indexOf('#');
    if (hashAt >= 0) rest = rest.slice(0, hashAt);
    let query = '';
    const qAt = rest.indexOf('?');
    if (qAt >= 0) {
        query = rest.slice(qAt + 1);
        rest = rest.slice(0, qAt);
    }
    let baseUrl = '';
    const m = /^([a-z][a-z0-9+.-]*:\/\/[^/]*)/i.exec(rest) || /^(\$\{[^}]*\})/.exec(rest);
    if (m) {
        baseUrl = m[1];
        rest = rest.slice(m[1].length);
    }
    return { baseUrl, path: rest || '/', query };
}

export function safeDecode(s: string): string {
    try {
        return decodeURIComponent(s.replace(/\+/g, ' '));
    } catch {
        return s;
    }
}
