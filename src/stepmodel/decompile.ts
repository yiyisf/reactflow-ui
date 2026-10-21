import type { WorkflowDef, TaskDef } from '../types/conductor';
import type { BusinessWorkflowModel, BusinessStep, BranchCase, ForkLane } from './types';
import { ActionRegistry, defaultActionRegistry } from '../actions/registry';

export function decompileTaskDefToStep(
  task: TaskDef,
  index: number,
  registry: ActionRegistry = defaultActionRegistry
): BusinessStep {
  const stepId = `step_${task.taskReferenceName || index}_${Date.now().toString(36)}`;

  // 1. 分支路由控制流 (DECISION / SWITCH)
  if (task.type === 'DECISION' || task.type === 'SWITCH') {
    const branches: BranchCase[] = [];
    if (task.decisionCases) {
      for (const [caseKey, branchTasks] of Object.entries(task.decisionCases)) {
        branches.push({
          caseKey,
          caseLabel: `分支: ${caseKey}`,
          steps: decompileTaskList(branchTasks || [], registry),
        });
      }
    }
    if (task.defaultCase && task.defaultCase.length > 0) {
      branches.push({
        caseKey: '__default__',
        caseLabel: '默认分支 (Default)',
        steps: decompileTaskList(task.defaultCase, registry),
      });
    }

    return {
      id: stepId,
      actionId: 'control_decision',
      taskReferenceName: task.taskReferenceName,
      name: task.description || task.name || '条件分支路由 (Decision / Switch)',
      description: task.description || `根据 ${task.caseValueParam || task.caseExpression || '条件'} 进行分支路由`,
      values: task.inputParameters || {},
      isProFallback: false,
      rawTaskDef: structuredClone(task),
      controlType: 'decision',
      caseParam: task.caseValueParam,
      caseExpression: task.caseExpression,
      branches,
    };
  }

  // 2. 并行多任务控制流 (FORK_JOIN / FORK_JOIN_DYNAMIC)
  if (task.type === 'FORK_JOIN' || task.type === 'FORK_JOIN_DYNAMIC') {
    const forkLanes: ForkLane[] = (task.forkTasks || []).map((laneTasks, laneIdx) => ({
      laneId: `lane_${laneIdx}`,
      laneLabel: `并发泳道 #${laneIdx + 1}`,
      steps: decompileTaskList(laneTasks || [], registry),
    }));

    return {
      id: stepId,
      actionId: 'control_fork',
      taskReferenceName: task.taskReferenceName,
      name: task.description || task.name || '并行并发任务组 (Fork / Join)',
      description: task.description || `同时并发执行 ${forkLanes.length} 条独立业务泳道`,
      values: task.inputParameters || {},
      isProFallback: false,
      rawTaskDef: structuredClone(task),
      controlType: 'fork',
      forkLanes,
    };
  }

  // 3. 循环迭代控制流 (DO_WHILE)
  if (task.type === 'DO_WHILE') {
    const loopSteps = decompileTaskList(task.loopOver || [], registry);

    return {
      id: stepId,
      actionId: 'control_loop',
      taskReferenceName: task.taskReferenceName,
      name: task.description || task.name || '循环迭代处理 (Do-While Loop)',
      description: task.description || `循环执行内部步骤，跳出条件: ${task.loopCondition || ''}`,
      values: task.inputParameters || {},
      isProFallback: false,
      rawTaskDef: structuredClone(task),
      controlType: 'loop',
      loopCondition: task.loopCondition,
      loopSteps,
    };
  }

  // 4. 普通动作匹配
  const matched = registry.findActionForTask(task);
  if (matched) {
    return {
      id: stepId,
      actionId: matched.action.id,
      taskReferenceName: task.taskReferenceName,
      name: matched.action.name,
      description: task.description,
      values: matched.values,
      isProFallback: false,
      // 流程库能力：记录任务里已有的名称与版本；未显式指定版本则保持不固定，避免改变原有语义
      ...(task.type === 'SUB_WORKFLOW' && task.subWorkflowParam?.name
        ? {
            libraryRef: {
              name: task.subWorkflowParam.name,
              version: task.subWorkflowParam.version,
            },
          }
        : {}),
    };
  }

  // 5. 未映射的底层技术任务 (Pro Fallback)
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

/**
 * 反编译一组顺序任务（顶层、分支内、泳道内、循环体内通用，可任意层级嵌套）。
 * FORK_JOIN 后配对的 JOIN 节点会被折叠进并行组（记录在 pairedJoinTaskRef），不单独成步。
 */
export function decompileTaskList(
  tasks: TaskDef[],
  registry: ActionRegistry = defaultActionRegistry
): BusinessStep[] {
  const pairedJoinRefs = new Set<string>();

  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].type === 'FORK_JOIN') {
      for (let j = i + 1; j < tasks.length; j++) {
        if (tasks[j].type === 'JOIN') {
          pairedJoinRefs.add(tasks[j].taskReferenceName);
          break;
        }
      }
    }
  }

  const steps: BusinessStep[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (task.type === 'JOIN' && pairedJoinRefs.has(task.taskReferenceName)) {
      continue;
    }

    const step = decompileTaskDefToStep(task, i, registry);
    if (step.controlType === 'fork') {
      for (let j = i + 1; j < tasks.length; j++) {
        if (tasks[j].type === 'JOIN') {
          step.pairedJoinTaskRef = tasks[j].taskReferenceName;
          break;
        }
      }
    }
    steps.push(step);
  }

  return steps;
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

  const steps = decompileTaskList(def.tasks || [], registry);

  return {
    name: def.name || 'unnamed_workflow',
    description: def.description || '',
    version: def.version || 1,
    steps,
    inputParameters: def.inputParameters,
    rawWorkflowDef: structuredClone(def),
  };
}
