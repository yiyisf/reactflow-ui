import { describe, it, expect } from 'vitest';
import { normalizeWorkflowDef, pinSubWorkflowVersions, applyTaskConfigurations } from './workflowSynthesizer';
import { executeToolCall, LIBRARY_SEARCH_RESULT_LIMIT, type ToolExecutionContext } from './toolExecutor';
import { buildLibraryCatalog, DEFAULT_PROMPT_CATALOG_LIMIT } from './systemPrompt';
import { schemaRegistry } from './schemaRegistry';
import { LibraryCatalog } from '../../library/catalog';
import { toLibraryItems, toTaskSchemas } from '../../library/projections';
import type { LibraryProvider, LibraryWorkflowRecord } from '../../library/types';
import type { WorkflowDef, TaskDef } from '../../types/conductor';
import type { WorkflowLibraryItem } from '../../types/workflowLibrary';

const sub = (ref: string, name: string, extra: Partial<TaskDef> = {}): TaskDef =>
  ({ name, taskReferenceName: ref, type: 'SUB_WORKFLOW', subWorkflowParam: { name }, ...extra }) as TaskDef;

const wfDef = (tasks: TaskDef[]): WorkflowDef => ({ name: 'wf', version: 1, schemaVersion: 2, tasks }) as WorkflowDef;

/** 库中最新版本：create_vm = 5，notify = 2 */
const latest = (name: string): number | undefined => ({ create_vm: 5, notify: 2 }[name]);

const baseCtx = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
  workflowDef: wfDef([]),
  validationResults: { isValid: true, errors: [], warnings: [] },
  libraryItems: [],
  ...overrides,
});

const subVersion = (t: TaskDef): number | undefined => t.subWorkflowParam?.version;

describe('workflowSynthesizer — SUB_WORKFLOW 版本固定', () => {
  it('新建的 SUB_WORKFLOW 缺少版本时固定为库当前最新版本', () => {
    const { workflow, autoFixed } = normalizeWorkflowDef(wfDef([sub('s1', 'create_vm')]), { resolveLatestVersion: latest });
    expect(subVersion(workflow.tasks[0])).toBe(5);
    expect(autoFixed.some((m) => m.includes('v5'))).toBe(true);
  });

  it('只有 workflowName（无 subWorkflowParam）时也取库当前版本，而不是 t.version ?? 1', () => {
    const t = { name: 'x', taskReferenceName: 's1', type: 'SUB_WORKFLOW', workflowName: 'create_vm', version: 1 } as unknown as TaskDef;
    const { workflow } = normalizeWorkflowDef(wfDef([t]), { resolveLatestVersion: latest });
    expect(workflow.tasks[0].subWorkflowParam).toEqual({ name: 'create_vm', version: 5 });
  });

  it('已有版本号一律不改（即使库已有更新版本）', () => {
    const { workflow } = normalizeWorkflowDef(
      wfDef([sub('s1', 'create_vm', { subWorkflowParam: { name: 'create_vm', version: 2 } } as Partial<TaskDef>)]),
      { resolveLatestVersion: latest },
    );
    expect(subVersion(workflow.tasks[0])).toBe(2);
  });

  it('画布上已存在的任务不被自动补版本', () => {
    const { workflow } = normalizeWorkflowDef(wfDef([sub('old_ref', 'create_vm'), sub('new_ref', 'create_vm')]), {
      resolveLatestVersion: latest,
      existingRefs: new Set(['old_ref']),
    });
    expect(subVersion(workflow.tasks[0])).toBeUndefined();
    expect(subVersion(workflow.tasks[1])).toBe(5);
  });

  it('目录中没有该流程时保持原行为并给出提示', () => {
    const { workflow, autoFixed } = normalizeWorkflowDef(wfDef([sub('s1', 'not_in_lib')]), { resolveLatestVersion: latest });
    expect(subVersion(workflow.tasks[0])).toBeUndefined();
    expect(autoFixed.some((m) => m.includes('not_in_lib') && m.includes('不在流程库目录'))).toBe(true);
  });

  it('只有 workflowName 且目录没有时回落为原行为（t.version ?? 1）并提示', () => {
    const t = { name: 'x', taskReferenceName: 's1', type: 'SUB_WORKFLOW', workflowName: 'ghost' } as unknown as TaskDef;
    const { workflow, autoFixed } = normalizeWorkflowDef(wfDef([t]), { resolveLatestVersion: latest });
    expect(subVersion(workflow.tasks[0])).toBe(1);
    expect(autoFixed.some((m) => m.includes('ghost'))).toBe(true);
  });

  it('不提供 resolveLatestVersion 时行为与原先完全一致', () => {
    const named = normalizeWorkflowDef(wfDef([sub('s1', 'create_vm')]));
    expect(subVersion(named.workflow.tasks[0])).toBeUndefined();
    expect(named.autoFixed).toEqual([]);
    const t = { name: 'x', taskReferenceName: 's2', type: 'SUB_WORKFLOW', workflowName: 'create_vm' } as unknown as TaskDef;
    const legacy = normalizeWorkflowDef(wfDef([t]));
    expect(legacy.workflow.tasks[0].subWorkflowParam).toEqual({ name: 'create_vm', version: 1 });
  });

  it('嵌套在分支 / 并行 / 循环里的子工作流同样固定版本', () => {
    const wf = wfDef([
      {
        name: 'sw', taskReferenceName: 'sw', type: 'SWITCH', caseValueParam: 'k',
        decisionCases: { a: [sub('in_case', 'create_vm')] },
        defaultCase: [sub('in_default', 'notify')],
      } as unknown as TaskDef,
      { name: 'lp', taskReferenceName: 'lp', type: 'DO_WHILE', loopCondition: 'false', loopOver: [sub('in_loop', 'create_vm')] } as unknown as TaskDef,
    ]);
    const { workflow } = pinSubWorkflowVersions(wf, { resolveLatestVersion: latest });
    expect(subVersion(workflow.tasks[0].decisionCases!.a[0])).toBe(5);
    expect(subVersion(workflow.tasks[0].defaultCase![0])).toBe(2);
    expect(subVersion(workflow.tasks[1].loopOver![0])).toBe(5);
  });

  it('applyTaskConfigurations 配置新任务的 subWorkflowParam 后固定为库当前版本', () => {
    const draft = wfDef([{ name: 's', taskReferenceName: 's1', type: 'SUB_WORKFLOW' } as unknown as TaskDef]);
    const res = applyTaskConfigurations(
      draft,
      { configurations: [{ ref: 's1', subWorkflowParam: { name: 'notify' } }] },
      { resolveLatestVersion: latest },
    );
    expect(subVersion(res.workflow.tasks[0])).toBe(2);
  });
});

describe('executeToolCall — 版本固定贯穿 AI 各条提案路径', () => {
  it('replace_workflow：新增的子工作流固定为当前版本，原有（含未固定）的步骤保持不变', () => {
    const current = wfDef([
      sub('keep_unpinned', 'create_vm'),
      sub('keep_pinned', 'create_vm', { subWorkflowParam: { name: 'create_vm', version: 3 } } as Partial<TaskDef>),
    ]);
    const proposed = wfDef([...current.tasks, sub('added', 'notify')]);
    const r = executeToolCall('replace_workflow', { workflow: proposed }, baseCtx({ workflowDef: current, resolveLatestVersion: latest }));
    expect(r.type).toBe('propose');
    const tasks = r.proposed!.tasks;
    expect(subVersion(tasks[0])).toBeUndefined();
    expect(subVersion(tasks[1])).toBe(3);
    expect(subVersion(tasks[2])).toBe(2);
  });

  it('patch_workflow add_task：新增的子工作流固定为当前版本', () => {
    const r = executeToolCall(
      'patch_workflow',
      { ops: [{ op: 'add_task', task: sub('added', 'create_vm') }] },
      baseCtx({ workflowDef: wfDef([sub('a', 'notify', { subWorkflowParam: { name: 'notify', version: 1 } } as Partial<TaskDef>)]), resolveLatestVersion: latest }),
    );
    const tasks = r.proposed!.tasks;
    expect(subVersion(tasks[0])).toBe(1);
    expect(subVersion(tasks[1])).toBe(5);
  });

  it('commit_workflow_proposal 路径：草稿中新增的子工作流固定为当前版本', () => {
    const r = executeToolCall(
      'commit_workflow_proposal',
      {},
      baseCtx({ workflowDef: wfDef([]), workingDraft: wfDef([sub('added', 'create_vm')]), resolveLatestVersion: latest }),
    );
    expect(r.type).toBe('propose');
    expect(subVersion(r.proposed!.tasks[0])).toBe(5);
  });

  it('未注入 resolveLatestVersion 时 replace_workflow 原样返回', () => {
    const proposed = wfDef([sub('added', 'create_vm')]);
    const r = executeToolCall('replace_workflow', { workflow: proposed }, baseCtx());
    expect(subVersion(r.proposed!.tasks[0])).toBeUndefined();
  });
});

describe('search_workflow_library — 服务端检索与结果上限', () => {
  const item = (n: number): WorkflowLibraryItem => ({
    workflowName: `wf_${n}`, workflowLevel: 'L1', version: '1', description: `desc ${n}`, tags: ['t'],
  });

  it('提供 librarySearchResults 时直接展示服务端命中（即使本地目录为空）', () => {
    const r = executeToolCall(
      'search_workflow_library',
      { query: '云主机' },
      baseCtx({ libraryItems: [], librarySearchResults: [{ ...item(1), workflowLevel: 'L2', workflowName: 'server_hit' }] }),
    );
    expect(r.type).toBe('info');
    expect(r.text).toContain('server_hit');
    expect(r.text).toContain('L2');
  });

  it('服务端命中为空数组时提示未找到，而不是回退本地', () => {
    const r = executeToolCall('search_workflow_library', { query: 'zzz' }, baseCtx({ libraryItems: [item(1)], librarySearchResults: [] }));
    expect(r.text).toContain('未找到');
  });

  it('未提供服务端结果时在本地目录内匹配（原行为）', () => {
    const r = executeToolCall('search_workflow_library', { query: 'wf_1' }, baseCtx({ libraryItems: [item(1), item(2)] }));
    expect(r.text).toContain('wf_1');
    expect((r.text ?? '').includes('wf_2')).toBe(false);
  });

  it('命中过多时只展示前 N 个并给出缩小范围的提示', () => {
    const many = Array.from({ length: LIBRARY_SEARCH_RESULT_LIMIT + 20 }, (_, i) => item(i));
    const r = executeToolCall('search_workflow_library', { query: 'wf_' }, baseCtx({ libraryItems: many }));
    expect(r.text).toContain(`找到 ${many.length} 个`);
    expect(r.text).toContain(`仅显示前 ${LIBRARY_SEARCH_RESULT_LIMIT} 个`);
    expect((r.text ?? '').includes(`wf_${LIBRARY_SEARCH_RESULT_LIMIT + 5}\``)).toBe(false);
  });
});

describe('系统提示词 — 目录体积上限', () => {
  const mk = (n: number, level: 'L1' | 'L2' | 'L3'): WorkflowLibraryItem => ({
    workflowName: `${level.toLowerCase()}_${n}`, workflowLevel: level, version: '1', description: 'd', tags: [],
  });

  it('条数不超过上限时输出与原先一致，不出现「另有」提示', () => {
    const text = buildLibraryCatalog([mk(1, 'L3'), mk(1, 'L2'), mk(1, 'L1')])!;
    expect(text).toContain('l3_1');
    expect(text).toContain('l2_1');
    expect(text).toContain('l1_1');
    expect(text.includes('另有')).toBe(false);
  });

  it('超出上限时按 L3 -> L2 -> L1 截断，并写明剩余数量与检索指引', () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => mk(i, 'L1')),
      ...Array.from({ length: 3 }, (_, i) => mk(i, 'L2')),
      ...Array.from({ length: 2 }, (_, i) => mk(i, 'L3')),
    ];
    const text = buildLibraryCatalog(items, 6)!;
    expect(text).toContain('l3_0');
    expect(text).toContain('l3_1');
    expect(text).toContain('l2_2');
    expect(text).toContain('l1_0');
    expect(text.includes('l1_1')).toBe(false); // L1 只剩 1 个名额
    expect(text).toContain('另有 4 个子工作流');
    expect(text).toContain('search_workflow_library');
  });

  it('默认上限为 50', () => {
    expect(DEFAULT_PROMPT_CATALOG_LIMIT).toBe(50);
    const items = Array.from({ length: 120 }, (_, i) => mk(i, 'L2'));
    const text = buildLibraryCatalog(items)!;
    expect(text).toContain('另有 70 个子工作流');
    expect(text.includes('l2_60')).toBe(false);
  });

  it('任务 Schema 段落支持条数上限，超出部分提示改用检索', () => {
    schemaRegistry.setSchemas(Array.from({ length: 5 }, (_, i) => ({ taskName: `t${i}`, inputSchema: { a: 'string' } })));
    try {
      const all = schemaRegistry.buildPromptSection()!;
      expect(all).toContain('t4');
      expect(all.includes('另有')).toBe(false);
      const limited = schemaRegistry.buildPromptSection({ limit: 2 })!;
      expect(limited).toContain('t1');
      expect(limited.includes('t2')).toBe(false);
      expect(limited).toContain('另有 3 个');
    } finally {
      schemaRegistry.setSchemas([]);
    }
  });
});

describe('集成：Provider -> 目录 -> 三种投影 -> AI 侧消费', () => {
  const rec = (name: string, version: number, level: 'L1' | 'L2' | 'L3'): LibraryWorkflowRecord => ({
    def: {
      name, version, description: `${name} 描述`, tasks: [],
      inputSchema: { type: 'JSON', data: { properties: { region: { type: 'string', enum: ['hz', 'bj'] } } } },
    } as WorkflowDef,
    extension: { level },
  });
  const provider: LibraryProvider = {
    async list() {
      return { workflows: [rec('create_vm', 4, 'L1'), rec('create_vm', 5, 'L1'), rec('apply_flow', 2, 'L2')] };
    },
    async get() {
      return null;
    },
  };

  it('目录最新版本同时驱动：AI 目录条目、Schema 注册表、提示词、以及 SUB_WORKFLOW 版本固定', async () => {
    const catalog = new LibraryCatalog(provider, {
      staticItems: [{ workflowName: 'legacy', workflowLevel: 'L1', version: '1', description: '旧静态条目', tags: [] }],
    });
    await catalog.load();

    const items = toLibraryItems(catalog);
    expect(items.map((i) => `${i.workflowName}@${i.version}`)).toEqual(['create_vm@5', 'apply_flow@2', 'legacy@1']);

    schemaRegistry.setSchemas(toTaskSchemas(catalog));
    try {
      const section = schemaRegistry.buildPromptSection()!;
      expect(section).toContain('create_vm');
      expect(section).toContain('region: hz|bj');
    } finally {
      schemaRegistry.setSchemas([]);
    }

    const prompt = buildLibraryCatalog(items)!;
    expect(prompt).toContain('`create_vm` (v5)');

    const resolve = (n: string) => catalog.latest(n)?.version;
    const r = executeToolCall(
      'replace_workflow',
      { workflow: wfDef([sub('s1', 'create_vm'), sub('s2', 'apply_flow')]) },
      baseCtx({ resolveLatestVersion: resolve }),
    );
    expect(subVersion(r.proposed!.tasks[0])).toBe(5);
    expect(subVersion(r.proposed!.tasks[1])).toBe(2);
  });

  it('库发布新版本后重新加载：已有步骤的版本不变，只有新建引用取新版本', async () => {
    let published = 5;
    const live: LibraryProvider = {
      async list() {
        return { workflows: [rec('create_vm', published, 'L1')] };
      },
      async get() {
        return null;
      },
    };
    const catalog = new LibraryCatalog(live);
    await catalog.load();
    const existing = wfDef([sub('old', 'create_vm', { subWorkflowParam: { name: 'create_vm', version: 5 } } as Partial<TaskDef>)]);
    published = 6;
    await catalog.reload();
    const resolve = (n: string) => catalog.latest(n)?.version;
    const r = executeToolCall(
      'replace_workflow',
      { workflow: wfDef([...existing.tasks, sub('fresh', 'create_vm')]) },
      baseCtx({ workflowDef: existing, resolveLatestVersion: resolve }),
    );
    expect(subVersion(r.proposed!.tasks[0])).toBe(5);
    expect(subVersion(r.proposed!.tasks[1])).toBe(6);
  });
});

describe('业务域：系统提示词与 search_workflow_library 过滤', () => {
  const item = (name: string, domain?: string): WorkflowLibraryItem => ({
    workflowName: name, workflowLevel: 'L1', version: '1', description: `${name} 描述`, tags: [], ...(domain ? { domain } : {}),
  });

  it('提示词目录在有业务域时输出 [业务域: X]，没有时不输出', () => {
    const text = buildLibraryCatalog([item('notify_a', '通知协助'), item('plain_b')])!;
    expect(text).toContain('[业务域: 通知协助]');
    expect(text.split('[业务域:').length - 1).toBe(1);
    expect(buildLibraryCatalog([item('plain_b')])!.includes('业务域:')).toBe(false);
  });

  it('domain 参数在本地目录内精确过滤', () => {
    const lib = [item('wf_notify', '通知协助'), item('wf_cloud', '云资源'), item('wf_none')];
    const r = executeToolCall('search_workflow_library', { query: 'wf_', domain: '通知协助' }, baseCtx({ libraryItems: lib }));
    expect(r.text).toContain('wf_notify');
    expect(r.text).toContain('[业务域: 通知协助]');
    expect((r.text ?? '').includes('wf_cloud')).toBe(false);
    expect((r.text ?? '').includes('wf_none')).toBe(false);
  });

  it('不传 domain 时行为不变（全部命中）', () => {
    const lib = [item('wf_notify', '通知协助'), item('wf_cloud', '云资源')];
    const r = executeToolCall('search_workflow_library', { query: 'wf_' }, baseCtx({ libraryItems: lib }));
    expect(r.text).toContain('找到 2 个');
  });

  it('domain 也作用于服务端命中；无匹配时提示未找到', () => {
    const hits = [item('srv_a', '通知协助'), item('srv_b', '云资源')];
    const r = executeToolCall('search_workflow_library', { query: 'srv', domain: '云资源' }, baseCtx({ librarySearchResults: hits }));
    expect(r.text).toContain('srv_b');
    expect((r.text ?? '').includes('srv_a')).toBe(false);
    const none = executeToolCall('search_workflow_library', { query: 'srv', domain: '安全服务' }, baseCtx({ librarySearchResults: hits }));
    expect(none.text).toContain('未找到');
  });

  it('端到端：Provider 记录（名称兜底）-> 目录 -> toLibraryItems -> 按业务域检索', async () => {
    const rec = (name: string): LibraryWorkflowRecord => ({ def: { name, version: 1, description: '描述', tasks: [] } as WorkflowDef });
    const provider: LibraryProvider = {
      async list() { return { workflows: [rec('std-L1-通知协助-企微-发送'), rec('std-L1-云资源-ECS-创建')] }; },
      async get() { return null; },
    };
    const catalog = new LibraryCatalog(provider);
    await catalog.load();
    const items = toLibraryItems(catalog);
    const r = executeToolCall('search_workflow_library', { query: 'std', domain: '云资源' }, baseCtx({ libraryItems: items }));
    expect(r.text).toContain('std-L1-云资源-ECS-创建');
    expect((r.text ?? '').includes('企微')).toBe(false);
  });
});

describe('A5 — workflowName 写法在所有提案路径上都规范化为 subWorkflowParam', () => {
  const byName = (ref: string, workflowName: string): TaskDef =>
    ({ name: ref, taskReferenceName: ref, type: 'SUB_WORKFLOW', workflowName } as unknown as TaskDef);

  it('replace_workflow：workflowName → subWorkflowParam.name，并固定为库当前版本', () => {
    const r = executeToolCall('replace_workflow', { workflow: wfDef([byName('s1', 'create_vm')]) }, baseCtx({ resolveLatestVersion: latest }));
    expect(r.type).toBe('propose');
    expect(r.proposed!.tasks[0].subWorkflowParam).toEqual({ name: 'create_vm', version: 5 });
  });

  it('patch_workflow add_task：workflowName 写法同样被规范化', () => {
    const r = executeToolCall('patch_workflow', { ops: [{ op: 'add_task', task: byName('s2', 'notify') }] }, baseCtx({ resolveLatestVersion: latest }));
    expect(r.proposed!.tasks[0].subWorkflowParam).toEqual({ name: 'notify', version: 2 });
  });

  it('不提供 resolver 时 replace_workflow 仍补齐 subWorkflowParam（否则 Conductor 拒收）', () => {
    const r = executeToolCall('replace_workflow', { workflow: wfDef([byName('s1', 'create_vm')]) }, baseCtx());
    expect(r.proposed!.tasks[0].subWorkflowParam?.name).toBe('create_vm');
  });

  it('scaffold_workflow_topology：用流程库版本固定，而不是 v1', () => {
    const r = executeToolCall('scaffold_workflow_topology', { tasks: [byName('s1', 'create_vm')] }, baseCtx({ resolveLatestVersion: latest }));
    expect(r.type).toBe('stage');
    expect(r.workingDraft!.tasks[0].subWorkflowParam).toEqual({ name: 'create_vm', version: 5 });
  });

  it('嵌套在分支里的 workflowName 写法也被规范化', () => {
    const sw = { name: 'sw', taskReferenceName: 'sw', type: 'SWITCH', decisionCases: { a: [byName('inner', 'notify')] } } as unknown as TaskDef;
    const { workflow } = pinSubWorkflowVersions(wfDef([sw]), { resolveLatestVersion: latest });
    expect(workflow.tasks[0].decisionCases!.a[0].subWorkflowParam).toEqual({ name: 'notify', version: 2 });
  });
});

describe('A12 — load_library_workflow', () => {
  const items: WorkflowLibraryItem[] = [{ workflowName: 'create_vm', workflowLevel: 'L2', version: '5', description: '创建虚机', tags: [] }];

  it('mode=open：流程库提供完整定义时，以该定义作为方案', () => {
    const full = wfDef([{ name: 'alloc', taskReferenceName: 'alloc', type: 'SIMPLE' } as TaskDef]);
    const r = executeToolCall('load_library_workflow', { name: 'create_vm' }, baseCtx({ libraryItems: items, libraryWorkflowDef: { ...full, name: 'create_vm' } }));
    expect(r.type).toBe('propose');
    expect(r.proposed!.name).toBe('create_vm');
    expect(r.diff!.added).toEqual(['alloc']);
    expect(r.inferredLevel).toBe('L2');
  });

  it('mode=open：只有摘要时返回错误并提示改用 reference', () => {
    const r = executeToolCall('load_library_workflow', { name: 'create_vm' }, baseCtx({ libraryItems: items }));
    expect(r.type).toBe('error');
    expect(r.text).toContain('reference');
  });

  it('mode=reference：在当前流程末尾追加引用，版本固定为库当前版本', () => {
    const current = wfDef([{ name: 'a', taskReferenceName: 'a', type: 'SIMPLE' } as TaskDef]);
    const r = executeToolCall('load_library_workflow', { name: 'create_vm', mode: 'reference' }, baseCtx({ workflowDef: current, libraryItems: items, resolveLatestVersion: latest }));
    expect(r.type).toBe('propose');
    expect(r.proposed!.tasks.map((t) => t.taskReferenceName)).toEqual(['a', 'create_vm_ref']);
    expect(r.proposed!.tasks[1].subWorkflowParam).toEqual({ name: 'create_vm', version: 5 });
  });

  it('库中没有该名称时返回错误', () => {
    const r = executeToolCall('load_library_workflow', { name: 'ghost' }, baseCtx({ libraryItems: items }));
    expect(r.type).toBe('error');
    expect(r.text).toContain('search_workflow_library');
  });
});
