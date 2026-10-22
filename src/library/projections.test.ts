import { describe, it, expect } from 'vitest';
import { LibraryCatalog } from './catalog';
import {
  toActions,
  toTaskSchemas,
  toLibraryItems,
  filterPickableActions,
  schemaToTypeStrings,
  collectLibraryDomains,
  libraryDomainOf,
  OTHER_DOMAIN,
} from './projections';
import type { ActionDefinition } from '../actions/types';
import { canCallLevel } from './level';
import { createStepFromAction } from '../stepmodel/factory';
import { compileStepToTaskDef } from '../stepmodel/compile';
import { ActionRegistry } from '../actions/registry';
import type { LibraryProvider, LibraryWorkflowRecord } from './types';
import type { WorkflowDef } from '../types/conductor';
import type { TaskSchema } from '../services/ai/schemaRegistry';

const ecsDef = (version: number): WorkflowDef =>
  ({
    name: 'ecs_delivery',
    description: '标准云主机交付',
    version,
    tasks: [],
    inputSchema: {
      type: 'JSON',
      data: {
        type: 'object',
        required: ['region'],
        properties: {
          region: { type: 'string', title: '地域', enum: ['hz', 'bj'] },
          count: { type: 'integer' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    outputSchema: { type: 'JSON', data: { type: 'object', properties: { instanceId: { type: 'string' } } } },
  }) as WorkflowDef;

function provider(workflows: LibraryWorkflowRecord[], tasks?: LibraryProviderTasks): LibraryProvider {
  return {
    async list() {
      return { workflows, tasks };
    },
    async get() {
      return null;
    },
  };
}
type LibraryProviderTasks = NonNullable<Awaited<ReturnType<LibraryProvider['list']>>['tasks']>;

async function loaded(workflows: LibraryWorkflowRecord[], tasks?: LibraryProviderTasks, opts?: ConstructorParameters<typeof LibraryCatalog>[1]) {
  const c = new LibraryCatalog(provider(workflows, tasks), opts);
  await c.load();
  return c;
}

describe('toActions', () => {
  it('生成 SUB_WORKFLOW 动作，extension 映射到 ActionExtension，workflowRef 为目录最新版本', async () => {
    const c = await loaded([
      { def: ecsDef(4), extension: { level: 'L2', displayName: '云主机交付', category: 'compute', icon: '🖥️', tags: ['云'] } },
    ]);
    const [a] = toActions(c);
    expect(a.id).toBe('wf.ecs_delivery');
    expect(a.name).toBe('云主机交付');
    expect(a.kind).toBe('workflow');
    expect(a.category).toBe('compute');
    expect(a.level).toBe('L2');
    expect(a.workflowRef).toEqual({ name: 'ecs_delivery', version: 4 });
    expect(a.fields.map((f) => f.key)).toEqual(['region', 'count', 'tags']);
    expect(a.outputs.map((o) => o.key)).toEqual(['instanceId']);
  });

  it('新建步骤固定为目录当前最新版本，并编译为带版本的 SUB_WORKFLOW', async () => {
    const c = await loaded([{ def: ecsDef(4) }]);
    const reg = new ActionRegistry(toActions(c));
    const action = reg.getAction('wf.ecs_delivery')!;
    const step = createStepFromAction(action);
    expect(step.libraryRef).toEqual({ name: 'ecs_delivery', version: 4 });
    const task = compileStepToTaskDef(step, 0, 'wf', reg);
    expect(task.type).toBe('SUB_WORKFLOW');
    expect(task.subWorkflowParam!.version).toBe(4);
  });

  it('已下线条目带 deprecated 标记但仍在动作表中；extension.action.hidden 的条目不生成', async () => {
    const c = await loaded([
      { def: { ...ecsDef(1), name: 'old_one' }, deprecated: true },
      { def: { ...ecsDef(1), name: 'hidden_one' }, extension: { action: { hidden: true } } },
      { def: { ...ecsDef(1), name: 'normal' } },
    ]);
    const actions = toActions(c);
    expect(actions.map((a) => a.id)).toEqual(['wf.old_one', 'wf.normal']);
    expect(actions[0].deprecated).toBe(true);
    expect(actions[1].deprecated).toBeUndefined();
  });

  it('只投影 Provider 条目；静态 workflowLibrary 条目不进入动作库', async () => {
    const c = await loaded([{ def: ecsDef(1) }], undefined, {
      staticItems: [{ workflowName: 'static_only', workflowLevel: 'L1', version: '1', description: '', tags: [] }],
    });
    expect(toActions(c).map((a) => a.id)).toEqual(['wf.ecs_delivery']);
  });

  it('原子任务生成 SIMPLE 动作', async () => {
    const c = await loaded([], [{ def: { name: 'send_mail', inputKeys: ['to'], outputKeys: ['id'] } }]);
    const [a] = toActions(c);
    expect(a.id).toBe('task.send_mail');
    expect(a.kind).toBe('task');
    expect(a.fields.map((f) => f.key)).toEqual(['to']);
  });
});

describe('toTaskSchemas', () => {
  it('由 inputSchema / outputSchema 展开为类型串，enum 输出为 a|b，数组输出为 T[]', async () => {
    const c = await loaded([{ def: ecsDef(1) }]);
    const [s] = toTaskSchemas(c);
    expect(s.taskName).toBe('ecs_delivery');
    expect(s.taskType).toBe('SUB_WORKFLOW');
    expect(s.inputSchema).toEqual({ region: 'hz|bj', count: 'integer', tags: 'string[]' });
    expect(s.outputSchema).toEqual({ instanceId: 'string' });
  });

  it('无 schema 时退回入参名 / outputParameters / inputKeys / outputKeys', async () => {
    const c = await loaded(
      [{ def: { name: 'w', version: 1, tasks: [], inputParameters: ['a', 'b'], outputParameters: { r: '${x.output.r}' } } }],
      [{ def: { name: 't', inputKeys: ['k1'], outputKeys: ['o1'] } }],
    );
    const byName = Object.fromEntries(toTaskSchemas(c).map((s) => [s.taskName, s]));
    expect(byName.w.inputSchema).toEqual({ a: 'string', b: 'string' });
    expect(byName.w.outputSchema).toEqual({ r: 'string' });
    expect(byName.t.taskType).toBe('SIMPLE');
    expect(byName.t.inputSchema).toEqual({ k1: 'string' });
    expect(byName.t.outputSchema).toEqual({ o1: 'string' });
  });

  it('同名 Provider 优先于静态 Schema；静态 Schema 在前', async () => {
    const statics: TaskSchema[] = [
      { taskName: 'keep', inputSchema: { x: 'string' } },
      { taskName: 'ecs_delivery', inputSchema: { stale: 'string' } },
    ];
    const c = await loaded([{ def: ecsDef(1) }], undefined, { staticTaskSchemas: statics });
    const out = toTaskSchemas(c);
    expect(out.map((s) => s.taskName)).toEqual(['keep', 'ecs_delivery']);
    expect(out[1].inputSchema!.region).toBe('hz|bj');
  });

  it('没有 Provider 时原样返回静态 Schema（兼容旧 taskSchemas）', () => {
    const statics: TaskSchema[] = [{ taskName: 'a', taskType: 'SIMPLE', outputSchema: { id: 'string' } }, { taskName: 'b' }];
    const c = new LibraryCatalog(undefined, { staticTaskSchemas: statics });
    expect(toTaskSchemas(c)).toEqual(statics);
  });

  it('已下线流程不输出 Schema', async () => {
    const c = await loaded([{ def: ecsDef(1), deprecated: true }]);
    expect(toTaskSchemas(c)).toHaveLength(0);
  });

  it('schemaToTypeStrings 对非 JSON / 无 properties 返回 undefined', () => {
    expect(schemaToTypeStrings(undefined)).toBeUndefined();
    expect(schemaToTypeStrings({ type: 'AVRO', data: { properties: { a: {} } } })).toBeUndefined();
    expect(schemaToTypeStrings({ type: 'JSON', data: {} })).toBeUndefined();
  });
});

describe('toLibraryItems', () => {
  it('Provider 条目：整数版本转字符串；缺层级按 L1；已下线不输出', async () => {
    const c = await loaded([
      { def: ecsDef(4), extension: { level: 'L3', tags: ['云'] } },
      { def: { ...ecsDef(2), name: 'no_level' } },
      { def: { ...ecsDef(1), name: 'gone' }, deprecated: true },
    ]);
    const items = toLibraryItems(c);
    expect(items).toEqual([
      { workflowName: 'ecs_delivery', workflowLevel: 'L3', version: '4', description: '标准云主机交付', tags: ['云'] },
      { workflowName: 'no_level', workflowLevel: 'L1', version: '2', description: '标准云主机交付', tags: [] },
    ]);
  });

  it('没有 Provider 时与旧 workflowLibrary 完全一致（含非整数版本串）', () => {
    const items = [
      { workflowName: 'a', workflowLevel: 'L1' as const, version: '1.2.0', description: 'd1', tags: ['x'] },
      { workflowName: 'b', workflowLevel: 'L2' as const, version: '3', description: 'd2', tags: [] },
    ];
    const orig = console.warn;
    console.warn = () => {};
    try {
      const c = new LibraryCatalog(undefined, { staticItems: items });
      expect(toLibraryItems(c)).toEqual(items);
    } finally {
      console.warn = orig;
    }
  });
});

describe('层级过滤 filterPickableActions', () => {
  it('canCallLevel 遵循分层调用规则', () => {
    expect(canCallLevel('L1', 'L2')).toBe(false);
    expect(canCallLevel('L1', 'L1')).toBe(true);
    expect(canCallLevel('L2', 'L3')).toBe(false);
    expect(canCallLevel('L2', 'L1')).toBe(true);
    expect(canCallLevel('L3', 'L3')).toBe(true);
    expect(canCallLevel(undefined, 'L3')).toBe(true);
    expect(canCallLevel('L1', undefined)).toBe(true);
  });

  it('提供 currentLevel 时隐藏违规的流程库动作；未提供则不按层级过滤', async () => {
    const c = await loaded([
      { def: { ...ecsDef(1), name: 'l1' }, extension: { level: 'L1' } },
      { def: { ...ecsDef(1), name: 'l2' }, extension: { level: 'L2' } },
      { def: { ...ecsDef(1), name: 'l3' }, extension: { level: 'L3' } },
      { def: { ...ecsDef(1), name: 'nolevel' } },
    ]);
    const actions = toActions(c);
    const ids = (lv?: 'L1' | 'L2' | 'L3') => filterPickableActions(actions, { currentLevel: lv }).map((a) => a.id);
    expect(ids('L1')).toEqual(['wf.l1', 'wf.nolevel']);
    expect(ids('L2')).toEqual(['wf.l1', 'wf.l2', 'wf.nolevel']);
    expect(ids('L3')).toEqual(['wf.l1', 'wf.l2', 'wf.l3', 'wf.nolevel']);
    expect(ids(undefined)).toEqual(['wf.l1', 'wf.l2', 'wf.l3', 'wf.nolevel']);
  });

  it('已下线动作始终隐藏；原子任务不受层级过滤', async () => {
    const c = await loaded(
      [{ def: { ...ecsDef(1), name: 'old' }, deprecated: true, extension: { level: 'L1' } }],
      [{ def: { name: 'atom' }, extension: { level: 'L3' } }],
    );
    const actions = toActions(c);
    expect(filterPickableActions(actions).map((a) => a.id)).toEqual(['task.atom']);
    expect(filterPickableActions(actions, { currentLevel: 'L1' }).map((a) => a.id)).toEqual(['task.atom']);
  });
});

describe('业务域：传播与命名兜底', () => {
  const rec = (name: string, extension?: LibraryWorkflowRecord['extension']): LibraryWorkflowRecord => ({
    def: { ...ecsDef(1), name },
    extension,
  });

  it('extension.domain 传播到动作与 LibraryItem', async () => {
    const c = await loaded([rec('create_vm', { domain: '云资源', level: 'L1' })]);
    expect(toActions(c)[0].domain).toBe('云资源');
    expect(toLibraryItems(c)[0].domain).toBe('云资源');
  });

  it('无 domain 时输出对象不带 domain 键（保持旧行为）', async () => {
    const c = await loaded([rec('create_vm', { level: 'L1' })]);
    expect('domain' in toActions(c)[0]).toBe(false);
    expect('domain' in toLibraryItems(c)[0]).toBe(false);
  });

  it('extension 缺省时从命名规范兜底 domain 与 level', async () => {
    const c = await loaded([rec('std-L2-通知协助-企业微信-发送消息')]);
    const a = toActions(c)[0];
    expect(a.domain).toBe('通知协助');
    expect(a.level).toBe('L2');
    const item = toLibraryItems(c)[0];
    expect(item.domain).toBe('通知协助');
    expect(item.workflowLevel).toBe('L2');
  });

  it('显式 extension 优先；层级冲突时保留 extension.level，不抛错', async () => {
    const c = await loaded([rec('std-L2-通知协助-企业微信-发送消息', { domain: '监控运维', level: 'L3' })]);
    const a = toActions(c)[0];
    expect(a.domain).toBe('监控运维');
    expect(a.level).toBe('L3');
  });

  it('只给 domain 不给 level 时，level 仍从名称兜底', async () => {
    const c = await loaded([rec('std-L3-云资源-ECS-创建', { domain: '自定义域' })]);
    expect(toActions(c)[0].level).toBe('L3');
    expect(toActions(c)[0].domain).toBe('自定义域');
  });

  it('不符合命名规范的名称不兜底', async () => {
    const c = await loaded([rec('create_vm')]);
    expect(toActions(c)[0].domain).toBeUndefined();
    expect(toActions(c)[0].level).toBeUndefined();
  });

  it('静态 workflowLibrary 条目的 domain 保留', () => {
    const c = new LibraryCatalog(undefined, {
      staticItems: [{ workflowName: 'legacy', workflowLevel: 'L1', version: '1', description: 'd', tags: [], domain: '安全服务' }],
    });
    expect(toLibraryItems(c)[0].domain).toBe('安全服务');
  });
});

describe('业务域分组 collectLibraryDomains', () => {
  const act = (id: string, extra: Partial<ActionDefinition>): ActionDefinition =>
    ({ id, name: id, category: 'custom', icon: 'x', description: '', riskLevel: 'safe', fields: [], outputs: [], compile: () => ({}) as any, ...extra }) as ActionDefinition;

  it('没有任何 domain 时返回空数组（保持分类分组）', () => {
    expect(collectLibraryDomains([act('a', { kind: 'workflow' }), act('b', {})])).toEqual([]);
  });

  it('按首次出现顺序，无业务域的流程库动作归「其他」且排最后；内置动作不参与', () => {
    const list = [
      act('a', { kind: 'workflow' }),
      act('b', { kind: 'workflow', domain: '通知协助' }),
      act('c', {}),
      act('d', { kind: 'workflow', domain: '云资源' }),
      act('e', { kind: 'workflow', domain: '通知协助' }),
    ];
    expect(collectLibraryDomains(list)).toEqual([ '通知协助', '云资源', OTHER_DOMAIN ]);
    expect(libraryDomainOf(list[0])).toBe(OTHER_DOMAIN);
    expect(libraryDomainOf(list[2])).toBeNull();
  });
});
