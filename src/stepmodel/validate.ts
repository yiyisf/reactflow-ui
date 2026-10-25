import type { BusinessStep } from './types';
import type { ActionRegistry } from '../actions/registry';
import type { ValidationResults } from '../types/workflow';

export interface StepIssue {
  /** 对应的表单字段 key；为空表示整步的问题 */
  field?: string;
  level: 'error' | 'warning';
  message: string;
}

/** taskReferenceName -> 该步骤的问题列表 */
export type StepIssueMap = Record<string, StepIssue[]>;

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const isExpr = (v: unknown) => typeof v === 'string' && v.includes('${');

function push(map: StepIssueMap, ref: string, issue: StepIssue) {
  (map[ref] ||= []).push(issue);
}

/**
 * 业务模式的步骤校验（纯函数）：必填字段、数字字段、分支判断依据、循环条件、空泳道。
 * 递归检查分支 / 泳道 / 循环体内的步骤。
 */
export function validateBusinessSteps(steps: BusinessStep[], registry: ActionRegistry, map: StepIssueMap = {}): StepIssueMap {
  for (const step of steps) {
    const ref = step.taskReferenceName;

    if (step.controlType === 'decision') {
      if (step.caseExpression !== undefined) {
        if (isBlank(step.caseExpression)) {
          push(map, ref, { level: 'error', message: '判断表达式为空：请填写用于选择分支的表达式' });
        }
      } else if (isBlank(step.caseParam)) {
        push(map, ref, { level: 'error', message: '判断参数名为空：请填写参数名并绑定判断取值' });
      } else if (isBlank(step.values?.[step.caseParam!])) {
        push(map, ref, {
          field: step.caseParam,
          level: 'error',
          message: '判断取值未绑定：请插入用于判断的数据，否则运行时总是走默认分支',
        });
      }
      if (!(step.branches || []).some((b) => b.caseKey !== '__default__')) {
        push(map, ref, { level: 'warning', message: '还没有条件分支：所有情况都会走默认分支，请新增分支' });
      }
      for (const b of step.branches || []) validateBusinessSteps(b.steps, registry, map);
      continue;
    }

    if (step.controlType === 'fork') {
      (step.forkLanes || []).forEach((lane, i) => {
        if (lane.steps.length === 0) {
          push(map, ref, { level: 'error', message: `泳道 ${i + 1} 没有步骤：请添加步骤或删除该泳道` });
        }
        validateBusinessSteps(lane.steps, registry, map);
      });
      continue;
    }

    if (step.controlType === 'loop') {
      if (isBlank(step.loopCondition)) {
        push(map, ref, { level: 'error', message: '循环继续条件为空：请填写何时继续下一轮' });
      }
      if ((step.loopSteps || []).length === 0) {
        push(map, ref, { level: 'warning', message: '循环体内没有步骤：请添加需要重复执行的步骤' });
      }
      validateBusinessSteps(step.loopSteps || [], registry, map);
      continue;
    }

    if (step.isProFallback) continue;
    const action = registry.getAction(step.actionId);
    if (!action) continue;

    for (const field of action.fields) {
      const value = step.values?.[field.key] ?? field.defaultValue;
      if (field.required && isBlank(value)) {
        push(map, ref, { field: field.key, level: 'error', message: `「${field.label}」为必填项：请填写或插入数据` });
        continue;
      }
      if (field.type === 'number' && !isBlank(value) && !isExpr(value) && !Number.isFinite(Number(value))) {
        push(map, ref, { field: field.key, level: 'error', message: `「${field.label}」需要填写数字` });
      }
    }
  }
  return map;
}

/** 把工作流校验器（validateWorkflow）的结果按任务引用名归类，合并进业务校验结果 */
export function mergeWorkflowValidation(map: StepIssueMap, results?: ValidationResults | null): StepIssueMap {
  if (!results) return map;
  const add = (items: ValidationResults['errors'], level: StepIssue['level']) => {
    for (const it of items || []) {
      if (it.type !== 'TASK' || !it.ref) continue;
      const list = (map[it.ref] ||= []);
      if (!list.some((x) => x.message === it.message)) list.push({ level, message: it.message });
    }
  };
  add(results.errors, 'error');
  add(results.warnings, 'warning');
  return map;
}

/** 收集一个步骤及其内部所有步骤的问题（容器卡片徽标用） */
export function collectIssues(step: BusinessStep, map: StepIssueMap): StepIssue[] {
  const out = [...(map[step.taskReferenceName] || [])];
  const children = [
    ...(step.branches || []).flatMap((b) => b.steps),
    ...(step.forkLanes || []).flatMap((l) => l.steps),
    ...(step.loopSteps || []),
  ];
  for (const c of children) out.push(...collectIssues(c, map));
  return out;
}
