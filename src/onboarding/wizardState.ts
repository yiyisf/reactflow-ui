import type { WorkflowLevel } from '../types/workflowLibrary';
import type { ProductInfo } from '../providers/types';
import type { WorkflowNameType } from '../library/naming';
import { validateNameParts } from './naming';
import type { WorkflowNameParts } from './naming';

/** 向导步骤：产品 → 命名 → 起点 */
export type WizardStep = 'product' | 'naming' | 'start';
export const WIZARD_STEPS: readonly WizardStep[] = ['product', 'naming', 'start'];
export const WIZARD_STEP_LABEL: Record<WizardStep, string> = {
  product: '产品',
  naming: '命名',
  start: '起点',
};

export type StartSource = 'blank' | 'template' | 'import';

export interface WizardDraft {
  /** existing：选择已有产品；new：登记新产品（仅试用环境） */
  productMode: 'existing' | 'new';
  productName: string;
  domain: string;
  systemCode: string;
  type: WorkflowNameType;
  level: WorkflowLevel;
  func: string;
  description: string;
  source: StartSource;
}

export interface WizardContextLite {
  trial: boolean;
  products: ProductInfo[];
}

/** 初始草稿：有产品时默认选第一个；没有产品时（试用环境）进入登记模式 */
export function createInitialDraft(ctx: WizardContextLite, level: WorkflowLevel = 'L2'): WizardDraft {
  const first = ctx.products[0];
  return {
    productMode: first ? 'existing' : 'new',
    productName: first?.name ?? '',
    domain: first?.domain ?? '',
    systemCode: '',
    // 试用环境固定 tmp；生产默认 custom（可改 std）
    type: ctx.trial ? 'tmp' : 'custom',
    level,
    func: '',
    description: '',
    source: 'blank',
  };
}

/** 产品名规则：非空、不含 `-` 与空白（会破坏五段切分） */
export function validateProductName(name: string): string | null {
  const n = (name ?? '').trim();
  if (!n) return '请填写产品名称';
  if (/-/.test(n)) return '产品名称不能包含「-」';
  if (/\s/.test(n)) return '产品名称不能包含空白字符';
  return null;
}

/** 第 1 步的校验错误（null = 可继续） */
export function productStepError(draft: WizardDraft, ctx: WizardContextLite, domains: string[]): string | null {
  if (draft.productMode === 'existing') {
    return ctx.products.some((p) => p.name === draft.productName) ? null : '请选择一个所属产品';
  }
  if (!ctx.trial) return '当前环境不开放自助试用，请选择已有产品';
  const e = validateProductName(draft.productName);
  if (e) return e;
  if (!draft.domain) return '请选择业务域';
  if (domains.length > 0 && domains.indexOf(draft.domain) < 0) return `业务域「${draft.domain}」不在允许的列表中`;
  return null;
}

/** 草稿 → 五段名称 */
export function draftToNameParts(draft: WizardDraft, trial: boolean): WorkflowNameParts {
  return {
    type: trial ? 'tmp' : draft.type,
    level: draft.level,
    domain: draft.domain,
    product: draft.productName,
    func: draft.func,
  };
}

/** 第 2 步的校验错误列表 */
export function namingStepErrors(draft: WizardDraft, trial: boolean, domains: string[]): string[] {
  return validateNameParts(draftToNameParts(draft, trial), domains.length > 0 ? domains : undefined);
}

/** 当前步骤是否允许进入下一步 */
export function canAdvance(step: WizardStep, draft: WizardDraft, ctx: WizardContextLite, domains: string[]): boolean {
  if (step === 'product') return productStepError(draft, ctx, domains) === null;
  if (step === 'naming') return namingStepErrors(draft, ctx.trial, domains).length === 0;
  return true;
}

export function nextStep(step: WizardStep): WizardStep {
  const i = WIZARD_STEPS.indexOf(step);
  return WIZARD_STEPS[Math.min(i + 1, WIZARD_STEPS.length - 1)];
}

export function prevStep(step: WizardStep): WizardStep {
  const i = WIZARD_STEPS.indexOf(step);
  return WIZARD_STEPS[Math.max(i - 1, 0)];
}

/** 可选的起点：未提供对应回调时隐藏该选项（空白始终可用） */
export function availableSources(opts: { hasTemplate: boolean; hasImport: boolean }): StartSource[] {
  const out: StartSource[] = ['blank'];
  if (opts.hasTemplate) out.push('template');
  if (opts.hasImport) out.push('import');
  return out;
}
