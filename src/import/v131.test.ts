import { describe, it, expect } from 'vitest';
import { parseCurl } from './curl';
import { parseOpenApi3 } from './openapi';
import { isSensitiveName } from './sensitive';
import { redactSensitive, schemaWithDefaults } from './common';
import type { ImportedOperation, ParseResult } from './types';

function one(r: ParseResult): ImportedOperation {
    if (!r.ok) throw new Error(`解析失败：${r.error}`);
    return r.operations[0];
}

describe('R6 curl 组合短参数', () => {
    it('-sX POST url：方法取 POST，URL 不被吞掉', () => {
        const op = one(parseCurl("curl -sX POST 'https://api.example.com/v1/items'"));
        expect(op.method).toBe('POST');
        expect(op.baseUrl).toBe('https://api.example.com');
        expect(op.path).toBe('/v1/items');
    });

    it("-sH 'Authorization: Bearer zzz' url：token 不进 uri，头被替换为占位", () => {
        const op = one(parseCurl("curl -sH 'Authorization: Bearer zzz-secret' https://api.example.com/me"));
        expect(op.baseUrl).toBe('https://api.example.com');
        expect(op.path).toBe('/me');
        expect(JSON.stringify(op)).not.toContain('zzz-secret');
        expect(op.headers.Authorization).toBe('${workflow.input.authorization}');
    });

    it('-sXPOST（值紧跟在同一 token 里）与 -LsSd body', () => {
        const a = one(parseCurl('curl -sXPOST https://h.example.com/a'));
        expect(a.method).toBe('POST');
        expect(a.path).toBe('/a');
        const b = one(parseCurl(`curl -LsSd '{"x":1}' https://h.example.com/b`));
        expect(b.method).toBe('POST');
        expect(b.path).toBe('/b');
        expect(b.body?.schema.properties.x.default).toBe(1);
    });

    it('-sG 组合仍识别为 GET 查询；-c cookie-jar 的文件名不会当成 URL', () => {
        const a = one(parseCurl("curl -sG -d 'q=1' https://h.example.com/search"));
        expect(a.method).toBe('GET');
        expect(a.params.map((p) => p.name)).toEqual(['q']);
        const b = one(parseCurl('curl -c jar.txt --cookie-jar jar2.txt https://h.example.com/c'));
        expect(b.baseUrl).toBe('https://h.example.com');
        expect(b.path).toBe('/c');
    });

    it('--oauth2-bearer 的值不落入定义', () => {
        const op = one(parseCurl('curl --oauth2-bearer tok-123 https://h.example.com/x'));
        expect(JSON.stringify(op)).not.toContain('tok-123');
        expect(op.headers.Authorization).toBe('${workflow.input.authorization}');
    });
});

describe('R7 嵌套敏感字段脱敏', () => {
    it('credentials.password 与数组里的 token 被替换', () => {
        const warnings: string[] = [];
        const schema = schemaWithDefaults(
            { name: 'svc', credentials: { user: 'bob', password: 'p@ss' }, items: [{ token: 't-1' }], meta: { owner: 'ops' } },
            warnings,
        );
        expect(schema.properties.name.default).toBe('svc');
        expect(schema.properties.credentials.default).toEqual({
            user: '${workflow.input.credentialsUser}',
            password: '${workflow.input.credentialsPassword}',
        });
        expect(schema.properties.items.default).toEqual([{ token: '${workflow.input.itemsToken}' }]);
        expect(schema.properties.meta.default).toEqual({ owner: 'ops' });
        expect(JSON.stringify(schema)).not.toContain('p@ss');
        expect(JSON.stringify(schema)).not.toContain('t-1');
        expect(warnings.some((w) => w.includes('credentials.password'))).toBe(true);
    });

    it('已是表达式的值保留；不修改入参', () => {
        const input = { auth: { password: '${workflow.input.pw}' }, secret: 'x' };
        const out = redactSensitive(input, ['body'], false, []);
        expect(out).toEqual({ auth: { password: '${workflow.input.pw}' }, secret: '${workflow.input.bodySecret}' });
        expect(input.secret).toBe('x');
    });

    it('curl JSON 请求体的嵌套密码不出现在结果里', () => {
        const op = one(parseCurl(`curl -X POST https://h.example.com/login -d '{"credentials":{"password":"hunter2"}}'`));
        expect(JSON.stringify(op)).not.toContain('hunter2');
    });
});

describe('R14 敏感名单', () => {
    it.each([
        'access_key', 'accessKey', 'AccessKeyId', 'x-signature', 'Ocp-Apim-Subscription-Key', 'subscription_key',
        'credential', 'credentials', 'session', 'session_id', 'sessionId', 'JSESSIONID', 'x-session-token',
        'token', 'client_secret', 'password', 'api-key',
    ])('%s 视为敏感', (name) => {
        expect(isSensitiveName(name)).toBe(true);
    });

    it.each(['sessionTimeout', 'session_count', 'name', 'page', 'keyword', 'description', 'type'])('%s 不视为敏感', (name) => {
        expect(isSensitiveName(name)).toBe(false);
    });
});

describe('OpenAPI：敏感参数、operationId、多个 servers', () => {
    const doc = {
        openapi: '3.0.0',
        info: { title: 't', version: '1' },
        servers: [
            { url: 'https://prod.example.com', description: '生产' },
            { url: 'https://staging.example.com', description: '预发' },
        ],
        paths: {
            '/items/{id}': {
                get: {
                    operationId: 'get_item',
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'i-1' },
                        { name: 'access_key', in: 'query', schema: { type: 'string' }, example: 'AKIA-EXAMPLE' },
                        { name: 'signature', in: 'query', schema: { type: 'string', default: 'sig-literal' } },
                    ],
                    responses: { 200: { description: 'ok' } },
                },
            },
            '/items': {
                post: { operationId: 'createItem', responses: { 201: { description: 'ok' } } },
            },
            '/getaway': {
                get: { operationId: 'getaway', responses: { 200: { description: 'ok' } } },
            },
        },
    };

    it('敏感参数不取 example / 字面默认值，改为入参占位', () => {
        const r = parseOpenApi3(doc);
        if (!r.ok) throw new Error(r.error);
        const op = r.operations.find((o) => o.path === '/items/{id}')!;
        const ak = op.params.find((p) => p.name === 'access_key')!;
        expect(ak.schema.default).toBeUndefined();
        expect(ak.defaultValue).toBe('${workflow.input.accessKey}');
        const sig = op.params.find((p) => p.name === 'signature')!;
        expect(sig.schema.default).toBeUndefined();
        expect(JSON.stringify(r)).not.toContain('AKIA-EXAMPLE');
        expect(JSON.stringify(r)).not.toContain('sig-literal');
        // 普通参数仍用 example
        expect(op.params.find((p) => p.name === 'id')!.schema.default).toBe('i-1');
    });

    it('operationId 已带方法前缀时不重复（get_item → get_item，而不是 get_get_item）', () => {
        const r = parseOpenApi3(doc);
        if (!r.ok) throw new Error(r.error);
        expect(r.operations.map((o) => o.id)).toEqual(['get_item', 'post_create_item', 'get_getaway']);
    });

    it('多个 servers：提示用了哪一个以及其他地址', () => {
        const r = parseOpenApi3(doc);
        if (!r.ok) throw new Error(r.error);
        expect(r.operations.every((o) => o.baseUrl === 'https://prod.example.com')).toBe(true);
        const w = r.warnings.find((x) => x.includes('2 个服务地址'));
        expect(w).toBeDefined();
        expect(w).toContain('https://staging.example.com');
    });
});
