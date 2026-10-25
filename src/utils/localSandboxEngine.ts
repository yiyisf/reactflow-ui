import type {
  WorkflowDef,
  TaskDef as WorkflowTask,
  WorkflowInstance,
  TaskInstance as TaskExecution,
} from '../types/conductor';
import { JqError, runJq } from './sandbox/jq';
import {
  createWorkerScriptEvaluator,
  notExecutedEvaluator,
  DEFAULT_SCRIPT_TIMEOUT_MS,
  type ScriptEvaluator,
  type ScriptResult,
} from './sandbox/scriptRunner';

/**
 * In-browser sandbox for Conductor workflows.
 *
 * Tasks that need no outside system run for real with Conductor semantics: INLINE / LAMBDA (JavaScript), JSON_JQ_TRANSFORM
 * (jq subset), SWITCH / DECISION (value-param and javascript), DO_WHILE (loop condition evaluated after each iteration),
 * FORK_JOIN, FORK_JOIN_DYNAMIC, JOIN, SET_VARIABLE, TERMINATE, WAIT. Tasks that call outside systems (HTTP, SIMPLE, HUMAN,
 * EVENT, KAFKA_PUBLISH, SUB_WORKFLOW, START_WORKFLOW, DYNAMIC …) return mock data, which the user can override per task.
 * Every task execution says which one happened in `sandboxExecution`.
 *
 * Scripts run in an isolated Web Worker, so script evaluation is asynchronous: use `executeLocalSandboxDryRunAsync`.
 * The synchronous `executeLocalSandboxDryRun` is kept for existing hosts; it does not run scripts and marks the affected
 * tasks as not executed instead of inventing a result.
 */

export interface TaskMockOverride {
  __isMockOverride?: boolean;
  /** Override execution status (e.g. simulate FAILED or TIMED_OUT) */
  status?: 'COMPLETED' | 'FAILED' | 'TIMED_OUT' | 'COMPLETED_WITH_ERRORS';
  /** Override simulated execution duration in ms */
  durationMs?: number;
  /** For SWITCH / DECISION tasks: force routing to a specific case key (or '__default__') */
  forceCase?: string;
  /** Custom outputData JSON for this task */
  outputData?: Record<string, any>;
  /** Custom error message when status is FAILED / TIMED_OUT */
  reasonForIncompletion?: string;
}

export interface SandboxDryRunOptions {
  /** Mock workflow input JSON */
  workflowInput?: Record<string, any>;
  /** Custom task output or behavior overrides keyed by taskReferenceName */
  taskMocks?: Record<string, Record<string, any> | TaskMockOverride>;
  /**
   * Safety limit for DO_WHILE iterations. The loop condition decides when a loop ends; when it is still true at this
   * limit the loop stops and is marked COMPLETED_WITH_ERRORS. Default 20 (async API). The synchronous API cannot evaluate
   * loop conditions, so there it is the number of iterations run (default 2, as before).
   */
  maxLoopIterations?: number;
}

export interface SandboxAsyncOptions extends SandboxDryRunOptions {
  /** Time budget per script in ms (default 2000). A script that runs longer is stopped and its task fails. */
  scriptTimeoutMs?: number;
  /** Custom script evaluator (tests, or hosts with their own isolation). Defaults to an isolated Web Worker. */
  scriptEvaluator?: ScriptEvaluator;
}

type Flow = 'COMPLETED' | 'FAILED' | 'TERMINATED';
interface ScriptRequest {
  expression: string;
  input: Record<string, unknown>;
}
type Gen<T> = Generator<ScriptRequest, T, ScriptResult>;

interface SandboxRuntimeContext {
  workflowInput: Record<string, any>;
  variables: Record<string, any>;
  taskOutputs: Record<string, Record<string, any>>;
  taskInputs: Record<string, Record<string, any>>;
  taskMocks: Record<string, Record<string, any> | TaskMockOverride>;
  tasks: TaskExecution[];
  currentTimeMs: number;
  maxLoopIterations: number;
  /** false in the synchronous API: loop conditions are not evaluated there */
  canRunScripts: boolean;
  seqCounter: number;
  /** refs spawned by the most recent FORK_JOIN_DYNAMIC, consumed by its JOIN */
  lastDynamicSpawn: string[] | null;
}

function getNormalizedMock(
  raw: Record<string, any> | TaskMockOverride | undefined
): TaskMockOverride | null {
  if (!raw || typeof raw !== 'object') return null;
  if (
    raw.__isMockOverride ||
    'outputData' in raw ||
    'forceCase' in raw ||
    'durationMs' in raw ||
    ('status' in raw &&
      (raw.status === 'COMPLETED' ||
        raw.status === 'FAILED' ||
        raw.status === 'TIMED_OUT' ||
        raw.status === 'COMPLETED_WITH_ERRORS') &&
      Object.keys(raw).every((k) =>
        ['__isMockOverride', 'status', 'durationMs', 'forceCase', 'outputData', 'reasonForIncompletion'].includes(k)
      ))
  ) {
    return raw as TaskMockOverride;
  }
  return {
    __isMockOverride: true,
    outputData: raw as Record<string, any>,
  };
}

/** Split a reference path into keys: `a.b[0]['c d'].e` → ['a','b',0,'c d','e']. */
function splitPath(path: string): (string | number)[] {
  const keys: (string | number)[] = [];
  const re = /([^.[\]]+)|\[(\d+)\]|\['([^']*)'\]|\["([^"]*)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) keys.push(/^\d+$/.test(m[1]) ? Number(m[1]) : m[1]);
    else if (m[2] !== undefined) keys.push(Number(m[2]));
    else keys.push(m[3] ?? m[4] ?? '');
  }
  return keys;
}

/** Resolve a nested path like "user.items[0].id" on an object */
function getByPath(obj: any, path: string): any {
  if (obj === null || obj === undefined || !path) return undefined;
  let cur = obj;
  for (const key of splitPath(path)) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[key as keyof typeof cur];
  }
  return cur;
}

/**
 * Resolve Conductor `${...}` expressions against current sandbox context.
 * References that cannot be resolved stay as written and are added to `misses` when given.
 */
export function resolveExpressionValue(val: any, ctx: SandboxRuntimeContext, misses?: string[]): any {
  if (typeof val === 'string') {
    // Exact single expression: "${workflow.input.orderId}" -> preserve non-string types
    const exactMatch = val.match(/^\$\{([^}]+)\}$/);
    if (exactMatch) {
      const resolved = evaluateSingleRef(exactMatch[1].trim(), ctx);
      if (resolved === undefined) misses?.push(exactMatch[1].trim());
      return resolved !== undefined ? resolved : val;
    }

    // Embedded expressions within string: "Bearer ${auth_ref.output.token}"
    return val.replace(/\$\{([^}]+)\}/g, (_full, expr) => {
      const resolved = evaluateSingleRef(expr.trim(), ctx);
      if (resolved === undefined) {
        misses?.push(expr.trim());
        return _full;
      }
      return typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
    });
  }

  if (Array.isArray(val)) {
    return val.map((item) => resolveExpressionValue(item, ctx, misses));
  }

  if (val && typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = resolveExpressionValue(v, ctx, misses);
    }
    return out;
  }

  return val;
}

function evaluateSingleRef(ref: string, ctx: SandboxRuntimeContext): any {
  if (ref === 'workflow.input') return ctx.workflowInput;
  if (ref.startsWith('workflow.input.') || ref.startsWith('workflow.input[')) {
    return getByPath(ctx.workflowInput, ref.slice('workflow.input'.length).replace(/^\./, ''));
  }
  if (ref === 'workflow.variables') return ctx.variables;
  if (ref.startsWith('workflow.variables.') || ref.startsWith('workflow.variables[')) {
    return getByPath(ctx.variables, ref.slice('workflow.variables'.length).replace(/^\./, ''));
  }
  if (ref === 'workflow.workflowId') return 'sandbox-dryrun-wf-001';
  if (ref === 'workflow.correlationId') return 'corr-sandbox-9921';

  // Task reference: "<taskRef>.output[.path]" or "<taskRef>.input[.path]"
  const m = /^([A-Za-z0-9_\-]+)\.(output|input)(.*)$/.exec(ref);
  if (m) {
    const [, taskRef, kind, rest] = m;
    const data = kind === 'output' ? ctx.taskOutputs[taskRef] : ctx.taskInputs[taskRef];
    if (!data) return undefined;
    if (!rest) return data;
    if (rest.startsWith('.') || rest.startsWith('[')) return getByPath(data, rest.replace(/^\./, ''));
  }

  return undefined;
}

/**
 * Default output shown for a task as a starting point for a custom mock (also what mocked tasks return).
 */
export function generateDefaultTaskOutputPreview(
  task: WorkflowTask,
  resolvedInput: Record<string, any> = {},
  iteration?: number
): Record<string, any> {
  switch (task.type) {
    case 'HTTP': {
      const httpReq = resolvedInput.http_request || task.httpRequest || resolvedInput;
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

    case 'JSON_JQ_TRANSFORM':
      return { result: {}, resultList: [{}] };

    case 'SET_VARIABLE': {
      return {
        variables: { ...(Object.keys(resolvedInput).length ? resolvedInput : task.inputParameters || {}) },
      };
    }

    case 'INLINE':
    case 'LAMBDA':
      return { result: null };

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
      return {
        code: 0,
        status: 'OK',
        result: `Simulated output from ${task.name}`,
        processedAt: new Date().toISOString(),
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

const truthy = (v: unknown) => v !== null && v !== undefined && v !== false && v !== 0 && v !== '';

/** Ask the driver to run a script; the generator receives the result. */
function* runScript(expression: string, input: Record<string, unknown>): Gen<ScriptResult> {
  return yield { expression, input };
}

/** Shared bookkeeping for one task execution. */
function beginTask(task: WorkflowTask, ctx: SandboxRuntimeContext, iteration?: number) {
  ctx.seqCounter += 1;
  const seq = ctx.seqCounter;
  const scheduledTime = ctx.currentTimeMs;
  const startTime = scheduledTime + 8 + (seq % 5) * 4;
  ctx.currentTimeMs = startTime;
  const misses: string[] = [];
  const resolvedInput = resolveExpressionValue(task.inputParameters || {}, ctx, misses);
  const execRefName = iteration && iteration > 1 ? `${task.taskReferenceName}__${iteration}` : task.taskReferenceName;
  const warnings = [...new Set(misses)].map((r) => `引用 \${${r}} 没有取到值（上游未执行或路径不存在）`);
  ctx.taskInputs[task.taskReferenceName] = resolvedInput;
  return { seq, scheduledTime, startTime, resolvedInput, execRefName, warnings };
}

function record(
  ctx: SandboxRuntimeContext,
  task: WorkflowTask,
  base: ReturnType<typeof beginTask>,
  fields: Partial<TaskExecution> & Pick<TaskExecution, 'status'>,
  iteration?: number,
): TaskExecution {
  const exec: TaskExecution = {
    taskId: `sandbox-task-${base.seq}`,
    taskType: task.type,
    taskDefName: task.name,
    referenceTaskName: base.execRefName,
    scheduledTime: base.scheduledTime,
    startTime: base.startTime,
    endTime: ctx.currentTimeMs,
    seq: base.seq,
    pollCount: 1,
    retryCount: 0,
    iteration,
    inputData: base.resolvedInput,
    workflowTask: task,
    ...fields,
  };
  if (base.warnings.length) exec.sandboxWarnings = [...(exec.sandboxWarnings ?? []), ...base.warnings];
  ctx.tasks.push(exec);
  if (exec.outputData) ctx.taskOutputs[task.taskReferenceName] = exec.outputData;
  return exec;
}

const FAILED_STATUSES = new Set(['FAILED', 'FAILED_WITH_TERMINAL_ERROR', 'TIMED_OUT']);

function* executeTaskList(tasks: WorkflowTask[], ctx: SandboxRuntimeContext, iteration?: number): Gen<Flow> {
  for (const task of tasks) {
    const status = yield* executeSingleTask(task, ctx, iteration);
    if (status === 'FAILED' || status === 'TERMINATED') return status;
  }
  return 'COMPLETED';
}

/** Choose the branch of a SWITCH / DECISION the way Conductor does: exact case key, otherwise defaultCase. */
function* chooseCase(task: WorkflowTask, input: Record<string, any>, warnings: string[]): Gen<{ value: unknown; error?: string }> {
  const isDecision = task.type === 'DECISION';
  const evaluator = isDecision ? (task.caseExpression ? 'javascript' : 'value-param') : task.evaluatorType || 'value-param';
  if (evaluator === 'value-param') {
    const param = isDecision ? task.caseValueParam : task.expression || task.caseValueParam;
    if (!param) {
      warnings.push('没有配置判断参数，走默认分支');
      return { value: undefined };
    }
    if (!(param in input)) warnings.push(`入参里没有 "${param}"，走默认分支`);
    return { value: input[param] };
  }
  if (evaluator === 'javascript' || evaluator === 'graaljs') {
    const src = isDecision ? task.caseExpression : task.expression;
    if (!src) {
      warnings.push('没有配置判断表达式，走默认分支');
      return { value: undefined };
    }
    const r = yield* runScript(src, input);
    if (r.ok) return { value: r.value };
    if (r.notExecuted) {
      warnings.push(`条件脚本未执行，走默认分支：${r.error}`);
      return { value: undefined };
    }
    return { value: undefined, error: `条件脚本执行失败：${r.error}` };
  }
  return { value: undefined, error: `沙箱不支持 ${evaluator} 求值器` };
}

function* executeSingleTask(task: WorkflowTask, ctx: SandboxRuntimeContext, iteration?: number): Gen<Flow> {
  const base = beginTask(task, ctx, iteration);
  const { resolvedInput } = base;
  const mock = getNormalizedMock(ctx.taskMocks[task.taskReferenceName]);
  const advance = (ms: number) => {
    ctx.currentTimeMs += typeof mock?.durationMs === 'number' && mock.durationMs >= 0 ? mock.durationMs : ms;
  };

  // ── branching ──
  if (task.type === 'SWITCH' || task.type === 'DECISION') {
    const warnings: string[] = [];
    let chosen: string;
    let value: unknown;
    if (mock?.forceCase) {
      chosen = mock.forceCase;
      warnings.push(`按配置台强制走分支 ${chosen === '__default__' ? '默认' : chosen}`);
    } else {
      const res = yield* chooseCase(task, resolvedInput, warnings);
      if (res.error) {
        advance(12);
        record(ctx, task, base, {
          status: 'FAILED',
          reasonForIncompletion: res.error,
          outputData: {},
          sandboxExecution: 'executed',
          sandboxWarnings: warnings,
        }, iteration);
        return 'FAILED';
      }
      value = res.value;
      const key = value === undefined || value === null ? '' : String(value);
      chosen = task.decisionCases && key in task.decisionCases ? key : '__default__';
    }
    advance(12);
    const branch = chosen === '__default__' ? task.defaultCase || [] : task.decisionCases?.[chosen] || task.defaultCase || [];
    record(ctx, task, base, {
      status: 'COMPLETED',
      inputData: { ...resolvedInput, case: chosen === '__default__' ? 'defaultCase' : chosen },
      outputData: mock?.outputData ?? {
        evaluationResult: [value === undefined ? null : String(value)],
        selectedCase: chosen === '__default__' ? 'defaultCase' : chosen,
      },
      sandboxExecution: mock?.forceCase ? 'mocked' : 'executed',
      sandboxWarnings: warnings,
    }, iteration);
    return yield* executeTaskList(branch, ctx, iteration);
  }

  // ── parallel ──
  if (task.type === 'FORK_JOIN') {
    advance(10);
    const forkTasks = task.forkTasks || [];
    record(ctx, task, base, { status: 'COMPLETED', outputData: {}, sandboxExecution: 'executed' }, iteration);
    return yield* runBranches(forkTasks, ctx, iteration);
  }

  if (task.type === 'FORK_JOIN_DYNAMIC') {
    advance(10);
    const warnings: string[] = [];
    const spawned = buildDynamicForkTasks(task, resolvedInput, warnings);
    ctx.lastDynamicSpawn = spawned.map((t) => t.taskReferenceName);
    record(ctx, task, base, {
      status: 'COMPLETED',
      outputData: {},
      sandboxExecution: 'executed',
      sandboxWarnings: warnings,
    }, iteration);
    return yield* runBranches(spawned.map((t) => [t]), ctx, iteration);
  }

  if (task.type === 'JOIN' || task.type === 'EXCLUSIVE_JOIN') {
    let joinOn = task.joinOn || [];
    if (!joinOn.length && ctx.lastDynamicSpawn) {
      joinOn = ctx.lastDynamicSpawn;
      ctx.lastDynamicSpawn = null;
    }
    const joined: Record<string, any> = {};
    for (const ref of joinOn) if (ctx.taskOutputs[ref]) joined[ref] = ctx.taskOutputs[ref];
    advance(15);
    record(ctx, task, base, { status: 'COMPLETED', inputData: { joinOn }, outputData: joined, sandboxExecution: 'executed' }, iteration);
    return 'COMPLETED';
  }

  // ── loop ──
  if (task.type === 'DO_WHILE') {
    return yield* executeLoop(task, ctx, base, iteration);
  }

  // ── tasks that run for real ──
  const executable = ['INLINE', 'LAMBDA', 'JSON_JQ_TRANSFORM', 'SET_VARIABLE', 'TERMINATE', 'WAIT', 'NOOP'];
  if (executable.includes(task.type) && !mock) {
    return yield* executeLocalTask(task, ctx, base, iteration);
  }

  // ── tasks that need an outside system: mocked (or user mock on any task) ──
  const defaultDurationMs =
    task.type === 'HTTP' ? 145 + (base.seq % 4) * 35 : task.type === 'SIMPLE' ? 85 + (base.seq % 5) * 30 : 28 + (base.seq % 3) * 12;
  advance(defaultDurationMs);
  let outputData: Record<string, any>;
  if (mock?.outputData) {
    outputData = structuredClone(mock.outputData);
  } else {
    outputData = generateDefaultTaskOutputPreview(task, resolvedInput, iteration);
    if (outputData.processedAt) outputData.processedAt = new Date(ctx.currentTimeMs).toISOString();
  }
  if (task.type === 'SET_VARIABLE') Object.assign(ctx.variables, mock?.outputData ?? resolvedInput);
  const status: TaskExecution['status'] = mock?.status || 'COMPLETED';
  const failed = FAILED_STATUSES.has(status);
  const taskDefName =
    task.type === 'DYNAMIC' && task.dynamicTaskNameParam && typeof resolvedInput[task.dynamicTaskNameParam] === 'string'
      ? resolvedInput[task.dynamicTaskNameParam]
      : task.name;
  record(ctx, task, base, {
    status,
    taskDefName,
    workerId: 'browser-local-sandbox-worker',
    outputData,
    reasonForIncompletion: failed ? mock?.reasonForIncompletion || `沙箱人工模拟任务异常 (${status})` : undefined,
    sandboxExecution: 'mocked',
  }, iteration);
  return failed ? 'FAILED' : 'COMPLETED';
}

function* runBranches(branches: WorkflowTask[][], ctx: SandboxRuntimeContext, iteration?: number): Gen<Flow> {
  // Branches start at the same time; the fork ends with the slowest one.
  const start = ctx.currentTimeMs;
  let end = start;
  let result: Flow = 'COMPLETED';
  for (const branch of branches) {
    ctx.currentTimeMs = start;
    const res = yield* executeTaskList(branch, ctx, iteration);
    end = Math.max(end, ctx.currentTimeMs);
    if (res !== 'COMPLETED' && result === 'COMPLETED') result = res;
  }
  ctx.currentTimeMs = end;
  return result;
}

/** Tasks for a FORK_JOIN_DYNAMIC, from `dynamicForkTasksParam` + `dynamicForkTasksInputParamName`, or forkTaskName/forkTaskInputs. */
function buildDynamicForkTasks(task: WorkflowTask, input: Record<string, any>, warnings: string[]): WorkflowTask[] {
  const tasksParam = task.dynamicForkTasksParam;
  if (tasksParam) {
    const list = input[tasksParam];
    if (!Array.isArray(list)) {
      warnings.push(`入参 "${tasksParam}" 不是任务数组，没有生成并行任务`);
      return [];
    }
    const inputsParam = task.dynamicForkTasksInputParamName;
    const inputs = (inputsParam && input[inputsParam]) || {};
    return list
      .filter((t): t is WorkflowTask => !!t && typeof t === 'object' && typeof t.taskReferenceName === 'string')
      .map((t) => ({ ...t, type: t.type || 'SIMPLE', inputParameters: inputs[t.taskReferenceName] ?? t.inputParameters ?? {} }));
  }
  const forkInputs = input.forkTaskInputs;
  const forkName = input.forkTaskName ?? input.forkTaskWorkflow;
  if (Array.isArray(forkInputs) && forkName) {
    const type = input.forkTaskType || (input.forkTaskWorkflow ? 'SUB_WORKFLOW' : 'SIMPLE');
    return forkInputs.map((inp, i) => ({
      name: String(forkName),
      taskReferenceName: `${task.taskReferenceName}_${i}`,
      type,
      inputParameters: inp && typeof inp === 'object' ? inp : { input: inp },
    }));
  }
  warnings.push('没有找到动态任务列表（dynamicForkTasksParam 或 forkTaskName + forkTaskInputs），没有生成并行任务');
  return [];
}

function* executeLoop(
  task: WorkflowTask,
  ctx: SandboxRuntimeContext,
  base: ReturnType<typeof beginTask>,
  outerIteration?: number,
): Gen<Flow> {
  const loopOver = task.loopOver || [];
  const limit = Math.max(1, ctx.maxLoopIterations);
  const warnings: string[] = [];
  const summary: Record<string, any> = {};
  const exec = record(ctx, task, base, {
    status: 'IN_PROGRESS',
    inputData: { ...base.resolvedInput, loopCondition: task.loopCondition },
    outputData: { iteration: 0 },
    sandboxExecution: 'executed',
  }, outerIteration);
  exec.sandboxWarnings = warnings;
  let status: TaskExecution['status'] = 'COMPLETED';
  let flow: Flow = 'COMPLETED';
  let iter = 0;

  for (;;) {
    iter += 1;
    const res = yield* executeTaskList(loopOver, ctx, iter);
    summary[String(iter)] = Object.fromEntries(
      loopOver.filter((c) => ctx.taskOutputs[c.taskReferenceName]).map((c) => [c.taskReferenceName, ctx.taskOutputs[c.taskReferenceName]]),
    );
    exec.outputData = { iteration: iter, ...summary };
    ctx.taskOutputs[task.taskReferenceName] = exec.outputData;
    if (res !== 'COMPLETED') {
      status = res === 'FAILED' ? 'FAILED' : 'COMPLETED';
      flow = res;
      break;
    }

    if (!task.loopCondition) {
      warnings.push('没有配置循环条件，只运行一轮');
      break;
    }
    if (!ctx.canRunScripts) {
      if (iter === 1) warnings.push(`循环条件未执行（同步接口不执行脚本），按上限运行 ${limit} 轮`);
      if (iter >= limit) break;
      continue;
    }
    // Conductor binds the loop's own output (with `iteration`), each child's output and the loop's inputs to `$`.
    const scope: Record<string, unknown> = { ...base.resolvedInput, [task.taskReferenceName]: exec.outputData };
    for (const c of loopOver) if (ctx.taskOutputs[c.taskReferenceName]) scope[c.taskReferenceName] = ctx.taskOutputs[c.taskReferenceName];
    const cond = yield* runScript(task.loopCondition, scope);
    if (!cond.ok) {
      if (cond.notExecuted) {
        warnings.push(`循环条件未执行：${cond.error}`);
        break;
      }
      status = 'FAILED';
      flow = 'FAILED';
      exec.reasonForIncompletion = `循环条件执行失败：${cond.error}`;
      break;
    }
    if (!truthy(cond.value)) break;
    if (iter >= limit) {
      status = 'COMPLETED_WITH_ERRORS';
      exec.reasonForIncompletion = `达到沙箱循环上限 ${limit} 轮时条件仍为真，已停止（真实运行会继续循环）`;
      break;
    }
  }

  ctx.currentTimeMs += 10;
  exec.status = status;
  exec.endTime = ctx.currentTimeMs;
  exec.iteration = iter;
  return flow;
}

function* executeLocalTask(
  task: WorkflowTask,
  ctx: SandboxRuntimeContext,
  base: ReturnType<typeof beginTask>,
  iteration?: number,
): Gen<Flow> {
  const input = base.resolvedInput;
  const fail = (reason: string, outputData: Record<string, any> = { error: reason }, duration = 6): Flow => {
    ctx.currentTimeMs += duration;
    record(ctx, task, base, { status: 'FAILED', reasonForIncompletion: reason, outputData, sandboxExecution: 'executed' }, iteration);
    return 'FAILED';
  };
  const done = (outputData: Record<string, any>, duration: number, extra: Partial<TaskExecution> = {}): Flow => {
    ctx.currentTimeMs += duration;
    record(ctx, task, base, { status: 'COMPLETED', outputData, sandboxExecution: 'executed', ...extra }, iteration);
    return 'COMPLETED';
  };

  switch (task.type) {
    case 'INLINE':
    case 'LAMBDA': {
      const isLambda = task.type === 'LAMBDA';
      const expression = isLambda ? input.scriptExpression : input.expression;
      const evaluator = isLambda ? 'javascript' : input.evaluatorType || task.evaluatorType || 'javascript';
      if (typeof expression !== 'string' || !expression.trim()) return fail('没有配置脚本（inputParameters.expression）');
      if (evaluator === 'value-param') return done({ result: input[expression] ?? null }, 4);
      if (evaluator !== 'javascript' && evaluator !== 'graaljs') return fail(`沙箱不支持 ${evaluator} 求值器`);
      const r = yield* runScript(expression, input);
      if (r.ok) return done({ result: r.value }, 6);
      if (r.notExecuted) {
        ctx.currentTimeMs += 1;
        record(ctx, task, base, {
          status: 'SKIPPED',
          reasonForIncompletion: r.error,
          outputData: {},
          sandboxExecution: 'not_executed',
        }, iteration);
        return 'COMPLETED';
      }
      return fail(`脚本执行失败：${r.error}`);
    }
    case 'JSON_JQ_TRANSFORM': {
      const query = input.queryExpression;
      if (typeof query !== 'string' || !query.trim()) return fail('没有配置 jq 表达式（inputParameters.queryExpression）');
      try {
        const results = runJq(query, input);
        return done({ result: results.length ? results[0] : null, resultList: results }, 5);
      } catch (e) {
        const msg = e instanceof JqError ? e.message : String(e);
        return fail(`jq 执行失败：${msg}`);
      }
    }
    case 'SET_VARIABLE':
      Object.assign(ctx.variables, input);
      return done({ variables: { ...input } }, 3);
    case 'WAIT':
      return done({}, 4, { sandboxWarnings: ['沙箱不实际等待，WAIT 立即完成'] });
    case 'NOOP':
      return done({}, 1);
    case 'TERMINATE': {
      const terminationStatus = input.terminationStatus || 'COMPLETED';
      const out = {
        terminationStatus,
        terminationReason: input.terminationReason || '',
        output: input.workflowOutput || {},
      };
      if (terminationStatus === 'FAILED') {
        ctx.currentTimeMs += 4;
        record(ctx, task, base, {
          status: 'FAILED_WITH_TERMINAL_ERROR',
          reasonForIncompletion: input.terminationReason || 'Terminated with FAILED status',
          outputData: out,
          sandboxExecution: 'executed',
        }, iteration);
        return 'FAILED';
      }
      done(out, 4);
      return 'TERMINATED';
    }
  }
  return fail(`沙箱无法执行 ${task.type}`);
}

/**
 * Build mock workflow input: declared input parameters plus every `${workflow.input.<field>}` the tasks reference.
 */
export function buildDefaultWorkflowMockInput(workflowDef: WorkflowDef): Record<string, any> {
  const input: Record<string, any> = {};

  if (Array.isArray(workflowDef.inputParameters)) {
    for (const param of workflowDef.inputParameters as any[]) {
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

  // Auto-discover ${workflow.input.<field>} expressions across all tasks in the workflow
  try {
    const rawJson = JSON.stringify(workflowDef.tasks || []);
    const regex = /\$\{\s*workflow\.input\.([a-zA-Z0-9_]+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(rawJson)) !== null) {
      const field = match[1];
      if (field && !(field in input)) {
        input[field] = `mock_${field}`;
      }
    }
  } catch {
    // ignore serialization errors
  }

  return input;
}

function createContext(workflowDef: WorkflowDef, options: SandboxDryRunOptions, canRunScripts: boolean) {
  const baseStartTime = Date.now() - 2000;
  const workflowInput = options.workflowInput || buildDefaultWorkflowMockInput(workflowDef);
  const ctx: SandboxRuntimeContext = {
    workflowInput,
    variables: {},
    taskOutputs: {},
    taskInputs: {},
    taskMocks: options.taskMocks || {},
    tasks: [],
    currentTimeMs: baseStartTime,
    maxLoopIterations: options.maxLoopIterations ?? (canRunScripts ? 20 : 2),
    canRunScripts,
    seqCounter: 0,
    lastDynamicSpawn: null,
  };
  return { ctx, baseStartTime };
}

function buildInstance(
  workflowDef: WorkflowDef,
  ctx: SandboxRuntimeContext,
  baseStartTime: number,
  finalResult: Flow,
): WorkflowInstance {
  const workflowOutput: Record<string, any> = {};
  if (workflowDef.outputParameters && Object.keys(workflowDef.outputParameters).length > 0) {
    Object.assign(workflowOutput, resolveExpressionValue(workflowDef.outputParameters, ctx));
  } else {
    const lastTask = ctx.tasks[ctx.tasks.length - 1];
    if (lastTask?.outputData) Object.assign(workflowOutput, lastTask.outputData);
  }
  const failed = ctx.tasks.find((t) => FAILED_STATUSES.has(t.status));
  return {
    workflowId: `sandbox-dryrun-${Date.now().toString(36)}`,
    workflowName: workflowDef.name || 'sandbox_workflow',
    workflowVersion: workflowDef.version || 1,
    // TERMINATE with terminationStatus COMPLETED ends the workflow as COMPLETED (FAILED is returned as 'FAILED' above)
    status: finalResult === 'FAILED' ? 'FAILED' : 'COMPLETED',
    startTime: baseStartTime,
    endTime: ctx.currentTimeMs,
    createTime: baseStartTime,
    updateTime: ctx.currentTimeMs,
    input: ctx.workflowInput,
    output: workflowOutput,
    variables: ctx.variables,
    tasks: ctx.tasks,
    reasonForIncompletion: finalResult === 'FAILED' ? failed?.reasonForIncompletion : undefined,
    workflowDefinition: structuredClone(workflowDef),
    isSandbox: true,
  };
}

/**
 * Run a WorkflowDef in the browser and return a complete WorkflowInstance.
 * Scripts (INLINE, javascript SWITCH / DECISION, DO_WHILE conditions) run in an isolated Web Worker.
 */
export async function executeLocalSandboxDryRunAsync(
  workflowDef: WorkflowDef,
  options: SandboxAsyncOptions = {},
): Promise<WorkflowInstance> {
  const { ctx, baseStartTime } = createContext(workflowDef, options, true);
  const owned = options.scriptEvaluator ? null : createWorkerScriptEvaluator({ timeoutMs: options.scriptTimeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS });
  const evaluate = options.scriptEvaluator ?? owned!.evaluate;
  try {
    const gen = executeTaskList(workflowDef.tasks || [], ctx);
    let step = gen.next();
    while (!step.done) {
      const r = await evaluate(step.value.expression, step.value.input);
      step = gen.next(r);
    }
    return buildInstance(workflowDef, ctx, baseStartTime, step.value);
  } finally {
    owned?.dispose();
  }
}

/**
 * Synchronous variant kept for existing hosts. It does not run scripts: INLINE tasks are SKIPPED with
 * `sandboxExecution: 'not_executed'`, javascript conditions take the default branch with a warning, and DO_WHILE runs
 * `maxLoopIterations` iterations (default 2). Prefer `executeLocalSandboxDryRunAsync`.
 */
export function executeLocalSandboxDryRun(
  workflowDef: WorkflowDef,
  options: SandboxDryRunOptions = {}
): WorkflowInstance {
  const { ctx, baseStartTime } = createContext(workflowDef, options, false);
  const gen = executeTaskList(workflowDef.tasks || [], ctx);
  let step = gen.next();
  while (!step.done) step = gen.next(notExecutedEvaluator(step.value.expression));
  return buildInstance(workflowDef, ctx, baseStartTime, step.value);
}
