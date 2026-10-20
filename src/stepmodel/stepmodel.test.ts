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
});
