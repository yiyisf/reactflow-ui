import { describe, it, expect } from 'vitest';
import { defaultActionRegistry } from '../actions/registry';
import { compileStepModelToWorkflowDef } from './compile';
import { decompileWorkflowDefToStepModel } from './decompile';
import type { BusinessWorkflowModel } from './types';

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
