import { describe, it, expect } from 'vitest';
import {
  diffWorkflowVersions,
  isDiffEmpty,
  summarizeDiff,
  buildUpgradeConfirmMessage,
  applyUpgradeToValues,
  collectReferencedOutputKeys,
} from './diff';
import type { WorkflowDef } from '../types/conductor';

const schema = (props: Record<string, unknown>, required: string[] = []) => ({
  type: 'JSON',
  data: { type: 'object', required, properties: props },
});

const wf = (version: number, input: Record<string, unknown>, required: string[], outputs: Record<string, unknown>): WorkflowDef =>
  ({
    name: 'ecs_delivery',
    version,
    tasks: [],
    inputSchema: schema(input, required),
    outputSchema: schema(outputs),
  }) as WorkflowDef;

const v1 = wf(
  1,
  { region: { type: 'string', enum: ['hz', 'bj'] }, count: { type: 'integer' }, legacy: { type: 'string' } },
  ['region'],
  { instanceId: { type: 'string' }, ip: { type: 'string' } },
);

describe('diffWorkflowVersions', () => {
  it('版本相同则无差异', () => {
    const d = diffWorkflowVersions(v1, v1, { region: 'hz' });
    expect(isDiffEmpty(d)).toBe(true);
    expect(d.lostValueKeys).toEqual([]);
  });

  it('新增入参，并标出是否必填', () => {
    const v2 = wf(
      2,
      { region: { type: 'string', enum: ['hz', 'bj'] }, count: { type: 'integer' }, legacy: { type: 'string' }, owner: { type: 'string' }, note: { type: 'string' } },
      ['region', 'owner'],
      { instanceId: { type: 'string' }, ip: { type: 'string' } },
    );
    const d = diffWorkflowVersions(v1, v2);
    expect(d.addedInputs.map((f) => [f.key, f.required])).toEqual([
      ['owner', true],
      ['note', false],
    ]);
    expect(d.removedInputs).toHaveLength(0);
  });

  it('删除入参；已填值的标记「值将丢失」，未填的不标记', () => {
    const v2 = wf(2, { region: { type: 'string', enum: ['hz', 'bj'] }, count: { type: 'integer' } }, ['region'], {
      instanceId: { type: 'string' },
      ip: { type: 'string' },
    });
    const d = diffWorkflowVersions(v1, v2, { region: 'hz', legacy: 'abc' });
    expect(d.removedInputs.map((f) => f.key)).toEqual(['legacy']);
    expect(d.lostValueKeys).toEqual(['legacy']);
    const d2 = diffWorkflowVersions(v1, v2, { region: 'hz', legacy: '' });
    expect(d2.lostValueKeys).toEqual([]);
  });

  it('类型 / enum / 必填变化记为 changedInputs', () => {
    const v2 = wf(
      2,
      {
        region: { type: 'string', enum: ['hz', 'bj', 'sh'] }, // 枚举变化
        count: { type: 'string' }, // 类型变化 number -> text
        legacy: { type: 'string' },
      },
      ['region', 'legacy'], // legacy 变为必填
      { instanceId: { type: 'string' }, ip: { type: 'string' } },
    );
    const d = diffWorkflowVersions(v1, v2, { count: '3' });
    const byKey = Object.fromEntries(d.changedInputs.map((c) => [c.key, c]));
    expect(byKey.region.from).toBe('可选值 hz|bj，必填');
    expect(byKey.region.to).toBe('可选值 hz|bj|sh，必填');
    expect(byKey.count.from).toBe('数字');
    expect(byKey.count.to).toBe('文本');
    expect(byKey.count.valueFilled).toBe(true);
    expect(byKey.legacy.from).toBe('文本');
    expect(byKey.legacy.to).toBe('文本，必填');
    expect(byKey.legacy.valueFilled).toBe(false);
  });

  it('出参新增 / 删除；删除的出参若被下游引用则标记引用失效', () => {
    const v2 = wf(2, { region: { type: 'string', enum: ['hz', 'bj'] }, count: { type: 'integer' }, legacy: { type: 'string' } }, ['region'], {
      instanceId: { type: 'string' },
      privateIp: { type: 'string' },
    });
    const d = diffWorkflowVersions(v1, v2, {}, { referencedOutputs: ['ip', 'instanceId'] });
    expect(d.addedOutputs).toEqual(['privateIp']);
    expect(d.removedOutputs).toEqual(['ip']);
    expect(d.brokenOutputRefs).toEqual(['ip']);
    const noRef = diffWorkflowVersions(v1, v2);
    expect(noRef.brokenOutputRefs).toEqual([]);
  });

  it('没有 schema 的旧式定义退回入参名 / outputParameters 比较', () => {
    const a = { name: 'w', version: 1, tasks: [], inputParameters: ['a', 'b'], outputParameters: { x: 1 } } as WorkflowDef;
    const b = { name: 'w', version: 2, tasks: [], inputParameters: ['a', 'c'], outputParameters: { y: 1 } } as WorkflowDef;
    const d = diffWorkflowVersions(a, b, { b: 'v' });
    expect(d.addedInputs.map((f) => f.key)).toEqual(['c']);
    expect(d.removedInputs.map((f) => f.key)).toEqual(['b']);
    expect(d.lostValueKeys).toEqual(['b']);
    expect(d.addedOutputs).toEqual(['y']);
    expect(d.removedOutputs).toEqual(['x']);
  });
});

describe('collectReferencedOutputKeys', () => {
  it('在嵌套结构的字符串中找出对指定步骤出参的引用（只取第一级 key）', () => {
    const keys = collectReferencedOutputKeys('create_vm_1', [
      { values: { a: '${create_vm_1.output.ip}', b: 'x ${create_vm_1.output.detail.name} y', c: '${other.output.ip}' } },
      [{ nested: ['${ create_vm_1.output.instanceId }'] }],
      { text: 'create_vm_1.output.noDollar' },
    ]);
    expect(Array.from(keys).sort()).toEqual(['detail', 'instanceId', 'ip']);
  });

  it('引用名含正则特殊字符时也能正确匹配，且不会误匹配前缀相同的其它步骤', () => {
    const keys = collectReferencedOutputKeys('a.b', [{ x: '${a.b.output.k1}', y: '${aXb.output.k2}', z: '${a.bc.output.k3}' }]);
    expect(Array.from(keys)).toEqual(['k1']);
  });

  it('可处理循环引用', () => {
    const o: Record<string, unknown> = { s: '${r.output.k}' };
    o.self = o;
    expect(Array.from(collectReferencedOutputKeys('r', [o]))).toEqual(['k']);
  });
});

describe('summarizeDiff / buildUpgradeConfirmMessage', () => {
  const v2 = wf(
    2,
    { region: { type: 'string', enum: ['hz', 'bj'] }, count: { type: 'string' }, owner: { type: 'string', title: '负责人' }, tag: { type: 'string' } },
    ['region', 'owner'],
    { instanceId: { type: 'string' }, privateIp: { type: 'string' } },
  );
  const diff = diffWorkflowVersions(v1, v2, { region: 'hz', count: '2', legacy: 'x' }, { referencedOutputs: ['ip'] });

  it('会影响已填内容的条目置顶，其余在后', () => {
    const { impacts, changes } = summarizeDiff(diff);
    expect(impacts).toEqual([
      '入参「legacy」已删除，已填写的值将丢失',
      '出参「ip」已删除，下游步骤对它的引用将失效',
      '入参「count」由「数字」变为「文本」，已填写的值可能不再有效',
      '新增必填入参「负责人（owner）」，需要补充填写',
    ]);
    expect(changes).toEqual(['新增入参「tag」', '新增出参「privateIp」']);
  });

  it('确认框文案：先列影响已填内容的，再列其它变化', () => {
    const msg = buildUpgradeConfirmMessage('ecs_delivery', 1, 2, diff);
    expect(msg).toContain('v2');
    expect(msg).toContain('当前引用 v1');
    expect(msg.indexOf('【会影响已填内容】')).toBeLessThan(msg.indexOf('【其它变化】'));
    expect(msg).toContain('已填写的值将丢失');
    expect(msg.endsWith('确定升级吗？')).toBe(true);
  });

  it('无差异时提示「入参出参未变化」', () => {
    const msg = buildUpgradeConfirmMessage('ecs_delivery', 1, 2, diffWorkflowVersions(v1, v1));
    expect(msg).toContain('入参出参未变化');
    expect(msg.includes('升级差异')).toBe(false);
  });
});

describe('applyUpgradeToValues', () => {
  it('移除已删除入参的值，补上新增入参的默认值，不覆盖用户已填的值', () => {
    const v2 = wf(
      2,
      {
        region: { type: 'string', enum: ['hz', 'bj'] },
        count: { type: 'integer' },
        zone: { type: 'string', default: 'a' },
        size: { type: 'string', default: 'small' },
      },
      ['region'],
      { instanceId: { type: 'string' }, ip: { type: 'string' } },
    );
    const d = diffWorkflowVersions(v1, v2, {});
    const next = applyUpgradeToValues({ region: 'hz', count: 2, legacy: 'x', size: 'large' }, d);
    expect(next).toEqual({ region: 'hz', count: 2, size: 'large', zone: 'a' });
  });

  it('不修改传入的对象', () => {
    const d = diffWorkflowVersions(v1, wf(2, { region: { type: 'string' } }, [], {}));
    const values = { region: 'hz', legacy: 'x' };
    applyUpgradeToValues(values, d);
    expect(values).toEqual({ region: 'hz', legacy: 'x' });
  });
});
