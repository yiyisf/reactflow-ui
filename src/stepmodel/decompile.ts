import type { WorkflowDef, TaskDef } from '../types/conductor';
import type { BusinessWorkflowModel, BusinessStep, BranchCase, ForkLane } from './types';
import { ActionRegistry, defaultActionRegistry } from '../actions/registry';

export function decompileTaskDefToStep(
  task: TaskDef,
  index: number,
  registry: ActionRegistry = defaultActionRegistry
): BusinessStep {
  // 步骤 ID 必须是确定性的：编辑器每次修改都会重新反编译，若 ID 随时间变化，
  // React key 与"展开/选中"状态都会失效（卡片被重建、输入焦点丢失）。
  // taskReferenceName 在工作流内唯一，且与新建步骤时的 ID（step_<ref>）一致。
  const stepId = `step_${task.taskReferenceName || `idx${index}`}`;

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
    // Conductor 的分支任务总有默认分支（为空即跳过）：始终生成，避免空默认分支在一次往返后消失
    branches.push({
      caseKey: '__default__',
      caseLabel: '默认分支 (Default)',
      steps: decompileTaskList(task.defaultCase || [], registry),
    });

    // SWITCH：value-param 的 expression 是参数名；javascript / graaljs 的 expression 是脚本
    let caseParam: string | undefined;
    let caseExpression: string | undefined;
    if (task.type === 'SWITCH') {
      if (!task.evaluatorType || task.evaluatorType === 'value-param') caseParam = task.expression ?? '';
      else caseExpression = task.expression ?? '';
    } else if (task.caseExpression !== undefined && !task.caseValueParam) {
      caseExpression = task.caseExpression;
    } else {
      caseParam = task.caseValueParam ?? '';
    }

    return {
      id: stepId,
      actionId: 'control_decision',
      taskReferenceName: task.taskReferenceName,
      name: task.name || task.taskReferenceName,
      description: task.description,
      values: { ...(task.inputParameters || {}) },
      isProFallback: false,
      rawTaskDef: structuredClone(task),
      controlType: 'decision',
      caseParam,
      caseExpression,
      branches,
    };
  }

  // 2. 静态并行 (FORK_JOIN)。动态并行（FORK_JOIN_DYNAMIC）的泳道在运行时生成，业务卡片无法编辑，作为专业步骤保留
  if (task.type === 'FORK_JOIN') {
    const forkLanes: ForkLane[] = (task.forkTasks || []).map((laneTasks, laneIdx) => ({
      laneId: `lane_${laneIdx}`,
      laneLabel: `并发泳道 #${laneIdx + 1}`,
      steps: decompileTaskList(laneTasks || [], registry),
    }));

    return {
      id: stepId,
      actionId: 'control_fork',
      taskReferenceName: task.taskReferenceName,
      name: task.name || task.taskReferenceName,
      description: task.description,
      values: { ...(task.inputParameters || {}) },
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
      name: task.name || task.taskReferenceName,
      description: task.description,
      values: { ...(task.inputParameters || {}) },
      isProFallback: false,
      rawTaskDef: structuredClone(task),
      controlType: 'loop',
      loopCondition: task.loopCondition ?? '',
      loopSteps,
    };
  }

  // 4. 普通动作匹配（动态并行不交给动作匹配，保持专业步骤）
  const matched = task.type === 'FORK_JOIN_DYNAMIC' ? null : registry.findActionForTask(task);
  if (matched) {
    // 原描述若不是动作自动生成的那句，就是用户起的步骤名称（用于区分两个同类步骤）
    let synthesized: string | undefined;
    try {
      synthesized = matched.action.compile(matched.values, {
        taskReferenceName: task.taskReferenceName,
        stepIndex: index,
      }).description;
    } catch {
      synthesized = undefined;
    }
    const customName = task.description && task.description !== synthesized ? task.description : undefined;
    return {
      id: stepId,
      actionId: matched.action.id,
      taskReferenceName: task.taskReferenceName,
      name: customName ?? matched.action.name,
      description: task.description,
      values: matched.values,
      isProFallback: false,
      // 保留原任务定义：编译时以它为底，任务级配置（optional / retryCount / timeoutSeconds 等）往返不丢失
      rawTaskDef: structuredClone(task),
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
    description: task.description,
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
  const isFork = (t: TaskDef) => t.type === 'FORK_JOIN' || t.type === 'FORK_JOIN_DYNAMIC';
  /** fork 下标 -> 配对的 JOIN 下标（取其后第一个 JOIN） */
  const joinIndexOf = new Map<number, number>();
  const pairedJoinIdx = new Set<number>();

  for (let i = 0; i < tasks.length; i++) {
    if (isFork(tasks[i])) {
      for (let j = i + 1; j < tasks.length; j++) {
        if (tasks[j].type === 'JOIN' && !pairedJoinIdx.has(j)) {
          joinIndexOf.set(i, j);
          pairedJoinIdx.add(j);
          break;
        }
      }
    }
  }

  const steps: BusinessStep[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (pairedJoinIdx.has(i)) continue;

    const step = decompileTaskDefToStep(task, i, registry);
    const j = joinIndexOf.get(i);
    if (j !== undefined) {
      step.pairedJoinTaskRef = tasks[j].taskReferenceName;
      step.pairedJoinTaskDef = structuredClone(tasks[j]);
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
    // B22：原定义没有的字段保持 undefined，编译时才不会补出 "description": "" / "version": 1
    description: def.description,
    version: def.version,
    steps,
    inputParameters: def.inputParameters,
    rawWorkflowDef: structuredClone(def),
  };
}
