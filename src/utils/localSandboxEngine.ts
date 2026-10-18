import type {
  WorkflowDef,
  TaskDef as WorkflowTask,
  WorkflowInstance,
  TaskInstance as TaskExecution,
} from '../types/conductor';

export interface SandboxDryRunOptions {
  /** Mock workflow input JSON */
  workflowInput?: Record<string, any>;
  /** Custom task output overrides keyed by taskReferenceName */
  taskMocks?: Record<string, Record<string, any>>;
  /** Max iterations per DO_WHILE loop in dry-run (default: 3) */
  maxLoopIterations?: number;
}

interface SandboxRuntimeContext {
  workflowInput: Record<string, any>;
  variables: Record<string, any>;
  taskOutputs: Record<string, Record<string, any>>;
  taskMocks: Record<string, Record<string, any>>;
  tasks: TaskExecution[];
  currentTimeMs: number;
  maxLoopIterations: number;
  seqCounter: number;
}

/**
 * Safely resolve nested property path like "user.profile.id" on an object
 */
function getByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Resolve Conductor `${...}` expressions against current sandbox context
 */
export function resolveExpressionValue(val: any, ctx: SandboxRuntimeContext): any {
  if (typeof val === 'string') {
    // Exact single expression: "${workflow.input.orderId}" -> preserve non-string types
    const exactMatch = val.match(/^\$\{([^}]+)\}$/);
    if (exactMatch) {
      const resolved = evaluateSingleRef(exactMatch[1].trim(), ctx);
      return resolved !== undefined ? resolved : val;
    }

    // Embedded expressions within string: "Bearer ${auth_ref.output.token}"
    return val.replace(/\$\{([^}]+)\}/g, (_full, expr) => {
      const resolved = evaluateSingleRef(expr.trim(), ctx);
      if (resolved === undefined) return _full;
      return typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
    });
  }

  if (Array.isArray(val)) {
    return val.map((item) => resolveExpressionValue(item, ctx));
  }

  if (val && typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = resolveExpressionValue(v, ctx);
    }
    return out;
  }

  return val;
}

function evaluateSingleRef(ref: string, ctx: SandboxRuntimeContext): any {
  if (ref === 'workflow.input') return ctx.workflowInput;
  if (ref.startsWith('workflow.input.')) {
    return getByPath(ctx.workflowInput, ref.slice('workflow.input.'.length));
  }
  if (ref === 'workflow.variables') return ctx.variables;
  if (ref.startsWith('workflow.variables.')) {
    return getByPath(ctx.variables, ref.slice('workflow.variables.'.length));
  }
  if (ref === 'workflow.workflowId') return 'sandbox-dryrun-wf-001';
  if (ref === 'workflow.correlationId') return 'corr-sandbox-9921';

  // Task output reference: "<taskRef>.output.<path>" or "<taskRef>.output"
  const outIdx = ref.indexOf('.output');
  if (outIdx > 0) {
    const taskRef = ref.slice(0, outIdx);
    const rest = ref.slice(outIdx + '.output'.length);
    const taskOut = ctx.taskOutputs[taskRef];
    if (!taskOut) return undefined;
    if (!rest || rest === '') return taskOut;
    if (rest.startsWith('.')) {
      return getByPath(taskOut, rest.slice(1));
    }
  }

  return undefined;
}

/**
 * Synthesize realistic mock output for a task based on its type and resolved inputParameters
 */
function synthesizeTaskOutput(
  task: WorkflowTask,
  resolvedInput: Record<string, any>,
  ctx: SandboxRuntimeContext,
  iteration?: number
): Record<string, any> {
  if (ctx.taskMocks[task.taskReferenceName]) {
    return structuredClone(ctx.taskMocks[task.taskReferenceName]);
  }

  switch (task.type) {
    case 'HTTP': {
      const httpReq = resolvedInput.http_request || resolvedInput;
      return {
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/json', 'x-sandbox': 'true' },
          body: {
            code: 0,
            status: 'SUCCESS',
            message: `Simulated HTTP ${httpReq?.method || 'GET'} response for ${task.name}`,
            requestEcho: httpReq?.uri || '/api/v1/resource',
            data: {
              id: `res_${task.taskReferenceName}_${iteration || 1}`,
              verified: true,
              score: 95,
              items: [{ id: 1, name: 'item-alpha' }, { id: 2, name: 'item-beta' }],
            },
          },
        },
      };
    }

    case 'JSON_JQ_TRANSFORM': {
      const expr = resolvedInput.queryExpression || '.';
      // Lightweight JQ subset simulator for common expressions
      if (expr === '.' || !expr) {
        const copy = { ...resolvedInput };
        delete copy.queryExpression;
        return { result: copy, resultList: [copy] };
      }
      if (expr.startsWith('.')) {
        const path = expr.slice(1).replace(/\[\]/g, '');
        const extracted = path ? getByPath(resolvedInput, path) : resolvedInput;
        return {
          result: extracted !== undefined ? extracted : { transformed: true, expression: expr },
          resultList: Array.isArray(extracted) ? extracted : [extracted ?? { transformed: true }],
        };
      }
      return {
        result: { transformed: true, queryExpression: expr, sourceKeys: Object.keys(resolvedInput) },
        resultList: [{ transformed: true }],
      };
    }

    case 'SET_VARIABLE': {
      Object.assign(ctx.variables, resolvedInput);
      return {
        variables: { ...ctx.variables },
      };
    }

    case 'INLINE': {
      return {
        result: {
          evaluated: true,
          evaluatorType: resolvedInput.evaluatorType || 'graaljs',
          summary: `Executed inline script for ${task.taskReferenceName}`,
          ...resolvedInput,
        },
      };
    }

    case 'EVENT':
      return {
        event_produced: `conductor:event:${task.sink || task.name}`,
        payload: resolvedInput,
      };

    case 'WAIT':
      return {
        waited: true,
        duration: resolvedInput.duration || '1s',
      };

    case 'TERMINATE':
      return {
        terminationStatus: resolvedInput.terminationStatus || 'COMPLETED',
        terminationReason: resolvedInput.terminationReason || 'Terminated in sandbox dry-run',
        output: resolvedInput.workflowOutput || {},
      };

    default: {
      // SIMPLE / Worker task or custom task
      return {
        code: 0,
        status: 'OK',
        result: `Simulated output from ${task.name}`,
        processedAt: new Date(ctx.currentTimeMs).toISOString(),
        iteration: iteration ?? 1,
        inputEcho: resolvedInput,
        data: {
          id: `${task.taskReferenceName}_out_${iteration || 1}`,
          approved: true,
          amount: resolvedInput.amount ?? 100,
        },
      };
    }
  }
}

/**
 * Evaluate SWITCH / DECISION branch key in sandbox
 */
function evaluateSwitchBranch(
  task: WorkflowTask,
  resolvedInput: Record<string, any>,
  decisionCases: Record<string, WorkflowTask[]>
): string {
  const caseKeys = Object.keys(decisionCases);
  if (caseKeys.length === 0) return 'default';

  const paramName = task.caseValueParam || 'case_value';
  const rawCaseVal = resolvedInput[paramName] ?? task.expression;

  if (rawCaseVal !== undefined && rawCaseVal !== null) {
    const strVal = String(rawCaseVal).trim();
    if (decisionCases[strVal]) {
      return strVal;
    }
    // Check if expression matches one of the case keys loosely
    for (const key of caseKeys) {
      if (strVal.includes(key)) return key;
    }
  }

  // Fallback to first available case so dry-run traverses an interesting branch
  return caseKeys[0];
}

function executeTaskList(
  tasks: WorkflowTask[],
  ctx: SandboxRuntimeContext,
  iteration?: number
): 'COMPLETED' | 'FAILED' | 'TERMINATED' {
  for (const task of tasks) {
    const status = executeSingleTask(task, ctx, iteration);
    if (status === 'FAILED' || status === 'TERMINATED') {
      return status;
    }
  }
  return 'COMPLETED';
}

function executeSingleTask(
  task: WorkflowTask,
  ctx: SandboxRuntimeContext,
  iteration?: number
): 'COMPLETED' | 'FAILED' | 'TERMINATED' {
  ctx.seqCounter += 1;
  const seq = ctx.seqCounter;
  const scheduledTime = ctx.currentTimeMs;
  const queueWaitMs = 8 + (seq % 5) * 4;
  const startTime = scheduledTime + queueWaitMs;
  ctx.currentTimeMs = startTime;

  const resolvedInput = resolveExpressionValue(task.inputParameters || {}, ctx);
  const execRefName =
    iteration && iteration > 1 ? `${task.taskReferenceName}__${iteration}` : task.taskReferenceName;

  if (task.type === 'SWITCH' || task.type === 'DECISION') {
    const cases = task.decisionCases || {};
    const chosenCase = evaluateSwitchBranch(task, resolvedInput, cases);
    const branchTasks = cases[chosenCase] || task.defaultCase || [];

    const switchExec: TaskExecution = {
      taskId: `sandbox-task-${seq}`,
      taskType: task.type,
      taskDefName: task.name,
      referenceTaskName: execRefName,
      status: 'COMPLETED',
      scheduledTime,
      startTime,
      endTime: startTime + 12,
      seq,
      pollCount: 1,
      retryCount: 0,
      iteration,
      inputData: { ...resolvedInput, case_value_param: chosenCase },
      outputData: { selectedCase: chosenCase, evaluatedExpression: task.expression || task.caseValueParam || 'default' },
      workflowTask: task,
    };
    ctx.currentTimeMs = switchExec.endTime!;
    ctx.taskOutputs[task.taskReferenceName] = switchExec.outputData!;
    ctx.tasks.push(switchExec);

    return executeTaskList(branchTasks, ctx, iteration);
  }

  if (task.type === 'FORK_JOIN') {
    const forkTasks = task.forkTasks || [];
    const forkStart = startTime;
    const forkExec: TaskExecution = {
      taskId: `sandbox-task-${seq}`,
      taskType: 'FORK_JOIN',
      taskDefName: task.name,
      referenceTaskName: execRefName,
      status: 'COMPLETED',
      scheduledTime,
      startTime: forkStart,
      endTime: forkStart + 10,
      seq,
      pollCount: 1,
      retryCount: 0,
      iteration,
      inputData: resolvedInput,
      outputData: { forkedBranches: forkTasks.length },
      workflowTask: task,
    };
    ctx.tasks.push(forkExec);

    // Run parallel branches starting at the same timestamp, then advance to max branch endTime
    const branchStartClock = forkStart + 10;
    let maxBranchEndClock = branchStartClock;

    for (const branch of forkTasks) {
      ctx.currentTimeMs = branchStartClock;
      const res = executeTaskList(branch, ctx, iteration);
      if (ctx.currentTimeMs > maxBranchEndClock) {
        maxBranchEndClock = ctx.currentTimeMs;
      }
      if (res !== 'COMPLETED') return res;
    }

    ctx.currentTimeMs = maxBranchEndClock;
    ctx.taskOutputs[task.taskReferenceName] = forkExec.outputData!;
    return 'COMPLETED';
  }

  if (task.type === 'JOIN') {
    const joinOn = task.joinOn || [];
    const joinedOutput: Record<string, any> = {};
    for (const ref of joinOn) {
      if (ctx.taskOutputs[ref]) {
        joinedOutput[ref] = ctx.taskOutputs[ref];
      }
    }
    const endTime = startTime + 15;
    const joinExec: TaskExecution = {
      taskId: `sandbox-task-${seq}`,
      taskType: 'JOIN',
      taskDefName: task.name,
      referenceTaskName: execRefName,
      status: 'COMPLETED',
      scheduledTime,
      startTime,
      endTime,
      seq,
      pollCount: 1,
      retryCount: 0,
      iteration,
      inputData: { joinOn },
      outputData: joinedOutput,
      workflowTask: task,
    };
    ctx.currentTimeMs = endTime;
    ctx.taskOutputs[task.taskReferenceName] = joinedOutput;
    ctx.tasks.push(joinExec);
    return 'COMPLETED';
  }

  if (task.type === 'DO_WHILE') {
    const loopOver = task.loopOver || [];
    const totalIterations = Math.min(ctx.maxLoopIterations, 2);
    const loopExec: TaskExecution = {
      taskId: `sandbox-task-${seq}`,
      taskType: 'DO_WHILE',
      taskDefName: task.name,
      referenceTaskName: execRefName,
      status: 'COMPLETED',
      scheduledTime,
      startTime,
      endTime: startTime,
      seq,
      pollCount: 1,
      retryCount: 0,
      iteration: totalIterations,
      inputData: { loopCondition: task.loopCondition, resolvedInput },
      outputData: { iteration: totalIterations },
      workflowTask: task,
    };
    ctx.tasks.push(loopExec);

    const iterSummary: Record<string, any> = {};
    for (let iter = 1; iter <= totalIterations; iter++) {
      const res = executeTaskList(loopOver, ctx, iter);
      iterSummary[String(iter)] = {};
      for (const child of loopOver) {
        if (ctx.taskOutputs[child.taskReferenceName]) {
          iterSummary[String(iter)][child.taskReferenceName] = ctx.taskOutputs[child.taskReferenceName];
        }
      }
      if (res !== 'COMPLETED') {
        loopExec.endTime = ctx.currentTimeMs;
        return res;
      }
    }

    loopExec.endTime = ctx.currentTimeMs + 10;
    loopExec.outputData = { iteration: totalIterations, ...iterSummary };
    ctx.currentTimeMs = loopExec.endTime;
    ctx.taskOutputs[task.taskReferenceName] = loopExec.outputData;
    return 'COMPLETED';
  }

  // Standard / System / Worker task
  const durationMs =
    task.type === 'HTTP'
      ? 145 + (seq % 4) * 35
      : task.type === 'SIMPLE'
      ? 85 + (seq % 5) * 30
      : 28 + (seq % 3) * 12;
  const endTime = startTime + durationMs;
  const outputData = synthesizeTaskOutput(task, resolvedInput, ctx, iteration);

  const isFailedTerminate =
    task.type === 'TERMINATE' && resolvedInput.terminationStatus === 'FAILED';

  const taskExec: TaskExecution = {
    taskId: `sandbox-task-${seq}`,
    taskType: task.type,
    taskDefName: task.name,
    referenceTaskName: execRefName,
    status: isFailedTerminate ? 'FAILED_WITH_TERMINAL_ERROR' : 'COMPLETED',
    scheduledTime,
    startTime,
    endTime,
    seq,
    pollCount: 1,
    retryCount: 0,
    iteration,
    workerId: 'browser-local-sandbox-worker',
    inputData: resolvedInput,
    outputData,
    workflowTask: task,
  };

  ctx.currentTimeMs = endTime;
  ctx.taskOutputs[task.taskReferenceName] = outputData;
  ctx.tasks.push(taskExec);

  if (task.type === 'TERMINATE') {
    return isFailedTerminate ? 'FAILED' : 'TERMINATED';
  }

  return 'COMPLETED';
}

/**
 * Build default mock input from workflowDef.inputParameters
 */
export function buildDefaultWorkflowMockInput(workflowDef: WorkflowDef): Record<string, any> {
  const input: Record<string, any> = {
    orderId: 'ORD-2026-88412',
    userId: 'usr_99201',
    amount: 299.0,
    currency: 'CNY',
    env: 'sandbox',
  };

  if (Array.isArray(workflowDef.inputParameters)) {
    for (const param of workflowDef.inputParameters) {
      const paramName = typeof param === 'string' ? param : param?.name;
      const defaultVal =
        typeof param === 'object' && param !== null
          ? param.example ?? param.defaultValue ?? `sample_${paramName}`
          : `sample_${paramName}`;
      if (paramName && !(paramName in input)) {
        input[paramName] = defaultVal;
      }
    }
  }

  return input;
}

/**
 * Execute an entire WorkflowDef in-browser deterministically and return a complete WorkflowInstance
 */
export function executeLocalSandboxDryRun(
  workflowDef: WorkflowDef,
  options: SandboxDryRunOptions = {}
): WorkflowInstance {
  const baseStartTime = Date.now() - 2000;
  const workflowInput = options.workflowInput || buildDefaultWorkflowMockInput(workflowDef);

  const ctx: SandboxRuntimeContext = {
    workflowInput,
    variables: {},
    taskOutputs: {},
    taskMocks: options.taskMocks || {},
    tasks: [],
    currentTimeMs: baseStartTime,
    maxLoopIterations: options.maxLoopIterations ?? 2,
    seqCounter: 0,
  };

  const finalResult = executeTaskList(workflowDef.tasks || [], ctx);

  // Resolve workflow outputParameters if defined
  const workflowOutput: Record<string, any> = {};
  if (workflowDef.outputParameters && Object.keys(workflowDef.outputParameters).length > 0) {
    Object.assign(workflowOutput, resolveExpressionValue(workflowDef.outputParameters, ctx));
  } else {
    // Default to last task's output
    const lastTask = ctx.tasks[ctx.tasks.length - 1];
    if (lastTask?.outputData) {
      Object.assign(workflowOutput, lastTask.outputData);
    }
  }

  const wfStatus: WorkflowInstance['status'] =
    finalResult === 'FAILED'
      ? 'FAILED'
      : finalResult === 'TERMINATED'
      ? 'TERMINATED'
      : 'COMPLETED';

  return {
    workflowId: `sandbox-dryrun-${Date.now().toString(36)}`,
    workflowName: workflowDef.name || 'sandbox_workflow',
    workflowVersion: workflowDef.version || 1,
    status: wfStatus,
    startTime: baseStartTime,
    endTime: ctx.currentTimeMs,
    createTime: baseStartTime,
    updateTime: ctx.currentTimeMs,
    input: workflowInput,
    output: workflowOutput,
    variables: ctx.variables,
    tasks: ctx.tasks,
    workflowDefinition: structuredClone(workflowDef),
  };
}
