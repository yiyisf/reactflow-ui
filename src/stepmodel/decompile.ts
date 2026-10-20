import type { WorkflowDef, TaskDef } from '../types/conductor';
import type { BusinessWorkflowModel, BusinessStep } from './types';
import { ActionRegistry, defaultActionRegistry } from '../actions/registry';

export function decompileTaskDefToStep(
  task: TaskDef,
  index: number,
  registry: ActionRegistry = defaultActionRegistry
): BusinessStep {
  const matched = registry.findActionForTask(task);
  const stepId = `step_${task.taskReferenceName || index}_${Date.now().toString(36)}`;

  if (matched) {
    return {
      id: stepId,
      actionId: matched.action.id,
      taskReferenceName: task.taskReferenceName,
      name: matched.action.name,
      description: task.description,
      values: matched.values,
      isProFallback: false,
    };
  }

  // Not mapped to any business action -> wrap as a lossless Pro Fallback step
  return {
    id: stepId,
    actionId: 'pro_custom_task',
    taskReferenceName: task.taskReferenceName,
    name: task.name || task.taskReferenceName,
    description: task.description || `底层 ${task.type} 技术任务`,
    values: task.inputParameters || {},
    isProFallback: true,
    rawTaskDef: structuredClone(task),
  };
}

export function decompileWorkflowDefToStepModel(
  def: WorkflowDef | null | undefined,
  registry: ActionRegistry = defaultActionRegistry
): BusinessWorkflowModel {
  if (!def) {
    return {
      name: 'new_cloud_automation',
      description: '新建云平台运维自动化流程',
      version: 1,
      steps: [],
    };
  }

  const steps = (def.tasks || []).map((task, idx) =>
    decompileTaskDefToStep(task, idx, registry)
  );

  return {
    name: def.name || 'unnamed_workflow',
    description: def.description || '',
    version: def.version || 1,
    steps,
    inputParameters: def.inputParameters,
    rawWorkflowDef: structuredClone(def),
  };
}
