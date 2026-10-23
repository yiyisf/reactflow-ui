/**
 * Postman Collection v2.1（JSON 文档对象）→ ImportedOperation[]。
 * Postman 变量 `{{var}}` 转为 `${workflow.input.var}`；认证配置只生成占位，不读取凭据值。
 */

import type { ImportedBody, ImportedOperation, ImportedParam, ParseResult } from './types';
import { collectWarnings, dropContentHeaders, finishOperation, queryParamsFromString, schemaWithDefaults } from './common';
import { inputPlaceholder } from './sensitive';
import { inferSchema, isPlainObject, slugify, splitUrl, uniqueId } from './util';

/** `{{var}}` → `${workflow.input.var}`；记录用到的变量名 */
export function convertPostmanVars(text: string, used?: Set<string>): string {
    return text.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (_w, name: string) => {
        const key = name.replace(/[^\w]/g, '_');
        used?.add(key);
        return '${workflow.input.' + key + '}';
    });
}

interface WalkCtx {
    used: Set<string>;
    vars: Set<string>;
    ops: ImportedOperation[];
}

type Auth = Record<string, any> | undefined;

function composeRawUrl(url: Record<string, any>): string {
    if (typeof url.raw === 'string' && url.raw) return url.raw;
    const host = Array.isArray(url.host) ? url.host.join('.') : typeof url.host === 'string' ? url.host : '';
    const path = Array.isArray(url.path) ? url.path.join('/') : typeof url.path === 'string' ? url.path : '';
    const proto = typeof url.protocol === 'string' && url.protocol ? `${url.protocol}://` : '';
    const port = url.port ? `:${url.port}` : '';
    const query = Array.isArray(url.query)
        ? url.query
              .filter((q: any) => isPlainObject(q) && !q.disabled && q.key)
              .map((q: any) => `${q.key}=${q.value ?? ''}`)
              .join('&')
        : '';
    return `${proto}${host}${port}/${path}${query ? `?${query}` : ''}`;
}

function describe(d: unknown): string | undefined {
    if (typeof d === 'string') return d;
    if (isPlainObject(d) && typeof d.content === 'string') return d.content;
    return undefined;
}

/** 认证配置 → 需要的头（只生成占位，不读取值）与查询参数 */
function applyAuth(auth: Auth, headers: Record<string, string>, params: ImportedParam[], warnings: string[]): void {
    if (!auth || typeof auth.type !== 'string' || auth.type === 'noauth') return;
    if (auth.type === 'apikey') {
        const entries: any[] = Array.isArray(auth.apikey) ? auth.apikey : [];
        const keyName = String(entries.find((e) => e?.key === 'key')?.value || 'X-Api-Key');
        const where = String(entries.find((e) => e?.key === 'in')?.value || 'header');
        if (where === 'query') {
            if (!params.some((p) => p.in === 'query' && p.name === keyName)) {
                params.push({ name: keyName, in: 'query', required: true, schema: { type: 'string' }, defaultValue: inputPlaceholder(keyName) });
            }
            warnings.push(`查询参数 ${keyName} 是认证密钥，已默认取自 ${inputPlaceholder(keyName)}，请在流程入参中提供`);
        } else {
            headers[keyName] = '';
        }
    } else if (['bearer', 'basic', 'oauth2', 'digest', 'hawk', 'awsv4', 'ntlm', 'oauth1'].includes(auth.type)) {
        headers.Authorization = '';
    }
}

function walkItems(
    items: unknown,
    ctx: WalkCtx,
    tags: string[],
    inheritedAuth: Auth,
): void {
    if (!Array.isArray(items)) return;
    for (const item of items) {
        if (!isPlainObject(item)) continue;
        const auth: Auth = isPlainObject(item.auth) ? item.auth : inheritedAuth;
        if (Array.isArray(item.item)) {
            const folder = typeof item.name === 'string' && item.name ? [...tags, item.name] : tags;
            walkItems(item.item, ctx, folder, auth);
            continue;
        }
        const req = item.request;
        if (!isPlainObject(req) && typeof req !== 'string') continue;
        const op = buildOperation(item, isPlainObject(req) ? req : { method: 'GET', url: req }, ctx, tags, auth);
        if (op) ctx.ops.push(op);
    }
}

function buildOperation(
    item: Record<string, any>,
    req: Record<string, any>,
    ctx: WalkCtx,
    tags: string[],
    auth: Auth,
): ImportedOperation | undefined {
    const warnings: string[] = [];
    const rawUrl = typeof req.url === 'string' ? req.url : isPlainObject(req.url) ? composeRawUrl(req.url) : '';
    if (!rawUrl) return undefined;

    const { baseUrl, path: rawPath, query } = splitUrl(convertPostmanVars(rawUrl, ctx.vars));
    // `:id` 路径变量 → `{id}`
    const path = rawPath.replace(/\/:([A-Za-z_]\w*)/g, '/{$1}');
    const params: ImportedParam[] = [];
    const pathVars: Record<string, string> = {};
    if (isPlainObject(req.url) && Array.isArray(req.url.variable)) {
        for (const v of req.url.variable) {
            if (isPlainObject(v) && typeof v.key === 'string' && typeof v.value === 'string' && v.value) {
                pathVars[v.key] = convertPostmanVars(v.value, ctx.vars);
            }
        }
    }
    for (const m of path.matchAll(/\{([^}/]+)\}/g)) {
        params.push({
            name: m[1],
            in: 'path',
            required: true,
            schema: { type: 'string' },
            defaultValue: pathVars[m[1]],
        });
    }
    params.push(...queryParamsFromString(query, warnings));

    // ── 请求头 ──
    const headers: Record<string, string> = {};
    if (Array.isArray(req.header)) {
        for (const h of req.header) {
            if (isPlainObject(h) && !h.disabled && typeof h.key === 'string' && h.key) {
                headers[h.key] = convertPostmanVars(String(h.value ?? ''), ctx.vars);
            }
        }
    }
    applyAuth(isPlainObject(req.auth) ? req.auth : auth, headers, params, warnings);

    // ── 请求体 ──
    let body: ImportedBody | undefined;
    const rb = req.body;
    if (isPlainObject(rb) && typeof rb.mode === 'string') {
        if (rb.mode === 'raw') {
            const text = convertPostmanVars(String(rb.raw ?? ''), ctx.vars);
            const lang = isPlainObject(rb.options) && isPlainObject(rb.options.raw) ? String(rb.options.raw.language || '') : '';
            const ctHeader = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
            const looksJson = lang === 'json' || (ctHeader && /json/i.test(headers[ctHeader])) || /^[[{]/.test(text.trim());
            if (text.trim()) {
                let parsed: unknown;
                let ok = false;
                if (looksJson) {
                    try {
                        parsed = JSON.parse(text);
                        ok = true;
                    } catch {
                        ok = false;
                    }
                }
                if (ok) {
                    body = { contentType: 'application/json', schema: schemaWithDefaults(parsed, warnings) };
                } else {
                    body = {
                        contentType: ctHeader ? headers[ctHeader] : 'text/plain',
                        schema: { type: 'string', default: text },
                    };
                    if (looksJson) warnings.push('请求体不是合法 JSON（可能含未加引号的变量），已作为文本整体导入');
                }
            }
        } else if (rb.mode !== 'none') {
            warnings.push(`请求体类型 ${rb.mode} 暂不支持，已忽略（仅支持 JSON / 文本）`);
        }
    }

    // ── 示例响应 → 出参 schema ──
    let responseSchema: Record<string, any> | undefined;
    if (Array.isArray(item.response)) {
        for (const r of item.response) {
            if (!isPlainObject(r) || typeof r.body !== 'string') continue;
            const code = Number(r.code);
            if (!(code >= 200 && code < 300)) continue;
            try {
                const parsed = JSON.parse(convertPostmanVars(r.body, ctx.vars));
                if (parsed !== null && typeof parsed === 'object') {
                    responseSchema = inferSchema(parsed);
                    break;
                }
            } catch {
                /* 示例响应不是 JSON，忽略 */
            }
        }
    }

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const method = String(req.method || 'GET').toUpperCase();
    const id = uniqueId(`${method.toLowerCase()}_${slugify(path.replace(/[{}]/g, ''))}`, ctx.used);

    return finishOperation({
        id,
        method,
        baseUrl,
        path,
        summary: name || undefined,
        description: describe(req.description),
        tags: [...tags],
        params,
        headers: dropContentHeaders(headers),
        body,
        responseSchema,
        warnings,
    });
}

/** 解析 Postman Collection v2.1 文档对象 */
export function parsePostman21(doc: unknown): ParseResult {
    if (!isPlainObject(doc) || !Array.isArray(doc.item)) {
        return { ok: false, format: 'postman21', error: 'Postman Collection 缺少 item 列表' };
    }
    try {
        const ctx: WalkCtx = { used: new Set(), vars: new Set(), ops: [] };
        const extra: string[] = [];
        walkItems(doc.item, ctx, [], isPlainObject(doc.auth) ? doc.auth : undefined);
        if (ctx.ops.length === 0) return { ok: false, format: 'postman21', error: 'Collection 中没有找到任何请求' };
        if (ctx.vars.size > 0) {
            extra.push(`用到了 Postman 变量：${Array.from(ctx.vars).join('、')}，已转为 \${workflow.input.xxx}，请在流程入参中提供`);
        }
        return { ok: true, format: 'postman21', operations: ctx.ops, warnings: collectWarnings(ctx.ops, extra) };
    } catch (e) {
        return { ok: false, format: 'postman21', error: `Postman 解析失败：${e instanceof Error ? e.message : String(e)}` };
    }
}
