/**
 * Swagger 2.0 样例（虚构内部接口）。TICKET_SWAGGER2 同时作为 public/sample-imports/ticket-swagger2.json 的来源。
 */

/** 工单服务：schemes/host/basePath、body 参数 $ref、嵌套 $ref、Basic 认证 */
export const TICKET_SWAGGER2 = {
    swagger: '2.0',
    info: { title: '工单服务', version: '1.0' },
    host: 'itsm.example.com:8443',
    basePath: '/api/v2/',
    schemes: ['https', 'http'],
    consumes: ['application/json'],
    produces: ['application/json'],
    securityDefinitions: { basicAuth: { type: 'basic' } },
    security: [{ basicAuth: [] }],
    paths: {
        '/tickets': {
            get: {
                operationId: 'listTickets',
                summary: '查询工单列表',
                tags: ['工单'],
                parameters: [
                    { name: 'status', in: 'query', type: 'string', enum: ['OPEN', 'PENDING', 'CLOSED'], description: '工单状态' },
                    { name: 'limit', in: 'query', type: 'integer', default: 20, maximum: 100 },
                ],
                responses: {
                    '200': { description: 'OK', schema: { type: 'array', items: { $ref: '#/definitions/Ticket' } } },
                },
            },
            post: {
                operationId: 'createTicket',
                summary: '创建工单',
                tags: ['工单'],
                parameters: [{ name: 'body', in: 'body', required: true, schema: { $ref: '#/definitions/TicketInput' } }],
                responses: { '201': { description: 'Created', schema: { $ref: '#/definitions/Ticket' } } },
            },
        },
        '/tickets/{id}': {
            parameters: [{ name: 'id', in: 'path', required: true, type: 'string', description: '工单号' }],
            get: {
                operationId: 'getTicket',
                summary: '查询工单详情',
                tags: ['工单'],
                responses: { '200': { description: 'OK', schema: { $ref: '#/definitions/Ticket' } } },
            },
            put: {
                operationId: 'updateTicket',
                summary: '更新工单',
                tags: ['工单'],
                parameters: [{ name: 'body', in: 'body', required: true, schema: { $ref: '#/definitions/TicketInput' } }],
                responses: { '200': { description: 'OK', schema: { $ref: '#/definitions/Ticket' } } },
            },
            delete: {
                operationId: 'closeTicket',
                summary: '关闭工单',
                tags: ['工单'],
                responses: { '204': { description: 'No Content' } },
            },
        },
    },
    definitions: {
        User: {
            type: 'object',
            properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' } },
        },
        Ticket: {
            type: 'object',
            properties: {
                id: { type: 'string', description: '工单号', example: 'T-2026-0001' },
                title: { type: 'string' },
                status: { type: 'string', enum: ['OPEN', 'PENDING', 'CLOSED'] },
                reporter: { $ref: '#/definitions/User' },
                createdAt: { type: 'string' },
            },
        },
        TicketInput: {
            type: 'object',
            required: ['title'],
            properties: {
                title: { type: 'string', title: '工单标题' },
                content: { type: 'string', maxLength: 1000 },
                severity: { type: 'integer', default: 3, enum: [1, 2, 3, 4] },
                reporter: { $ref: '#/definitions/User' },
            },
        },
    },
};

/** 文件服务：表单上传（不支持）、Authorization 头参数、http 端口、循环定义 */
export const FILES_SWAGGER2 = {
    swagger: '2.0',
    info: { title: '文件服务', version: '1.2' },
    host: 'files.example.com',
    schemes: ['http'],
    paths: {
        '/v1/files': {
            post: {
                operationId: 'uploadFile',
                summary: '上传文件',
                consumes: ['multipart/form-data'],
                parameters: [
                    { name: 'Authorization', in: 'header', required: true, type: 'string' },
                    { name: 'file', in: 'formData', type: 'file', required: true },
                ],
                responses: { '200': { description: 'OK', schema: { type: 'object', properties: { fileId: { type: 'string' } } } } },
            },
        },
        '/v1/folders/{folderId}': {
            get: {
                operationId: 'getFolder',
                summary: '查询目录',
                parameters: [{ name: 'folderId', in: 'path', required: true, type: 'string' }],
                responses: { '200': { description: 'OK', schema: { $ref: '#/definitions/Folder' } } },
            },
        },
    },
    definitions: {
        Folder: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                parent: { $ref: '#/definitions/Folder' },
                files: { type: 'array', items: { type: 'object', properties: { fileId: { type: 'string' }, size: { type: 'integer' } } } },
            },
        },
    },
};

/** 无 host：仅 basePath；apiKey 头认证（X-Auth-Token） */
export const NOTIFY_SWAGGER2 = {
    swagger: '2.0',
    info: { title: '通知服务', version: '1.0' },
    basePath: '/notify/v1',
    securityDefinitions: { token: { type: 'apiKey', in: 'header', name: 'X-Auth-Token' } },
    paths: {
        '/messages': {
            post: {
                summary: '发送通知',
                security: [{ token: [] }],
                parameters: [
                    {
                        name: 'payload',
                        in: 'body',
                        required: true,
                        schema: {
                            type: 'object',
                            required: ['channel', 'text'],
                            properties: {
                                channel: { type: 'string', enum: ['dingtalk', 'wecom', 'email'] },
                                text: { type: 'string' },
                                atAll: { type: 'boolean', default: false },
                            },
                        },
                    },
                ],
                responses: { '200': { description: 'OK', schema: { type: 'object', properties: { messageId: { type: 'string' } } } } },
            },
        },
    },
};
