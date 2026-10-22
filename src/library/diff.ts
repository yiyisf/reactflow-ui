import type { WorkflowDef } from '../types/conductor';
import { parseWorkflowInputParams } from '../types/conductor';
import type { ActionField } from '../actions/types';
import { buildFields, buildOutputs } from '../actions/fromDefinitions';

/**
 * 流程库能力升级差异（纯函数）：对比旧、新两个版本的入参 / 出参，
 * 让用户在确认升级前看清「哪些已填内容会受影响」。
 */

export interface InputChange {
  key: string;
  /** 旧版本的类型描述，如「数字，必填」「可选值 a|b」 */
  from: string;
  /** 新版本的类型描述 */
  to: string;
  /** 该入参是否已填写过值（类型变化后已填值可能不再有效） */
  valueFilled: boolean;
}

export interface WorkflowVersionDiff {
  /** 新增入参（field.required 标出必填） */
  addedInputs: ActionField[];
  /** 删除的入参 */
  removedInputs: ActionField[];
  /** 类型 / 枚举 / 必填变化 */
  changedInputs: InputChange[];
  addedOutputs: string[];
  removedOutputs: string[];
  /** removedInputs 中已填值的 key：升级后这些值将丢失 */
  lostValueKeys: string[];
  /** removedOutputs 中被其它步骤引用的 key：升级后下游引用将失效 */
  brokenOutputRefs: string[];
}

export interface DiffOptions {
  /** 其它步骤中引用了本步骤哪些出参 key（见 collectReferencedOutputKeys）；缺省视为没有引用 */
  referencedOutputs?: Iterable<string>;
}

function isFilled(v: unknown): boolean {
  return v !== undefined && v !== null && v !== '';
}

function describeField(f: ActionField): string {
  let base: string;
  switch (f.type) {
    case 'select':
      base = `可选值 ${(f.options ?? []).map((o) => String(o.value)).join('|')}`;
      break;
    case 'number':
      base = '数字';
      break;
    case 'boolean':
      base = '布尔';
      break;
    default:
      base = '文本';
  }
  return f.required ? `${base}，必填` : base;
}

function inputFieldsOf(def: WorkflowDef): ActionField[] {
  const keys = parseWorkflowInputParams(def.inputParameters as any[]).map((p) => p.name);
  return buildFields(def.inputSchema, keys, def.inputTemplate);
}

function outputKeysOf(def: WorkflowDef): string[] {
  return buildOutputs(def.outputSchema, [], def.outputParameters).map((o) => o.key);
}

/**
 * @param oldDef       步骤当前固定版本的定义
 * @param newDef       目录最新版本的定义
 * @param filledValues 步骤上已填写的入参值
 */
export function diffWorkflowVersions(
  oldDef: WorkflowDef,
  newDef: WorkflowDef,
  filledValues: Record<string, unknown> = {},
  options: DiffOptions = {},
): WorkflowVersionDiff {
  const oldInputs = new Map(inputFieldsOf(oldDef).map((f) => [f.key, f]));
  const newInputs = new Map(inputFieldsOf(newDef).map((f) => [f.key, f]));

  const addedInputs: ActionField[] = [];
  const removedInputs: ActionField[] = [];
  const changedInputs: InputChange[] = [];

  for (const [key, f] of newInputs) {
    const prev = oldInputs.get(key);
    if (!prev) {
      addedInputs.push(f);
      continue;
    }
    const from = describeField(prev);
    const to = describeField(f);
    if (from !== to) changedInputs.push({ key, from, to, valueFilled: isFilled(filledValues[key]) });
  }
  for (const [key, f] of oldInputs) {
    if (!newInputs.has(key)) removedInputs.push(f);
  }

  const oldOutputs = outputKeysOf(oldDef);
  const newOutputs = outputKeysOf(newDef);
  const addedOutputs = newOutputs.filter((k) => !oldOutputs.includes(k));
  const removedOutputs = oldOutputs.filter((k) => !newOutputs.includes(k));

  const referenced = new Set(options.referencedOutputs ?? []);

  return {
    addedInputs,
    removedInputs,
    changedInputs,
    addedOutputs,
    removedOutputs,
    lostValueKeys: removedInputs.filter((f) => isFilled(filledValues[f.key])).map((f) => f.key),
    brokenOutputRefs: removedOutputs.filter((k) => referenced.has(k)),
  };
}

/** 没有任何入参 / 出参变化 */
export function isDiffEmpty(diff: WorkflowVersionDiff): boolean {
  return (
    diff.addedInputs.length === 0 &&
    diff.removedInputs.length === 0 &&
    diff.changedInputs.length === 0 &&
    diff.addedOutputs.length === 0 &&
    diff.removedOutputs.length === 0
  );
}

/**
 * 在若干结构（其它步骤的入参值等）中查找对 `${ref.output.<key>...}` 的引用，返回被引用的出参 key。
 * 用于判断升级删除某个出参后，下游引用是否会失效。
 */
export function collectReferencedOutputKeys(taskReferenceName: string, parts: unknown[]): Set<string> {
  const escaped = taskReferenceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\$\\{\\s*${escaped}\\.output\\.([^.\\s}\\[\\]]+)`, 'g');
  const found = new Set<string>();
  const seen = new Set<unknown>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(v)) !== null) found.add(m[1]);
      return;
    }
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    for (const child of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) walk(child);
  };
  for (const p of parts) walk(p);
  return found;
}

export interface DiffSummary {
  /** 会影响已填内容的条目（置顶显示） */
  impacts: string[];
  /** 其它变化 */
  changes: string[];
}

function labelOf(f: ActionField): string {
  return f.label && f.label !== f.key ? `${f.label}（${f.key}）` : f.key;
}

/** 把差异整理为面向用户的文字条目：会影响已填内容的置顶 */
export function summarizeDiff(diff: WorkflowVersionDiff): DiffSummary {
  const impacts: string[] = [];
  const changes: string[] = [];

  for (const f of diff.removedInputs) {
    if (diff.lostValueKeys.includes(f.key)) impacts.push(`入参「${labelOf(f)}」已删除，已填写的值将丢失`);
    else changes.push(`入参「${labelOf(f)}」已删除`);
  }
  for (const key of diff.removedOutputs) {
    if (diff.brokenOutputRefs.includes(key)) impacts.push(`出参「${key}」已删除，下游步骤对它的引用将失效`);
    else changes.push(`出参「${key}」已删除`);
  }
  for (const c of diff.changedInputs) {
    const text = `入参「${c.key}」由「${c.from}」变为「${c.to}」`;
    if (c.valueFilled) impacts.push(`${text}，已填写的值可能不再有效`);
    else changes.push(text);
  }
  for (const f of diff.addedInputs) {
    if (f.required) impacts.push(`新增必填入参「${labelOf(f)}」，需要补充填写`);
    else changes.push(`新增入参「${labelOf(f)}」`);
  }
  for (const key of diff.addedOutputs) changes.push(`新增出参「${key}」`);

  return { impacts, changes };
}

/** 升级确认框文案（含升级差异）。无差异时提示「入参出参未变化」。 */
export function buildUpgradeConfirmMessage(
  name: string,
  pinned: number | undefined,
  latest: number,
  diff: WorkflowVersionDiff,
): string {
  const head = `流程库「${name}」已有新版本 v${latest}（当前引用 v${pinned ?? '?'}）。`;
  if (isDiffEmpty(diff)) {
    return `${head}\n入参出参未变化。确定升级吗？`;
  }
  const { impacts, changes } = summarizeDiff(diff);
  const lines = [head, '升级差异：'];
  if (impacts.length > 0) {
    lines.push('【会影响已填内容】', ...impacts.map((s) => `· ${s}`));
  }
  if (changes.length > 0) {
    lines.push('【其它变化】', ...changes.map((s) => `· ${s}`));
  }
  lines.push('确定升级吗？');
  return lines.join('\n');
}

/**
 * 升级后调整步骤已填的入参值：
 * - 删除的入参：移除其值（与差异中「值将丢失」一致）
 * - 新增且有默认值的入参：补上默认值（用户已填的不覆盖）
 */
export function applyUpgradeToValues(values: Record<string, any>, diff: WorkflowVersionDiff): Record<string, any> {
  const next: Record<string, any> = { ...values };
  for (const f of diff.removedInputs) delete next[f.key];
  for (const f of diff.addedInputs) {
    if (f.defaultValue !== undefined && next[f.key] === undefined) next[f.key] = f.defaultValue;
  }
  return next;
}
