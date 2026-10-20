import type { WorkflowDef, TaskDef } from '../types/conductor';
import type { BusinessWorkflowModel, BusinessStep } from './types';
import { ActionRegistry, defaultActionRegistry } from '../actions/registry';

export function compileStepToTaskDef(
  step: BusinessStep,
  index: number,
  workflowName: string,
  registry: ActionRegistry = defaultActionRegistry
): TaskDef {
  if (step.isProFallback && step.rawTaskDef) {
    return {
      ...step.rawTaskDef,
      taskReferenceName: step.taskReferenceName || step.rawTaskDef.taskReferenceName,
      name: step.name || step.rawTaskDef.name,
      description: step.description ?? step.rawTaskDef.description,
    };
  }

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
  });
}

export function compileStepModelToWorkflowDef(
  model: BusinessWorkflowModel,
  registry: ActionRegistry = defaultActionRegistry
): WorkflowDef {
  const baseDef: Partial<WorkflowDef> = model.rawWorkflowDef
    ? structuredClone(model.rawWorkflowDef)
    : {};

  const tasks: TaskDef[] = model.steps.map((step, idx) =>
    compileStepToTaskDef(step, idx, model.name, registry)
  );

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
