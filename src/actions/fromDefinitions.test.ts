import { describe, it, expect } from 'vitest';
import { ActionRegistry } from './registry';
import {
  buildActionFromWorkflowDef,
  buildActionFromTaskDef,
  buildActionsFromLibrary,
} from './fromDefinitions';
import { createStepFromAction } from '../stepmodel/factory';
import { compileStepModelToWorkflowDef } from '../stepmodel/compile';
import { decompileWorkflowDefToStepModel } from '../stepmodel/decompile';
import type { WorkflowDef } from '../types/conductor';

const libWorkflow = (version: number): WorkflowDef =>
  ({
    name: 'ecs_standard_delivery',
    description: '标准云主机交付',
    version,
    ownerEmail: 'infra@example.com',
    tasks: [],
    inputSchema: {
      name: 'ecs_in',
      type: 'JSON',
      data: {
        type: 'object',
        required: ['region', 'count'],
        properties: {
          region: { type: 'string', title: '地域', enum: ['cn-hangzhou', 'cn-beijing'], default: 'cn-hangzhou' },
          count: { type: 'integer', title: '台数', description: '一次交付的实例数量' },
          tags: { type: 'object', title: '标签' },
          note: { type: 'string', title: '备注', maxLength: 500 },
          dryRun: { type: 'boolean', title: '仅演练' },
        },
      },
    },
    outputParameters: { instanceId: '${create_vm.output.instanceId}', ready: true },
  }) as any;

describe('buildActionFromWorkflowDef', () => {
  it('从 inputSchema / outputParameters 生成表单字段与出参', () => {
    const action = buildActionFromWorkflowDef(libWorkflow(2), { label: '标准云主机交付', category: 'compute', level: 'L2' })!;
    expect(action.id).toBe('wf.ecs_standard_delivery');
    expect(action.kind).toBe('workflow');
    expect(action.workflowRef).toEqual({ name: 'ecs_standard_delivery', version: 2 });
    expect(action.name).toBe('标准云主机交付');
    expect(action.level).toBe('L2');
    expect(action.ownerEmail).toBe('infra@example.com');

    const byKey = Object.fromEntries(action.fields.map((f) => [f.key, f]));
    expect(byKey.region.type).toBe('select');
    expect(byKey.region.required).toBe(true);
    expect(byKey.region.defaultValue).toBe('cn-hangzhou');
    expect(byKey.count.type).toBe('number');
    expect(byKey.count.required).toBe(true);
    expect(byKey.tags.type).toBe('textarea');
    expect(byKey.note.type).toBe('textarea');
    expect(byKey.dryRun.type).toBe('boolean');

    const outKeys = action.outputs.map((o) => o.key);
    expect(outKeys).toEqual(['instanceId', 'ready']);
    expect(action.outputs[1].type).toBe('boolean');
  });

  it('没有 schema 时退化为 inputParameters 的 key 列表，并带上 inputTemplate 默认值', () => {
    const action = buildActionFromWorkflowDef({
      name: 'simple_wf',
      version: 1,
      tasks: [],
      inputParameters: ['a', 'b'],
      inputTemplate: { b: 'x' },
    } as any)!;
    expect(action.fields.map((f) => f.key)).toEqual(['a', 'b']);
    expect(action.fields[1].defaultValue).toBe('x');
  });

  it('hidden 的扩展不生成动作', () => {
    expect(buildActionFromWorkflowDef(libWorkflow(1), { hidden: true })).toBeNull();
    expect(buildActionsFromLibrary([{ workflowDef: libWorkflow(1), extension: { hidden: true } }])).toHaveLength(0);
  });

  it('扩展字段可覆盖表单字段属性', () => {
    const action = buildActionFromWorkflowDef(libWorkflow(1), {
      fieldOverrides: { region: { label: '所属地域', type: 'text' } },
    })!;
    const region = action.fields.find((f) => f.key === 'region')!;
    expect(region.label).toBe('所属地域');
    expect(region.type).toBe('text');
    expect(region.key).toBe('region');
  });
});

describe('流程库版本：首次引用固定，库升级不自动跟随', () => {
  it('新建步骤记录引用时的版本，库升级后编译仍使用已记录版本', () => {
    const registry = new ActionRegistry([buildActionFromWorkflowDef(libWorkflow(2))!]);
    const step = createStepFromAction(registry.getAction('wf.ecs_standard_delivery')!);
    expect(step.libraryRef).toEqual({ name: 'ecs_standard_delivery', version: 2 });

    step.values = { region: 'cn-beijing', count: '3', tags: '{"env":"prod"}', note: 'n', dryRun: false };

    // 库升级到 v3：重新注册同一能力
    registry.register(buildActionFromWorkflowDef(libWorkflow(3))!);
    expect(registry.getAction('wf.ecs_standard_delivery')!.workflowRef!.version).toBe(3);

    const def = compileStepModelToWorkflowDef({ name: 'wf', steps: [step] }, registry);
    const task = def.tasks[0];
    expect(task.type).toBe('SUB_WORKFLOW');
    expect(task.subWorkflowParam).toEqual({ name: 'ecs_standard_delivery', version: 2 });
    // 表单值按 schema 类型还原
    expect(task.inputParameters).toEqual({
      region: 'cn-beijing',
      count: 3,
      tags: { env: 'prod' },
      note: 'n',
      dryRun: false,
    });
  });

  it('数据胶囊表达式在类型还原时原样保留', () => {
    const registry = new ActionRegistry([buildActionFromWorkflowDef(libWorkflow(1))!]);
    const step = createStepFromAction(registry.getAction('wf.ecs_standard_delivery')!);
    step.values = { count: '${workflow.input.count}' };
    const task = compileStepModelToWorkflowDef({ name: 'wf', steps: [step] }, registry).tasks[0];
    expect(task.inputParameters!.count).toBe('${workflow.input.count}');
  });

  it('反编译已有 SUB_WORKFLOW：记录其版本；未指定版本则保持不固定', () => {
    const registry = new ActionRegistry([buildActionFromWorkflowDef(libWorkflow(5))!]);

    const pinnedDef = {
      name: 'wf',
      tasks: [
        {
          name: 'ecs_standard_delivery',
          taskReferenceName: 'deliver',
          type: 'SUB_WORKFLOW',
          subWorkflowParam: { name: 'ecs_standard_delivery', version: 2 },
          inputParameters: { region: 'cn-beijing' },
        },
      ],
    } as any;
    const m1 = decompileWorkflowDefToStepModel(pinnedDef, registry);
    expect(m1.steps[0].actionId).toBe('wf.ecs_standard_delivery');
    expect(m1.steps[0].libraryRef).toEqual({ name: 'ecs_standard_delivery', version: 2 });
    const back1 = compileStepModelToWorkflowDef(m1, registry).tasks[0];
    expect(back1.subWorkflowParam!.version).toBe(2);

    const floatingDef = {
      name: 'wf',
      tasks: [{ ...pinnedDef.tasks[0], subWorkflowParam: { name: 'ecs_standard_delivery' } }],
    } as any;
    const m2 = decompileWorkflowDefToStepModel(floatingDef, registry);
    expect(m2.steps[0].libraryRef!.version).toBeUndefined();
    const back2 = compileStepModelToWorkflowDef(m2, registry).tasks[0];
    expect(back2.subWorkflowParam).toEqual({ name: 'ecs_standard_delivery' });
  });

  it('库中不存在（如无权限）的子流程回退为专业步骤，不丢数据', () => {
    const registry = new ActionRegistry([]);
    const def = {
      name: 'wf',
      tasks: [
        {
          name: 'hidden_wf',
          taskReferenceName: 'h',
          type: 'SUB_WORKFLOW',
          subWorkflowParam: { name: 'hidden_wf', version: 1 },
          inputParameters: { a: 1 },
        },
      ],
    } as any;
    const model = decompileWorkflowDefToStepModel(def, registry);
    expect(model.steps[0].isProFallback).toBe(true);
    expect(compileStepModelToWorkflowDef(model, registry).tasks[0].subWorkflowParam).toEqual({
      name: 'hidden_wf',
      version: 1,
    });
  });
});

describe('buildActionFromTaskDef', () => {
  it('仅有 inputKeys / outputKeys / inputTemplate 时也能生成可用动作', () => {
    const action = buildActionFromTaskDef({
      name: 'send_sms',
      description: '发送短信',
      inputKeys: ['phone', 'text'],
      outputKeys: ['msgId'],
      inputTemplate: { text: '您好' },
    })!;
    expect(action.id).toBe('task.send_sms');
    expect(action.fields.map((f) => f.key)).toEqual(['phone', 'text']);
    expect(action.fields[1].defaultValue).toBe('您好');
    expect(action.outputs[0].key).toBe('msgId');

    const task = action.compile({ phone: '138' }, { taskReferenceName: 'sms_1', stepIndex: 0 });
    expect(task.type).toBe('SIMPLE');
    expect(task.name).toBe('send_sms');
    expect(action.decompile!(task)).toEqual({ phone: '138' });
    expect(action.mockOutput!({})).toEqual({ msgId: 'sample' });
  });
});
