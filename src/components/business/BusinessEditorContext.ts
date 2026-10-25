import { createContext, useContext } from 'react';
import type { BusinessStep } from '../../stepmodel/types';
import type { StepIssueMap } from '../../stepmodel/validate';
import type { LibraryCatalog } from '../../library/catalog';
import type { ActionDefinition } from '../../actions/types';

/** 打开动作选择器时的上下文说明（如"分支 VIP · 第 2 步"），替代固定的"第 N 步" */
export interface InsertPickerInfo {
  label?: string;
}

/** 打开动作选择器，选中动作后执行 callback（在分支 / 泳道 / 循环体内插入时使用） */
export type OpenInsertModal = (callback: (action: ActionDefinition) => void, info?: InsertPickerInfo) => void;

/**
 * 业务卡片视图的共享上下文：由 StepFlowEditor 提供，嵌套卡片按需读取，避免层层透传。
 * 卡片在 StepFlowEditor 之外单独使用时取默认值，行为与之前一致。
 */
export interface BusinessEditorContextValue {
  /** 工作流全局入参声明（数据胶囊选择器中的"工作流全局入参"分组） */
  workflowInputParams?: any[];
  /** 按 taskReferenceName 归类的校验问题 */
  issues: StepIssueMap;
  /** 最近一次试跑的各步骤状态 */
  runStatus?: Record<string, string>;
  /** 删除等操作的确认（StepFlowEditor 提供统一的确认弹窗） */
  confirm?: (message: string, confirmLabel?: string) => Promise<boolean>;
  libraryCatalog?: LibraryCatalog;
  /** 顶层全部步骤（用于判断某步骤输出是否被下游引用） */
  allSteps: BusinessStep[];
  /** 定位请求：嵌套卡片据此切换到对应分支 / 展开对应步骤 */
  focusRequest?: { ref: string; nonce: number } | null;
}

export const BusinessEditorContext = createContext<BusinessEditorContextValue>({ issues: {}, allSteps: [] });

export const useBusinessEditor = () => useContext(BusinessEditorContext);

/** 步骤卡片的 DOM id（定位步骤时滚动到此处） */
export const stepDomId = (ref: string) => `cm-step-${ref}`;

/** 递归判断 ref 是否在步骤列表（含嵌套）中 */
export function containsStepRef(steps: BusinessStep[], ref: string): boolean {
  return steps.some(
    (s) =>
      s.taskReferenceName === ref ||
      containsStepRef(s.loopSteps || [], ref) ||
      (s.branches || []).some((b) => containsStepRef(b.steps, ref)) ||
      (s.forkLanes || []).some((l) => containsStepRef(l.steps, ref))
  );
}
