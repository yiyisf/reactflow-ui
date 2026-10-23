/**
 * OpenAPI 3.x / Swagger 2.0（JSON 文档对象）→ ImportedOperation[]。
 * 只做解析，不发请求；解析失败返回 { ok: false }，不抛异常。
 */

import type { ImportedBody, ImportedOperation, ImportedParam, JsonSchema, ParseResult } from './types';
import { collectWarnings, finishOperation } from './common';
import { derefObject, resolveSchema } from './schema';
import { inputPlaceholder, isSensitiveHeader } from './sensitive';
import { HTTP_METHODS, inferSchema, isPlainObject, slugify, uniqueId } from './util';

type Version = 2 | 3;

const SKIPPED_HEADER_PARAMS = /^(content-type|accept)$/i;

function isJsonMedia(type: string): boolean {
    return /json/i.test(type);
}

/** 解析 OpenAPI 3 的 servers[0].url（含 variables 默认值） */
function resolveServerUrl(servers: unknown, warnings: string[]): string {
    if (!Array.isArray(servers) || !isPlainObject(servers[0]) || typeof servers[0].url !== 'string') {
        warnings.push('文档未声明 servers，URL 仅含路径，请在步骤里补充完整服务地址');
        return '';
    }
    const server = servers[0];
    const vars = isPlainObject(server.variables) ? server.variables : {};
    const url = (server.url as string).replace(/\{([^}]+)\}/g, (whole, name: string) => {
        const v = vars[name];
        if (isPlainObject(v)) {
            if (v.default !== undefined) return String(v.default);
            if (Array.isArray(v.enum) && v.enum.length > 0) return String(v.enum[0]);
        }
        warnings.push(`服务地址变量 {${name}} 没有默认值，请手动替换`);
        return whole;
    });
    const trimmed = url.replace(/\/+$/, '');
    if (trimmed && !/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !trimmed.startsWith('${')) {
        warnings.push(`服务地址 ${trimmed} 是相对路径，请在步骤里补充完整地址`);
    }
    return trimmed;
}

/** Swagger 2：schemes[0] + host + basePath */
function resolveSwaggerBase(doc: Record<string, any>, warnings: string[]): string {
    const basePath = typeof doc.basePath === 'string' ? doc.basePath.replace(/\/+$/, '') : '';
    if (typeof doc.host !== 'string' || !doc.host) {
        warnings.push('文档未声明 host，URL 仅含路径，请在步骤里补充完整服务地址');
        return basePath;
    }
    const scheme = Array.isArray(doc.schemes) && typeof doc.schemes[0] === 'string' ? doc.schemes[0] : 'https';
    return `${scheme}://${doc.host}${basePath}`;
}

/** Swagger 2 的非 body 参数把类型直接写在参数上：抽出成 schema */
function swaggerParamSchema(p: Record<string, any>): JsonSchema {
    const s: JsonSchema = {};
    for (const k of ['type', 'format', 'enum', 'default', 'items', 'minimum', 'maximum', 'maxLength', 'pattern']) {
        if (p[k] !== undefined) s[k] = p[k];
    }
    if (!s.type) s.type = 'string';
    return s;
}

function pickJsonMedia(content: unknown): { type: string; media: Record<string, any> } | undefined {
    if (!isPlainObject(content)) return undefined;
    const keys = Object.keys(content);
    const key = keys.find((k) => k.toLowerCase() === 'application/json') ?? keys.find(isJsonMedia);
    return key && isPlainObject(content[key]) ? { type: key, media: content[key] } : undefined;
}

function schemaFromMedia(media: Record<string, any>, root: unknown, warnings: string[]): JsonSchema {
    let schema = resolveSchema(media.schema, root, warnings);
    if (Object.keys(schema).length === 0) {
        const example = media.example ?? (isPlainObject(media.examples) ? Object.values(media.examples).map((e) => (isPlainObject(e) ? e.value : undefined)).find((v) => v !== undefined) : undefined);
        if (example !== undefined) schema = inferSchema(example);
    }
    return schema;
}

/** 选取 2xx 响应的 JSON schema */
function pickResponseSchema(op: Record<string, any>, root: unknown, version: Version, warnings: string[]): JsonSchema | undefined {
    const responses = isPlainObject(op.responses) ? op.responses : {};
    const codes = Object.keys(responses);
    const exact = codes.filter((c) => /^2\d\d$/.test(c)).sort();
    const code = exact[0] ?? codes.find((c) => /^2xx$/i.test(c)) ?? (codes.includes('default') ? 'default' : undefined);
    if (!code) return undefined;
    const resp = derefObject<Record<string, any>>(responses[code], root);
    if (!resp) return undefined;
    let schema: JsonSchema | undefined;
    if (version === 3) {
        const picked = pickJsonMedia(resp.content);
        if (picked) schema = schemaFromMedia(picked.media, root, warnings);
    } else if (resp.schema !== undefined) {
        schema = resolveSchema(resp.schema, root, warnings);
    }
    return schema && Object.keys(schema).length > 0 ? schema : undefined;
}

interface SecurityResult {
    headers: Record<string, string>;
    queryParams: ImportedParam[];
}

/** 由 security 要求推断需要的认证头（只取第一组备选；不读取任何凭据值） */
function resolveSecurity(
    requirement: unknown,
    schemes: unknown,
    root: unknown,
    warnings: string[],
): SecurityResult {
    const out: SecurityResult = { headers: {}, queryParams: [] };
    if (!Array.isArray(requirement) || !isPlainObject(requirement[0]) || !isPlainObject(schemes)) return out;
    for (const name of Object.keys(requirement[0])) {
        const scheme = derefObject<Record<string, any>>(schemes[name], root);
        if (!scheme) continue;
        const type = String(scheme.type || '');
        if (type === 'apiKey') {
            const keyName = typeof scheme.name === 'string' ? scheme.name : 'X-Api-Key';
            if (scheme.in === 'header') {
                out.headers[keyName] = '';
            } else if (scheme.in === 'query') {
                out.queryParams.push({
                    name: keyName,
                    in: 'query',
                    required: true,
                    schema: { type: 'string' },
                    description: `认证参数（${name}）`,
                    defaultValue: inputPlaceholder(keyName),
                });
                warnings.push(`查询参数 ${keyName} 是认证密钥，已默认取自 ${inputPlaceholder(keyName)}，请在流程入参中提供`);
            } else {
                warnings.push(`认证方式 ${name}（${String(scheme.in)}）暂不支持，已忽略`);
            }
        } else if (type === 'http' || type === 'basic' || type === 'oauth2' || type === 'openIdConnect') {
            out.headers.Authorization = '';
        }
    }
    return out;
}

function buildOperations(doc: Record<string, any>, version: Version): ParseResult {
    const format = version === 3 ? 'openapi3' : 'swagger2';
    if (!isPlainObject(doc.paths)) {
        return { ok: false, format, error: '缺少 paths 字段，找不到接口定义' };
    }

    const globalWarnings: string[] = [];
    const swaggerBase = version === 2 ? resolveSwaggerBase(doc, globalWarnings) : '';
    const schemes = version === 3 ? doc.components?.securitySchemes : doc.securityDefinitions;
    const used = new Set<string>();
    const ops: ImportedOperation[] = [];
    // 同一个 servers 数组只解析一次提示，避免每个接口重复
    const serverCache = new Map<unknown, { url: string; warnings: string[] }>();

    for (const [path, rawItem] of Object.entries(doc.paths as Record<string, unknown>)) {
        const item = derefObject<Record<string, any>>(rawItem, doc);
        if (!item) continue;

        for (const method of HTTP_METHODS) {
            const node = item[method];
            if (!isPlainObject(node)) continue;
            const warnings: string[] = [];

            // ── 服务地址 ──
            let baseUrl: string;
            if (version === 3) {
                const servers = node.servers ?? item.servers ?? doc.servers;
                let cached = serverCache.get(servers);
                if (!cached) {
                    const w: string[] = [];
                    cached = { url: resolveServerUrl(servers, w), warnings: w };
                    serverCache.set(servers, cached);
                    globalWarnings.push(...w);
                }
                baseUrl = cached.url;
            } else {
                baseUrl = swaggerBase;
            }

            // ── 参数 ──
            const params: ImportedParam[] = [];
            const headers: Record<string, string> = {};
            const merged = new Map<string, Record<string, any>>();
            for (const raw of [...(Array.isArray(item.parameters) ? item.parameters : []), ...(Array.isArray(node.parameters) ? node.parameters : [])]) {
                const p = derefObject<Record<string, any>>(raw, doc);
                if (p && typeof p.name === 'string' && typeof p.in === 'string') merged.set(`${p.in}:${p.name}`, p);
            }
            let body: ImportedBody | undefined;
            for (const p of merged.values()) {
                const loc = p.in as string;
                if (loc === 'path' || loc === 'query' || loc === 'header') {
                    if (loc === 'header' && SKIPPED_HEADER_PARAMS.test(p.name)) continue;
                    if (loc === 'header' && isSensitiveHeader(p.name)) {
                        headers[p.name] = '';
                        continue;
                    }
                    const schema = resolveSchema(version === 3 ? p.schema ?? { type: 'string' } : swaggerParamSchema(p), doc, warnings);
                    if (schema.default === undefined && p.example !== undefined && version === 3) schema.default = p.example;
                    params.push({
                        name: p.name,
                        in: loc,
                        required: loc === 'path' ? true : p.required === true,
                        schema: Object.keys(schema).length > 0 ? schema : { type: 'string' },
                        description: typeof p.description === 'string' ? p.description : undefined,
                    });
                } else if (loc === 'body' && version === 2) {
                    const consumes: unknown = node.consumes ?? doc.consumes;
                    const ct = Array.isArray(consumes) && consumes.length > 0 ? String(consumes.find((c) => isJsonMedia(String(c))) ?? consumes[0]) : 'application/json';
                    if (isJsonMedia(ct)) {
                        body = { contentType: ct, schema: resolveSchema(p.schema, doc, warnings) };
                    } else {
                        warnings.push(`请求体类型 ${ct} 暂不支持，已忽略（仅支持 JSON）`);
                    }
                } else if (loc === 'formData') {
                    warnings.push('表单（formData）参数暂不支持，已忽略');
                } else if (loc === 'cookie') {
                    warnings.push(`Cookie 参数 ${p.name} 暂不支持，已忽略`);
                }
            }

            // ── OpenAPI 3 请求体 ──
            if (version === 3 && node.requestBody !== undefined) {
                const rb = derefObject<Record<string, any>>(node.requestBody, doc);
                const picked = rb ? pickJsonMedia(rb.content) : undefined;
                if (picked) {
                    body = { contentType: picked.type, schema: schemaFromMedia(picked.media, doc, warnings) };
                } else if (rb && isPlainObject(rb.content) && Object.keys(rb.content).length > 0) {
                    warnings.push(`请求体类型 ${Object.keys(rb.content)[0]} 暂不支持，已忽略（仅支持 JSON）`);
                }
            }

            // ── 认证 ──
            const sec = resolveSecurity(node.security ?? doc.security, schemes, doc, warnings);
            for (const h of Object.keys(sec.headers)) if (!(h in headers)) headers[h] = '';
            for (const q of sec.queryParams) if (!params.some((x) => x.in === 'query' && x.name === q.name)) params.push(q);

            const slug = typeof node.operationId === 'string' && node.operationId ? slugify(node.operationId) : slugify(path.replace(/[{}]/g, ''));
            const id = uniqueId(`${method}_${slug}`, used);

            ops.push(
                finishOperation({
                    id,
                    method: method.toUpperCase(),
                    baseUrl,
                    path,
                    summary: typeof node.summary === 'string' && node.summary.trim() ? node.summary.trim() : undefined,
                    description: typeof node.description === 'string' ? node.description : undefined,
                    operationId: typeof node.operationId === 'string' ? node.operationId : undefined,
                    tags: Array.isArray(node.tags) ? node.tags.filter((t: unknown): t is string => typeof t === 'string') : [],
                    params,
                    headers,
                    body,
                    responseSchema: pickResponseSchema(node, doc, version, warnings),
                    warnings,
                }),
            );
        }
    }

    if (ops.length === 0) return { ok: false, format, error: 'paths 中没有找到任何接口（get / post / put / delete / patch …）' };
    return { ok: true, format, operations: ops, warnings: collectWarnings(ops, globalWarnings) };
}

/** 解析 OpenAPI 3.x 文档对象 */
export function parseOpenApi3(doc: unknown): ParseResult {
    if (!isPlainObject(doc)) return { ok: false, format: 'openapi3', error: 'OpenAPI 文档必须是 JSON 对象' };
    try {
        return buildOperations(doc, 3);
    } catch (e) {
        return { ok: false, format: 'openapi3', error: `OpenAPI 解析失败：${e instanceof Error ? e.message : String(e)}` };
    }
}

/** 解析 Swagger 2.0 文档对象 */
export function parseSwagger2(doc: unknown): ParseResult {
    if (!isPlainObject(doc)) return { ok: false, format: 'swagger2', error: 'Swagger 文档必须是 JSON 对象' };
    try {
        return buildOperations(doc, 2);
    } catch (e) {
        return { ok: false, format: 'swagger2', error: `Swagger 解析失败：${e instanceof Error ? e.message : String(e)}` };
    }
}
