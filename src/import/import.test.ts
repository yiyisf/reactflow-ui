import { describe, it, expect } from 'vitest';
import { detectFormat, parseApiText } from './detect';
import { parseOpenApi3, parseSwagger2 } from './openapi';
import { parsePostman21 } from './postman';
import { parseCurl, tokenizeCurl } from './curl';
import { resolveSchema } from './schema';
import { sanitizeHeaders } from './sensitive';
import type { ImportedOperation, ParseResult } from './types';
import { YAML_HINT } from './types';
import { CMDB_OPENAPI3, ITSM_OPENAPI3, MONITOR_OPENAPI3 } from './__fixtures__/openapi3';
import { FILES_SWAGGER2, NOTIFY_SWAGGER2, TICKET_SWAGGER2 } from './__fixtures__/swagger2';
import { CMDB_POSTMAN, ITSM_POSTMAN, MISC_POSTMAN } from './__fixtures__/postman';
import { CURL_BASIC_GET, CURL_CHROME_STYLE, CURL_CREATE_TICKET, CURL_FORM, CURL_LONG_FLAGS } from './__fixtures__/curl';

function ops(r: ParseResult): ImportedOperation[] {
    if (!r.ok) throw new Error(`解析失败：${r.error}`);
    return r.operations;
}
function find(list: ImportedOperation[], method: string, path: string): ImportedOperation {
    const op = list.find((o) => o.method === method && o.path === path);
    if (!op) throw new Error(`找不到 ${method} ${path}`);
    return op;
}
const SECRET_SAMPLES = ['sample-token-123', 'sample-password', 'sample-literal-key', 'abc; theme', 'sample-abc'];

describe('detectFormat', () => {
    it('识别 OpenAPI 3 / Swagger 2 / Postman / curl', () => {
        expect(detectFormat(JSON.stringify(CMDB_OPENAPI3))).toBe('openapi3');
        expect(detectFormat(JSON.stringify(ITSM_OPENAPI3))).toBe('openapi3');
        expect(detectFormat(JSON.stringify(TICKET_SWAGGER2))).toBe('swagger2');
        expect(detectFormat(JSON.stringify(CMDB_POSTMAN))).toBe('postman21');
        expect(detectFormat(CURL_CREATE_TICKET)).toBe('curl');
        expect(detectFormat('  $ curl https://a.example.com')).toBe('curl');
        expect(detectFormat('\uFEFF' + JSON.stringify(MONITOR_OPENAPI3))).toBe('openapi3');
    });

    it('识别 YAML，不尝试解析', () => {
        expect(detectFormat('openapi: 3.0.0\ninfo:\n  title: x\npaths: {}')).toBe('yaml');
        expect(detectFormat('---\nswagger: "2.0"\n')).toBe('yaml');
        expect(detectFormat('info:\n  title: x')).toBe('yaml');
        const r = parseApiText('openapi: 3.0.0\npaths:\n  /a:\n    get: {}');
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.format).toBe('yaml');
            expect(r.error).toBe(YAML_HINT);
            expect(r.error).toBe('YAML 请先转为 JSON 后再导入');
        }
    });

    it('无法识别的内容返回 unknown', () => {
        expect(detectFormat('')).toBe('unknown');
        expect(detectFormat('{"hello": 1}')).toBe('unknown');
        expect(detectFormat('{bad json')).toBe('unknown');
        expect(detectFormat('just some words')).toBe('unknown');
    });
});

describe('错误输入不抛异常，返回错误结果', () => {
    it('JSON 语法错误 / 空输入 / 无 paths / 非 curl', () => {
        const bad = parseApiText('{"openapi": "3.0.0", ');
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.error).toContain('JSON 格式不正确');

        const empty = parseApiText('   ');
        expect(empty.ok).toBe(false);

        const noPaths = parseOpenApi3({ openapi: '3.0.0' });
        expect(noPaths.ok).toBe(false);
        if (!noPaths.ok) expect(noPaths.error).toContain('paths');

        const emptyPaths = parseOpenApi3({ openapi: '3.0.0', paths: { '/a': {} } });
        expect(emptyPaths.ok).toBe(false);

        expect(parseSwagger2(null).ok).toBe(false);
        expect(parseSwagger2('str').ok).toBe(false);
        expect(parsePostman21({ info: {} }).ok).toBe(false);
        expect(parsePostman21({ item: [{ name: 'folder', item: [] }] }).ok).toBe(false);
        expect(parseCurl('wget https://a.example.com').ok).toBe(false);
        expect(parseCurl('curl -X POST').ok).toBe(false);
    });
});

describe('schema 解析：$ref、循环、深度', () => {
    it('解析 definitions 引用并合并 allOf', () => {
        const root = {
            definitions: {
                A: { type: 'object', required: ['x'], properties: { x: { type: 'string' } } },
                B: { allOf: [{ $ref: '#/definitions/A' }, { properties: { y: { type: 'integer' } } }] },
            },
        };
        const s = resolveSchema({ $ref: '#/definitions/B' }, root);
        expect(Object.keys(s.properties)).toEqual(['x', 'y']);
        expect(s.required).toEqual(['x']);
    });

    it('循环引用被截断并提示一次', () => {
        const root = { definitions: { N: { type: 'object', properties: { next: { $ref: '#/definitions/N' }, v: { type: 'string' } } } } };
        const w: string[] = [];
        const s = resolveSchema({ $ref: '#/definitions/N' }, root, w);
        expect(s.properties.next.type).toBe('object');
        expect(s.properties.next.properties).toBeUndefined();
        expect(w).toHaveLength(1);
    });

    it('超过深度 6 的节点只保留类型', () => {
        let node: any = { type: 'string' };
        for (let i = 0; i < 10; i++) node = { type: 'object', properties: { child: node } };
        let cur: any = resolveSchema(node, {});
        let depth = 0;
        while (cur.properties && cur.properties.child) {
            cur = cur.properties.child;
            depth++;
        }
        expect(depth).toBe(7);
        expect(cur.properties).toBeUndefined();
    });

    it('无法解析的引用不抛异常', () => {
        const w: string[] = [];
        const s = resolveSchema({ $ref: '#/components/schemas/Missing' }, {}, w);
        expect(s).toEqual({});
        expect(w).toHaveLength(1);
    });
});

describe('OpenAPI 3', () => {
    it('CMDB：servers 变量默认值、尾斜杠、操作数量与 id', () => {
        const r = parseOpenApi3(CMDB_OPENAPI3);
        const list = ops(r);
        expect(list).toHaveLength(5);
        expect(list.map((o) => o.id)).toEqual([
            'get_list_assets',
            'post_create_asset',
            'get_asset',
            'delete_asset',
            'get_list_relations',
        ]);
        expect(list.every((o) => o.baseUrl === 'https://test.cmdb.example.com/api/v1')).toBe(true);
    });

    it('CMDB：路径参数 / 查询参数 / $ref 参数 / 路径级 parameters', () => {
        const list = ops(parseOpenApi3(CMDB_OPENAPI3));
        const listAssets = find(list, 'GET', '/assets');
        expect(listAssets.params.map((p) => `${p.in}:${p.name}`)).toEqual(['query:page', 'query:type', 'query:keyword']);
        const page = listAssets.params[0];
        expect(page.schema.default).toBe(1);
        expect(listAssets.params[1].schema.enum).toEqual(['server', 'network', 'storage']);
        expect(listAssets.summary).toBe('查询资产列表');

        const getAsset = find(list, 'GET', '/assets/{assetId}');
        expect(getAsset.params).toHaveLength(1);
        expect(getAsset.params[0].in).toBe('path');
        expect(getAsset.params[0].required).toBe(true);
    });

    it('CMDB：请求体 $ref 展开，响应 2xx schema 展开 items', () => {
        const list = ops(parseOpenApi3(CMDB_OPENAPI3));
        const create = find(list, 'POST', '/assets');
        expect(create.body?.contentType).toBe('application/json');
        expect(Object.keys(create.body!.schema.properties)).toEqual(['name', 'type', 'owner', 'cpuCores', 'managed', 'tags', 'attributes']);
        expect(create.body!.schema.required).toEqual(['name', 'type']);
        expect(create.responseSchema?.properties.id.example).toBe('ast-001');

        const page = find(list, 'GET', '/assets').responseSchema!;
        expect(page.properties.items.type).toBe('array');
        expect(page.properties.items.items.properties.name.title).toBe('资产名称');

        expect(find(list, 'DELETE', '/assets/{assetId}').responseSchema).toBeUndefined();
    });

    it('CMDB：循环引用 RelationNode 被截断并给出提示', () => {
        const r = parseOpenApi3(CMDB_OPENAPI3);
        const rel = find(ops(r), 'GET', '/assets/{assetId}/relations');
        const children = rel.responseSchema!.properties.children;
        // 响应 schema 本身就是 RelationNode，children.items 再次引用它时在此截断
        expect(children.type).toBe('array');
        expect(children.items.type).toBe('object');
        expect(children.items.properties).toBeUndefined();
        expect(rel.warnings.some((w) => w.includes('循环引用'))).toBe(true);
        if (r.ok) expect(r.warnings.some((w) => w.includes('GET /assets/{assetId}/relations') && w.includes('循环引用'))).toBe(true);
    });

    it('CMDB：Bearer 认证 → Authorization 占位，不含任何凭据值', () => {
        const r = parseOpenApi3(CMDB_OPENAPI3);
        const list = ops(r);
        expect(list.every((o) => o.headers.Authorization === '${workflow.input.authorization}')).toBe(true);
        expect(list[0].warnings.some((w) => w.includes('Authorization'))).toBe(true);
        if (r.ok) expect(r.warnings.some((w) => w.includes('请求头 Authorization'))).toBe(true);
    });

    it('ITSM：相对 servers 给出提示；allOf 合并；header 参数 X-Api-Key 不作为字段；Accept 被忽略', () => {
        const r = parseOpenApi3(ITSM_OPENAPI3);
        const list = ops(r);
        const create = find(list, 'POST', '/tickets');
        expect(create.baseUrl).toBe('/itsm/api');
        expect(create.headers['X-Api-Key']).toBe('${workflow.input.xApiKey}');
        expect(create.params.map((p) => p.name)).toEqual(['X-Request-Id']);
        expect(Object.keys(create.body!.schema.properties)).toEqual(['title', 'description', 'assignee', 'priority']);
        expect(create.body!.schema.required).toEqual(['title', 'priority']);
        if (r.ok) expect(r.warnings.some((w) => w.includes('相对路径'))).toBe(true);
    });

    it('ITSM：无 schema 的示例响应推断出出参；multipart 体提示不支持', () => {
        const list = ops(parseOpenApi3(ITSM_OPENAPI3));
        const create = find(list, 'POST', '/tickets');
        expect(Object.keys(create.responseSchema!.properties)).toEqual(['ticketId', 'state', 'url']);
        const upload = find(list, 'POST', '/tickets/{id}/attachments');
        expect(upload.body).toBeUndefined();
        expect(upload.warnings.some((w) => w.includes('multipart/form-data'))).toBe(true);
        // 没有 operationId 时按路径生成 id
        expect(upload.id).toBe('post_tickets_id_attachments');
    });

    it('Monitor：无 servers 提示；查询串 apiKey 变成带占位默认值的必填查询参数；2XX 数组响应；oneOf 取首个分支', () => {
        const r = parseOpenApi3(MONITOR_OPENAPI3);
        const list = ops(r);
        const q = find(list, 'GET', '/metrics/query');
        expect(q.baseUrl).toBe('');
        const key = q.params.find((p) => p.name === 'api_key');
        expect(key?.defaultValue).toBe('${workflow.input.apiKey}');
        expect(key?.required).toBe(true);
        expect(q.responseSchema?.type).toBe('array');
        expect(q.params.find((p) => p.name === 'ids')?.schema.type).toBe('array');
        if (r.ok) expect(r.warnings.some((w) => w.includes('未声明 servers'))).toBe(true);

        const ack = find(list, 'PUT', '/alerts/{id}/ack');
        expect(Object.keys(ack.body!.schema.properties)).toEqual(['comment', 'silenceMinutes']);
        expect(ack.params[0].schema.type).toBe('integer');
    });
});

describe('Swagger 2', () => {
    it('Ticket：schemes/host/basePath 拼接、尾斜杠处理', () => {
        const list = ops(parseSwagger2(TICKET_SWAGGER2));
        expect(list).toHaveLength(5);
        expect(list.every((o) => o.baseUrl === 'https://itsm.example.com:8443/api/v2')).toBe(true);
    });

    it('Ticket：query 参数类型直接写在参数上；body 参数 $ref（含嵌套 $ref）；路径级参数', () => {
        const list = ops(parseSwagger2(TICKET_SWAGGER2));
        const l = find(list, 'GET', '/tickets');
        expect(l.params.find((p) => p.name === 'status')?.schema.enum).toEqual(['OPEN', 'PENDING', 'CLOSED']);
        expect(l.params.find((p) => p.name === 'limit')?.schema.default).toBe(20);
        expect(l.responseSchema?.type).toBe('array');
        expect(l.responseSchema?.items.properties.reporter.properties.email.type).toBe('string');

        const create = find(list, 'POST', '/tickets');
        expect(create.body?.contentType).toBe('application/json');
        expect(create.body!.schema.required).toEqual(['title']);
        expect(create.body!.schema.properties.reporter.properties.name.type).toBe('string');

        const get = find(list, 'GET', '/tickets/{id}');
        expect(get.params[0]).toEqual({ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: '工单号' });
        expect(get.responseSchema?.properties.id.example).toBe('T-2026-0001');
    });

    it('Ticket：basic 认证 → Authorization 占位并提示', () => {
        const r = parseSwagger2(TICKET_SWAGGER2);
        const list = ops(r);
        expect(list.every((o) => o.headers.Authorization === '${workflow.input.authorization}')).toBe(true);
        if (r.ok) expect(r.warnings.some((w) => w.includes('Authorization'))).toBe(true);
    });

    it('Files：http 方案；Authorization 头参数不作为字段；formData 提示不支持；循环定义被截断', () => {
        const r = parseSwagger2(FILES_SWAGGER2);
        const list = ops(r);
        const up = find(list, 'POST', '/v1/files');
        expect(up.baseUrl).toBe('http://files.example.com');
        expect(up.headers.Authorization).toBe('${workflow.input.authorization}');
        expect(up.params).toHaveLength(0);
        expect(up.body).toBeUndefined();
        expect(up.warnings.some((w) => w.includes('formData'))).toBe(true);

        const folder = find(list, 'GET', '/v1/folders/{folderId}');
        expect(folder.responseSchema?.properties.parent.type).toBe('object');
        expect(folder.responseSchema?.properties.parent.properties).toBeUndefined();
        expect(folder.warnings.some((w) => w.includes('循环引用'))).toBe(true);
    });

    it('Notify：没有 host 时只用 basePath 并提示；apiKey 头认证被占位', () => {
        const r = parseSwagger2(NOTIFY_SWAGGER2);
        const list = ops(r);
        expect(list).toHaveLength(1);
        expect(list[0].baseUrl).toBe('/notify/v1');
        expect(list[0].headers['X-Auth-Token']).toBe('${workflow.input.xAuthToken}');
        expect(list[0].body!.schema.properties.atAll.default).toBe(false);
        if (r.ok) expect(r.warnings.some((w) => w.includes('未声明 host'))).toBe(true);
    });
});

describe('Postman 2.1', () => {
    it('CMDB：{{变量}} 转为 workflow.input；URL 拆分出 baseUrl/path/query 默认值；文件夹作为 tag', () => {
        const r = parsePostman21(CMDB_POSTMAN);
        const list = ops(r);
        expect(list).toHaveLength(2);
        const l = find(list, 'GET', '/assets');
        expect(l.baseUrl).toBe('${workflow.input.baseUrl}');
        expect(l.tags).toEqual(['资产']);
        expect(l.summary).toBe('查询资产列表');
        expect(l.params.map((p) => [p.name, p.defaultValue])).toEqual([['page', '1'], ['type', 'server']]);
        // Accept 头不作为固定头
        expect(l.headers.Accept).toBeUndefined();
        if (r.ok) expect(r.warnings.some((w) => w.includes('baseUrl') && w.includes('Postman 变量'))).toBe(true);
    });

    it('CMDB：集合级 Bearer 认证 → 占位；raw JSON 体推断 schema 与默认值；变量保留；Content-Type 与禁用头不进固定头', () => {
        const list = ops(parsePostman21(CMDB_POSTMAN));
        const create = find(list, 'POST', '/assets');
        expect(create.headers.Authorization).toBe('${workflow.input.authorization}');
        expect(create.headers['X-Trace-Id']).toBe('trace-${workflow.input.traceId}');
        expect(create.headers['X-Debug']).toBeUndefined();
        expect(create.headers['Content-Type']).toBeUndefined();
        const props = create.body!.schema.properties;
        expect(props.owner.default).toBe('${workflow.input.ownerEmail}');
        expect(props.cpuCores.type).toBe('integer');
        expect(props.cpuCores.default).toBe(8);
        expect(props.tags.items.type).toBe('string');
        expect(create.description).toBe('登记一台新资产');
    });

    it('CMDB：示例响应 → 出参 schema', () => {
        const list = ops(parsePostman21(CMDB_POSTMAN));
        const l = find(list, 'GET', '/assets');
        expect(Object.keys(l.responseSchema!.properties)).toEqual(['total', 'items']);
        expect(l.responseSchema!.properties.items.type).toBe('array');
    });

    it('ITSM：url 对象形式、:id 路径变量带默认值、apikey(query) 变成占位参数、禁用的查询项被忽略、urlencoded 体提示', () => {
        const r = parsePostman21(ITSM_POSTMAN);
        const list = ops(r);
        const get = find(list, 'GET', '/api/tickets/{id}');
        expect(get.baseUrl).toBe('https://itsm.example.com');
        expect(get.params.find((p) => p.in === 'path')?.defaultValue).toBe('T-1001');
        expect(get.params.find((p) => p.name === 'expand')?.defaultValue).toBe('comments');
        expect(get.params.find((p) => p.name === 'debug')).toBeUndefined();
        expect(get.params.find((p) => p.name === 'api_key')?.defaultValue).toBe('${workflow.input.apiKey}');
        expect(JSON.stringify(get)).not.toContain('dummy-not-a-secret');

        const form = find(list, 'POST', '/api/forms');
        expect(form.body).toBeUndefined();
        expect(form.warnings.some((w) => w.includes('urlencoded'))).toBe(true);
    });

    it('杂项：嵌套文件夹 tag、字面量 X-Api-Key 被替换、非法 JSON（未加引号变量）与非 JSON raw 作为文本体', () => {
        const r = parsePostman21(MISC_POSTMAN);
        const list = ops(r);
        expect(list).toHaveLength(2);
        const restart = find(list, 'POST', '/services/restart');
        expect(restart.tags).toEqual(['运维', '深层']);
        expect(restart.headers['X-Api-Key']).toBe('${workflow.input.xApiKey}');
        expect(restart.body?.schema.type).toBe('string');
        expect(restart.body?.schema.default).toContain('${workflow.input.timeout}');
        expect(restart.warnings.some((w) => w.includes('合法 JSON'))).toBe(true);

        const logs = find(list, 'PUT', '/logs');
        expect(logs.body?.contentType).toBe('text/plain');
        expect(logs.body?.schema.default).toBe('plain text line');
        expect(JSON.stringify(list)).not.toContain('sample-literal-key');
    });
});

describe('curl', () => {
    it('续行 + 多个 -H + -d JSON：方法、URL 拆分、查询参数、体 schema', () => {
        const r = parseCurl(CURL_CREATE_TICKET);
        const op = ops(r)[0];
        expect(op.method).toBe('POST');
        expect(op.baseUrl).toBe('https://itsm.example.com');
        expect(op.path).toBe('/api/tickets');
        expect(op.params.map((p) => [p.name, p.defaultValue])).toEqual([['notify', 'true']]);
        expect(op.headers['X-Request-Id']).toBe('req-1');
        expect(op.headers['Content-Type']).toBeUndefined();
        expect(op.body?.contentType).toBe('application/json');
        const props = op.body!.schema.properties;
        expect(props.title.default).toBe('磁盘告警');
        expect(props.retry.type).toBe('integer');
        expect(props.watchers.type).toBe('array');
        expect(props.meta.type).toBe('object');
        expect(op.id).toBe('post_api_tickets');
    });

    it('敏感头：Bearer 被替换为占位，原值不残留，并给出提示', () => {
        const r = parseCurl(CURL_CREATE_TICKET);
        const op = ops(r)[0];
        expect(op.headers.Authorization).toBe('${workflow.input.authorization}');
        expect(JSON.stringify(op)).not.toContain('sample-token-123');
        if (r.ok) expect(r.warnings.some((w) => w.includes('Authorization') && w.includes('凭据管理'))).toBe(true);
    });

    it('Chrome 复制风格：--data-raw 与 $\'…\' 引号、省略 -X 时按有体推断 POST、cookie 被占位', () => {
        const r = parseCurl(CURL_CHROME_STYLE);
        const op = ops(r)[0];
        expect(op.method).toBe('POST');
        expect(op.body!.schema.properties.owner.default).toBe("o'neil@example.com");
        expect(op.headers.cookie).toBe('${workflow.input.cookie}');
        expect(JSON.stringify(op)).not.toContain('sid=abc');
    });

    it('-u 基本认证 → Authorization 占位；GET 默认；查询串里的 token 参数默认值被占位', () => {
        const r = parseCurl(CURL_BASIC_GET);
        const op = ops(r)[0];
        expect(op.method).toBe('GET');
        expect(op.headers.Authorization).toBe('${workflow.input.authorization}');
        expect(op.params.find((p) => p.name === 'access_token')?.defaultValue).toBe('${workflow.input.accessToken}');
        expect(op.params.find((p) => p.name === 'limit')?.defaultValue).toBe('10');
        const text = JSON.stringify(r);
        expect(text).not.toContain('sample-password');
        expect(text).not.toContain('sample-abc');
        expect(text).not.toContain('admin:');
    });

    it('长选项 --request / --header / --url / --data 与 -sS -L 等无关选项', () => {
        const op = ops(parseCurl(CURL_LONG_FLAGS))[0];
        expect(op.method).toBe('PUT');
        expect(op.path).toBe('/api/v1/assets/ast-001');
        expect(op.headers['X-Api-Key']).toBe('${workflow.input.xApiKey}');
        expect(op.body!.schema.properties.owner.default).toBe('zhang@example.com');
    });

    it('表单体：作为文本整体，敏感字段值被占位', () => {
        const op = ops(parseCurl(CURL_FORM))[0];
        expect(op.method).toBe('POST');
        expect(op.body?.contentType).toBe('application/x-www-form-urlencoded');
        expect(op.body?.schema.default).toBe('username=alice&password=${workflow.input.password}&remember=1');
    });

    it('其它写法：-XDELETE 紧贴、-G 把 -d 当查询参数、-I 为 HEAD、URL 缺协议、URL 内联账号、@文件 提示', () => {
        expect(ops(parseCurl('curl -XDELETE https://a.example.com/x/1'))[0].method).toBe('DELETE');

        const g = ops(parseCurl('curl -G https://a.example.com/search -d "q=disk&page=2"'))[0];
        expect(g.method).toBe('GET');
        expect(g.body).toBeUndefined();
        expect(g.params.map((p) => p.name)).toEqual(['q', 'page']);

        expect(ops(parseCurl('curl -I https://a.example.com/'))[0].method).toBe('HEAD');

        const noScheme = parseCurl('curl a.example.com/api/ping');
        const nop = ops(noScheme)[0];
        expect(nop.baseUrl).toBe('http://a.example.com');
        if (noScheme.ok) expect(noScheme.warnings.some((w) => w.includes('没有协议'))).toBe(true);

        const inline = parseCurl('curl https://bob:sample-inline@a.example.com/api');
        const iop = ops(inline)[0];
        expect(iop.baseUrl).toBe('https://a.example.com');
        expect(iop.headers.Authorization).toBe('${workflow.input.authorization}');
        expect(JSON.stringify(inline)).not.toContain('sample-inline');

        const file = parseCurl('curl -X POST https://a.example.com/up -d @body.json');
        expect(ops(file)[0].body).toBeUndefined();
        if (file.ok) expect(file.warnings.some((w) => w.includes('@body.json'))).toBe(true);
    });

    it('分词：引号、转义与续行', () => {
        expect(tokenizeCurl("curl -H 'A: b c' \"x y\" z\\ w")).toEqual(['curl', '-H', 'A: b c', 'x y', 'z w']);
        expect(tokenizeCurl('curl \\\n  -X GET \\\r\n  http://a')).toEqual(['curl', '-X', 'GET', 'http://a']);
        expect(tokenizeCurl('curl "a\\"b"')).toEqual(['curl', 'a"b']);
    });
});

describe('敏感头处理', () => {
    it('固定名单与名称模式都会被替换；已是表达式的值保留', () => {
        const { headers, warnings } = sanitizeHeaders({
            Authorization: 'Bearer x',
            Cookie: 'a=b',
            'Proxy-Authorization': 'Basic y',
            'X-Api-Key': 'k',
            'X-Auth-Token': 't',
            'X-Client-Secret': 's',
            'X_API_KEY': 'k2',
            'Content-Length': '12',
            'X-Trace': 'keep',
            'X-Token-Ref': '${workflow.input.already}',
        });
        expect(headers.Authorization).toBe('${workflow.input.authorization}');
        expect(headers.Cookie).toBe('${workflow.input.cookie}');
        expect(headers['Proxy-Authorization']).toBe('${workflow.input.proxyAuthorization}');
        expect(headers['X-Api-Key']).toBe('${workflow.input.xApiKey}');
        expect(headers['X-Auth-Token']).toBe('${workflow.input.xAuthToken}');
        expect(headers['X-Client-Secret']).toBe('${workflow.input.xClientSecret}');
        expect(headers.X_API_KEY).toBe('${workflow.input.xApiKey}');
        expect(headers['Content-Length']).toBe('12');
        expect(headers['X-Trace']).toBe('keep');
        expect(headers['X-Token-Ref']).toBe('${workflow.input.already}');
        expect(warnings).toHaveLength(7);
    });

    it('各格式的解析结果里都不残留示例凭据', () => {
        const all = [
            parseOpenApi3(CMDB_OPENAPI3), parseOpenApi3(ITSM_OPENAPI3), parseOpenApi3(MONITOR_OPENAPI3),
            parseSwagger2(TICKET_SWAGGER2), parseSwagger2(FILES_SWAGGER2), parseSwagger2(NOTIFY_SWAGGER2),
            parsePostman21(CMDB_POSTMAN), parsePostman21(ITSM_POSTMAN), parsePostman21(MISC_POSTMAN),
            parseCurl(CURL_CREATE_TICKET), parseCurl(CURL_CHROME_STYLE), parseCurl(CURL_BASIC_GET), parseCurl(CURL_LONG_FLAGS), parseCurl(CURL_FORM),
        ];
        for (const r of all) {
            const text = JSON.stringify(r);
            for (const secret of SECRET_SAMPLES) expect(text).not.toContain(secret);
        }
    });
});

describe('parseApiText 统一入口', () => {
    it('按格式分派', () => {
        const a = parseApiText(JSON.stringify(TICKET_SWAGGER2));
        expect(a.ok && a.format).toBe('swagger2');
        const b = parseApiText(JSON.stringify(CMDB_POSTMAN));
        expect(b.ok && b.format).toBe('postman21');
        const c = parseApiText(CURL_LONG_FLAGS);
        expect(c.ok && c.format).toBe('curl');
        const d = parseApiText(JSON.stringify({ foo: 1 }));
        expect(d.ok).toBe(false);
    });
});
