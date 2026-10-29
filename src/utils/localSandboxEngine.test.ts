import { describe, it, expect } from 'vitest';
import { buildDefaultWorkflowMockInput, executeLocalSandboxDryRun, executeLocalSandboxDryRunAsync } from './localSandboxEngine';
import type { ScriptEvaluator } from './sandbox/scriptRunner';
import type { WorkflowDef } from '../types/conductor';

describe('In-Browser Deterministic Dry-Run Sandbox Engine', () => {
  it('evaluates expressions, SET_VARIABLE, SWITCH branches, and DO_WHILE iterations in-browser', () => {
    const wf: WorkflowDef = {
      name: 'sandbox_test_wf',
      version: 1,
      inputParameters: ['orderId', 'channel'],
      tasks: [
        {
          name: 'set_env',
          taskReferenceName: 'set_env_ref',
          type: 'SET_VARIABLE',
          inputParameters: {
            region: 'cn-shanghai',
          },
        },
        {
          name: 'fetch_detail',
          taskReferenceName: 'fetch_detail_ref',
          type: 'HTTP',
          inputParameters: {
            http_request: {
              uri: 'https://api.internal/orders/${workflow.input.orderId}',
              method: 'GET',
            },
          },
        },
        {
          name: 'route_channel',
          taskReferenceName: 'route_channel_ref',
          type: 'SWITCH',
          caseValueParam: 'ch',
          inputParameters: {
            ch: '${workflow.input.channel}',
          },
          decisionCases: {
            MOBILE: [
              {
                name: 'mobile_push',
                taskReferenceName: 'mobile_push_ref',
                type: 'SIMPLE',
                inputParameters: {
                  region: '${workflow.variables.region}',
                  httpCode: '${fetch_detail_ref.output.response.statusCode}',
                },
              },
            ],
            WEB: [
              {
                name: 'web_notify',
                taskReferenceName: 'web_notify_ref',
                type: 'SIMPLE',
                inputParameters: {},
              },
            ],
          },
        },
        {
          name: 'batch_loop',
          taskReferenceName: 'batch_loop_ref',
          type: 'DO_WHILE',
          loopCondition: '$.batch_loop_ref.iteration < 2',
          loopOver: [
            {
              name: 'loop_worker',
              taskReferenceName: 'loop_worker_ref',
              type: 'SIMPLE',
              inputParameters: {
                orderId: '${workflow.input.orderId}',
              },
            },
          ],
        },
      ],
      outputParameters: {
        finalStatus: '${fetch_detail_ref.output.response.statusCode}',
        regionUsed: '${workflow.variables.region}',
      },
    };

    const instance = executeLocalSandboxDryRun(wf, {
      workflowInput: {
        orderId: 'ORD-777',
        channel: 'MOBILE',
      },
      maxLoopIterations: 2,
    });

    expect(instance.status).toBe('COMPLETED');
    expect(instance.output?.finalStatus).toBe(200);
    expect(instance.output?.regionUsed).toBe('cn-shanghai');

    // Should have executed MOBILE branch and skipped WEB branch
    const executedRefs = instance.tasks.map((t) => t.referenceTaskName);
    expect(executedRefs).toContain('mobile_push_ref');
    expect(executedRefs).not.toContain('web_notify_ref');

    // Mobile push task should have resolved ${workflow.variables.region} and ${fetch_detail_ref.output.response.statusCode}
    const mobileTask = instance.tasks.find((t) => t.referenceTaskName === 'mobile_push_ref');
    expect(mobileTask?.inputData?.region).toBe('cn-shanghai');
    expect(mobileTask?.inputData?.httpCode).toBe(200);

    // DO_WHILE loop should have executed 2 iterations: loop_worker_ref and loop_worker_ref__2
    expect(executedRefs).toContain('loop_worker_ref');
    expect(executedRefs).toContain('loop_worker_ref__2');
  });

  it('supports manual TaskMockOverride for custom outputData, forceCase routing, custom durationMs, and FAILED fault injection', () => {
    const wf: WorkflowDef = {
      name: 'manual_mock_wf',
      version: 1,
      tasks: [
        {
          name: 'risk_check',
          taskReferenceName: 'risk_check_ref',
          type: 'HTTP',
          inputParameters: {},
        },
        {
          name: 'route_decision',
          taskReferenceName: 'route_decision_ref',
          type: 'SWITCH',
          caseValueParam: 'risk',
          inputParameters: {
            risk: '${risk_check_ref.output.riskLevel}',
          },
          decisionCases: {
            LOW: [
              {
                name: 'auto_approve',
                taskReferenceName: 'auto_approve_ref',
                type: 'SIMPLE',
              },
            ],
            HIGH: [
              {
                name: 'manual_audit',
                taskReferenceName: 'manual_audit_ref',
                type: 'SIMPLE',
              },
            ],
          },
        },
        {
          name: 'final_settlement',
          taskReferenceName: 'final_settlement_ref',
          type: 'SIMPLE',
        },
      ],
    };

    const instance = executeLocalSandboxDryRun(wf, {
      taskMocks: {
        risk_check_ref: {
          __isMockOverride: true,
          status: 'COMPLETED',
          durationMs: 888,
          outputData: { riskLevel: 'LOW', customTag: 'mocked-by-user' },
        },
        // Force SWITCH to take HIGH branch despite riskLevel being LOW
        route_decision_ref: {
          __isMockOverride: true,
          forceCase: 'HIGH',
        },
        // Inject failure on manual_audit_ref so final_settlement_ref is short-circuited
        manual_audit_ref: {
          __isMockOverride: true,
          status: 'FAILED',
          reasonForIncompletion: 'Simulated audit rejection',
        },
      },
    });

    expect(instance.status).toBe('FAILED');
    const executedRefs = instance.tasks.map((t) => t.referenceTaskName);
    expect(executedRefs).toEqual(['risk_check_ref', 'route_decision_ref', 'manual_audit_ref']);
    expect(executedRefs).not.toContain('final_settlement_ref');

    const riskTask = instance.tasks.find((t) => t.referenceTaskName === 'risk_check_ref');
    expect(riskTask?.outputData?.customTag).toBe('mocked-by-user');
    expect((riskTask?.endTime || 0) - (riskTask?.startTime || 0)).toBe(888);

    const auditTask = instance.tasks.find((t) => t.referenceTaskName === 'manual_audit_ref');
    expect(auditTask?.status).toBe('FAILED');
    expect(auditTask?.reasonForIncompletion).toBe('Simulated audit rejection');
  });

  it('sync API does not invent script results: INLINE is marked not executed', () => {
    const wf: WorkflowDef = {
      name: 'sync_inline',
      tasks: [{ name: 'calc', taskReferenceName: 'calc', type: 'INLINE', inputParameters: { evaluatorType: 'graaljs', expression: '1 + 1' } }],
    };
    const instance = executeLocalSandboxDryRun(wf);
    expect(instance.isSandbox).toBe(true);
    expect(instance.tasks[0].status).toBe('SKIPPED');
    expect(instance.tasks[0].sandboxExecution).toBe('not_executed');
  });
});

// Plain-function evaluator for node tests; the browser default runs scripts in an isolated Web Worker.
const evaluate: ScriptEvaluator = async (expression, input) => {
  try {
    return { ok: true, value: new Function('$', '__src', 'return eval(__src);')(input, expression) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

describe('Async sandbox: tasks without outside systems run for real', () => {
  const wf: WorkflowDef = {
    name: 'real_exec',
    version: 1,
    tasks: [
      {
        name: 'calc',
        taskReferenceName: 'calc',
        type: 'INLINE',
        inputParameters: { evaluatorType: 'graaljs', a: '${workflow.input.a}', expression: '(function(){ return $.a * 2; })()' },
      },
      {
        name: 'sum',
        taskReferenceName: 'sum',
        type: 'JSON_JQ_TRANSFORM',
        inputParameters: { items: '${workflow.input.items}', queryExpression: '[.items[] | select(.n > 1) | .n] | add' },
      },
      {
        name: 'size',
        taskReferenceName: 'size',
        type: 'SWITCH',
        evaluatorType: 'javascript',
        expression: '$.v > 10 ? "BIG" : "SMALL"',
        inputParameters: { v: '${calc.output.result}' },
        decisionCases: {
          BIG: [{ name: 'big', taskReferenceName: 'big', type: 'NOOP' }],
          SMALL: [{ name: 'small', taskReferenceName: 'small', type: 'NOOP' }],
        },
      },
      {
        name: 'route',
        taskReferenceName: 'route',
        type: 'SWITCH',
        evaluatorType: 'value-param',
        expression: 'k',
        inputParameters: { k: 'NOPE' },
        decisionCases: { A: [{ name: 'a', taskReferenceName: 'case_a', type: 'NOOP' }] },
        defaultCase: [{ name: 'd', taskReferenceName: 'case_default', type: 'NOOP' }],
      },
      {
        name: 'loop',
        taskReferenceName: 'loop',
        type: 'DO_WHILE',
        loopCondition: '$.loop.iteration < 3',
        loopOver: [{ name: 'tick', taskReferenceName: 'tick', type: 'INLINE', inputParameters: { evaluatorType: 'javascript', expression: '1 + 1' } }],
      },
      {
        name: 'fan',
        taskReferenceName: 'fan',
        type: 'FORK_JOIN_DYNAMIC',
        dynamicForkTasksParam: 'tasks',
        dynamicForkTasksInputParamName: 'inputs',
        inputParameters: {
          tasks: [
            { name: 'x', taskReferenceName: 'x1', type: 'INLINE' },
            { name: 'x', taskReferenceName: 'x2', type: 'INLINE' },
          ],
          inputs: {
            x1: { evaluatorType: 'javascript', expression: '"one"' },
            x2: { evaluatorType: 'javascript', expression: '"two"' },
          },
        },
      },
      { name: 'join', taskReferenceName: 'join', type: 'JOIN' },
    ],
    outputParameters: {
      doubled: '${calc.output.result}',
      sum: '${sum.output.result}',
      joined: '${join.output}',
      first: '${workflow.input.items[0].n}',
      calcInput: '${calc.input.a}',
    },
  };

  it('runs INLINE, JQ, SWITCH, DO_WHILE, FORK_JOIN_DYNAMIC with Conductor semantics', async () => {
    const instance = await executeLocalSandboxDryRunAsync(wf, {
      workflowInput: { a: 7, items: [{ n: 1 }, { n: 2 }, { n: 3 }] },
      scriptEvaluator: evaluate,
    });
    expect(instance.status).toBe('COMPLETED');
    expect(instance.output).toEqual({
      doubled: 14,
      sum: 5,
      joined: { x1: { result: 'one' }, x2: { result: 'two' } },
      first: 1,
      calcInput: 7,
    });
    const refs = instance.tasks.map((t) => t.referenceTaskName);
    expect(refs).toContain('big');
    expect(refs).not.toContain('small');
    // unmatched value-param case goes to defaultCase, not the first case
    expect(refs).toContain('case_default');
    expect(refs).not.toContain('case_a');
    // loop condition decides: 3 iterations
    expect(refs.filter((r) => r.startsWith('tick'))).toEqual(['tick', 'tick__2', 'tick__3']);
    expect(instance.tasks.find((t) => t.referenceTaskName === 'loop')?.iteration).toBe(3);
    expect(instance.tasks.find((t) => t.referenceTaskName === 'calc')?.sandboxExecution).toBe('executed');
  });

  it('stops a loop whose condition stays true at the safety limit', async () => {
    const instance = await executeLocalSandboxDryRunAsync(
      { name: 'forever', tasks: [{ name: 'l', taskReferenceName: 'l', type: 'DO_WHILE', loopCondition: 'true', loopOver: [{ name: 'n', taskReferenceName: 'n', type: 'NOOP' }] }] },
      { scriptEvaluator: evaluate, maxLoopIterations: 5 },
    );
    const loop = instance.tasks[0];
    expect(loop.status).toBe('COMPLETED_WITH_ERRORS');
    expect(loop.iteration).toBe(5);
    expect(loop.reasonForIncompletion).toMatch(/上限 5 轮/);
  });

  it('fails the task with the script error, and jq errors say what went wrong', async () => {
    const thrown = await executeLocalSandboxDryRunAsync(
      { name: 'boom', tasks: [{ name: 'i', taskReferenceName: 'i', type: 'INLINE', inputParameters: { evaluatorType: 'javascript', expression: 'throw new Error("boom")' } }] },
      { scriptEvaluator: evaluate },
    );
    expect(thrown.status).toBe('FAILED');
    expect(thrown.tasks[0].reasonForIncompletion).toBe('脚本执行失败：boom');

    const jq = await executeLocalSandboxDryRunAsync(
      { name: 'jqbad', tasks: [{ name: 'j', taskReferenceName: 'j', type: 'JSON_JQ_TRANSFORM', inputParameters: { queryExpression: '.a[]', a: 5 } }] },
      { scriptEvaluator: evaluate },
    );
    expect(jq.status).toBe('FAILED');
    expect(jq.tasks[0].reasonForIncompletion).toMatch(/^jq 执行失败/);
  });

  it('marks outside-system tasks as mocked and records unresolved references', async () => {
    const instance = await executeLocalSandboxDryRunAsync(
      { name: 'mocked', tasks: [{ name: 'h', taskReferenceName: 'h', type: 'HTTP', inputParameters: { id: '${nope.output.id}' } }] },
      { scriptEvaluator: evaluate },
    );
    expect(instance.tasks[0].sandboxExecution).toBe('mocked');
    expect(instance.tasks[0].sandboxWarnings?.[0]).toMatch(/nope\.output\.id/);
  });

  it('TERMINATE with COMPLETED ends the workflow as COMPLETED and skips the rest', async () => {
    const instance = await executeLocalSandboxDryRunAsync(
      {
        name: 'term',
        tasks: [
          { name: 't', taskReferenceName: 't', type: 'TERMINATE', inputParameters: { terminationStatus: 'COMPLETED' } },
          { name: 'n', taskReferenceName: 'n', type: 'NOOP' },
        ],
      },
      { scriptEvaluator: evaluate },
    );
    expect(instance.status).toBe('COMPLETED');
    expect(instance.tasks.map((t) => t.referenceTaskName)).toEqual(['t']);
  });

  it('without Web Worker support the default evaluator reports scripts as not executed', async () => {
    const instance = await executeLocalSandboxDryRunAsync({
      name: 'noworker',
      tasks: [{ name: 'i', taskReferenceName: 'i', type: 'INLINE', inputParameters: { evaluatorType: 'javascript', expression: '1' } }],
    });
    expect(instance.tasks[0].sandboxExecution).toBe('not_executed');
    expect(instance.tasks[0].reasonForIncompletion).toMatch(/Web Worker/);
  });
});

describe('v1.3.2 批次 2：沙箱与 Conductor 语义对齐', () => {
  it('[S11-01] 可选任务失败记为带错完成，流程继续', async () => {
    const instance = await executeLocalSandboxDryRunAsync(
      {
        name: 'optional_fail',
        tasks: [
          { name: 'h', taskReferenceName: 'h', type: 'HTTP', optional: true, inputParameters: {} },
          { name: 'after', taskReferenceName: 'after', type: 'NOOP' },
        ],
      },
      { scriptEvaluator: evaluate, taskMocks: { h: { status: 'FAILED', reasonForIncompletion: '下游 503' } } },
    );
    expect(instance.status).toBe('COMPLETED');
    const h = instance.tasks.find((t) => t.referenceTaskName === 'h')!;
    expect(h.status).toBe('COMPLETED_WITH_ERRORS');
    expect(h.reasonForIncompletion).toBe('下游 503');
    expect(instance.tasks.map((t) => t.referenceTaskName)).toEqual(['h', 'after']);
  });

  it('[S11-02] 可选的脚本任务失败、超时也继续；非可选任务失败仍中断', async () => {
    const optionalScript = await executeLocalSandboxDryRunAsync(
      {
        name: 'optional_script',
        tasks: [
          { name: 'i', taskReferenceName: 'i', type: 'INLINE', optional: true, inputParameters: { evaluatorType: 'javascript', expression: 'throw new Error("x")' } },
          { name: 's', taskReferenceName: 's', type: 'SIMPLE', optional: true, inputParameters: {} },
          { name: 'after', taskReferenceName: 'after', type: 'NOOP' },
        ],
      },
      { scriptEvaluator: evaluate, taskMocks: { s: { status: 'TIMED_OUT' } } },
    );
    expect(optionalScript.status).toBe('COMPLETED');
    expect(optionalScript.tasks.map((t) => [t.referenceTaskName, t.status])).toEqual([
      ['i', 'COMPLETED_WITH_ERRORS'],
      ['s', 'COMPLETED_WITH_ERRORS'],
      ['after', 'COMPLETED'],
    ]);

    const required = await executeLocalSandboxDryRunAsync(
      {
        name: 'required_fail',
        tasks: [
          { name: 'h', taskReferenceName: 'h', type: 'HTTP', inputParameters: {} },
          { name: 'after', taskReferenceName: 'after', type: 'NOOP' },
        ],
      },
      { scriptEvaluator: evaluate, taskMocks: { h: { status: 'FAILED' } } },
    );
    expect(required.status).toBe('FAILED');
    expect(required.tasks.map((t) => t.referenceTaskName)).toEqual(['h']);
  });

  it.each([
    ['COMPLETED', 'COMPLETED', undefined],
    ['FAILED', 'FAILED', '库存不足'],
    ['TERMINATED', 'TERMINATED', '库存不足'],
  ] as const)('[S12-01] TERMINATE 以 %s 结束：实例状态 %s，输出取 workflowOutput，之后的任务不执行', async (terminationStatus, expected, reason) => {
    const instance = await executeLocalSandboxDryRunAsync(
      {
        name: 'term_' + terminationStatus,
        outputParameters: { ignored: '${workflow.input.a}' },
        tasks: [
          {
            name: 't', taskReferenceName: 't', type: 'TERMINATE',
            inputParameters: { terminationStatus, terminationReason: '库存不足', workflowOutput: { code: 'OUT_OF_STOCK', a: '${workflow.input.a}' } },
          },
          { name: 'n', taskReferenceName: 'n', type: 'NOOP' },
        ],
      },
      { scriptEvaluator: evaluate, workflowInput: { a: 3 } },
    );
    expect(instance.status).toBe(expected);
    expect(instance.output).toEqual({ code: 'OUT_OF_STOCK', a: 3 });
    expect(instance.reasonForIncompletion).toBe(reason);
    expect(instance.tasks.map((t) => [t.referenceTaskName, t.status])).toEqual([['t', 'COMPLETED']]);
  });

  it('[S13-01] 默认模拟入参按 inputSchema 类型与 inputTemplate 默认值生成', () => {
    const input = buildDefaultWorkflowMockInput({
      name: 'typed_inputs',
      inputParameters: ['qty', 'vip', 'tags', 'meta', 'region', 'note'],
      inputSchema: {
        name: 'typed_inputs_input',
        type: 'JSON',
        data: {
          type: 'object',
          properties: {
            qty: { type: 'integer' },
            vip: { type: 'boolean' },
            tags: { type: 'array' },
            meta: { type: 'object' },
            region: { type: 'string', examples: ['cn-north'] },
          },
        },
      },
      inputTemplate: { qty: 5 },
      tasks: [{ name: 'x', taskReferenceName: 'x', type: 'NOOP', inputParameters: { e: '${workflow.input.extra}' } }],
    } as WorkflowDef);
    expect(input).toEqual({ qty: 5, vip: true, tags: [], meta: {}, region: 'cn-north', note: 'sample_note', extra: 'mock_extra' });
  });

  it('[S13-02] 执行时 inputTemplate 补齐缺省入参，variables 取定义里的初值', async () => {
    const instance = await executeLocalSandboxDryRunAsync(
      {
        name: 'template_fill',
        inputParameters: ['a', 'b'],
        inputTemplate: { a: 2, b: 10 },
        variables: { count: 1 },
        tasks: [
          { name: 'calc', taskReferenceName: 'calc', type: 'INLINE', inputParameters: { evaluatorType: 'javascript', a: '${workflow.input.a}', b: '${workflow.input.b}', c: '${workflow.variables.count}', expression: '$.a * $.b + $.c' } },
        ],
      } as WorkflowDef,
      { scriptEvaluator: evaluate, workflowInput: { a: 3 } },
    );
    expect(instance.input).toEqual({ a: 3, b: 10 });
    expect(instance.tasks[0].outputData).toEqual({ result: 31 });
    expect(instance.variables).toEqual({ count: 1 });
  });

  it('[S12-02] terminationStatus 写错时 TERMINATE 失败并说明可选值', async () => {
    const instance = await executeLocalSandboxDryRunAsync(
      { name: 'term_bad', tasks: [{ name: 't', taskReferenceName: 't', type: 'TERMINATE', inputParameters: { terminationStatus: 'DONE' } }] },
      { scriptEvaluator: evaluate },
    );
    expect(instance.status).toBe('FAILED');
    expect(instance.tasks[0].reasonForIncompletion).toMatch(/COMPLETED、FAILED 或 TERMINATED/);
  });
});
