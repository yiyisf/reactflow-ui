/**
 * Postman Collection v2.1 样例（虚构内部接口，凭据均为占位）。
 * CMDB_POSTMAN 同时作为 public/sample-imports/cmdb-postman.json 的来源。
 */

const SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

/** CMDB：文件夹、{{变量}}、集合级 Bearer 认证、raw JSON 体、示例响应 */
export const CMDB_POSTMAN = {
    info: { _postman_id: 'b3a1f6c0-0000-4000-8000-000000000001', name: 'CMDB 资产', schema: SCHEMA },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{cmdbToken}}', type: 'string' }] },
    variable: [{ key: 'baseUrl', value: 'https://test.cmdb.example.com/api/v1' }],
    item: [
        {
            name: '资产',
            item: [
                {
                    name: '查询资产列表',
                    request: {
                        method: 'GET',
                        header: [{ key: 'Accept', value: 'application/json' }],
                        url: { raw: '{{baseUrl}}/assets?page=1&type=server', host: ['{{baseUrl}}'], path: ['assets'], query: [{ key: 'page', value: '1' }, { key: 'type', value: 'server' }] },
                    },
                    response: [
                        {
                            name: '成功',
                            code: 200,
                            body: '{"total": 2, "items": [{"id": "ast-001", "name": "web-01"}]}',
                        },
                    ],
                },
                {
                    name: '登记资产',
                    request: {
                        method: 'POST',
                        header: [
                            { key: 'Content-Type', value: 'application/json' },
                            { key: 'X-Trace-Id', value: 'trace-{{traceId}}' },
                            { key: 'X-Debug', value: '1', disabled: true },
                        ],
                        body: {
                            mode: 'raw',
                            raw: '{\n  "name": "web-02",\n  "type": "server",\n  "owner": "{{ownerEmail}}",\n  "cpuCores": 8,\n  "managed": true,\n  "tags": ["prod", "web"]\n}',
                            options: { raw: { language: 'json' } },
                        },
                        url: '{{baseUrl}}/assets',
                        description: '登记一台新资产',
                    },
                },
            ],
        },
    ],
};

/** 工单：url 对象形式、`:id` 路径变量、请求级 apikey（查询串）、urlencoded 体（不支持） */
export const ITSM_POSTMAN = {
    info: { name: '工单', schema: SCHEMA },
    item: [
        {
            name: '查询工单',
            request: {
                method: 'GET',
                auth: { type: 'apikey', apikey: [{ key: 'key', value: 'api_key' }, { key: 'value', value: 'dummy-not-a-secret' }, { key: 'in', value: 'query' }] },
                url: {
                    protocol: 'https',
                    host: ['itsm', 'example', 'com'],
                    path: ['api', 'tickets', ':id'],
                    query: [{ key: 'expand', value: 'comments' }, { key: 'debug', value: '1', disabled: true }],
                    variable: [{ key: 'id', value: 'T-1001' }],
                },
            },
        },
        {
            name: '提交表单',
            request: {
                method: 'POST',
                header: [],
                body: { mode: 'urlencoded', urlencoded: [{ key: 'title', value: 'x' }] },
                url: { raw: 'https://itsm.example.com/api/forms' },
            },
        },
    ],
};

/** 杂项：嵌套文件夹、字面量 X-Api-Key 头、非 JSON raw、未加引号变量的 JSON、无请求的空文件夹 */
export const MISC_POSTMAN = {
    info: { name: '杂项', schema: SCHEMA },
    item: [
        {
            name: '运维',
            item: [
                {
                    name: '深层',
                    item: [
                        {
                            name: '重启服务',
                            request: {
                                method: 'POST',
                                header: [{ key: 'X-Api-Key', value: 'sample-literal-key' }, { key: 'Content-Type', value: 'application/json' }],
                                body: { mode: 'raw', raw: '{"service": "gateway", "timeoutSec": {{timeout}}}', options: { raw: { language: 'json' } } },
                                url: 'https://ops.example.com/services/restart',
                            },
                        },
                        {
                            name: '发送日志',
                            request: {
                                method: 'PUT',
                                header: [{ key: 'Content-Type', value: 'text/plain' }],
                                body: { mode: 'raw', raw: 'plain text line' },
                                url: 'https://ops.example.com/logs',
                            },
                        },
                    ],
                },
                { name: '空文件夹', item: [] },
            ],
        },
    ],
};
