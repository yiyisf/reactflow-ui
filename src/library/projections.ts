import type { ActionCategory, ActionDefinition } from '../actions/types';
import {
  buildActionFromTaskDef,
  buildActionFromWorkflowDef,
  type ActionExtension,
} from '../actions/fromDefinitions';
import type { SchemaDef, WorkflowDef } from '../types/conductor';
import { parseWorkflowInputParams } from '../types/conductor';
import type { WorkflowLevel, WorkflowLibraryItem } from '../types/workflowLibrary';
import type { TaskSchema } from '../services/ai/schemaRegistry';
import type { LibraryCatalog } from './catalog';
import type { LibraryExtension } from './types';
import { canCallLevel } from './level';

/**
 * 投影：同一份目录数据，转成三种消费形态。
 * - toActions        业务模式动作选择器（ActionRegistry）
 * - toTaskSchemas    AI 系统提示词 / W-LSP 引用校验（schemaRegistry）
 * - toLibraryItems   AI 目录 / 检索工具 / LibraryPanel（libraryStore）
 */

const ACTION_CATEGORIES: ActionCategory[] = ['compute', 'storage', 'network', 'monitor', 'notify', 'logic', 'human', 'custom'];

/** LibraryExtension → ActionExtension（extension.action 中的显式设置优先） */
export function toActionExtension(ext?: LibraryExtension): ActionExtension {
  if (!ext) return {};
  const category = ACTION_CATEGORIES.includes(ext.category as ActionCategory) ? (ext.category as ActionCategory) : undefined;
  return {
    ...(ext.displayName ? { label: ext.displayName } : {}),
    ...(category ? { category } : {}),
    ...(ext.icon ? { icon: ext.icon } : {}),
    ...(ext.level ? { level: ext.level } : {}),
    ...(ext.tags ? { tags: ext.tags } : {}),
    ...(ext.action ?? {}),
  };
}

/**
 * 目录 → 动作。只投影 Provider 提供的条目（静态 workflowLibrary 条目只有摘要，没有入参定义，
 * 不进入业务模式动作库，以保持原有 `actions` 行为不变）。
 * 已下线条目仍会生成动作（已引用的步骤需要照常显示与编译），但带 `deprecated` 标记，选择器会隐藏。
 */
export function toActions(catalog: LibraryCatalog): ActionDefinition[] {
  const out: ActionDefinition[] = [];
  for (const entry of catalog.entries()) {
    if (entry.source !== 'provider') continue;
    const def: WorkflowDef = { ...entry.record.def, version: entry.version };
    const action = buildActionFromWorkflowDef(def, toActionExtension(entry.record.extension));
    if (!action) continue;
    out.push(entry.deprecated ? { ...action, deprecated: true } : action);
  }
  for (const rec of catalog.tasks()) {
    const action = buildActionFromTaskDef(rec.def, toActionExtension(rec.extension));
    if (action) out.push(action);
  }
  return out;
}

// ── Schema → 类型串 ─────────────────────────────────────────────────────────

function typeStringOfProp(prop: any): string {
  if (!prop || typeof prop !== 'object') return 'string';
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum.map((v: unknown) => String(v)).join('|');
  const t = Array.isArray(prop.type) ? prop.type.find((x: string) => x !== 'null') : prop.type;
  if (t === 'array') {
    const it = prop.items && typeof prop.items === 'object' ? typeStringOfProp(prop.items) : 'any';
    return `${it}[]`;
  }
  return t || 'string';
}

/** JSON Schema（Conductor SchemaDef）→ { 字段名: 类型串 }；`enum` 输出为 `a|b`。无可解析的 properties 返回 undefined */
export function schemaToTypeStrings(schema?: SchemaDef): Record<string, string> | undefined {
  if (!schema || (schema.type && schema.type !== 'JSON')) return undefined;
  const props = schema.data && typeof schema.data === 'object' ? (schema.data as any).properties : undefined;
  if (!props || typeof props !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, p] of Object.entries(props)) out[k] = typeStringOfProp(p);
  return Object.keys(out).length > 0 ? out : undefined;
}

function fromKeys(keys: string[]): Record<string, string> | undefined {
  const uniq = Array.from(new Set(keys));
  if (uniq.length === 0) return undefined;
  return Object.fromEntries(uniq.map((k) => [k, 'string']));
}

/**
 * 目录 → 任务 Schema。
 * - 有 inputSchema / outputSchema 时展开 properties；没有时退回 inputKeys / 工作流入参名 / outputKeys / outputParameters 的 key
 * - 同名条目 Provider 优先于静态 `taskSchemas`；静态 Schema 在前，保持原有顺序
 * - 已下线条目不输出（避免 AI 继续引用）
 */
export function toTaskSchemas(catalog: LibraryCatalog): TaskSchema[] {
  const derived: TaskSchema[] = [];
  for (const rec of catalog.tasks()) {
    const d = rec.def;
    derived.push({
      taskName: d.name,
      taskType: 'SIMPLE',
      description: d.description,
      inputSchema: schemaToTypeStrings(d.inputSchema) ?? fromKeys([...(d.inputKeys ?? []), ...Object.keys(d.inputTemplate ?? {})]),
      outputSchema: schemaToTypeStrings(d.outputSchema) ?? fromKeys(d.outputKeys ?? []),
    });
  }
  for (const entry of catalog.entries()) {
    if (entry.source !== 'provider' || entry.deprecated) continue;
    const d = entry.record.def;
    derived.push({
      taskName: entry.name,
      taskType: 'SUB_WORKFLOW',
      description: d.description,
      inputSchema:
        schemaToTypeStrings(d.inputSchema) ??
        fromKeys(parseWorkflowInputParams(d.inputParameters as any[]).map((p) => p.name)),
      outputSchema: schemaToTypeStrings(d.outputSchema) ?? fromKeys(Object.keys(d.outputParameters ?? {})),
    });
  }
  const overridden = new Set(derived.map((s) => s.taskName));
  const statics = catalog.staticTaskSchemas().filter((s) => !overridden.has(s.taskName));
  return [...statics, ...derived];
}

/**
 * 目录 → 旧版 WorkflowLibraryItem。
 * - 未标注层级的条目按 L1 处理（调用规则最保守：只能被同层及更高层引用）
 * - `version` 为字符串以兼容旧类型：静态条目保持原样，Provider 条目输出整数版本（即步骤将固定的版本）
 * - 已下线条目不输出
 */
export function toLibraryItems(catalog: LibraryCatalog): WorkflowLibraryItem[] {
  return catalog
    .entries()
    .filter((e) => !e.deprecated)
    .map((e) => ({
      workflowName: e.name,
      workflowLevel: (e.level ?? 'L1') as WorkflowLevel,
      version: e.source === 'static' ? (e.versionLabel ?? String(e.version)) : String(e.version),
      description: e.description ?? '',
      tags: e.tags,
    }));
}

/**
 * 动作选择器可见性过滤：
 * - 已下线动作隐藏（已引用的步骤仍可通过 registry 正常显示与编译）
 * - 提供 currentLevel 时，隐藏违反分层调用规则的流程库动作（L1 不显示 L2/L3，L2 不显示 L3）；未提供则不按层级过滤
 */
export function filterPickableActions(
  actions: ActionDefinition[],
  opts: { currentLevel?: WorkflowLevel } = {},
): ActionDefinition[] {
  return actions.filter((a) => {
    if (a.deprecated) return false;
    if (opts.currentLevel && a.kind === 'workflow' && !canCallLevel(opts.currentLevel, a.level)) return false;
    return true;
  });
}
