import type { WorkflowDef } from '../types/conductor';
import type { WorkflowLevel } from '../types/workflowLibrary';
import { parseWorkflowName, validateWorkflowName } from '../library/naming';
import type { WorkflowNameType } from '../library/naming';

/**
 * 自助接入的命名辅助：纯函数，不依赖 React，可直接单测。
 * 命名规范：`类型-层级-业务域-产品-功能`（见 src/library/naming.ts）。
 */

/** 申请上线时可选的目标类型 */
export type PromotionTargetType = 'custom' | 'std';

/** 五段式名称的各段 */
export interface WorkflowNameParts {
  type: WorkflowNameType;
  level: WorkflowLevel;
  domain: string;
  product: string;
  func: string;
}

/** 业务域 / 产品段不允许包含 `-`（会破坏五段切分），同时去掉首尾空白 */
function cleanSegment(s: string): string {
  return (s ?? '').replace(/-/g, '').trim();
}

/** 拼出完整流程名称。业务域 / 产品段会被去掉 `-`；功能段保持原样（仅去首尾空白，允许含 `-`） */
export function buildWorkflowName(parts: WorkflowNameParts): string {
  return [parts.type, parts.level, cleanSegment(parts.domain), cleanSegment(parts.product), (parts.func ?? '').trim()].join('-');
}

/** 校验各段拼出的名称（空段会得到「xx不能为空」类错误），业务域白名单可选 */
export function validateNameParts(parts: WorkflowNameParts, allowedDomains?: string[]): string[] {
  return validateWorkflowName(buildWorkflowName(parts), allowedDomains);
}

const CJK = /[㐀-鿿]/;

/**
 * 由用户输入的功能说明建议「功能」段：
 * - 含中文：保持原样，仅去掉 `-`（避免破坏分段），空白折叠为 `_`；
 * - 纯 ASCII：转小写 snake_case（驼峰拆词，连字符 / 空格 / 其他符号折叠为 `_`）。
 */
export function suggestFuncSlug(text: string): string {
  const raw = (text ?? '').trim();
  if (!raw) return '';
  if (CJK.test(raw)) {
    return raw.replace(/-/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  }
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * 申请上线后的正式名称：把类型段（第一段）替换为目标类型。
 * 名称不符合五段规范时返回 null。
 */
export function promotionTargetName(tmpName: string, targetType: PromotionTargetType): string | null {
  const parsed = parseWorkflowName(tmpName);
  if (!parsed) return null;
  const idx = tmpName.indexOf('-');
  return `${targetType}${tmpName.slice(idx)}`;
}

/** 当前流程名称是否是可申请上线的临时流程（类型段为 tmp） */
export function isPromotableName(name: string | undefined | null): boolean {
  if (!name) return false;
  return parseWorkflowName(name)?.type === 'tmp';
}

export interface SkeletonInput {
  name: string;
  description?: string;
  ownerEmail?: string;
}

/** 向导生成的骨架定义：version 1 / schemaVersion 2，空任务 */
export function buildSkeletonWorkflow(input: SkeletonInput): WorkflowDef {
  const def: WorkflowDef = {
    name: input.name,
    description: (input.description ?? '').trim(),
    version: 1,
    schemaVersion: 2,
    tasks: [],
    inputParameters: [],
    outputParameters: {},
  };
  if (input.ownerEmail) def.ownerEmail = input.ownerEmail;
  return def;
}

/**
 * 保存前的命名提示（设计 3.3，R15）：名称不符合五段规范时返回一句提示，符合时返回 null。
 * 只提示、不阻断保存；服务端做权威校验。
 */
export function saveNameHint(name: string | undefined | null, allowedDomains?: string[]): string | null {
  const errors = validateWorkflowName(name ?? '', allowedDomains && allowedDomains.length > 0 ? allowedDomains : undefined);
  if (errors.length === 0) return null;
  const shown = name && name.trim() ? `流程名称「${name}」` : '流程名称';
  return `已保存。${shown}不符合命名规范：${errors.join('；')}。申请上线前请在流程设置里改名。`;
}
