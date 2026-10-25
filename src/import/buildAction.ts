/**
 * ImportedOperation → 业务动作（ActionDefinition）。
 *
 * - 字段：路径参数 / 查询参数 / 请求头参数 / 请求体属性，沿用 `buildFields` 规则（title → 标签、enum → 下拉、
 *   类型 → 控件），全部支持插入数据胶囊；
 * - 出参：2xx 响应 schema，沿用 `buildOutputs`，键为 Conductor HTTP 任务的真实输出路径
 *   `response.body.<字段>`，因此数据胶囊引用 `${ref.output.response.body.xxx}` 运行时可直接取到；
 * - 编译：Conductor `HTTP` 任务，`inputParameters` 里保留 `_actionId` 与各字段值，
 *   使步骤重新打开时能被 `decompile` 还原为同一动作（动作未注册时退回「专业步骤」卡片，定义无损）。
 */

import type { ActionDefinition, ActionField, ActionOutputField } from '../actions/types';
import { buildFields, buildOutputs } from '../actions/fromDefinitions';
import type { TaskDef } from '../types/conductor';
import type { ImportedOperation, ImportedParam, JsonSchema } from './types';
import { dropContentHeaders } from './common';
import { inputPlaceholder, sanitizeHeaders } from './sensitive';
import { isPlainObject, schemaType, uniqueId } from './util';

export interface BuildHttpActionOptions {
    /** 已存在的动作 id（完整 id，如 `import.get_tickets`）：冲突时自动追加 `_2` 等后缀 */
    existingIds?: Iterable<string>;
    /** 动作 id 前缀，默认 `import` */
    idPrefix?: string;
}

type Source = 'path' | 'query' | 'header' | 'body';

interface Binding {
    /** 表单字段 key（同一动作内唯一） */
    key: string;
    /** 接口里的原始名称 */
    name: string;
    source: Source;
    type: string;
}

const RESERVED_KEYS = ['_actionId', 'actionName', 'http_request'];

function isEmpty(v: unknown): boolean {
    return v === undefined || v === null || v === '';
}

/** schema 属性 → buildFields 能直接消费的 JSON Schema 属性 */
function toProp(schema: JsonSchema, extra: { description?: string; defaultValue?: unknown } = {}): JsonSchema {
    const prop: JsonSchema = { ...schema };
    if (!prop.description && extra.description) prop.description = extra.description;
    if (extra.defaultValue !== undefined) prop.default = extra.defaultValue;
    if (prop.example !== undefined && prop.examples === undefined) {
        prop.examples = [typeof prop.example === 'object' ? JSON.stringify(prop.example) : prop.example];
    }
    delete prop.example;
    return prop;
}

/** 表单值 → 请求体 / 查询值：按声明类型还原；`${...}` 表达式整体保留 */
function coerce(value: unknown, type: string): unknown {
    if (isEmpty(value)) return undefined;
    if (typeof value !== 'string') return value;
    if (type === 'object' || type === 'array') {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
    if (value.includes('${')) return value;
    if (type === 'number' || type === 'integer') {
        return value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : value;
    }
    if (type === 'boolean') {
        if (value === 'true') return true;
        if (value === 'false') return false;
    }
    return value;
}

function encodeQueryPart(s: string): string {
    return s.includes('${') ? s : encodeURIComponent(s);
}

function setPath(target: Record<string, any>, dotted: string, value: unknown): void {
    const parts = dotted.split('.');
    let cur = target;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {};
        cur = cur[parts[i]];
    }
    const last = parts[parts.length - 1];
    // 父级先于子级写入；若父级已有子对象，保留
    if (!(isPlainObject(cur[last]) && isPlainObject(value))) cur[last] = value;
}

function outputTypeOf(schema: JsonSchema): ActionOutputField['type'] {
    const t = schemaType(schema);
    if (t === 'integer' || t === 'number') return 'number';
    if (t === 'boolean' || t === 'array' || t === 'object') return t;
    return 'string';
}

function normalizeProps(props: Record<string, JsonSchema>): Record<string, JsonSchema> {
    const out: Record<string, JsonSchema> = {};
    for (const [k, v] of Object.entries(props)) out[k] = toProp(v);
    return out;
}

/** 响应体 schema → 出参（键为 `response.body.<字段>`，最多展开一层嵌套对象） */
function buildBodyOutputs(schema: JsonSchema | undefined): ActionOutputField[] {
    if (schema && schemaType(schema) === 'object' && isPlainObject(schema.properties) && Object.keys(schema.properties).length > 0) {
        const props = schema.properties as Record<string, JsonSchema>;
        const top = buildOutputs({ type: 'JSON', data: { type: 'object', properties: normalizeProps(props) } }, []);
        const out: ActionOutputField[] = [];
        for (const o of top) {
            out.push({ ...o, key: `response.body.${o.key}` });
            const child = props[o.key];
            if (child && schemaType(child) === 'object' && isPlainObject(child.properties) && Object.keys(child.properties).length > 0) {
                const nested = buildOutputs({ type: 'JSON', data: { type: 'object', properties: normalizeProps(child.properties) } }, []);
                for (const c of nested) {
                    out.push({ ...c, key: `response.body.${o.key}.${c.key}`, label: `${o.label}.${c.label}` });
                }
            }
        }
        return out;
    }
    const type = schema ? outputTypeOf(schema) : 'object';
    const example = type === 'array' ? [] : type === 'object' ? {} : type === 'number' ? 0 : type === 'boolean' ? true : 'sample';
    return [{ key: 'response.body', label: '响应体', type, example }];
}

function actionName(op: ImportedOperation): string {
    const s = (op.summary || '').trim();
    return s ? (s.length > 40 ? `${s.slice(0, 40)}…` : s) : `${op.method} ${op.path}`;
}

/**
 * 由导入的接口生成 HTTP 业务动作。
 * 固定请求头会再做一次敏感值检查（解析器已处理时这里是空操作），保证动作定义里不会出现凭据。
 */
export function buildHttpAction(op: ImportedOperation, opts: BuildHttpActionOptions = {}): ActionDefinition {
    const prefix = opts.idPrefix || 'import';
    const taken = new Set<string>(opts.existingIds || []);
    const shortId = uniqueId(op.id, new Set(Array.from(taken).filter((i) => i.startsWith(`${prefix}.`)).map((i) => i.slice(prefix.length + 1))));
    const id = `${prefix}.${shortId}`;
    const name = actionName(op);

    // ── 参数 → 字段绑定 ──
    const usedKeys = new Set<string>(RESERVED_KEYS);
    const alloc = (raw: string, source: Source): string => {
        let key = raw;
        if (usedKeys.has(key)) key = `${raw}_${source}`;
        return uniqueId(key, usedKeys);
    };

    const bindings: Binding[] = [];
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    // 路径模板里出现但文档没声明的参数，补一个
    const declaredPath = new Set(op.params.filter((p) => p.in === 'path').map((p) => p.name));
    const pathParams: ImportedParam[] = op.params.filter((p) => p.in === 'path');
    for (const m of op.path.matchAll(/\{([^}/]+)\}/g)) {
        if (!declaredPath.has(m[1])) {
            declaredPath.add(m[1]);
            pathParams.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } });
        }
    }
    const ordered: ImportedParam[] = [
        ...pathParams,
        ...op.params.filter((p) => p.in === 'query'),
        ...op.params.filter((p) => p.in === 'header'),
    ];
    for (const p of ordered) {
        const key = alloc(p.name, p.in);
        const t = schemaType(p.schema);
        bindings.push({ key, name: p.name, source: p.in, type: t });
        const defaultValue = p.defaultValue !== undefined ? p.defaultValue : p.in === 'path' && p.schema.default === undefined ? inputPlaceholder(p.name) : undefined;
        properties[key] = toProp(p.schema, { description: p.description, defaultValue });
        if (p.required || p.in === 'path') required.push(key);
    }

    let bodyMode: 'none' | 'props' | 'whole' = 'none';
    let bodyType = 'object';
    if (op.body) {
        const bs = op.body.schema;
        bodyType = schemaType(bs);
        if (bodyType === 'object' && isPlainObject(bs.properties) && Object.keys(bs.properties).length > 0) {
            bodyMode = 'props';
            const reqd = Array.isArray(bs.required) ? bs.required : [];
            for (const [propName, propSchema] of Object.entries(bs.properties as Record<string, JsonSchema>)) {
                const key = alloc(propName, 'body');
                bindings.push({ key, name: propName, source: 'body', type: schemaType(propSchema) });
                properties[key] = toProp(propSchema);
                if (reqd.includes(propName)) required.push(key);
            }
        } else {
            bodyMode = 'whole';
            const key = alloc('body', 'body');
            bindings.push({ key, name: 'body', source: 'body', type: bodyType });
            properties[key] = toProp({ ...bs, title: bs.title || '请求体' });
        }
    }

    const fields: ActionField[] = buildFields({ type: 'JSON', data: { type: 'object', properties, required } }, []).map((f) => {
        // 对象 / 数组默认值在文本框里以 JSON 字符串呈现
        if (f.defaultValue !== undefined && f.defaultValue !== null && typeof f.defaultValue === 'object') {
            return { ...f, defaultValue: JSON.stringify(f.defaultValue) };
        }
        return f;
    });

    const outputs: ActionOutputField[] = [
        { key: 'response.statusCode', label: 'HTTP 状态码', type: 'number', example: 200 },
        ...buildBodyOutputs(op.responseSchema),
    ];

    // ── 固定头：再过一遍敏感检查，并取出 content-type / accept ──
    const staticHeaders = dropContentHeaders(sanitizeHeaders(op.headers).headers);
    const base = op.baseUrl.replace(/\/+$/, '');
    const pathTemplate = op.path.startsWith('/') ? op.path : `/${op.path}`;
    const bindingsOf = (source: Source) => bindings.filter((b) => b.source === source);

    const compile = (values: Record<string, any>, ctx: { taskReferenceName: string }): TaskDef => {
        const v = values || {};

        // uri：路径参数替换（空值回退到同名工作流入参）+ 查询串
        const path = pathTemplate.replace(/\{([^}/]+)\}/g, (_w, pName: string) => {
            const b = bindingsOf('path').find((x) => x.name === pName);
            const raw = b ? v[b.key] : undefined;
            const s = isEmpty(raw) ? inputPlaceholder(pName) : String(raw);
            return s.includes('${') ? s : encodeURIComponent(s);
        });
        const pairs: string[] = [];
        for (const b of bindingsOf('query')) {
            const val = coerce(v[b.key], b.type);
            if (val === undefined) continue;
            const items = Array.isArray(val) ? val : [val];
            for (const item of items) {
                pairs.push(`${encodeURIComponent(b.name)}=${encodeQueryPart(typeof item === 'object' ? JSON.stringify(item) : String(item))}`);
            }
        }
        const uri = `${base}${path}${pairs.length > 0 ? `${path.includes('?') ? '&' : '?'}${pairs.join('&')}` : ''}`;

        const headers: Record<string, string> = { ...staticHeaders };
        for (const b of bindingsOf('header')) {
            if (!isEmpty(v[b.key])) headers[b.name] = String(v[b.key]);
        }

        let body: unknown;
        if (bodyMode === 'props') {
            const obj: Record<string, unknown> = {};
            for (const b of bindingsOf('body')) {
                const val = coerce(v[b.key], b.type);
                if (val !== undefined) obj[b.name] = val;
            }
            body = obj;
        } else if (bodyMode === 'whole') {
            const b = bindingsOf('body')[0];
            body = b ? (bodyType === 'object' || bodyType === 'array' ? coerce(v[b.key], bodyType) : isEmpty(v[b.key]) ? undefined : String(v[b.key])) : undefined;
        }

        const stored: Record<string, any> = {};
        for (const f of fields) {
            if (!isEmpty(v[f.key])) stored[f.key] = v[f.key];
        }

        return {
            name: `http_${op.id}`,
            taskReferenceName: ctx.taskReferenceName,
            type: 'HTTP',
            description: `调用接口：${name}`,
            inputParameters: {
                _actionId: id,
                actionName: name,
                ...stored,
                http_request: {
                    uri,
                    method: op.method,
                    ...(Object.keys(headers).length > 0 ? { headers } : {}),
                    accept: 'application/json',
                    ...(op.body && body !== undefined ? { contentType: op.body.contentType, body } : {}),
                },
            },
        } as TaskDef;
    };

    const desc = (op.description || op.summary || '').split('\n')[0].trim();
    return {
        id,
        name,
        category: 'network',
        icon: 'plug',
        description: `${op.method} ${base}${pathTemplate}${desc ? `：${desc.slice(0, 80)}` : ''}`,
        kind: 'task',
        tags: ['导入', ...op.tags],
        riskLevel: ['GET', 'HEAD', 'OPTIONS'].includes(op.method) ? 'safe' : 'sensitive',
        fields,
        outputs,
        compile,
        decompile: (task) => {
            if (task.type !== 'HTTP' || task.inputParameters?._actionId !== id) return null;
            const out: Record<string, any> = {};
            for (const f of fields) {
                const val = task.inputParameters[f.key];
                if (val !== undefined) out[f.key] = val;
            }
            return out;
        },
        mockOutput: () => {
            const out: Record<string, any> = {};
            for (const o of outputs) setPath(out, o.key, o.example);
            return out;
        },
    };
}
