import { describe, it, expect } from 'vitest';
import { createMockGovernanceProvider } from './mockGovernanceProvider';
import { DEMO_DOMAINS, DEMO_WORKFLOW_NAMES as N, createDemoLibraryData } from './libraryData';
import { parseWorkflowName } from '../../library/naming';
import { LibraryCatalog } from '../../library/catalog';
import { diffWorkflowVersions } from '../../library/diff';

const fast = () => createMockGovernanceProvider({ latencyMs: 0 });

async function rejects(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error('期望 Promise 被拒绝，但它成功了');
}

describe('mockGovernanceProvider.list', () => {
  it('每个名称只返回一条当前版本，且为摘要（tasks 为空、schema 完整）', async () => {
    const res = await fast().list();
    const names = res.workflows.map((r) => r.def.name);
    expect(new Set(names).size).toBe(names.length);
    expect(res.workflows.length).toBeGreaterThanOrEqual(10);
    for (const r of res.workflows) {
      expect(r.def.tasks).toEqual([]);
      expect(r.def.inputSchema?.type).toBe('JSON');
    }
    expect((res.tasks ?? []).length).toBeGreaterThan(0);
  });

  it('取最大的未撤回版本；多版本能力返回最新版', async () => {
    const res = await fast().list();
    const ci = res.workflows.find((r) => r.def.name === N.QUERY_CI)!;
    expect(ci.def.version).toBe(2);
    const snap = res.workflows.find((r) => r.def.name === N.ECS_SNAPSHOT)!;
    expect(snap.def.version).toBe(2);
  });

  it('已下线能力带 deprecated 标记，其余不带', async () => {
    const res = await fast().list();
    const dep = res.workflows.filter((r) => r.deprecated);
    expect(dep.map((r) => r.def.name)).toEqual([N.SFTP_UPLOAD]);
    expect(dep[0].extension?.deprecated).toBe(true);
    expect(res.workflows.find((r) => r.def.name === N.SMS)!.deprecated).toBeUndefined();
  });

  it('返回的是拷贝，修改不影响后续请求', async () => {
    const p = fast();
    const a = await p.list();
    a.workflows[0].def.description = '被改动';
    const b = await p.list();
    expect(b.workflows[0].def.description === '被改动').toBe(false);
  });

  it('可由 LibraryCatalog 加载，已下线条目被标记', async () => {
    const catalog = new LibraryCatalog(fast());
    await catalog.load();
    expect(catalog.getSnapshot().status).toBe('ready');
    expect(catalog.latest(N.SFTP_UPLOAD)!.deprecated).toBe(true);
    expect(catalog.latest(N.QUERY_CI)!.version).toBe(2);
    expect(catalog.latest(N.SMS)!.domain).toBe('通知协助');
  });
});

describe('mockGovernanceProvider.get', () => {
  it('返回指定版本的完整定义（含任务体）', async () => {
    const p = fast();
    const v1 = await p.get(N.QUERY_CI, 1);
    const v2 = await p.get(N.QUERY_CI, 2);
    expect(v1!.def.version).toBe(1);
    expect(v2!.def.version).toBe(2);
    expect(v2!.def.tasks.length).toBeGreaterThan(0);
  });

  it('未指定版本时返回当前最新版本', async () => {
    const rec = await fast().get(N.SMS);
    expect(rec!.def.version).toBe(2);
  });

  it('被撤回的版本、不存在的版本、不存在的名称都返回 null', async () => {
    const p = fast();
    expect(await p.get(N.ECS_SNAPSHOT, 1)).toBeNull();
    expect(await p.get(N.ECS_SNAPSHOT, 99)).toBeNull();
    expect(await p.get('std-L1-云资源-nope-none', 1)).toBeNull();
    expect((await p.get(N.ECS_SNAPSHOT, 2))!.def.version).toBe(2);
  });

  it('已下线能力仍可按版本获取，且带 deprecated', async () => {
    const rec = await fast().get(N.SFTP_UPLOAD, 1);
    expect(rec!.deprecated).toBe(true);
  });

  it('LibraryCatalog.getVersion 对撤回版本得到 null', async () => {
    const catalog = new LibraryCatalog(fast());
    await catalog.load();
    expect(await catalog.getVersion(N.ECS_SNAPSHOT, 1)).toBeNull();
    expect((await catalog.getVersion(N.QUERY_CI, 1))!.def.version).toBe(1);
  });

  it('配置项查询 v2 相对 v1：新增必填入参、删除出参（升级差异演示场景）', async () => {
    const p = fast();
    const v1 = (await p.get(N.QUERY_CI, 1))!.def;
    const v2 = (await p.get(N.QUERY_CI, 2))!.def;
    const diff = diffWorkflowVersions(v1, v2, { ciType: '服务器' });
    expect(diff.addedInputs.some((f) => f.key === 'tenantId' && f.required)).toBe(true);
    expect(diff.removedOutputs.includes('costMs')).toBe(true);
  });
});

describe('mockGovernanceProvider.search', () => {
  it('按关键字匹配名称 / 展示名 / 描述 / 标签', async () => {
    const p = fast();
    const byName = await p.search!('send_sms');
    expect(byName.map((r) => r.def.name)).toEqual([N.SMS]);
    const byTag = await p.search!('快照');
    expect(byTag.map((r) => r.def.name)).toContain(N.ECS_SNAPSHOT);
    const none = await p.search!('完全不存在的关键字xyz');
    expect(none).toEqual([]);
  });

  it('按层级与业务域过滤，可组合', async () => {
    const p = fast();
    const l2 = await p.search!('', { level: 'L2' });
    expect(l2.length).toBeGreaterThan(0);
    for (const r of l2) expect(r.extension?.level).toBe('L2');
    const notify = await p.search!('', { domain: '通知协助' });
    expect(notify.map((r) => r.def.name).sort()).toEqual([N.CARD, N.SMS].sort());
    const both = await p.search!('', { domain: '监控运维', level: 'L2' });
    expect(both.map((r) => r.def.name)).toEqual([N.AUTO_SCALE]);
  });

  it('limit 生效，且已下线能力不出现在检索结果中', async () => {
    const p = fast();
    const limited = await p.search!('', { limit: 3 });
    expect(limited).toHaveLength(3);
    const all = await p.search!('');
    expect(all.some((r) => r.def.name === N.SFTP_UPLOAD)).toBe(false);
  });
});

describe('mockGovernanceProvider 取消与故障', () => {
  it('请求发出前已 abort：直接以 AbortError 拒绝，且不计入请求数', async () => {
    const p = fast();
    const ctl = new AbortController();
    ctl.abort();
    const err = await rejects(p.list(ctl.signal));
    expect(err.name).toBe('AbortError');
    expect(p.requestCount).toBe(0);
  });

  it('延迟期间 abort：立即拒绝而不是等到延迟结束', async () => {
    const p = createMockGovernanceProvider({ latencyMs: 5000 });
    const ctl = new AbortController();
    const started = Date.now();
    const pending = rejects(p.get(N.SMS, 1, ctl.signal));
    setTimeout(() => ctl.abort(), 10);
    const err = await pending;
    expect(err.name).toBe('AbortError');
    expect(Date.now() - started < 2000).toBe(true);
  });

  it('模拟延迟确实生效', async () => {
    const p = createMockGovernanceProvider({ latencyMs: 60 });
    const started = Date.now();
    await p.list();
    expect(Date.now() - started >= 50).toBe(true);
  });

  it('failNext：只失败指定次数，之后恢复正常', async () => {
    const p = fast();
    p.failNext(2);
    await rejects(p.list());
    await rejects(p.get(N.SMS, 1));
    expect((await p.list()).workflows.length).toBeGreaterThan(0);
  });

  it('failureRate：为 1 时总是失败，为 0 时从不失败；可运行时调整', async () => {
    const always = createMockGovernanceProvider({ latencyMs: 0, failureRate: 1 });
    await rejects(always.list());
    always.setFailureRate(0);
    expect((await always.list()).workflows.length).toBeGreaterThan(0);

    const seeded = createMockGovernanceProvider({ latencyMs: 0, failureRate: 0.5, random: () => 0.4 });
    await rejects(seeded.list());
    const seeded2 = createMockGovernanceProvider({ latencyMs: 0, failureRate: 0.5, random: () => 0.6 });
    expect((await seeded2.list()).workflows.length).toBeGreaterThan(0);
  });

  it('目录加载失败后重试成功（LibraryCatalog 进入 error 再回到 ready）', async () => {
    const p = fast();
    p.failNext();
    const catalog = new LibraryCatalog(p);
    await catalog.load();
    expect(catalog.getSnapshot().status).toBe('error');
    await catalog.reload();
    expect(catalog.getSnapshot().status).toBe('ready');
  });
});

describe('演示数据完整性', () => {
  const { workflows, tasks } = createDemoLibraryData();
  const records = workflows.flatMap((e) => e.versions.map((v) => v.record));

  it('规模与覆盖面：10–14 个能力，覆盖至少 5 个业务域与 L1/L2/L3', () => {
    expect(workflows.length).toBeGreaterThanOrEqual(10);
    expect(workflows.length <= 14).toBe(true);
    const domains = new Set(workflows.map((e) => parseWorkflowName(e.name)!.domain));
    expect(domains.size).toBeGreaterThanOrEqual(5);
    const levels = new Set(workflows.map((e) => parseWorkflowName(e.name)!.level));
    expect(levels.has('L1') && levels.has('L2') && levels.has('L3')).toBe(true);
  });

  it('每条记录的名称符合命名规范，业务域在全局列表内，extension.level / domain 与名称一致', () => {
    for (const r of records) {
      const parsed = parseWorkflowName(r.def.name);
      expect(parsed === null).toBe(false);
      expect(DEMO_DOMAINS.includes(parsed!.domain)).toBe(true);
      expect(r.extension?.level).toBe(parsed!.level);
      expect(r.extension?.domain).toBe(parsed!.domain);
    }
  });

  it('同名各版本的 version 为整数且不重复，名称与条目一致', () => {
    for (const e of workflows) {
      const versions = e.versions.map((v) => v.record.def.version!);
      expect(new Set(versions).size).toBe(versions.length);
      for (const v of versions) expect(Number.isInteger(v) && v >= 1).toBe(true);
      for (const v of e.versions) expect(v.record.def.name).toBe(e.name);
    }
  });

  it('每个 schema 属性都有中文 title 与 description，必填项存在于属性中', () => {
    const check = (schemaDef: { data?: Record<string, any> } | undefined, where: string) => {
      const data = schemaDef?.data;
      expect(data === undefined).toBe(false);
      const props = data!.properties as Record<string, { title?: string; description?: string; examples?: unknown[] }>;
      expect(Object.keys(props).length).toBeGreaterThan(0);
      for (const [key, p] of Object.entries(props)) {
        if (!p.title || !p.description) throw new Error(`${where}.${key} 缺少 title 或 description`);
        if (!/[一-龥]/.test(p.title)) throw new Error(`${where}.${key} 的 title 不是中文`);
      }
      for (const req of (data!.required ?? []) as string[]) {
        if (!(req in props)) throw new Error(`${where} 的必填项 ${req} 不在属性中`);
      }
    };
    for (const r of records) {
      check(r.def.inputSchema, `${r.def.name}@${r.def.version}.inputSchema`);
      check(r.def.outputSchema, `${r.def.name}@${r.def.version}.outputSchema`);
    }
    for (const t of tasks) {
      check(t.def.inputSchema, `${t.def.name}.inputSchema`);
      check(t.def.outputSchema, `${t.def.name}.outputSchema`);
    }
  });

  it('outputParameters 的键与 outputSchema 属性一致，任务非空且引用名唯一', () => {
    for (const r of records) {
      const outProps = Object.keys(r.def.outputSchema!.data!.properties);
      expect(Object.keys(r.def.outputParameters!).sort()).toEqual(outProps.sort());
      expect(r.def.tasks.length).toBeGreaterThan(0);
      const refs = r.def.tasks.map((t) => t.taskReferenceName);
      expect(new Set(refs).size).toBe(refs.length);
    }
  });

  it('组合能力引用的下层版本真实存在，且不违反分层规则（高层调用低层或同层）', () => {
    const rank = { L1: 1, L2: 2, L3: 3 } as const;
    for (const e of workflows) {
      const caller = parseWorkflowName(e.name)!;
      for (const v of e.versions) {
        for (const t of v.record.def.tasks) {
          if (t.type !== 'SUB_WORKFLOW') continue;
          const sub = t.subWorkflowParam!;
          const target = workflows.find((w) => w.name === sub.name);
          if (!target) throw new Error(`${e.name} 引用了不存在的 ${sub.name}`);
          expect(target.versions.some((x) => x.record.def.version === sub.version)).toBe(true);
          expect(rank[parseWorkflowName(sub.name)!.level] <= rank[caller.level]).toBe(true);
        }
      }
    }
  });

  it('包含演示所需场景：已下线能力、被撤回的版本、含破坏性变化的多版本能力', () => {
    expect(workflows.some((e) => e.versions.every((v) => v.status === 'DEPRECATED'))).toBe(true);
    expect(workflows.some((e) => e.versions.some((v) => v.status === 'WITHDRAWN'))).toBe(true);
    expect(workflows.some((e) => e.versions.length >= 2)).toBe(true);
  });
});
