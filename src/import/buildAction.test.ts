import { describe, it, expect } from 'vitest';
import { buildHttpAction } from './buildAction';
import { appendImportedActions } from './insert';
import { parseApiText } from './detect';
import { parseCurl } from './curl';
import { parseOpenApi3 } from './openapi';
import { parsePostman21 } from './postman';
import type { ImportedOperation, ParseResult } from './types';
import { ActionRegistry, defaultActionRegistry } from '../actions/registry';
import { createStepFromAction } from '../stepmodel/factory';
import { compileStepToTaskDef, compileStepModelToWorkflowDef } from '../stepmodel/compile';
import { decompileWorkflowDefToStepModel } from '../stepmodel/decompile';
import { generateDefaultTaskOutputPreview } from '../utils/localSandboxEngine';
import { CMDB_OPENAPI3, ITSM_OPENAPI3 } from './__fixtures__/openapi3';
import { CMDB_POSTMAN } from './__fixtures__/postman';
import { CURL_CREATE_TICKET, CURL_BASIC_GET } from './__fixtures__/curl';

function ops(r: ParseResult): ImportedOperation[] {
    if (!r.ok) throw new Error(r.error);
    return r.operations;
}
function find(list: ImportedOperation[], method: string, path: string): ImportedOperation {
    const op = list.find((o) => o.method === method && o.path === path);
    if (!op) throw new Error(`找不到 ${method} ${path}`);
    return op;
}
const ctx = { taskReferenceName: 'call_1', stepIndex: 0, workflowName: 'wf' };

describe('buildHttpAction：动作定义', () => {
    const list = ops(parseOpenApi3(CMDB_OPENAPI3));

    it('基本属性：id / 名称 / 分类 / 风险等级 / 标签', () => {
        const get = buildHttpAction(find(list, 'GET', '/assets'));
        expect(get.id).toBe('import.get_list_assets');
        expect(get.name).toBe('查询资产列表');
        expect(get.category).toBe('network');
        expect(get.kind).toBe('task');
        expect(get.riskLevel).toBe('safe');
        expect(get.tags).toEqual(['导入', '资产']);
        expect(buildHttpAction(find(list, 'POST', '/assets')).riskLevel).toBe('sensitive');
        expect(buildHttpAction(find(list, 'DELETE', '/assets/{assetId}')).riskLevel).toBe('sensitive');
    });

    it('没有摘要时名称为「METHOD path」', () => {
        const a = buildHttpAction(ops(parseCurl('curl https://a.example.com/api/ping'))[0]);
        expect(a.name).toBe('GET /api/ping');
        expect(a.id).toBe('import.get_api_ping');
    });

    it('字段：参数与请求体属性（沿用 buildFields 规则），均支持数据胶囊', () => {
        const create = buildHttpAction(find(list, 'POST', '/assets'));
        expect(create.fields.map((f) => f.key)).toEqual(['name', 'type', 'owner', 'cpuCores', 'managed', 'tags', 'attributes']);
        const byKey = Object.fromEntries(create.fields.map((f) => [f.key, f]));
        expect(byKey.name.label).toBe('资产名称');
        expect(byKey.name.required).toBe(true);
        expect(byKey.type.type).toBe('select');
        expect(byKey.type.options?.map((o) => o.value)).toEqual(['server', 'network', 'storage']);
        expect(byKey.cpuCores.type).toBe('number');
        expect(byKey.cpuCores.defaultValue).toBe(4);
        expect(byKey.managed.type).toBe('boolean');
        expect(byKey.tags.type).toBe('textarea');
        expect(byKey.owner.acceptsPills).toBe(true);
        expect(byKey.owner.help).toBe('负责人邮箱');

        const getAsset = buildHttpAction(find(list, 'GET', '/assets/{assetId}'));
        expect(getAsset.fields).toHaveLength(1);
        expect(getAsset.fields[0].key).toBe('assetId');
        expect(getAsset.fields[0].required).toBe(true);
        // 路径参数默认取同名工作流入参
        expect(getAsset.fields[0].defaultValue).toBe('${workflow.input.assetId}');
    });

    it('出参：HTTP 状态码 + response.body.<字段>（嵌套对象展开一层），键即 Conductor 真实输出路径', () => {
        const page = buildHttpAction(find(list, 'GET', '/assets'));
        expect(page.outputs.map((o) => o.key)).toEqual([
            'response.statusCode',
            'response.body.total',
            'response.body.page',
            'response.body.items',
        ]);
        expect(page.outputs[1].label).toBe('total');
        expect(page.outputs[1].description).toBe('总数');
        expect(page.outputs[3].type).toBe('array');

        const created = buildHttpAction(find(list, 'POST', '/assets'));
        const idOut = created.outputs.find((o) => o.key === 'response.body.id');
        expect(idOut?.example).toBe('ast-001');

        // 无响应 schema → 整个响应体
        const del = buildHttpAction(find(list, 'DELETE', '/assets/{assetId}'));
        expect(del.outputs.map((o) => o.key)).toEqual(['response.statusCode', 'response.body']);

        // mockOutput 的形状与沙箱的 HTTP 输出一致（response.body.xxx）
        const mock = created.mockOutput!({});
        expect(mock.response.statusCode).toBe(200);
        expect(mock.response.body.id).toBe('ast-001');
    });

    it('字段 key 冲突时追加来源后缀；保留名不被占用', () => {
        const op: ImportedOperation = {
            id: 'put_x', method: 'PUT', baseUrl: 'https://a.example.com', path: '/x/{id}', tags: [], headers: {}, warnings: [],
            params: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'query', required: false, schema: { type: 'string' } },
            ],
            body: { contentType: 'application/json', schema: { type: 'object', properties: { id: { type: 'string' }, http_request: { type: 'string' } } } },
        };
        const a = buildHttpAction(op);
        expect(a.fields.map((f) => f.key)).toEqual(['id', 'id_query', 'id_body', 'http_request_body']);
    });

    it('已有同名动作 id 时追加后缀', () => {
        const op = find(list, 'GET', '/assets');
        const a = buildHttpAction(op, { existingIds: ['import.get_list_assets', 'import.get_list_assets_2'] });
        expect(a.id).toBe('import.get_list_assets_3');
    });
});

describe('buildHttpAction：编译为 Conductor HTTP 任务', () => {
    it('GET：路径参数替换、查询串编码、数组展开、空值省略', () => {
        const list = ops(parseOpenApi3(CMDB_OPENAPI3));
        const a = buildHttpAction(find(list, 'GET', '/assets'));
        const task = a.compile({ page: 2, type: 'server', keyword: 'web 01&x' }, ctx);
        expect(task.type).toBe('HTTP');
        expect(task.taskReferenceName).toBe('call_1');
        const req = task.inputParameters!.http_request;
        expect(req.method).toBe('GET');
        expect(req.uri).toBe('https://test.cmdb.example.com/api/v1/assets?page=2&type=server&keyword=web%2001%26x');
        expect(req.accept).toBe('application/json');
        expect(req.body).toBeUndefined();
        expect(req.contentType).toBeUndefined();
        expect(req.headers).toEqual({ Authorization: '${workflow.input.authorization}' });

        const noQuery = a.compile({}, ctx).inputParameters!.http_request.uri;
        expect(noQuery).toBe('https://test.cmdb.example.com/api/v1/assets');

        const one = buildHttpAction(find(list, 'GET', '/assets/{assetId}'));
        expect(one.compile({ assetId: 'ast 1/2' }, ctx).inputParameters!.http_request.uri).toBe(
            'https://test.cmdb.example.com/api/v1/assets/ast%201%2F2',
        );
        // 数据胶囊原样保留，不做编码
        expect(one.compile({ assetId: '${create_1.output.response.body.id}' }, ctx).inputParameters!.http_request.uri).toBe(
            'https://test.cmdb.example.com/api/v1/assets/${create_1.output.response.body.id}',
        );
        // 空值回退到同名工作流入参
        expect(one.compile({}, ctx).inputParameters!.http_request.uri).toBe('https://test.cmdb.example.com/api/v1/assets/${workflow.input.assetId}');
    });

    it('数组类型的查询参数按重复键展开', () => {
        const list = ops(parseOpenApi3({
            openapi: '3.0.0',
            servers: [{ url: 'https://m.example.com' }],
            paths: { '/q': { get: { parameters: [{ name: 'ids', in: 'query', schema: { type: 'array', items: { type: 'string' } } }], responses: {} } } },
        }));
        const a = buildHttpAction(list[0]);
        expect(a.compile({ ids: '["a","b c"]' }, ctx).inputParameters!.http_request.uri).toBe('https://m.example.com/q?ids=a&ids=b%20c');
    });

    it('POST：请求体按声明类型还原（数字 / 布尔 / JSON），空值省略，contentType 与头', () => {
        const list = ops(parseOpenApi3(CMDB_OPENAPI3));
        const a = buildHttpAction(find(list, 'POST', '/assets'));
        const task = a.compile(
            { name: 'web-02', type: 'server', cpuCores: '8', managed: 'true', tags: '["prod","web"]', attributes: '{"rack":"A1"}', owner: '' },
            ctx,
        );
        const req = task.inputParameters!.http_request;
        expect(req.method).toBe('POST');
        expect(req.uri).toBe('https://test.cmdb.example.com/api/v1/assets');
        expect(req.contentType).toBe('application/json');
        expect(req.body).toEqual({ name: 'web-02', type: 'server', cpuCores: 8, managed: true, tags: ['prod', 'web'], attributes: { rack: 'A1' } });

        // 带数据胶囊的数字字段保留表达式
        const piped = a.compile({ name: 'n', type: 'server', cpuCores: '${wf.input.cores}' }, ctx).inputParameters!.http_request.body;
        expect(piped.cpuCores).toBe('${wf.input.cores}');
    });

    it('请求头参数与固定头：敏感头只含占位，不含凭据值', () => {
        const list = ops(parseOpenApi3(ITSM_OPENAPI3));
        const a = buildHttpAction(find(list, 'POST', '/tickets'));
        const task = a.compile({ title: '磁盘告警', priority: 'high' }, ctx);
        const req = task.inputParameters!.http_request;
        expect(req.headers).toEqual({ 'X-Api-Key': '${workflow.input.xApiKey}' });
        expect(req.body).toEqual({ title: '磁盘告警', priority: 'high' });
        // 头参数字段（key 与参数名相同）
        const withHeader = a.compile({ title: 't', priority: 'low', 'X-Request-Id': 'r1' }, ctx).inputParameters!.http_request.headers;
        expect(withHeader['X-Request-Id']).toBe('r1');
        expect(JSON.stringify(a.compile({ title: 't' }, ctx))).not.toContain('sample');
    });

    it('curl：多行续行命令编译出等价的请求（默认值即原请求体）', () => {
        const a = buildHttpAction(ops(parseCurl(CURL_CREATE_TICKET))[0]);
        const step = createStepFromAction(a);
        const task = compileStepToTaskDef(step, 0, 'wf', new ActionRegistry([a]));
        const req = task.inputParameters!.http_request;
        expect(req.method).toBe('POST');
        expect(req.uri).toBe('https://itsm.example.com/api/tickets?notify=true');
        expect(req.body).toEqual({ title: '磁盘告警', priority: 'high', retry: 3, watchers: ['a@example.com'], meta: { source: 'monitor' } });
        expect(req.headers).toEqual({ Authorization: '${workflow.input.authorization}', 'X-Request-Id': 'req-1' });
        expect(req.contentType).toBe('application/json');
    });

    it('字符串体（表单 / 文本）整体作为 body', () => {
        const a = buildHttpAction(ops(parseApiText("curl https://auth.example.com/login -d 'username=alice&password=x1'"))[0]);
        const task = a.compile({ body: 'username=bob' }, ctx);
        expect(task.inputParameters!.http_request.body).toBe('username=bob');
        expect(task.inputParameters!.http_request.contentType).toBe('application/x-www-form-urlencoded');
    });

    it('Postman 变量：baseUrl 保持为工作流入参表达式', () => {
        const list = ops(parsePostman21(CMDB_POSTMAN));
        const a = buildHttpAction(find(list, 'GET', '/assets'));
        const step = createStepFromAction(a);
        const task = compileStepToTaskDef(step, 0, 'wf', new ActionRegistry([a]));
        expect(task.inputParameters!.http_request.uri).toBe('${workflow.input.baseUrl}/assets?page=1&type=server');
    });

    it('本地沙箱可执行导入的 HTTP 任务（输出路径 response.body 与 mock 一致）', () => {
        const a = buildHttpAction(find(ops(parseOpenApi3(CMDB_OPENAPI3)), 'GET', '/assets'));
        const task = a.compile({ page: 1 }, ctx);
        const out = generateDefaultTaskOutputPreview(task as any, task.inputParameters as any);
        expect(out.response.statusCode).toBe(200);
        expect(out.response.body).toBeDefined();
    });
});

describe('stepmodel 往返：导入的 HTTP 步骤重新打开仍是同一动作', () => {
    const list = ops(parseOpenApi3(CMDB_OPENAPI3));
    const create = buildHttpAction(find(list, 'POST', '/assets'));
    const registry = new ActionRegistry([create]);

    it('compile → decompile → compile 幂等，字段值不丢', () => {
        const model = {
            name: 'wf_import',
            steps: [
                {
                    id: 'step_c1',
                    actionId: create.id,
                    taskReferenceName: 'c1',
                    name: create.name,
                    values: { name: 'web-02', type: 'server', cpuCores: '8', tags: '["a"]' },
                },
            ],
        };
        const def = compileStepModelToWorkflowDef(model, registry);
        expect(def.tasks[0].type).toBe('HTTP');
        expect(def.tasks[0].inputParameters!._actionId).toBe('import.post_create_asset');

        const back = decompileWorkflowDefToStepModel(def, registry);
        expect(back.steps).toHaveLength(1);
        expect(back.steps[0].actionId).toBe('import.post_create_asset');
        expect(back.steps[0].isProFallback).toBe(false);
        expect(back.steps[0].name).toBe('登记资产');
        expect(back.steps[0].values).toEqual({ name: 'web-02', type: 'server', cpuCores: '8', tags: '["a"]' });

        const def2 = compileStepModelToWorkflowDef(back, registry);
        expect(def2.tasks).toEqual(def.tasks);
    });

    it('未注册该动作（例如刷新页面后）时退回专业步骤，任务定义无损', () => {
        const def = compileStepModelToWorkflowDef(
            { name: 'w', steps: [{ id: 's', actionId: create.id, taskReferenceName: 'c1', name: 'x', values: { name: 'a', type: 'server' } }] },
            registry,
        );
        const back = decompileWorkflowDefToStepModel(def, defaultActionRegistry);
        expect(back.steps[0].isProFallback).toBe(true);
        const again = compileStepModelToWorkflowDef(back, defaultActionRegistry);
        expect(again.tasks).toEqual(def.tasks);
    });

    it('不会误匹配内置动作或其它 HTTP 任务', () => {
        const other = {
            name: 'raw_http', taskReferenceName: 'raw', type: 'HTTP',
            inputParameters: { http_request: { uri: 'https://x.example.com', method: 'GET' } },
        } as any;
        const back = decompileWorkflowDefToStepModel({ name: 'w', tasks: [other] } as any, registry);
        expect(back.steps[0].isProFallback).toBe(true);
    });
});

describe('appendImportedActions：追加到流程末尾', () => {
    const list = ops(parseOpenApi3(CMDB_OPENAPI3));
    const actions = [buildHttpAction(find(list, 'GET', '/assets/{assetId}')), buildHttpAction(find(list, 'DELETE', '/assets/{assetId}'))];

    it('追加任务、引用名唯一，并补充用到的工作流入参', () => {
        const base = {
            name: 'wf',
            version: 1,
            tasks: [{ name: 'x', taskReferenceName: 'x_ref', type: 'SIMPLE' }],
            inputParameters: ['existing'],
        } as any;
        const next = appendImportedActions(base, actions);
        expect(next.tasks).toHaveLength(3);
        expect(next.tasks[0].taskReferenceName).toBe('x_ref');
        expect(next.tasks[1].type).toBe('HTTP');
        expect(next.tasks[1].taskReferenceName === next.tasks[2].taskReferenceName).toBe(false);
        expect(next.inputParameters).toEqual(['existing', 'assetId', 'authorization']);
        // 不修改入参
        expect(base.tasks).toHaveLength(1);
        expect(base.inputParameters).toEqual(['existing']);
    });

    it('没有当前流程时使用空白骨架；结构化入参声明不重复', () => {
        const next = appendImportedActions(null, actions);
        expect(next.tasks).toHaveLength(2);
        const names = (next.inputParameters as any[]).map((p) => p.name);
        expect(names).toEqual(['assetId', 'authorization']);
        const again = appendImportedActions(next, [actions[0]]);
        expect((again.inputParameters as any[]).map((p) => p.name)).toEqual(['assetId', 'authorization']);
        expect(again.tasks).toHaveLength(3);
    });

    it('追加后整体能被业务模式反编译为对应的动作步骤', () => {
        const next = appendImportedActions(null, actions);
        const reg = new ActionRegistry(actions);
        const model = decompileWorkflowDefToStepModel(next, reg);
        expect(model.steps.map((s) => s.actionId)).toEqual(actions.map((a) => a.id));
        expect(model.steps.every((s) => !s.isProFallback)).toBe(true);
    });
});

describe('敏感信息不落入动作定义', () => {
    it('curl 的 -u 与查询 token：动作定义序列化后不含原值', () => {
        const a = buildHttpAction(ops(parseCurl(CURL_BASIC_GET))[0]);
        const step = createStepFromAction(a);
        const task = compileStepToTaskDef(step, 0, 'wf', new ActionRegistry([a]));
        const text = JSON.stringify([a.fields, a.description, task]);
        expect(text).not.toContain('sample-password');
        expect(text).not.toContain('sample-abc');
        expect(task.inputParameters!.http_request.headers.Authorization).toBe('${workflow.input.authorization}');
        expect(task.inputParameters!.http_request.uri).toContain('access_token=${workflow.input.accessToken}');
    });

    it('即使调用方直接构造含明文凭据的接口，buildHttpAction 也会替换', () => {
        const op: ImportedOperation = {
            id: 'get_x', method: 'GET', baseUrl: 'https://a.example.com', path: '/x', tags: [], params: [], warnings: [],
            headers: { Authorization: 'Bearer plain-secret', 'X-Env': 'test' },
        };
        const task = buildHttpAction(op).compile({}, ctx);
        expect(task.inputParameters!.http_request.headers).toEqual({ Authorization: '${workflow.input.authorization}', 'X-Env': 'test' });
        expect(JSON.stringify(task)).not.toContain('plain-secret');
    });
});
