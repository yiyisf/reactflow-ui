/** 输入格式识别与统一入口（纯函数，不抛异常）。 */

import type { DetectedFormat, ParseResult } from './types';
import { YAML_HINT } from './types';
import { isPlainObject, normalizeText } from './util';
import { parseOpenApi3, parseSwagger2 } from './openapi';
import { parsePostman21 } from './postman';
import { parseCurl } from './curl';

interface Analysis {
    format: DetectedFormat;
    doc?: unknown;
    /** JSON 语法错误等 */
    error?: string;
}

function looksLikeYaml(text: string): boolean {
    if (/^---\s*$/m.test(text.split('\n')[0] ?? '')) return true;
    if (/^\s*(openapi|swagger)\s*:/m.test(text)) return true;
    // 首行是 `key:` 或 `key: value`，且不是 JSON / curl
    return /^[A-Za-z_][\w-]*\s*:(\s|$)/.test(text);
}

function analyze(raw: string): Analysis {
    const text = normalizeText(raw);
    if (!text) return { format: 'unknown' };
    if (/^(\$\s+)?curl(\s|$)/i.test(text)) return { format: 'curl' };

    if (text.startsWith('{') || text.startsWith('[')) {
        let doc: unknown;
        try {
            doc = JSON.parse(text);
        } catch (e) {
            return { format: 'unknown', error: `JSON 格式不正确：${e instanceof Error ? e.message : String(e)}` };
        }
        if (isPlainObject(doc)) {
            if (typeof doc.openapi === 'string' && /^3\./.test(doc.openapi)) return { format: 'openapi3', doc };
            if (typeof doc.swagger === 'string' && /^2\./.test(doc.swagger)) return { format: 'swagger2', doc };
            const schema = isPlainObject(doc.info) ? String(doc.info.schema ?? '') : '';
            if (Array.isArray(doc.item) && isPlainObject(doc.info) && (/collection\/v2/.test(schema) || doc.info._postman_id)) {
                return { format: 'postman21', doc };
            }
        }
        return { format: 'unknown', doc };
    }

    if (looksLikeYaml(text)) return { format: 'yaml' };
    return { format: 'unknown' };
}

/** 识别输入文本的格式 */
export function detectFormat(text: string): DetectedFormat {
    return analyze(text).format;
}

const UNKNOWN_HINT = '无法识别的格式：支持 OpenAPI 3 / Swagger 2 / Postman Collection v2.1（JSON）和 curl 命令';

/**
 * 识别并解析：返回 ParseResult，永不抛异常。
 * YAML 不受支持，返回固定提示 {@link YAML_HINT}。
 */
export function parseApiText(text: string): ParseResult {
    try {
        const a = analyze(text);
        switch (a.format) {
            case 'openapi3':
                return parseOpenApi3(a.doc);
            case 'swagger2':
                return parseSwagger2(a.doc);
            case 'postman21':
                return parsePostman21(a.doc);
            case 'curl':
                return parseCurl(normalizeText(text));
            case 'yaml':
                return { ok: false, format: 'yaml', error: YAML_HINT };
            default:
                return { ok: false, format: 'unknown', error: a.error ?? (normalizeText(text) ? UNKNOWN_HINT : '请粘贴接口文档或 curl 命令') };
        }
    } catch (e) {
        return { ok: false, error: `解析失败：${e instanceof Error ? e.message : String(e)}` };
    }
}
