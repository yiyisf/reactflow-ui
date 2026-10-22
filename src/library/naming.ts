import type { WorkflowLevel } from '../types/workflowLibrary';

/**
 * 治理平台的流程命名规范：`类型-层级-业务域-产品-功能`，以 `-` 分隔。
 * - 类型：std（通用）/ proxy（代理）/ tmp（临时，自动清理）/ custom（自定义）
 * - 层级：L1 / L2 / L3
 * - 业务域：来自全局可调整的列表（由服务端提供，这里不写死，只当字符串处理）
 * - 产品：自由名称（内部不含 `-`）
 * - 功能：第 4 个 `-` 之后的全部内容（自身可含 `-`）
 */

export type WorkflowNameType = 'std' | 'proxy' | 'tmp' | 'custom';

export interface ParsedWorkflowName {
  type: WorkflowNameType;
  level: WorkflowLevel;
  domain: string;
  product: string;
  func: string;
}

export const WORKFLOW_NAME_TYPES: readonly WorkflowNameType[] = ['std', 'proxy', 'tmp', 'custom'];
const LEVELS: readonly WorkflowLevel[] = ['L1', 'L2', 'L3'];

/**
 * 解析流程名称。段数不足 5、类型或层级不合法时返回 null（不抛错）。
 * 业务域 / 产品 / 功能只做切分，不在此校验是否为空或是否在白名单内（见 validateWorkflowName）。
 */
export function parseWorkflowName(name: string): ParsedWorkflowName | null {
  if (typeof name !== 'string') return null;
  const parts = name.split('-');
  if (parts.length < 5) return null;
  const type = parts[0] as WorkflowNameType;
  const level = parts[1] as WorkflowLevel;
  if (!WORKFLOW_NAME_TYPES.includes(type)) return null;
  if (!LEVELS.includes(level)) return null;
  return { type, level, domain: parts[2], product: parts[3], func: parts.slice(4).join('-') };
}

/**
 * 校验流程名称，返回中文错误列表（空数组 = 合法）。
 * 仅当提供 allowedDomains 时才校验业务域是否在列表内。
 */
export function validateWorkflowName(name: string, allowedDomains?: string[]): string[] {
  const errors: string[] = [];
  if (typeof name !== 'string' || name.trim() === '') return ['流程名称不能为空'];
  const parts = name.split('-');
  if (parts.length < 5) {
    errors.push('流程名称需为「类型-层级-业务域-产品-功能」5 段，以 - 分隔');
  }
  if (!WORKFLOW_NAME_TYPES.includes(parts[0] as WorkflowNameType)) {
    errors.push(`类型「${parts[0]}」不合法，应为 ${WORKFLOW_NAME_TYPES.join(' / ')} 之一`);
  }
  if (parts.length > 1 && !LEVELS.includes(parts[1] as WorkflowLevel)) {
    errors.push(`层级「${parts[1]}」不合法，应为 L1 / L2 / L3 之一`);
  }
  if (parts.length >= 5) {
    if (parts[2] === '') errors.push('业务域不能为空');
    else if (allowedDomains && !allowedDomains.includes(parts[2])) {
      errors.push(`业务域「${parts[2]}」不在允许的列表中（${allowedDomains.join('、')}）`);
    }
    if (parts[3] === '') errors.push('产品不能为空');
    if (parts.slice(4).join('-') === '') errors.push('功能不能为空');
  }
  return errors;
}
