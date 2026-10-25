import type { ActionDefinition } from '../actions/types';
import type { BusinessStep } from './types';

/** 新建条件分支时，判断取值所在的入参名（inputParameters[caseValue]） */
export const DEFAULT_CASE_PARAM = 'caseValue';

/** 新建循环的默认继续条件：按本循环自身的已执行轮次判断，最多执行 3 轮 */
export const DEFAULT_LOOP_MAX_ITERATIONS = 3;
export function defaultLoopCondition(loopRef: string, maxIterations = DEFAULT_LOOP_MAX_ITERATIONS): string {
  return `if ($.${loopRef}['iteration'] < ${maxIterations}) { true; } else { false; }`;
}

/**
 * 根据动作定义创建一个新的业务步骤。
 * 控制流动作（分支 / 并行 / 循环）会生成带 controlType 的容器步骤，
 * 因此可以在任意层级（顶层、分支内、泳道内、循环体内）递归嵌套。
 */
export function createStepFromAction(action: ActionDefinition): BusinessStep {
  const suffix = `${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`;
  const newStepRef = `${action.id.replace(/\./g, '_')}_${suffix}`;

  if (action.id === 'control.decision') {
    // 判断取值默认留空：用户需绑定一个数据胶囊（如上游输出 / 全局入参），否则运行时总是走默认分支（校验会提示）
    return {
      id: `step_${newStepRef}`,
      actionId: 'control_decision',
      taskReferenceName: newStepRef,
      name: '条件分支路由',
      values: { [DEFAULT_CASE_PARAM]: '' },
      controlType: 'decision',
      caseParam: DEFAULT_CASE_PARAM,
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
      values: {},
      controlType: 'loop',
      loopCondition: defaultLoopCondition(newStepRef),
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
    // 流程库能力：首次引用时固定为当前发布版本，之后不随库升级自动变化
    ...(action.kind === 'workflow' && action.workflowRef
      ? { libraryRef: { name: action.workflowRef.name, version: action.workflowRef.version } }
      : {}),
  };
}
