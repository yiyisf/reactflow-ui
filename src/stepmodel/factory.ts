import type { ActionDefinition } from '../actions/types';
import type { BusinessStep } from './types';

/**
 * 根据动作定义创建一个新的业务步骤。
 * 控制流动作（分支 / 并行 / 循环）会生成带 controlType 的容器步骤，
 * 因此可以在任意层级（顶层、分支内、泳道内、循环体内）递归嵌套。
 */
export function createStepFromAction(action: ActionDefinition): BusinessStep {
  const suffix = `${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`;
  const newStepRef = `${action.id.replace(/\./g, '_')}_${suffix}`;

  if (action.id === 'control.decision') {
    return {
      id: `step_${newStepRef}`,
      actionId: 'control_decision',
      taskReferenceName: newStepRef,
      name: '条件分支路由',
      description: '根据输入参数或上下文表达式分流执行',
      values: { caseParam: 'status' },
      controlType: 'decision',
      caseParam: 'status',
      branches: [
        { caseKey: 'SUCCESS', caseLabel: '分支: SUCCESS', steps: [] },
        { caseKey: '__default__', caseLabel: '默认分支 (Default)', steps: [] },
      ],
      isProFallback: false,
    };
  }

  if (action.id === 'control.fork') {
    return {
      id: `step_${newStepRef}`,
      actionId: 'control_fork',
      taskReferenceName: newStepRef,
      name: '并行并发组',
      description: '同时并发执行多条独立业务泳道',
      values: {},
      controlType: 'fork',
      forkLanes: [
        { laneId: 'lane_0', laneLabel: '并发泳道 #1', steps: [] },
        { laneId: 'lane_1', laneLabel: '并发泳道 #2', steps: [] },
      ],
      isProFallback: false,
    };
  }

  if (action.id === 'control.loop') {
    return {
      id: `step_${newStepRef}`,
      actionId: 'control_loop',
      taskReferenceName: newStepRef,
      name: '循环迭代处理',
      description: '重复循环执行内部步骤，直到满足退出条件',
      values: { loopCondition: '$.status == "PENDING"' },
      controlType: 'loop',
      loopCondition: '$.status == "PENDING"',
      loopSteps: [],
      isProFallback: false,
    };
  }

  const initialValues: Record<string, any> = {};
  for (const f of action.fields) {
    if (f.defaultValue !== undefined) {
      initialValues[f.key] = f.defaultValue;
    }
  }

  return {
    id: `step_${newStepRef}`,
    actionId: action.id,
    taskReferenceName: newStepRef,
    name: action.name,
    description: action.description,
    values: initialValues,
    isProFallback: false,
  };
}
