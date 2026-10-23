/**
 * OpenAPI 3 样例（均为虚构的内部接口，不含真实地址与凭据）。
 * CMDB_OPENAPI3 同时作为 public/sample-imports/cmdb-openapi3.json 的来源。
 */

/** CMDB 资产接口：servers 变量、$ref、循环引用、Bearer 认证 */
export const CMDB_OPENAPI3 = {
    openapi: '3.0.3',
    info: { title: 'CMDB 资产管理', version: '1.0.0' },
    servers: [
        {
            url: 'https://{env}.cmdb.example.com/api/{version}/',
            variables: {
                env: { default: 'test', enum: ['test', 'prod'] },
                version: { default: 'v1' },
            },
        },
    ],
    security: [{ bearerAuth: [] }],
    paths: {
        '/assets': {
            get: {
                operationId: 'listAssets',
                summary: '查询资产列表',
                tags: ['资产'],
                parameters: [
                    { $ref: '#/components/parameters/Page' },
                    { name: 'type', in: 'query', schema: { type: 'string', enum: ['server', 'network', 'storage'] }, description: '资产类型' },
                    { name: 'keyword', in: 'query', schema: { type: 'string' }, description: '名称关键字' },
                ],
                responses: {
                    '200': {
                        description: 'OK',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/AssetPage' } } },
                    },
                },
            },
            post: {
                operationId: 'createAsset',
                summary: '登记资产',
                tags: ['资产'],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/AssetCreate' } } },
                },
                responses: {
                    '201': {
                        description: 'Created',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } },
                    },
                },
            },
        },
        '/assets/{assetId}': {
            parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string' }, description: '资产 ID' }],
            get: {
                operationId: 'getAsset',
                summary: '查询资产详情',
                tags: ['资产'],
                responses: {
                    '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } },
                    '404': { description: 'Not Found' },
                },
            },
            delete: {
                operationId: 'deleteAsset',
                summary: '下线资产',
                tags: ['资产'],
                responses: { '204': { description: 'No Content' } },
            },
        },
        '/assets/{assetId}/relations': {
            get: {
                operationId: 'listRelations',
                summary: '查询资产关联关系',
                tags: ['关系'],
                parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/RelationNode' } } } },
                },
            },
        },
    },
    components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
        parameters: {
            Page: { name: 'page', in: 'query', schema: { type: 'integer', default: 1, minimum: 1 }, description: '页码' },
        },
        schemas: {
            Asset: {
                type: 'object',
                required: ['id', 'name'],
                properties: {
                    id: { type: 'string', description: '资产 ID', example: 'ast-001' },
                    name: { type: 'string', title: '资产名称' },
                    type: { type: 'string', enum: ['server', 'network', 'storage'] },
                    owner: { type: 'string', description: '负责人邮箱' },
                    status: { type: 'string', enum: ['online', 'offline'], example: 'online' },
                    labels: { type: 'object', additionalProperties: { type: 'string' } },
                    createdAt: { type: 'string', format: 'date-time' },
                },
            },
            AssetCreate: {
                type: 'object',
                required: ['name', 'type'],
                properties: {
                    name: { type: 'string', title: '资产名称' },
                    type: { type: 'string', enum: ['server', 'network', 'storage'], title: '资产类型' },
                    owner: { type: 'string', description: '负责人邮箱' },
                    cpuCores: { type: 'integer', default: 4 },
                    managed: { type: 'boolean', default: true },
                    tags: { type: 'array', items: { type: 'string' } },
                    attributes: { type: 'object', description: '扩展属性' },
                },
            },
            AssetPage: {
                type: 'object',
                properties: {
                    total: { type: 'integer', description: '总数' },
                    page: { type: 'integer' },
                    items: { type: 'array', items: { $ref: '#/components/schemas/Asset' } },
                },
            },
            RelationNode: {
                type: 'object',
                properties: {
                    assetId: { type: 'string' },
                    relation: { type: 'string' },
                    children: { type: 'array', items: { $ref: '#/components/schemas/RelationNode' } },
                },
            },
        },
    },
};

/** 工单接口：相对 servers、allOf、header 参数里的 API Key、示例响应、表单体（不支持） */
export const ITSM_OPENAPI3 = {
    openapi: '3.1.0',
    info: { title: '工单服务', version: '2.3.0' },
    servers: [{ url: '/itsm/api' }],
    paths: {
        '/tickets': {
            post: {
                operationId: 'createTicket',
                summary: '创建工单',
                parameters: [
                    { name: 'X-Api-Key', in: 'header', required: true, schema: { type: 'string' } },
                    { name: 'X-Request-Id', in: 'header', schema: { type: 'string' }, description: '幂等号' },
                    { name: 'Accept', in: 'header', schema: { type: 'string' } },
                ],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                allOf: [
                                    { $ref: '#/components/schemas/TicketBase' },
                                    { type: 'object', required: ['priority'], properties: { priority: { type: 'string', enum: ['low', 'medium', 'high'] } } },
                                ],
                            },
                        },
                    },
                },
                responses: {
                    '201': {
                        description: 'Created',
                        content: { 'application/json': { example: { ticketId: 'T-1001', state: 'OPEN', url: 'https://itsm.example.com/T-1001' } } },
                    },
                },
            },
        },
        '/tickets/{id}/attachments': {
            post: {
                summary: '上传附件',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
                responses: { '200': { description: 'OK' } },
            },
        },
    },
    components: {
        schemas: {
            TicketBase: {
                type: 'object',
                required: ['title'],
                properties: {
                    title: { type: 'string', title: '工单标题', maxLength: 120 },
                    description: { type: 'string', maxLength: 2000 },
                    assignee: { type: 'string' },
                },
            },
        },
    },
};

/** 监控接口：无 servers、apiKey 在查询串、2XX 范围响应、oneOf */
export const MONITOR_OPENAPI3 = {
    openapi: '3.0.1',
    info: { title: '监控指标', version: '0.9.0' },
    security: [{ apiKeyQuery: [] }],
    paths: {
        '/metrics/query': {
            get: {
                operationId: 'queryMetrics',
                summary: '查询指标',
                parameters: [
                    { name: 'metric', in: 'query', required: true, schema: { type: 'string' }, description: '指标名，如 cpu.usage' },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
                    { name: 'ids', in: 'query', schema: { type: 'array', items: { type: 'string' } }, description: '实例列表' },
                ],
                responses: {
                    '2XX': {
                        description: 'OK',
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: { type: 'object', properties: { ts: { type: 'integer' }, value: { type: 'number' } } } },
                            },
                        },
                    },
                },
            },
        },
        '/alerts/{id}/ack': {
            put: {
                operationId: 'ackAlert',
                summary: '确认告警',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                oneOf: [
                                    { type: 'object', properties: { comment: { type: 'string' }, silenceMinutes: { type: 'integer', default: 30 } } },
                                    { type: 'object', properties: { reason: { type: 'string' } } },
                                ],
                            },
                        },
                    },
                },
                responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { acked: { type: 'boolean' } } } } } } },
            },
        },
    },
    components: {
        securitySchemes: { apiKeyQuery: { type: 'apiKey', in: 'query', name: 'api_key' } },
    },
};
