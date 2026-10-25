import { describe, it, expect } from 'vitest';
import { defaultActionRegistry as R } from '../actions/registry';
import { createStepFromAction } from './factory';
import { buildPillGroups, describePillRef } from './pills';
import { validateBusinessSteps, mergeWorkflowValidation, collectIssues } from './validate';
import { runStatusBadge } from '../components/business/runStatus';
import type { BusinessStep } from './types';

const action = (id: string) => R.getAction(id)!;
const withRef = (s: BusinessStep, ref: string): BusinessStep => ({ ...s, id: `step_${ref}`, taskReferenceName: ref });

describe('B14 / B15 数据胶囊可选项', () => {
  it('包含工作流全局入参（字符串与结构化两种声明）', () => {
    const groups = buildPillGroups([], R, ['env', { name: 'disk', type: 'number', description: '磁盘大小' }]);
    expect(groups[0].title).toBe('工作流全局入参');
    expect(groups[0].items.map((i) => i.rawRef)).toEqual(['workflow.input.env', 'workflow.input.disk']);
    expect(groups[0].items[1].label).toBe('磁盘大小');
  });

  it('控制流之后的步骤可引用其内部步骤的输出；并行组引用 JOIN 的汇聚输出', () => {
    const vm = withRef(createStepFromAction(action('ecs.create_instance')), 'vm');
    const snap = withRef(createStepFromAction(action('ecs.create_snapshot')), 'snap');
    const fork = withRef(createStepFromAction(action('control.fork')), 'par');
    fork.forkLanes![0].steps = [vm];
    fork.forkLanes![1].steps = [snap];
    const decision = withRef(createStepFromAction(action('control.decision')), 'route');
    const notify = withRef(createStepFromAction(action('notify.send_message')), 'ntf');
    decision.branches![0].steps = [notify];

    const groups = buildPillGroups([fork, decision], R);
    const refs = groups.flatMap((g) => g.items.map((i) => i.rawRef));
    expect(refs).toContain('join_par.output');
    expect(refs).not.toContain('par.output');
    expect(refs).toContain('vm.output.instanceId');
    expect(refs).toContain('snap.output.snapshotId');
    expect(refs).toContain('ntf.output.messageId');
    expect(groups.find((g) => g.key === 'ntf')!.note).toContain('分支 SUCCESS');
    expect(describePillRef('vm.output.instanceId', groups)).toBe('创建云主机 · 实例ID');
    expect(describePillRef('workflow.input.x', groups)).toBe('全局入参 · x');
  });

  it('循环提供已执行轮次，循环体内步骤可引用', () => {
    const loop = withRef(createStepFromAction(action('control.loop')), 'poll');
    loop.loopSteps = [withRef(createStepFromAction(action('ecs.query_instance')), 'q')];
    const refs = buildPillGroups([loop], R).flatMap((g) => g.items.map((i) => i.rawRef));
    expect(refs).toContain('poll.output.iteration');
    expect(refs).toContain('q.output.status');
  });
});

describe('B16 业务模式校验', () => {
  it('必填字段为空、数字字段非数字时报错；嵌套步骤也会检查', () => {
    const q = withRef(createStepFromAction(action('ecs.query_instance')), 'q');
    const snap = withRef(createStepFromAction(action('ecs.create_snapshot')), 'snap');
    snap.values = { ...snap.values, instanceId: '${q.output.instanceId}', retentionDays: 'abc' };
    const loop = withRef(createStepFromAction(action('control.loop')), 'loop');
    loop.loopSteps = [snap];
    const map = validateBusinessSteps([q, loop], R);
    expect(map.q[0]).toMatchObject({ field: 'instanceId', level: 'error' });
    expect(map.snap.map((i) => i.field)).toEqual(['retentionDays']);
    expect(map.loop).toBeUndefined();
    expect(collectIssues(loop, map)).toHaveLength(1);
  });

  it('新建条件分支未绑定判断取值时报错，绑定后通过', () => {
    const d = withRef(createStepFromAction(action('control.decision')), 'd');
    expect(validateBusinessSteps([d], R).d[0].message).toContain('判断取值未绑定');
    d.values = { [d.caseParam!]: '${workflow.input.env}' };
    expect(validateBusinessSteps([d], R).d).toBeUndefined();
  });

  it('循环条件清空、空泳道报错', () => {
    const loop = withRef(createStepFromAction(action('control.loop')), 'l');
    loop.loopCondition = '';
    const fork = withRef(createStepFromAction(action('control.fork')), 'f');
    const map = validateBusinessSteps([loop, fork], R);
    expect(map.l.some((i) => i.level === 'error')).toBe(true);
    expect(map.f).toHaveLength(2);
  });

  it('合并工作流校验器的任务级结果，忽略全局项', () => {
    const map = mergeWorkflowValidation({}, {
      isValid: false,
      errors: [{ type: 'TASK', ref: 'a', message: '缺少 uri' }, { type: 'GLOBAL', ref: 'GLOBAL', message: 'x' }],
      warnings: [{ type: 'TASK', ref: 'a', message: '建议设置超时' }],
    });
    expect(map.a.map((i) => i.level)).toEqual(['error', 'warning']);
    expect(Object.keys(map)).toEqual(['a']);
  });
});

describe('B16 试跑徽标按真实状态显示', () => {
  it('每种状态都有中文词，失败与超时不显示成功', () => {
    expect(runStatusBadge('COMPLETED').label).toBe('成功');
    expect(runStatusBadge('FAILED').label).toBe('失败');
    expect(runStatusBadge('TIMED_OUT').label).toBe('已超时');
    expect(runStatusBadge('SKIPPED').label).toBe('已跳过');
    expect(runStatusBadge('IN_PROGRESS').label).toBe('运行中');
    expect(runStatusBadge(undefined).label).toBe('等待中');
  });
});
