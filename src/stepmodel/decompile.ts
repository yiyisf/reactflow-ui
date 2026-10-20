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
          steps: (branchTasks || []).map((t, i) => decompileTaskDefToStep(t, i, registry)),
        });
      }
    }
    if (task.defaultCase && task.defaultCase.length > 0) {
      branches.push({
        caseKey: '__default__',
        caseLabel: '默认分支 (Default)',
        steps: task.defaultCase.map((t, i) => decompileTaskDefToStep(t, i, registry)),
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
      steps: (laneTasks || []).map((t, i) => decompileTaskDefToStep(t, i, registry)),
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
    const loopSteps = (task.loopOver || []).map((t, i) => decompileTaskDefToStep(t, i, registry));

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

  const tasks = def.tasks || [];
  const pairedJoinRefs = new Set<string>();

  // 先预扫描找寻 FORK_JOIN 对应的 JOIN 节点
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (t.type === 'FORK_JOIN') {
      // 寻找下一个或后续配对的 JOIN
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
    // 跳过已与 FORK_JOIN 配对的 JOIN，因为它已经作为并行组的收口点内嵌处理
    if (task.type === 'JOIN' && pairedJoinRefs.has(task.taskReferenceName)) {
      continue;
    }

    const step = decompileTaskDefToStep(task, i, registry);
    if (step.controlType === 'fork') {
      // 记录关联的 JOIN 引用名
      for (let j = i + 1; j < tasks.length; j++) {
        if (tasks[j].type === 'JOIN') {
          step.pairedJoinTaskRef = tasks[j].taskReferenceName;
          break;
        }
      }
    }
    steps.push(step);
  }

  return {
    name: def.name || 'unnamed_workflow',
    description: def.description || '',
    version: def.version || 1,
    steps,
    inputParameters: def.inputParameters,
    rawWorkflowDef: structuredClone(def),
  };
}
