import { describe, it, expect } from 'vitest';
import { defaultActionRegistry } from '../actions/registry';
import { compileStepModelToWorkflowDef } from './compile';
import { decompileWorkflowDefToStepModel } from './decompile';
import type { BusinessWorkflowModel } from './types';
import type { WorkflowDef } from '../types/conductor';
import { createStepFromAction } from './factory';

describe('stepmodel & actions compile/decompile round-trip', () => {
  it('correctly registers built-in cloud host and common actions', () => {
    const ecsActions = defaultActionRegistry.getActionsByCategory('compute');
    expect(ecsActions.length).toBeGreaterThanOrEqual(6);

    const createAction = defaultActionRegistry.getAction('ecs.create_instance');
    expect(createAction).toBeDefined();
    expect(createAction?.name).toBe('创建云主机');
    expect(createAction?.outputs.some((o) => o.key === 'instanceId')).toBe(true);
  });

  it('compiles a BusinessWorkflowModel to Conductor WorkflowDef and decompiles back losslessly', () => {
    const model: BusinessWorkflowModel = {
      name: 'daily_ecs_backup_and_check',
      description: '每日云主机自动快照与巡检',
      version: 1,
      steps: [
        {
          id: 'step_1',
          actionId: 'ecs.create_instance',
          taskReferenceName: 'create_app_node',
          name: '创建云主机',
          values: {
            regionId: 'cn-hangzhou',
            instanceType: 'ecs.c7.xlarge',
            instanceName: 'prod-api-server',
            imageId: 'image-alilinux-3',
            systemDiskSize: 120,
          },
        },
        {
          id: 'step_2',
          actionId: 'ecs.create_snapshot',
          taskReferenceName: 'snapshot_app_disk',
          name: '创建云盘快照',
          values: {
            instanceId: '${create_app_node.output.instanceId}',
            snapshotName: 'auto-daily-snapshot',
            retentionDays: 14,
          },
        },
        {
          id: 'step_3',
          actionId: 'notify.send_message',
          taskReferenceName: 'send_report',
          name: '发送运维通知',
          values: {
            channel: 'webhook_dingtalk',
            title: '【巡检通知】云主机已创建并完成快照',
            content: '实例 ${create_app_node.output.instanceId} 快照已归档。',
          },
        },
      ],
    };

    const workflowDef = compileStepModelToWorkflowDef(model);
    expect(workflowDef.name).toBe('daily_ecs_backup_and_check');
    expect(workflowDef.tasks.length).toBe(3);
    expect(workflowDef.tasks[0].taskReferenceName).toBe('create_app_node');
    expect(workflowDef.tasks[0].type).toBe('HTTP');
    expect(workflowDef.tasks[1].taskReferenceName).toBe('snapshot_app_disk');

    // Decompile back
    const restoredModel = decompileWorkflowDefToStepModel(workflowDef);
    expect(restoredModel.steps.length).toBe(3);
    expect(restoredModel.steps[0].actionId).toBe('ecs.create_instance');
    expect(restoredModel.steps[0].values.instanceName).toBe('prod-api-server');
    expect(restoredModel.steps[0].values.systemDiskSize).toBe(120);

    expect(restoredModel.steps[1].actionId).toBe('ecs.create_snapshot');
    expect(restoredModel.steps[1].values.instanceId).toBe('${create_app_node.output.instanceId}');
    expect(restoredModel.steps[1].values.retentionDays).toBe(14);

    expect(restoredModel.steps[2].actionId).toBe('notify.send_message');
    expect(restoredModel.steps[2].values.channel).toBe('webhook_dingtalk');
  });

  it('losslessly preserves unknown technical tasks as isProFallback steps', () => {
    const rawDef = {
      name: 'hybrid_workflow',
      tasks: [
        {
          name: 'ecs_create_instance',
          taskReferenceName: 'ecs_step',
          type: 'HTTP' as const,
          inputParameters: {
            _actionId: 'ecs.create_instance',
            instanceName: 'test-node',
          },
        },
        {
          name: 'complex_jq_transform',
          taskReferenceName: 'jq_step',
          type: 'JSON_JQ_TRANSFORM' as const,
          inputParameters: {
            queryExpression: '.items[] | {id: .id, active: true}',
          },
        },
      ],
    };

    const model = decompileWorkflowDefToStepModel(rawDef);
    expect(model.steps.length).toBe(2);
    expect(model.steps[0].isProFallback).toBe(false);
    expect(model.steps[1].isProFallback).toBe(true);
    expect(model.steps[1].name).toBe('complex_jq_transform');
    expect(model.steps[1].rawTaskDef?.type).toBe('JSON_JQ_TRANSFORM');

    // Recompiling preserves the raw JQ task definition intact
    const recompiled = compileStepModelToWorkflowDef(model);
    expect(recompiled.tasks.length).toBe(2);
    expect(recompiled.tasks[1].type).toBe('JSON_JQ_TRANSFORM');
    expect(recompiled.tasks[1].inputParameters?.queryExpression).toBe(
      '.items[] | {id: .id, active: true}'
    );
  });

  it('decompiles and compiles control flow structures (DECISION, FORK_JOIN, DO_WHILE) with nested step fidelity', () => {
    const rawDef = {
      name: 'control_flow_showcase',
      tasks: [
        {
          name: 'route_by_env',
          taskReferenceName: 'switch_env',
          type: 'DECISION' as const,
          caseValueParam: 'env',
          inputParameters: { env: '${workflow.input.env}' },
          decisionCases: {
            prod: [
              {
                name: 'ecs_create_prod',
                taskReferenceName: 'create_prod_ecs',
                type: 'HTTP' as const,
                inputParameters: {
                  _actionId: 'ecs.create_instance',
                  instanceName: 'prod-server',
                  instanceType: 'ecs.g7.2xlarge',
                },
              },
            ],
            test: [
              {
                name: 'ecs_create_test',
                taskReferenceName: 'create_test_ecs',
                type: 'HTTP' as const,
                inputParameters: {
                  _actionId: 'ecs.create_instance',
                  instanceName: 'test-server',
                  instanceType: 'ecs.e-c1m1.large',
                },
              },
            ],
          },
          defaultCase: [
            {
              name: 'notify_invalid_env',
              taskReferenceName: 'notify_invalid',
              type: 'HTTP' as const,
              inputParameters: {
                _actionId: 'notify.send_message',
                title: '未知环境报警',
              },
            },
          ],
        },
        {
          name: 'parallel_ops',
          taskReferenceName: 'fork_ops',
          type: 'FORK_JOIN' as const,
          forkTasks: [
            [
              {
                name: 'ecs_snapshot',
                taskReferenceName: 'take_snap',
                type: 'HTTP' as const,
                inputParameters: {
                  _actionId: 'ecs.create_snapshot',
                  snapshotName: 'auto-snap',
                },
              },
            ],
            [
              {
                name: 'send_notice',
                taskReferenceName: 'send_chat',
                type: 'HTTP' as const,
                inputParameters: {
                  _actionId: 'notify.send_message',
                  title: '并行通知',
                },
              },
            ],
          ],
        },
        {
          name: 'join_ops',
          taskReferenceName: 'join_ops_ref',
          type: 'JOIN' as const,
          joinOn: ['take_snap', 'send_chat'],
        },
        {
          name: 'wait_ready_loop',
          taskReferenceName: 'loop_check',
          type: 'DO_WHILE' as const,
          loopCondition: '$.check_status.output.status == "PENDING"',
          loopOver: [
            {
              name: 'ecs_query_instance',
              taskReferenceName: 'check_status',
              type: 'HTTP' as const,
              inputParameters: {
                _actionId: 'ecs.query_instance',
                instanceId: 'i-test123',
              },
            },
          ],
        },
      ],
    };

    // 1. Decompile
    const model = decompileWorkflowDefToStepModel(rawDef);

    // Expect 3 business steps (FORK_JOIN + JOIN are merged into 1 logical step)
    expect(model.steps.length).toBe(3);

    // Check DECISION step
    const decisionStep = model.steps[0];
    expect(decisionStep.controlType).toBe('decision');
    expect(decisionStep.caseParam).toBe('env');
    expect(decisionStep.branches?.length).toBe(3); // prod, test, __default__
    expect(decisionStep.branches?.[0].steps[0].actionId).toBe('ecs.create_instance');
    expect(decisionStep.branches?.[2].caseKey).toBe('__default__');

    // Check FORK_JOIN step
    const forkStep = model.steps[1];
    expect(forkStep.controlType).toBe('fork');
    expect(forkStep.forkLanes?.length).toBe(2);
    expect(forkStep.forkLanes?.[0].steps[0].actionId).toBe('ecs.create_snapshot');
    expect(forkStep.pairedJoinTaskRef).toBe('join_ops_ref');

    // Check DO_WHILE step
    const loopStep = model.steps[2];
    expect(loopStep.controlType).toBe('loop');
    expect(loopStep.loopCondition).toBe('$.check_status.output.status == "PENDING"');
    expect(loopStep.loopSteps?.length).toBe(1);
    expect(loopStep.loopSteps?.[0].actionId).toBe('ecs.query_instance');

    // 2. Recompile
    const recompiled = compileStepModelToWorkflowDef(model);
    expect(recompiled.tasks.length).toBe(4); // DECISION, FORK_JOIN, JOIN, DO_WHILE

    // Validate DECISION recompiled structure
    const recDecision = recompiled.tasks[0];
    expect(recDecision.type).toBe('DECISION');
    expect(recDecision.decisionCases?.prod?.length).toBe(1);
    expect(recDecision.decisionCases?.test?.length).toBe(1);
    expect(recDecision.defaultCase?.length).toBe(1);

    // Validate FORK_JOIN & JOIN recompiled structure
    const recFork = recompiled.tasks[1];
    expect(recFork.type).toBe('FORK_JOIN');
    expect(recFork.forkTasks?.length).toBe(2);
    const recJoin = recompiled.tasks[2];
    expect(recJoin.type).toBe('JOIN');
    expect(recJoin.taskReferenceName).toBe('join_ops_ref');
    expect(recJoin.joinOn).toEqual(['take_snap', 'send_chat']);

    // Validate DO_WHILE recompiled structure
    const recLoop = recompiled.tasks[3];
    expect(recLoop.type).toBe('DO_WHILE');
    expect(recLoop.loopCondition).toBe('$.check_status.output.status == "PENDING"');
    expect(recLoop.loopOver?.length).toBe(1);
    expect(recLoop.loopOver?.[0].taskReferenceName).toBe('check_status');
  });
});

describe('多层嵌套控制流 compile/decompile', () => {
  const simple = (ref: string) => ({ name: ref, taskReferenceName: ref, type: 'SIMPLE' as const, inputParameters: {} });

  const nestedDef = {
    name: 'nested_wf',
    version: 1,
    schemaVersion: 2,
    tasks: [
      {
        name: 'outer_switch',
        taskReferenceName: 'outer_switch',
        type: 'DECISION' as const,
        caseValueParam: 'kind',
        decisionCases: {
          A: [
            {
              name: 'inner_switch',
              taskReferenceName: 'inner_switch',
              type: 'DECISION' as const,
              caseValueParam: 'level',
              decisionCases: { HIGH: [simple('deep_task')] },
              defaultCase: [],
            },
          ],
          B: [
            {
              name: 'inner_fork',
              taskReferenceName: 'inner_fork',
              type: 'FORK_JOIN' as const,
              forkTasks: [[simple('lane_a')], [simple('lane_b')]],
            },
            {
              name: 'inner_fork_join',
              taskReferenceName: 'inner_fork_join',
              type: 'JOIN' as const,
              joinOn: ['lane_a', 'lane_b'],
            },
          ],
        },
        defaultCase: [],
      },
    ],
  } as any;

  it('分支内再嵌套分支 / 并行时可无损往返，且嵌套并行的 JOIN 被保留', () => {
    const model = decompileWorkflowDefToStepModel(nestedDef);
    const outer = model.steps[0];
    expect(outer.controlType).toBe('decision');

    const branchA = outer.branches!.find((b) => b.caseKey === 'A')!;
    expect(branchA.steps[0].controlType).toBe('decision');
    expect(branchA.steps[0].branches![0].steps[0].taskReferenceName).toBe('deep_task');

    const branchB = outer.branches!.find((b) => b.caseKey === 'B')!;
    // JOIN 被折叠进并行组，不应变成独立的"专业步骤"
    expect(branchB.steps).toHaveLength(1);
    expect(branchB.steps[0].controlType).toBe('fork');
    expect(branchB.steps[0].pairedJoinTaskRef).toBe('inner_fork_join');

    const compiled = compileStepModelToWorkflowDef(model);
    const outTask = compiled.tasks[0];
    expect(outTask.decisionCases!.A[0].type).toBe('DECISION');
    expect(outTask.decisionCases!.A[0].decisionCases!.HIGH[0].taskReferenceName).toBe('deep_task');

    const bTasks = outTask.decisionCases!.B;
    expect(bTasks.map((t: any) => t.type)).toEqual(['FORK_JOIN', 'JOIN']);
    expect(bTasks[1].joinOn).toEqual(['lane_a', 'lane_b']);
  });
});

describe('步骤 ID 稳定性', () => {
  it('同一份定义多次反编译（跨毫秒）得到相同的步骤 ID，包括嵌套步骤', async () => {
    const def = {
      name: 'wf',
      tasks: [
        { name: 'a', taskReferenceName: 'a_ref', type: 'SIMPLE', inputParameters: {} },
        {
          name: 'sw',
          taskReferenceName: 'sw_ref',
          type: 'DECISION',
          caseValueParam: 'k',
          decisionCases: { X: [{ name: 'b', taskReferenceName: 'b_ref', type: 'SIMPLE', inputParameters: {} }] },
          defaultCase: [],
        },
      ],
    } as any;
    const first = decompileWorkflowDefToStepModel(def);
    await new Promise((r) => setTimeout(r, 5));
    const second = decompileWorkflowDefToStepModel(def);

    expect(second.steps.map((s) => s.id)).toEqual(first.steps.map((s) => s.id));
    expect(second.steps[1].branches![0].steps[0].id).toBe(first.steps[1].branches![0].steps[0].id);
    expect(first.steps[0].id).toBe('step_a_ref');
  });

  it('新建步骤的 ID 与其编译再反编译后的 ID 一致（保证新增后能自动展开）', () => {
    const action = defaultActionRegistry.getAllActions().find((a) => a.id === 'notify.send_message')!;
    const step = createStepFromAction(action);
    const def = compileStepModelToWorkflowDef({ name: 'wf', steps: [step] });
    const back = decompileWorkflowDefToStepModel(def);
    expect(back.steps[0].id).toBe(step.id);
  });
});

describe('v1.3.1 业务模式往返无损（B1–B8 / B19 / B20）', () => {
  const R = defaultActionRegistry;
  const wf = (tasks: any[]) => ({ name: 'wf', version: 1, schemaVersion: 2, tasks }) as any;
  const roundTrip = (def: any) => compileStepModelToWorkflowDef(decompileWorkflowDefToStepModel(def));
  const simple = (ref: string) => ({ name: ref, taskReferenceName: ref, type: 'SIMPLE' as const, inputParameters: {} });

  it('B1 新建条件分支：判断取值绑定到 inputParameters[caseParam]，编译后可再反编译回来', () => {
    const step = createStepFromAction(R.getAction('control.decision')!);
    step.values = { ...step.values, [step.caseParam!]: '${workflow.input.env}' };
    const def = compileStepModelToWorkflowDef({ name: 'wf', steps: [step] });
    const task = def.tasks[0];
    expect(task.type).toBe('DECISION');
    expect(task.inputParameters?.[task.caseValueParam!]).toBe('${workflow.input.env}');
    const back = decompileWorkflowDefToStepModel(def).steps[0];
    expect(back.caseParam).toBe(step.caseParam);
    expect(back.values[back.caseParam!]).toBe('${workflow.input.env}');
  });

  it('B2 空默认分支往返后仍然存在；B3 删除默认分支后不会复活旧步骤', () => {
    const def = wf([
      { name: 'sw', taskReferenceName: 'sw', type: 'DECISION', caseValueParam: 'k', inputParameters: { k: '${workflow.input.k}' }, decisionCases: { A: [simple('a')] }, defaultCase: [] },
    ]);
    const model = decompileWorkflowDefToStepModel(def);
    expect(model.steps[0].branches!.map((b) => b.caseKey)).toEqual(['A', '__default__']);
    const again = decompileWorkflowDefToStepModel(compileStepModelToWorkflowDef(model));
    expect(again.steps[0].branches!.map((b) => b.caseKey)).toEqual(['A', '__default__']);

    const withDefault = decompileWorkflowDefToStepModel(
      wf([{ ...def.tasks[0], defaultCase: [simple('fallback')] }])
    );
    withDefault.steps[0].branches = withDefault.steps[0].branches!.filter((b) => b.caseKey !== '__default__');
    expect(compileStepModelToWorkflowDef(withDefault).tasks[0].defaultCase).toEqual([]);
  });

  it('B19 SWITCH value-param：expression 作为判断参数，往返不变且可编辑', () => {
    const sw = {
      name: 'route_by_env', taskReferenceName: 'sw', type: 'SWITCH', evaluatorType: 'value-param', expression: 'env',
      inputParameters: { env: '${workflow.input.env}' },
      decisionCases: { prod: [simple('a')] }, defaultCase: [simple('b')],
    };
    const model = decompileWorkflowDefToStepModel(wf([sw]));
    expect(model.steps[0].caseParam).toBe('env');
    expect(model.steps[0].caseExpression).toBeUndefined();
    expect(compileStepModelToWorkflowDef(model).tasks[0]).toEqual(sw);

    model.steps[0].caseParam = 'region';
    model.steps[0].values = { region: '${workflow.input.region}' };
    const edited = compileStepModelToWorkflowDef(model).tasks[0];
    expect(edited.expression).toBe('region');
    expect(edited.inputParameters).toEqual({ region: '${workflow.input.region}' });
  });

  it('B19 SWITCH javascript：脚本表达式往返不变；清空后如实写空，不回退旧值', () => {
    const sw = {
      name: 'js_switch', taskReferenceName: 'jsw', type: 'SWITCH', evaluatorType: 'javascript',
      expression: '$.amount > 100 ? "big" : "small"', inputParameters: { amount: '${workflow.input.amount}' },
      decisionCases: { big: [simple('a')] }, defaultCase: [],
    };
    const model = decompileWorkflowDefToStepModel(wf([sw]));
    expect(model.steps[0].caseExpression).toBe(sw.expression);
    expect(compileStepModelToWorkflowDef(model).tasks[0]).toEqual(sw);
    model.steps[0].caseExpression = '';
    expect(compileStepModelToWorkflowDef(model).tasks[0].expression).toBe('');
  });

  it('B19 DECISION caseExpression 与 caseValueParam 互斥，编辑哪个写哪个', () => {
    const model = decompileWorkflowDefToStepModel(
      wf([{ name: 'd', taskReferenceName: 'd', type: 'DECISION', caseExpression: '$.x', decisionCases: {}, defaultCase: [] }])
    );
    expect(model.steps[0].caseExpression).toBe('$.x');
    model.steps[0].caseExpression = undefined;
    model.steps[0].caseParam = 'k';
    const t = compileStepModelToWorkflowDef(model).tasks[0];
    expect(t.caseValueParam).toBe('k');
    expect('caseExpression' in t).toBe(false);
  });

  it('B4 FORK_JOIN_DYNAMIC + JOIN 往返后保持两个任务，且不凭空生成 forkTasks', () => {
    const fd = { name: 'dyn', taskReferenceName: 'dyn', type: 'FORK_JOIN_DYNAMIC', dynamicForkTasksParam: 't', dynamicForkTasksInputParamName: 'i', inputParameters: { t: '${x.output.t}', i: '${x.output.i}' } };
    const jn = { name: 'jn', taskReferenceName: 'jn', type: 'JOIN' };
    const model = decompileWorkflowDefToStepModel(wf([fd, jn]));
    expect(model.steps).toHaveLength(1);
    expect(model.steps[0].isProFallback).toBe(true);
    expect(model.steps[0].pairedJoinTaskRef).toBe('jn');
    const out = compileStepModelToWorkflowDef(model);
    expect(out.tasks).toEqual([fd, jn]);
  });

  it('JOIN 的原始字段（name / joinMode 等）往返保留', () => {
    const f = { name: 'f', taskReferenceName: 'f', type: 'FORK_JOIN', forkTasks: [[simple('a')], [simple('b')]] };
    const j = { name: 'my_join', taskReferenceName: 'j', type: 'JOIN', joinOn: ['a', 'b'] };
    expect(roundTrip(wf([f, j])).tasks[1]).toEqual(j);
  });

  it('B5 原始 WAIT（until / 等待信号）保留为专业步骤，不被改写成"等待 10 秒"', () => {
    const until = { name: 'w1', taskReferenceName: 'w1', type: 'WAIT', inputParameters: { until: '2026-12-01 09:00 GMT+8' } };
    const signal = { name: 'w2', taskReferenceName: 'w2', type: 'WAIT' };
    const model = decompileWorkflowDefToStepModel(wf([until, signal]));
    expect(model.steps.every((s) => s.isProFallback)).toBe(true);
    expect(compileStepModelToWorkflowDef(model).tasks).toEqual([until, signal]);

    const dur = decompileWorkflowDefToStepModel(wf([{ name: 'w3', taskReferenceName: 'w3', type: 'WAIT', inputParameters: { duration: '30s' } }]));
    expect(dur.steps[0].actionId).toBe('control.wait');
    expect(dur.steps[0].values.duration).toBe('30s');
  });

  it('B6 已识别动作往返保留 optional / retryCount / timeoutSeconds / startDelay / description 与额外配置', () => {
    const t = {
      name: 'ecs_query_instance', taskReferenceName: 'q', type: 'HTTP', optional: true, retryCount: 5,
      timeoutSeconds: 30, startDelay: 2, description: '查询生产主机',
      inputParameters: { _actionId: 'ecs.query_instance', instanceId: 'i-1', http_request: { uri: 'https://x', headers: { 'X-Token': '${workflow.input.token}' } } },
    };
    const out = roundTrip(wf([t])).tasks[0];
    expect(out).toMatchObject({ optional: true, retryCount: 5, timeoutSeconds: 30, startDelay: 2, description: '查询生产主机', name: 'ecs_query_instance' });
    expect(out.inputParameters?.http_request?.headers).toEqual({ 'X-Token': '${workflow.input.token}' });
  });

  it('B7 控制流步骤 name 与 description 分开，多次往返不改名、不生成合成描述', () => {
    const def = wf([
      { name: 'route', taskReferenceName: 'r', type: 'DECISION', caseValueParam: 'k', inputParameters: { k: '' }, decisionCases: {}, defaultCase: [] },
      { name: 'par', taskReferenceName: 'p', type: 'FORK_JOIN', description: '并行备份', forkTasks: [[simple('a')]] },
      { name: 'par_join', taskReferenceName: 'pj', type: 'JOIN', joinOn: ['a'] },
      { name: 'poll', taskReferenceName: 'l', type: 'DO_WHILE', loopCondition: 'false', loopOver: [simple('c')] },
    ]);
    const once = roundTrip(def);
    const twice = roundTrip(once);
    expect(twice.tasks).toEqual(def.tasks);
  });

  it('步骤改名写入 description，用于区分两个同类步骤，往返后名称不变', () => {
    const a = createStepFromAction(R.getAction('ecs.create_instance')!);
    a.name = '创建 Web 主机';
    const def = compileStepModelToWorkflowDef({ name: 'wf', steps: [a] });
    expect(def.tasks[0].description).toBe('创建 Web 主机');
    expect(def.tasks[0].name).toBe('ecs_create_instance');
    expect(decompileWorkflowDefToStepModel(def).steps[0].name).toBe('创建 Web 主机');
    // 未改名时显示动作名
    const b = createStepFromAction(R.getAction('ecs.create_instance')!);
    const backB = decompileWorkflowDefToStepModel(compileStepModelToWorkflowDef({ name: 'wf', steps: [b] }));
    expect(backB.steps[0].name).toBe('创建云主机');
  });

  it('B8 数字字段插入数据胶囊后原样保留；清空回落默认值而不是 0', () => {
    const c = createStepFromAction(R.getAction('ecs.create_instance')!);
    c.values.systemDiskSize = '${workflow.input.disk}';
    const t = compileStepModelToWorkflowDef({ name: 'wf', steps: [c] }).tasks[0];
    expect(t.inputParameters?.systemDiskSize).toBe('${workflow.input.disk}');
    const back = decompileWorkflowDefToStepModel({ name: 'wf', tasks: [t] } as any).steps[0];
    expect(back.values.systemDiskSize).toBe('${workflow.input.disk}');

    const s = createStepFromAction(R.getAction('ecs.create_snapshot')!);
    s.values.retentionDays = '';
    expect(compileStepModelToWorkflowDef({ name: 'wf', steps: [s] }).tasks[0].inputParameters?.retentionDays).toBe(7);
    s.values.retentionDays = 0;
    expect(compileStepModelToWorkflowDef({ name: 'wf', steps: [s] }).tasks[0].inputParameters?.retentionDays).toBe(0);
    s.values.retentionDays = '14';
    expect(compileStepModelToWorkflowDef({ name: 'wf', steps: [s] }).tasks[0].inputParameters?.retentionDays).toBe(14);
  });

  it('对象类型入参往返保持对象（不变成 "[object Object]"）', () => {
    const t = { name: 'custom_worker', taskReferenceName: 'cw', type: 'SIMPLE', inputParameters: { payload: { a: 1, list: [1, 2] } } };
    const out = roundTrip(wf([t])).tasks[0];
    expect(out.inputParameters?.payload).toEqual({ a: 1, list: [1, 2] });
  });

  it('B19 新建循环的默认条件引用循环自身的轮次，确保会结束', () => {
    const l = createStepFromAction(R.getAction('control.loop')!);
    const t = compileStepModelToWorkflowDef({ name: 'wf', steps: [l] }).tasks[0];
    expect(t.loopCondition).toContain(`$.${l.taskReferenceName}['iteration']`);
    expect(t.inputParameters).toEqual({});
    l.loopCondition = '';
    expect(compileStepModelToWorkflowDef({ name: 'wf', steps: [l] }).tasks[0].loopCondition).toBe('');
  });

  it('B20 人工审批超时编译为任务级 timeoutSeconds + timeoutPolicy', () => {
    const h = createStepFromAction(R.getAction('human.approval')!);
    h.values.timeoutMinutes = 30;
    const t = compileStepModelToWorkflowDef({ name: 'wf', steps: [h] }).tasks[0];
    expect(t.timeoutSeconds).toBe(1800);
    expect(t.timeoutPolicy).toBe('TIME_OUT_WF');
    // 往返后仍能识别为审批动作，超时设置不丢
    const again = roundTrip({ name: 'wf', tasks: [t] });
    expect(again.tasks[0].timeoutSeconds).toBe(1800);
  });

  it('已有工作流的空描述往返后保持为空，不补合成描述', () => {
    expect(roundTrip({ name: 'w', version: 1, description: '', tasks: [] }).description).toBe('');
  });
});

describe('v1.3.2 B21：业务模式往返保留 JOIN 的 joinOn', () => {
  const wf = (tasks: any[]) => ({ name: 'wf', version: 1, schemaVersion: 2, tasks }) as any;
  const simple = (ref: string) => ({ name: ref, taskReferenceName: ref, type: 'SIMPLE' as const, inputParameters: {} });
  const partialJoinDef = () => wf([
    { name: 'par', taskReferenceName: 'p', type: 'FORK_JOIN', forkTasks: [[simple('a')], [simple('b')], [simple('c')]] },
    // 只等前两条分支：c 是“发了就不管”的旁路，合法设计
    { name: 'par_join', taskReferenceName: 'pj', type: 'JOIN', joinOn: ['a', 'b'] },
    simple('after'),
  ]);

  it('[B21-01] 只等部分分支的 FORK 往返后 joinOn 不变，全部任务逐字段一致', () => {
    const def = partialJoinDef();
    const out = compileStepModelToWorkflowDef(decompileWorkflowDefToStepModel(def));
    expect(out.tasks[1].joinOn).toEqual(['a', 'b']);
    expect(out.tasks).toEqual(def.tasks);
    const twice = compileStepModelToWorkflowDef(decompileWorkflowDefToStepModel(out));
    expect(twice.tasks).toEqual(def.tasks);
  });

  it('[B21-02] 等待的泳道末尾追加步骤：只把该项换成新的末尾，未等待的泳道仍不等待', () => {
    const model = decompileWorkflowDefToStepModel(partialJoinDef());
    const lane0 = model.steps[0].forkLanes![0];
    const extra = decompileWorkflowDefToStepModel(wf([simple('a2')])).steps[0];
    lane0.steps.push(extra);
    const out = compileStepModelToWorkflowDef(model);
    expect(out.tasks[1].joinOn).toEqual(['a2', 'b']);
  });

  it('[B21-03] 删除一条被等待的泳道：对应项移除，其余保留', () => {
    const model = decompileWorkflowDefToStepModel(partialJoinDef());
    model.steps[0].forkLanes = model.steps[0].forkLanes!.slice(1);
    const out = compileStepModelToWorkflowDef(model);
    expect(out.tasks[1].joinOn).toEqual(['b']);
  });

  it('[B21-04] 新增泳道默认等待其末尾任务', () => {
    const model = decompileWorkflowDefToStepModel(partialJoinDef());
    const d = decompileWorkflowDefToStepModel(wf([simple('d')])).steps[0];
    model.steps[0].forkLanes!.push({ laneId: 'lane_3', steps: [d] });
    const out = compileStepModelToWorkflowDef(model);
    expect(out.tasks[1].joinOn).toEqual(['a', 'b', 'd']);
  });

  it('[B21-05] 业务模式新建的并行组（没有原 JOIN）仍默认等待全部非空泳道', () => {
    const def = wf([
      { name: 'par', taskReferenceName: 'p', type: 'FORK_JOIN', forkTasks: [[simple('a')], [simple('b')]] },
    ]);
    const out = compileStepModelToWorkflowDef(decompileWorkflowDefToStepModel(def));
    const join = out.tasks.find((t) => t.type === 'JOIN')!;
    expect(join.joinOn).toEqual(['a', 'b']);
  });
});

describe('v1.3.2 B22：业务模式往返逐字段一致', () => {
  const roundtrip = (def: WorkflowDef) => compileStepModelToWorkflowDef(decompileWorkflowDefToStepModel(def));

  it('[B22-01] 没有 description / version / schemaVersion 的定义，往返后 JSON 完全相同', () => {
    const def = {
      name: 'minimal_flow',
      tasks: [{ name: 'noop', taskReferenceName: 'noop', type: 'NOOP' }],
    } as unknown as WorkflowDef;
    const out = roundtrip(def);
    expect(JSON.stringify(out)).toBe(JSON.stringify(def));
    expect('description' in out).toBe(false);
    expect('version' in out).toBe(false);
  });

  it('[B22-02] 已有的空描述、版本号与其它顶层字段原样保留，键序不变', () => {
    const def = {
      name: 'full_flow',
      description: '',
      version: 7,
      schemaVersion: 2,
      ownerEmail: 'ops@example.com',
      timeoutSeconds: 600,
      tasks: [{ name: 'noop', taskReferenceName: 'noop', type: 'NOOP' }],
      outputParameters: { ok: true },
    } as unknown as WorkflowDef;
    expect(JSON.stringify(roundtrip(def))).toBe(JSON.stringify(def));
  });

  it('[B22-03] 全新模型（没有原定义）仍给默认描述、版本与 schemaVersion', () => {
    const out = compileStepModelToWorkflowDef({ name: 'brand_new', steps: [] });
    expect(out).toMatchObject({ name: 'brand_new', description: '云平台自动化工作流', version: 1, schemaVersion: 2 });
  });
});
