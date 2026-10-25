import type { SchemaDef, TaskDef, WorkflowDef } from '../types/conductor';
import { parseWorkflowInputParams } from '../types/conductor';
import type {
  ActionCategory,
  ActionDefinition,
  ActionField,
  ActionOutputField,
} from './types';
import type { WorkflowLevel } from '../types/workflowLibrary';

/**
 * 从 Conductor OSS 标准定义（WorkflowDef / 已注册 TaskDef）生成业务动作。
 *
 * 设计原则：
 * - 库本身不发请求：定义数据由接入方从治理层取得（权限过滤也在治理层完成）。
 * - 标准结构给不了的信息（中文名、分类、图标、风险等级、特殊控件、层级、标签）
 *   通过可选的 ActionExtension 补充；缺省时按合理默认值降级，保证任何定义都能出现在动作库里。
 */

/** 治理层/接入方提供的补充字段（均可选，按名称一一对应） */
export interface ActionExtension {
  /** 业务展示名（缺省使用定义名称） */
  label?: string;
  description?: string;
  category?: ActionCategory;
  icon?: string;
  riskLevel?: 'safe' | 'sensitive';
  connector?: string;
  level?: WorkflowLevel;
  /** 业务域展示名 */
  domain?: string;
  tags?: string[];
  /** 为 true 时不进入动作库（例如用户无权限、已下线） */
  hidden?: boolean;
  /** 按入参 key 覆盖表单字段属性（中文标签、控件类型、下拉选项等） */
  fieldOverrides?: Record<string, Partial<ActionField>>;
  /** 按出参 key 覆盖出参说明（中文标签、示例值） */
  outputOverrides?: Record<string, Partial<ActionOutputField>>;
}

/** Conductor `/metadata/taskdefs` 返回的已注册任务定义（只列本模块用到的标准字段） */
export interface RegisteredTaskDef {
  name: string;
  description?: string;
  /** 仅文档用途，不强制 */
  inputKeys?: string[];
  outputKeys?: string[];
  inputTemplate?: Record<string, any>;
  inputSchema?: SchemaDef;
  outputSchema?: SchemaDef;
  ownerEmail?: string;
}

// ── JSON Schema → 表单字段 / 出参 ───────────────────────────────────────────

type JsonSchemaProp = {
  type?: string | string[];
  title?: string;
  description?: string;
  enum?: any[];
  default?: any;
  examples?: any[];
  format?: string;
  maxLength?: number;
};

function primaryType(prop: JsonSchemaProp): string {
  const t = Array.isArray(prop.type) ? prop.type.find((x) => x !== 'null') : prop.type;
  return t || 'string';
}

function getSchemaDoc(schema?: SchemaDef): { properties: Record<string, JsonSchemaProp>; required: string[] } | null {
  // 只有 JSON 类型且带内联 data 的 schema 才可解析
  if (!schema || (schema.type && schema.type !== 'JSON')) return null;
  const data = schema.data;
  if (!data || typeof data !== 'object') return null;
  const properties = (data as any).properties;
  if (!properties || typeof properties !== 'object') return null;
  return {
    properties,
    required: Array.isArray((data as any).required) ? (data as any).required : [],
  };
}

function fieldFromProp(key: string, prop: JsonSchemaProp, required: boolean, tplDefault: any): ActionField {
  const t = primaryType(prop);
  const base: ActionField = {
    key,
    label: prop.title || key,
    type: 'text',
    help: prop.description,
    required,
    defaultValue: prop.default !== undefined ? prop.default : tplDefault,
    placeholder: Array.isArray(prop.examples) && prop.examples.length > 0 ? String(prop.examples[0]) : undefined,
    acceptsPills: true,
  };

  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    return {
      ...base,
      type: 'select',
      options: prop.enum.map((v) => ({ label: String(v), value: v })),
      acceptsPills: true,
    };
  }
  if (t === 'boolean') return { ...base, type: 'boolean', acceptsPills: false };
  if (t === 'number' || t === 'integer') return { ...base, type: 'number' };
  if (t === 'object' || t === 'array') {
    return {
      ...base,
      type: 'textarea',
      help: [prop.description, 'JSON 格式'].filter(Boolean).join('；'),
    };
  }
  if (prop.format === 'textarea' || (typeof prop.maxLength === 'number' && prop.maxLength > 200)) {
    return { ...base, type: 'textarea' };
  }
  return base;
}

/**
 * 将 JSON Schema 的 properties 转为表单字段；没有 schema 时退化为仅有 key 列表
 * （Conductor 的 inputKeys / inputParameters 只有名称），类型一律按文本处理。
 */
export function buildFields(
  schema: SchemaDef | undefined,
  fallbackKeys: string[],
  inputTemplate?: Record<string, any>
): ActionField[] {
  const doc = getSchemaDoc(schema);
  if (doc) {
    return Object.entries(doc.properties).map(([key, prop]) =>
      fieldFromProp(key, prop || {}, doc.required.includes(key), inputTemplate?.[key])
    );
  }
  const keys = Array.from(new Set([...fallbackKeys, ...Object.keys(inputTemplate || {})]));
  return keys.map((key) => ({
    key,
    label: key,
    type: 'text' as const,
    defaultValue: inputTemplate?.[key],
    acceptsPills: true,
  }));
}

function outputTypeOf(v: any): ActionOutputField['type'] {
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (v && typeof v === 'object') return 'object';
  return 'string';
}

function defaultExampleFor(type: ActionOutputField['type']): any {
  switch (type) {
    case 'number':
      return 0;
    case 'boolean':
      return true;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return 'sample';
  }
}

/** 出参：优先 outputSchema；其次 outputKeys / outputParameters 的 key（后者是输出模板，其 key 即对外接口） */
export function buildOutputs(
  schema: SchemaDef | undefined,
  fallbackKeys: string[],
  outputTemplate?: Record<string, any>
): ActionOutputField[] {
  const doc = getSchemaDoc(schema);
  if (doc) {
    return Object.entries(doc.properties).map(([key, prop]) => {
      const t = primaryType(prop || {});
      const type: ActionOutputField['type'] =
        t === 'integer' ? 'number' : (['string', 'number', 'boolean', 'object', 'array'].includes(t) ? (t as any) : 'string');
      return {
        key,
        label: prop?.title || key,
        type,
        description: prop?.description,
        example: Array.isArray(prop?.examples) && prop.examples.length > 0 ? prop.examples[0] : defaultExampleFor(type),
      };
    });
  }

  const keys = Array.from(new Set([...fallbackKeys, ...Object.keys(outputTemplate || {})]));
  return keys.map((key) => {
    const tplVal = outputTemplate?.[key];
    // 模板值若是 ${...} 表达式，无法得知真实类型，按 string 处理
    const isExpr = typeof tplVal === 'string' && tplVal.includes('${');
    const type = isExpr || tplVal === undefined ? 'string' : outputTypeOf(tplVal);
    return {
      key,
      label: key,
      type,
      example: isExpr || tplVal === undefined ? defaultExampleFor(type) : tplVal,
    };
  });
}

function applyOverrides<T extends { key: string }>(items: T[], overrides?: Record<string, Partial<T>>): T[] {
  if (!overrides) return items;
  return items.map((it) => (overrides[it.key] ? { ...it, ...overrides[it.key], key: it.key } : it));
}

/**
 * 按声明类型把表单值还原为 Conductor 入参：
 * 数字文本转数字、JSON 文本转对象；`${...}` 表达式（数据胶囊）原样保留。
 */
function coerceValues(values: Record<string, any>, fields: ActionField[], types: Record<string, string>): Record<string, any> {
  const out: Record<string, any> = {};
  const fieldKeys = new Set(fields.map((f) => f.key));
  for (const [k, v] of Object.entries(values || {})) {
    if (!fieldKeys.has(k) || typeof v !== 'string' || v.includes('${')) {
      out[k] = v;
      continue;
    }
    const t = types[k];
    if (t === 'number' || t === 'integer') {
      out[k] = v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
    } else if (t === 'object' || t === 'array') {
      try {
        out[k] = JSON.parse(v);
      } catch {
        out[k] = v;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

function declaredTypes(schema?: SchemaDef): Record<string, string> {
  const doc = getSchemaDoc(schema);
  const out: Record<string, string> = {};
  if (doc) {
    for (const [k, p] of Object.entries(doc.properties)) out[k] = primaryType(p || {});
  }
  return out;
}

function mockFromOutputs(outputs: ActionOutputField[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const o of outputs) out[o.key] = o.example !== undefined ? o.example : defaultExampleFor(o.type);
  return out;
}

// ── 流程库能力（WorkflowDef → SUB_WORKFLOW 动作） ───────────────────────────

/**
 * 把流程库中的一个工作流定义生成为动作：业务用户只面对入参表单与出参，
 * 编译为 SUB_WORKFLOW 引用。版本由步骤上的 libraryRef 决定（首次引用时固定）。
 * 被 extension.hidden 标记时返回 null。
 */
export function buildActionFromWorkflowDef(def: WorkflowDef, ext: ActionExtension = {}): ActionDefinition | null {
  if (ext.hidden) return null;

  const inputKeys = parseWorkflowInputParams(def.inputParameters as any[]).map((p) => p.name);
  const fields = applyOverrides(buildFields(def.inputSchema, inputKeys, def.inputTemplate), ext.fieldOverrides);
  const outputs = applyOverrides(
    buildOutputs(def.outputSchema, [], def.outputParameters),
    ext.outputOverrides
  );
  const types = declaredTypes(def.inputSchema);
  const latestVersion = def.version ?? 1;

  return {
    id: `wf.${def.name}`,
    name: ext.label || def.name,
    category: ext.category || 'custom',
    icon: ext.icon || 'puzzle',
    description: ext.description || def.description || '',
    connector: ext.connector,
    kind: 'workflow',
    workflowRef: { name: def.name, version: latestVersion },
    level: ext.level,
    ...(ext.domain ? { domain: ext.domain } : {}),
    tags: ext.tags,
    ownerEmail: def.ownerEmail,
    riskLevel: ext.riskLevel || 'safe',
    fields,
    outputs,
    compile: (values, ctx) => {
      const pinned = ctx.libraryRef?.name === def.name ? ctx.libraryRef.version : undefined;
      return {
        name: def.name,
        taskReferenceName: ctx.taskReferenceName,
        type: 'SUB_WORKFLOW',
        description: ext.label || def.description,
        inputParameters: coerceValues(values, fields, types),
        subWorkflowParam: {
          name: def.name,
          // 已记录版本则固定；未记录（沿用原定义）则不显式指定，保持原语义
          ...(pinned !== undefined ? { version: pinned } : {}),
        },
      } as TaskDef;
    },
    decompile: (task) => {
      if (task.type === 'SUB_WORKFLOW' && task.subWorkflowParam?.name === def.name) {
        return { ...(task.inputParameters || {}) };
      }
      return null;
    },
    mockOutput: () => mockFromOutputs(outputs),
  };
}

// ── 原子任务（已注册 TaskDef → SIMPLE 动作） ────────────────────────────────

/** 已注册任务定义生成原子动作，编译为同名 SIMPLE 任务。 */
export function buildActionFromTaskDef(def: RegisteredTaskDef, ext: ActionExtension = {}): ActionDefinition | null {
  if (ext.hidden) return null;

  const fields = applyOverrides(buildFields(def.inputSchema, def.inputKeys || [], def.inputTemplate), ext.fieldOverrides);
  const outputs = applyOverrides(buildOutputs(def.outputSchema, def.outputKeys || []), ext.outputOverrides);
  const types = declaredTypes(def.inputSchema);

  return {
    id: `task.${def.name}`,
    name: ext.label || def.name,
    category: ext.category || 'custom',
    icon: ext.icon || 'settings',
    description: ext.description || def.description || '',
    connector: ext.connector,
    kind: 'task',
    level: ext.level,
    ...(ext.domain ? { domain: ext.domain } : {}),
    tags: ext.tags,
    ownerEmail: def.ownerEmail,
    riskLevel: ext.riskLevel || 'safe',
    fields,
    outputs,
    compile: (values, ctx) =>
      ({
        name: def.name,
        taskReferenceName: ctx.taskReferenceName,
        type: 'SIMPLE',
        description: ext.label || def.description,
        inputParameters: coerceValues(values, fields, types),
      }) as TaskDef,
    decompile: (task) => {
      if (task.type === 'SIMPLE' && task.name === def.name) {
        return { ...(task.inputParameters || {}) };
      }
      return null;
    },
    mockOutput: () => mockFromOutputs(outputs),
  };
}

// ── 批量构建 ────────────────────────────────────────────────────────────────

export interface LibraryWorkflowEntry {
  workflowDef: WorkflowDef;
  extension?: ActionExtension;
}

export interface RegisteredTaskEntry {
  taskDef: RegisteredTaskDef;
  extension?: ActionExtension;
}

/** 批量生成流程库动作（自动跳过 hidden） */
export function buildActionsFromLibrary(entries: LibraryWorkflowEntry[]): ActionDefinition[] {
  return entries
    .map((e) => buildActionFromWorkflowDef(e.workflowDef, e.extension))
    .filter((a): a is ActionDefinition => a !== null);
}

/** 批量生成原子任务动作（自动跳过 hidden） */
export function buildActionsFromTaskDefs(entries: RegisteredTaskEntry[]): ActionDefinition[] {
  return entries
    .map((e) => buildActionFromTaskDef(e.taskDef, e.extension))
    .filter((a): a is ActionDefinition => a !== null);
}
