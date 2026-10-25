import type { WorkflowDef, TaskDef } from '../types/conductor';
import type { BusinessWorkflowModel, BusinessStep } from './types';
import { ActionRegistry, defaultActionRegistry } from '../actions/registry';
import type { ActionDefinition } from '../actions/types';

const isPlainObject = (v: unknown): v is Record<string, any> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** 删除值为 undefined 的键，避免往返后多出 `"description": undefined` 之类的空字段 */
function dropUndefined<T extends object>(obj: T): T {
  for (const k of Object.keys(obj) as (keyof T)[]) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
}

/** 控制流步骤的公共字段：name 与 description 分开保存，不再互相覆盖、不生成合成描述 */
function controlBase(step: BusinessStep): Partial<TaskDef> {
  const base: Partial<TaskDef> = step.rawTaskDef ? structuredClone(step.rawTaskDef) : {};
  base.name = step.name || base.name || step.taskReferenceName;
  base.taskReferenceName = step.taskReferenceName;
  if (step.description !== undefined) base.description = step.description || undefined;
  // 原定义没有入参且步骤也没有值时不凭空补 inputParameters: {}
  const values = step.values || {};
  if (Object.keys(values).length > 0 || step.rawTaskDef?.inputParameters !== undefined || !step.rawTaskDef) {
    base.inputParameters = { ...values };
  } else {
    delete base.inputParameters;
  }
  return base;
}

function compileDecision(step: BusinessStep, workflowName: string, registry: ActionRegistry): TaskDef {
  const task = controlBase(step);
  const decisionCases: Record<string, TaskDef[]> = {};
  // 没有 __default__ 分支即默认分支为空：不回退到原始定义，否则已删除的步骤会复活
  let defaultCase: TaskDef[] = [];

  for (const b of step.branches || []) {
    if (b.caseKey === '__default__') {
      defaultCase = compileStepList(b.steps, workflowName, registry);
    } else {
      decisionCases[b.caseKey] = compileStepList(b.steps, workflowName, registry);
    }
  }

  const expressionMode = step.caseExpression !== undefined;
  if (task.type === 'SWITCH') {
    if (expressionMode) {
      task.evaluatorType =
        task.evaluatorType && task.evaluatorType !== 'value-param' ? task.evaluatorType : 'javascript';
      task.expression = step.caseExpression;
    } else {
      task.evaluatorType = 'value-param';
      task.expression = step.caseParam ?? '';
    }
  } else {
    task.type = 'DECISION';
    // 两种判断方式互斥：编辑哪个就写哪个，清空也如实写入空值（不回退到旧值）
    if (expressionMode) {
      task.caseExpression = step.caseExpression;
      delete task.caseValueParam;
    } else {
      task.caseValueParam = step.caseParam ?? '';
      delete task.caseExpression;
    }
  }

  task.decisionCases = decisionCases;
  task.defaultCase = defaultCase;
  return dropUndefined(task) as TaskDef;
}

function compileFork(step: BusinessStep, workflowName: string, registry: ActionRegistry): TaskDef {
  const task = controlBase(step);
  task.type = 'FORK_JOIN';
  task.forkTasks = (step.forkLanes || []).map((lane) => compileStepList(lane.steps, workflowName, registry));
  return dropUndefined(task) as TaskDef;
}

function compileLoop(step: BusinessStep, workflowName: string, registry: ActionRegistry): TaskDef {
  const task = controlBase(step);
  task.type = 'DO_WHILE';
  // 清空条件即写入空值（由校验提示），不回退到旧条件
  task.loopCondition = step.loopCondition ?? task.loopCondition ?? 'false';
  task.loopOver = compileStepList(step.loopSteps || [], workflowName, registry);
  return dropUndefined(task) as TaskDef;
}

/**
 * 普通动作编译：以原任务定义为底（保留 optional / retryCount / timeoutSeconds / startDelay 等任务级配置），
 * 动作产出的字段覆盖其上。入参中不属于表单字段的对象（如 http_request）做一层合并，保留 headers 等额外配置；
 * 表单字段本身以表单值为准（删除对象里的键不会被原值"复活"）。
 */
function compileAction(step: BusinessStep, action: ActionDefinition, index: number, workflowName: string): TaskDef {
  const out = action.compile(step.values, {
    taskReferenceName: step.taskReferenceName,
    stepIndex: index,
    workflowName,
    libraryRef: step.libraryRef,
  });
  const base: Partial<TaskDef> = step.rawTaskDef ? structuredClone(step.rawTaskDef) : {};
  const fieldKeys = new Set(action.fields.map((f) => f.key));

  const baseInputs = base.inputParameters || {};
  const outInputs = out.inputParameters || {};
  const inputParameters: Record<string, any> = { ...baseInputs };
  for (const [k, v] of Object.entries(outInputs)) {
    inputParameters[k] =
      !fieldKeys.has(k) && isPlainObject(v) && isPlainObject(baseInputs[k]) ? { ...baseInputs[k], ...v } : v;
  }
  // 表单字段被清空（值为 undefined）时，不保留原定义中的旧值
  for (const key of fieldKeys) {
    if (key in baseInputs && !(key in outInputs)) delete inputParameters[key];
  }

  const merged: TaskDef = {
    ...(base as TaskDef),
    ...out,
    // 原任务名优先：HTTP / WAIT / HUMAN 等系统任务的 name 可任意，往返不改名；SIMPLE / SUB_WORKFLOW 匹配时二者本就一致
    name: base.name || out.name,
    taskReferenceName: step.taskReferenceName,
    inputParameters,
  };

  if (base.subWorkflowParam || out.subWorkflowParam) {
    merged.subWorkflowParam = { ...(base.subWorkflowParam || {}), ...(out.subWorkflowParam || {}) } as TaskDef['subWorkflowParam'];
  }

  // 步骤名称：用户改过名（与动作名不同）时写入 description，用于区分两个同类步骤；否则沿用原描述或动作生成的描述
  const customName = step.name && step.name !== action.name ? step.name : undefined;
  merged.description = customName ?? base.description ?? out.description;
  return dropUndefined(merged);
}

export function compileStepToTaskDef(
  step: BusinessStep,
  index: number,
  workflowName: string,
  registry: ActionRegistry = defaultActionRegistry
): TaskDef {
  if (step.controlType === 'decision') return compileDecision(step, workflowName, registry);
  if (step.controlType === 'fork') return compileFork(step, workflowName, registry);
  if (step.controlType === 'loop') return compileLoop(step, workflowName, registry);

  // 底层技术步骤：原样保留（仅引用名可变）
  if (step.isProFallback && step.rawTaskDef) {
    return dropUndefined({
      ...step.rawTaskDef,
      taskReferenceName: step.taskReferenceName || step.rawTaskDef.taskReferenceName,
      name: step.name || step.rawTaskDef.name,
      description: step.description ?? step.rawTaskDef.description,
    });
  }

  const action = registry.getAction(step.actionId);
  if (!action) {
    // 动作未注册（如宿主移除了该动作）：保留原定义，避免丢数据；连原定义也没有时生成占位任务
    if (step.rawTaskDef) {
      return dropUndefined({
        ...step.rawTaskDef,
        taskReferenceName: step.taskReferenceName,
        inputParameters: { ...(step.rawTaskDef.inputParameters || {}), ...step.values },
      });
    }
    return dropUndefined({
      name: step.name || step.taskReferenceName,
      taskReferenceName: step.taskReferenceName,
      type: 'SIMPLE',
      description: step.description,
      inputParameters: {
        _actionId: step.actionId,
        ...step.values,
      },
    });
  }

  return compileAction(step, action, index, workflowName);
}

/** 并行组（或动态并行专业步骤）后应紧跟的 JOIN */
function compileJoinFor(step: BusinessStep, forkTask: TaskDef): TaskDef {
  const joinRef = step.pairedJoinTaskRef || `join_${step.taskReferenceName}`;
  const raw: Partial<TaskDef> = step.pairedJoinTaskDef ? structuredClone(step.pairedJoinTaskDef) : {};

  // 动态并行：泳道在运行时生成，joinOn 由引擎决定，保持原 JOIN 定义不变
  if (forkTask.type === 'FORK_JOIN_DYNAMIC') {
    return dropUndefined({
      name: `${step.taskReferenceName}_join`,
      ...raw,
      taskReferenceName: joinRef,
      type: 'JOIN',
    } as TaskDef);
  }

  const joinOn: string[] = [];
  for (const lane of forkTask.forkTasks || []) {
    if (lane && lane.length > 0) joinOn.push(lane[lane.length - 1].taskReferenceName);
  }
  return dropUndefined({
    name: `${step.taskReferenceName}_join`,
    ...(step.pairedJoinTaskDef ? {} : { description: `Join task for ${step.taskReferenceName}` }),
    ...raw,
    taskReferenceName: joinRef,
    type: 'JOIN',
    joinOn: joinOn.length > 0 ? joinOn : undefined,
  } as TaskDef);
}

/**
 * 编译一组顺序步骤（顶层、分支内、泳道内、循环体内通用，可任意层级嵌套）。
 * 遇到并行组时，会在其后自动补全配对的 JOIN 节点，
 * joinOn 取各泳道编译后的最后一个任务（若泳道末尾是嵌套并行，则为其 JOIN）。
 * 以专业步骤保留的动态并行（FORK_JOIN_DYNAMIC）同样输出其配对 JOIN。
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

    const isDynamicForkPro = step.isProFallback && taskDef.type === 'FORK_JOIN_DYNAMIC' && !!step.pairedJoinTaskRef;
    if (step.controlType === 'fork' || isDynamicForkPro) {
      tasks.push(compileJoinFor(step, taskDef));
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
    // 已有定义：如实保留描述（含空字符串），不补合成描述；全新模型才给默认描述
    description: model.rawWorkflowDef ? (model.description ?? baseDef.description) : model.description || '云平台自动化工作流',
    version: model.version ?? 1,
    schemaVersion: 2,
    tasks,
    inputParameters: model.inputParameters || baseDef.inputParameters,
  };
}
