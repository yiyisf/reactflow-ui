import type { BusinessStep } from './types';
import type { ActionRegistry } from '../actions/registry';
import type { WorkflowInputParam } from '../types/conductor';

export interface PillItem {
  /** 引用路径（不含 `${}`），如 "create_vm.output.instanceId" */
  rawRef: string;
  label: string;
  type: string;
  example?: any;
  /** 来源步骤的展示名 */
  stepLabel: string;
}

export interface PillGroup {
  /** 分组唯一键（来源引用名） */
  key: string;
  title: string;
  icon: string;
  /** 取值说明，如"仅在分支 A 命中时有值" */
  note?: string;
  items: PillItem[];
}

/** 并行组配对的 JOIN 引用名（与编译时补全的 JOIN 一致） */
export const joinRefOf = (step: BusinessStep): string => step.pairedJoinTaskRef || `join_${step.taskReferenceName}`;

/**
 * 生成数据胶囊选择器的可选项：
 * - 工作流全局入参
 * - 上游普通步骤的输出
 * - 上游控制流内部（分支 / 泳道 / 循环体，任意层级）的步骤输出，并说明何时有值
 * - 并行组引用其 JOIN 的汇聚输出；循环引用其已执行轮次
 */
export function buildPillGroups(
  upstreamSteps: BusinessStep[],
  registry: ActionRegistry,
  workflowInputParams?: any[]
): PillGroup[] {
  const groups: PillGroup[] = [];

  // 兼容 string[] 旧格式、WorkflowInputParam[] 新格式以及二者混用
  const inputs: WorkflowInputParam[] = (workflowInputParams || [])
    .map((p) => (typeof p === 'string' ? { name: p } : p))
    .filter((p): p is WorkflowInputParam => !!p && typeof p.name === 'string' && p.name !== '');
  if (inputs.length > 0) {
    groups.push({
      key: 'workflow.input',
      title: '工作流全局入参',
      icon: 'globe',
      items: inputs.map((p) => ({
        rawRef: `workflow.input.${p.name}`,
        label: p.description || p.name,
        type: p.type || 'string',
        example: p.example ?? p.defaultValue,
        stepLabel: '全局入参',
      })),
    });
  }

  const visit = (step: BusinessStep, title: string, note?: string) => {
    const action = registry.getAction(step.actionId);
    const stepLabel = step.name || action?.name || step.taskReferenceName;

    if (step.controlType === 'decision') {
      for (const b of step.branches || []) {
        const branchName = b.caseKey === '__default__' ? '默认分支' : `分支 ${b.caseKey}`;
        for (const child of b.steps) {
          visit(child, `${stepLabel} › ${branchName} › ${child.name || child.taskReferenceName}`, `仅在${branchName}被执行时有值`);
        }
      }
      return;
    }

    if (step.controlType === 'fork') {
      groups.push({
        key: joinRefOf(step),
        title: `${title}（并行汇聚）`,
        icon: 'zap',
        note,
        items: [
          {
            rawRef: `${joinRefOf(step)}.output`,
            label: '各泳道最后一步的输出',
            type: 'object',
            stepLabel,
          },
        ],
      });
      (step.forkLanes || []).forEach((lane, li) => {
        for (const child of lane.steps) {
          visit(child, `${stepLabel} › 泳道 ${li + 1} › ${child.name || child.taskReferenceName}`, note);
        }
      });
      return;
    }

    if (step.controlType === 'loop') {
      groups.push({
        key: step.taskReferenceName,
        title,
        icon: 'repeat',
        note,
        items: [{ rawRef: `${step.taskReferenceName}.output.iteration`, label: '已执行轮次', type: 'number', stepLabel }],
      });
      for (const child of step.loopSteps || []) {
        visit(child, `${stepLabel} › 循环体 › ${child.name || child.taskReferenceName}`, '循环体内的步骤，取最后一轮的值');
      }
      return;
    }

    const items: PillItem[] =
      action && action.outputs.length > 0
        ? action.outputs.map((out) => ({
            rawRef: `${step.taskReferenceName}.output.${out.key}`,
            label: out.label,
            type: out.type,
            example: out.example,
            stepLabel,
          }))
        : [{ rawRef: `${step.taskReferenceName}.output`, label: '完整输出对象', type: 'object', stepLabel }];

    groups.push({ key: step.taskReferenceName, title, icon: action?.icon || 'settings', note, items });
  };

  upstreamSteps.forEach((step, i) => {
    const action = registry.getAction(step.actionId);
    visit(step, `#${i + 1} ${step.name || action?.name || step.taskReferenceName}`);
  });

  return groups;
}

/** 把 `${...}` 内的引用翻译成可读标签；找不到时退回较通用的说明 */
export function describePillRef(ref: string, groups: PillGroup[]): string {
  for (const g of groups) {
    const hit = g.items.find((it) => it.rawRef === ref);
    if (hit) return g.key === 'workflow.input' ? `全局入参 · ${hit.label}` : `${hit.stepLabel} · ${hit.label}`;
  }
  if (ref.startsWith('workflow.input.')) return `全局入参 · ${ref.slice('workflow.input.'.length)}`;
  for (const g of groups) {
    const owner = g.items[0];
    const base = owner?.rawRef.split('.output')[0];
    if (owner && base && ref.startsWith(`${base}.output`)) return `${owner.stepLabel} 输出`;
  }
  return ref;
}
