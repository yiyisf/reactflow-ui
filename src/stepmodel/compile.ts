import type { WorkflowDef, TaskDef } from '../types/conductor';
import type { BusinessWorkflowModel, BusinessStep } from './types';
import { ActionRegistry, defaultActionRegistry } from '../actions/registry';

export function compileStepToTaskDef(
  step: BusinessStep,
  index: number,
  workflowName: string,
  registry: ActionRegistry = defaultActionRegistry
): TaskDef {
  // 1. 分支控制流 (DECISION / SWITCH)
  if (step.controlType === 'decision') {
    const baseTask: Partial<TaskDef> = step.rawTaskDef ? structuredClone(step.rawTaskDef) : {};
    const decisionCases: Record<string, TaskDef[]> = {};
    let defaultCase: TaskDef[] | undefined = undefined;

    for (const b of step.branches || []) {
      if (b.caseKey === '__default__') {
        defaultCase = compileStepList(b.steps, workflowName, registry);
      } else {
        decisionCases[b.caseKey] = compileStepList(b.steps, workflowName, registry);
      }
    }

    return {
      ...baseTask,
      name: step.name || baseTask.name || step.taskReferenceName,
      taskReferenceName: step.taskReferenceName,
      type: baseTask.type === 'SWITCH' ? 'SWITCH' : 'DECISION',
      description: step.description ?? baseTask.description,
      caseValueParam: step.caseParam || baseTask.caseValueParam,
      caseExpression: step.caseExpression || baseTask.caseExpression,
      decisionCases,
      defaultCase: defaultCase || baseTask.defaultCase || [],
      inputParameters: {
        ...(baseTask.inputParameters || {}),
        ...(step.values || {}),
      },
    };
  }

  // 2. 并行控制流 (FORK_JOIN / FORK_JOIN_DYNAMIC)
  if (step.controlType === 'fork') {
    const baseTask: Partial<TaskDef> = step.rawTaskDef ? structuredClone(step.rawTaskDef) : {};
    const forkTasks: TaskDef[][] = (step.forkLanes || []).map((lane) =>
      compileStepList(lane.steps, workflowName, registry)
    );

    return {
      ...baseTask,
      name: step.name || baseTask.name || step.taskReferenceName,
      taskReferenceName: step.taskReferenceName,
      type: baseTask.type === 'FORK_JOIN_DYNAMIC' ? 'FORK_JOIN_DYNAMIC' : 'FORK_JOIN',
      description: step.description ?? baseTask.description,
      forkTasks,
      inputParameters: {
        ...(baseTask.inputParameters || {}),
        ...(step.values || {}),
      },
    };
  }

  // 3. 循环控制流 (DO_WHILE)
  if (step.controlType === 'loop') {
    const baseTask: Partial<TaskDef> = step.rawTaskDef ? structuredClone(step.rawTaskDef) : {};
    const loopOver: TaskDef[] = compileStepList(step.loopSteps || [], workflowName, registry);

    return {
      ...baseTask,
      name: step.name || baseTask.name || step.taskReferenceName,
      taskReferenceName: step.taskReferenceName,
      type: 'DO_WHILE',
      description: step.description ?? baseTask.description,
      loopCondition: step.loopCondition || baseTask.loopCondition || 'false',
      loopOver,
      inputParameters: {
        ...(baseTask.inputParameters || {}),
        ...(step.values || {}),
      },
    };
  }

  // 4. 底层技术步骤回退
  if (step.isProFallback && step.rawTaskDef) {
    return {
      ...step.rawTaskDef,
      taskReferenceName: step.taskReferenceName || step.rawTaskDef.taskReferenceName,
      name: step.name || step.rawTaskDef.name,
      description: step.description ?? step.rawTaskDef.description,
    };
  }

  // 5. 普通动作编译
  const action = registry.getAction(step.actionId);
  if (!action) {
    // Fallback simple task if action not found
    return {
      name: step.name || step.taskReferenceName,
      taskReferenceName: step.taskReferenceName,
      type: 'SIMPLE',
      description: step.description,
      inputParameters: {
        _actionId: step.actionId,
        ...step.values,
      },
    };
  }

  return action.compile(step.values, {
    taskReferenceName: step.taskReferenceName,
    stepIndex: index,
    workflowName,
    libraryRef: step.libraryRef,
  });
}

/**
 * 编译一组顺序步骤（顶层、分支内、泳道内、循环体内通用，可任意层级嵌套）。
 * 遇到 FORK_JOIN 时，会在其后自动补全配对的 JOIN 节点，
 * joinOn 取各泳道编译后的最后一个任务（若泳道末尾是嵌套并行，则为其 JOIN）。
 */
export function compileStepList(
  steps: BusinessStep[],
  workflowName: string,
  registry: ActionRegistry = defaultActionRegistry
): TaskDef[] {
  const tasks: TaskDef[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const taskDef = compileStepToTaskDef(step, i, workflowName, registry);
    tasks.push(taskDef);

    if (step.controlType === 'fork') {
      const joinRef = step.pairedJoinTaskRef || `join_${step.taskReferenceName}`;
      const joinOn: string[] = [];
      if (taskDef.forkTasks) {
        for (const lane of taskDef.forkTasks) {
          if (lane && lane.length > 0) {
            joinOn.push(lane[lane.length - 1].taskReferenceName);
          }
        }
      }

      tasks.push({
        name: `${step.taskReferenceName}_join`,
        taskReferenceName: joinRef,
        type: 'JOIN',
        description: `Join task for ${step.taskReferenceName}`,
        joinOn: joinOn.length > 0 ? joinOn : undefined,
      });
    }
  }

  return tasks;
}

export function compileStepModelToWorkflowDef(
  model: BusinessWorkflowModel,
  registry: ActionRegistry = defaultActionRegistry
): WorkflowDef {
  const baseDef: Partial<WorkflowDef> = model.rawWorkflowDef
    ? structuredClone(model.rawWorkflowDef)
    : {};

  const tasks: TaskDef[] = compileStepList(model.steps, model.name, registry);

  return {
    ...baseDef,
    name: model.name || 'cloud_host_automation',
    description: model.description || '云平台自动化工作流',
    version: model.version ?? 1,
    schemaVersion: 2,
    tasks,
    inputParameters: model.inputParameters || baseDef.inputParameters,
  };
}
