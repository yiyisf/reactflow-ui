import { describe, it, expect } from 'vitest';
import { LibraryCatalog } from './catalog';
import { normalizeVersion } from './version';
import type { LibraryListResult, LibraryProvider, LibraryWorkflowRecord } from './types';
import type { WorkflowLibraryItem } from '../types/workflowLibrary';

const wf = (name: string, version: number | undefined, extra: Partial<LibraryWorkflowRecord> = {}): LibraryWorkflowRecord => ({
  def: { name, version, description: `${name} 描述`, tasks: [] },
  ...extra,
});

/** 可观测调用次数的假 Provider */
function fakeProvider(
  list: LibraryListResult,
  versions: Record<string, LibraryWorkflowRecord> = {},
): LibraryProvider & { getCalls: string[]; listCalls: number } {
  const p = {
    getCalls: [] as string[],
    listCalls: 0,
    async list() {
      p.listCalls++;
      return list;
    },
    async get(name: string, version?: number) {
      p.getCalls.push(`${name}@${version}`);
      return versions[`${name}@${version}`] ?? null;
    },
  };
  return p;
}

describe('normalizeVersion 版本规范化', () => {
  it('整数原样使用', () => {
    expect(normalizeVersion(3)).toEqual({ version: 3, lossy: false });
  });
  it('静态 "3" -> 3，label 为 "3"', () => {
    expect(normalizeVersion('3')).toEqual({ version: 3, label: '3', lossy: false });
  });
  it('"1.2.0" 取主版本号，label 保留原串且标记有损', () => {
    expect(normalizeVersion('1.2.0')).toEqual({ version: 1, label: '1.2.0', lossy: true });
    expect(normalizeVersion('v2.0').version).toBe(2);
  });
  it('缺省 / 无法解析时回落为 1', () => {
    expect(normalizeVersion(undefined).version).toBe(1);
    expect(normalizeVersion('abc').version).toBe(1);
  });
});

describe('LibraryCatalog 规范化与去重', () => {
  it('同名多版本去重，取每个 name 的最大 version', async () => {
    const catalog = new LibraryCatalog(
      fakeProvider({ workflows: [wf('a', 1), wf('a', 3), wf('a', 2), wf('b', 5)] }),
    );
    await catalog.load();
    expect(catalog.latest('a')!.version).toBe(3);
    expect(catalog.latest('b')!.version).toBe(5);
    expect(catalog.entries()).toHaveLength(2);
  });

  it('WorkflowDef.version 缺省按 1 处理', async () => {
    const catalog = new LibraryCatalog(fakeProvider({ workflows: [wf('a', undefined)] }));
    await catalog.load();
    expect(catalog.latest('a')!.version).toBe(1);
  });

  it('静态条目版本规范化："3" -> 3；"1.2.0" -> 1 且保留 versionLabel，仅告警一次', () => {
    const warns: string[] = [];
    const orig = console.warn;
    console.warn = (...args: unknown[]) => {
      warns.push(args.map(String).join(' '));
    };
    try {
      const items: WorkflowLibraryItem[] = [
        { workflowName: 'x', workflowLevel: 'L1', version: '3', description: '', tags: [] },
        { workflowName: 'y', workflowLevel: 'L2', version: '1.2.0', description: '', tags: ['t'] },
      ];
      const catalog = new LibraryCatalog(undefined, { staticItems: items });
      catalog.setStatic({ staticItems: items }); // 重复设置不应重复告警
      expect(catalog.latest('x')!.version).toBe(3);
      expect(catalog.latest('x')!.versionLabel).toBe('3');
      expect(catalog.latest('y')!.version).toBe(1);
      expect(catalog.latest('y')!.versionLabel).toBe('1.2.0');
      expect(catalog.latest('y')!.level).toBe('L2');
      expect(warns).toHaveLength(1);
    } finally {
      console.warn = orig;
    }
  });

  it('同名条目 Provider 优先于静态 prop；静态独有条目保留', async () => {
    const catalog = new LibraryCatalog(
      fakeProvider({ workflows: [wf('a', 7, { extension: { level: 'L2' } })] }),
      {
        staticItems: [
          { workflowName: 'a', workflowLevel: 'L1', version: '1', description: '静态', tags: [] },
          { workflowName: 'only_static', workflowLevel: 'L1', version: '2', description: '', tags: [] },
        ],
      },
    );
    await catalog.load();
    expect(catalog.latest('a')!.source).toBe('provider');
    expect(catalog.latest('a')!.version).toBe(7);
    expect(catalog.latest('a')!.level).toBe('L2');
    expect(catalog.latest('only_static')!.source).toBe('static');
  });

  it('deprecated 来自记录或 extension', async () => {
    const catalog = new LibraryCatalog(
      fakeProvider({
        workflows: [wf('a', 1, { deprecated: true }), wf('b', 1, { extension: { deprecated: true } }), wf('c', 1)],
      }),
    );
    await catalog.load();
    expect(catalog.latest('a')!.deprecated).toBe(true);
    expect(catalog.latest('b')!.deprecated).toBe(true);
    expect(catalog.latest('c')!.deprecated).toBe(false);
  });
});

describe('LibraryCatalog 状态与订阅', () => {
  it('load 过程 idle -> loading -> ready，并通知订阅者；快照引用随变化更新', async () => {
    const catalog = new LibraryCatalog(fakeProvider({ workflows: [wf('a', 1)] }));
    const seen: string[] = [];
    const unsub = catalog.subscribe(() => seen.push(catalog.getSnapshot().status));
    const before = catalog.getSnapshot();
    expect(before.status).toBe('idle');
    await catalog.load();
    expect(seen).toEqual(['loading', 'ready']);
    expect(catalog.getSnapshot() === before).toBe(false);
    unsub();
    await catalog.load();
    expect(seen).toHaveLength(2);
  });

  it('网络错误记为 error 状态而不抛出；之后可重试成功', async () => {
    let fail = true;
    const provider: LibraryProvider = {
      async list() {
        if (fail) throw new Error('网络不通');
        return { workflows: [wf('a', 1)] };
      },
      async get() {
        return null;
      },
    };
    const catalog = new LibraryCatalog(provider);
    await catalog.load();
    expect(catalog.getSnapshot().status).toBe('error');
    expect(catalog.getSnapshot().error!.message).toBe('网络不通');
    fail = false;
    await catalog.load();
    expect(catalog.getSnapshot().status).toBe('ready');
    expect(catalog.latest('a')!.version).toBe(1);
  });

  it('已 abort 的加载结果被丢弃，不写入目录', async () => {
    const ac = new AbortController();
    const provider: LibraryProvider = {
      async list(signal) {
        ac.abort();
        expect(signal!.aborted).toBe(true);
        return { workflows: [wf('late', 1)] };
      },
      async get() {
        return null;
      },
    };
    const catalog = new LibraryCatalog(provider);
    await catalog.load(ac.signal);
    expect(catalog.latest('late')).toBeUndefined();
    expect(catalog.getSnapshot().status).toBe('idle');
  });

  it('更换 Provider 后，旧 Provider 的过期结果被丢弃', async () => {
    let release: (r: LibraryListResult) => void = () => {};
    const slow: LibraryProvider = {
      list: () => new Promise<LibraryListResult>((r) => (release = r)),
      async get() {
        return null;
      },
    };
    const catalog = new LibraryCatalog(slow);
    const pending = catalog.load();
    catalog.setProvider(fakeProvider({ workflows: [wf('new', 2)] }));
    release({ workflows: [wf('old', 1)] });
    await pending;
    expect(catalog.latest('old')).toBeUndefined();
    await catalog.load();
    expect(catalog.latest('new')!.version).toBe(2);
  });

  it('无 Provider 时 load 为空操作，静态条目照常可用', async () => {
    const catalog = new LibraryCatalog(undefined, {
      staticItems: [{ workflowName: 's', workflowLevel: 'L3', version: '2', description: 'd', tags: [] }],
    });
    await catalog.load();
    expect(catalog.getSnapshot().status).toBe('idle');
    expect(catalog.entries()).toHaveLength(1);
  });
});

describe('LibraryCatalog 历史版本缓存', () => {
  it('getVersion 按需取并缓存，重复调用不再请求', async () => {
    const provider = fakeProvider(
      { workflows: [wf('a', 3)] },
      { 'a@1': wf('a', 1), 'a@3': wf('a', 3) },
    );
    const catalog = new LibraryCatalog(provider);
    await catalog.load();
    const r1 = await catalog.getVersion('a', 1);
    const r2 = await catalog.getVersion('a', 1);
    expect(r1!.def.version).toBe(1);
    expect(r2 === r1).toBe(true);
    expect(provider.getCalls).toEqual(['a@1']);
  });

  it('找不到的版本返回 null，且不缓存（之后发布了可再取到）', async () => {
    const versions: Record<string, LibraryWorkflowRecord> = {};
    const provider = fakeProvider({ workflows: [wf('a', 1)] }, versions);
    const catalog = new LibraryCatalog(provider);
    await catalog.load();
    expect(await catalog.getVersion('a', 9)).toBeNull();
    versions['a@9'] = wf('a', 9);
    expect((await catalog.getVersion('a', 9))!.def.version).toBe(9);
    expect(provider.getCalls).toEqual(['a@9', 'a@9']);
  });

  it('更换 Provider 后缓存清空', async () => {
    const p1 = fakeProvider({ workflows: [wf('a', 1)] }, { 'a@1': wf('a', 1) });
    const catalog = new LibraryCatalog(p1);
    await catalog.load();
    await catalog.getVersion('a', 1);
    const p2 = fakeProvider({ workflows: [wf('a', 1)] }, {});
    catalog.setProvider(p2);
    expect(await catalog.getVersion('a', 1)).toBeNull();
    expect(p2.getCalls).toEqual(['a@1']);
  });

  it('静态条目的当前版本直接返回摘要，不请求 Provider', async () => {
    const catalog = new LibraryCatalog(undefined, {
      staticItems: [{ workflowName: 's', workflowLevel: 'L1', version: '2', description: 'd', tags: [] }],
    });
    expect((await catalog.getVersion('s', 2))!.def.name).toBe('s');
    expect(await catalog.getVersion('s', 1)).toBeNull();
  });
});

describe('LibraryCatalog 检索', () => {
  it('Provider 无 search 时返回 null（调用方退回本地匹配）', async () => {
    const catalog = new LibraryCatalog(fakeProvider({ workflows: [] }));
    expect(catalog.hasServerSearch()).toBe(false);
    expect(await catalog.search('x')).toBeNull();
  });

  it('Provider 有 search 时透传参数并规范化结果', async () => {
    let received: unknown;
    const provider: LibraryProvider = {
      async list() {
        return { workflows: [] };
      },
      async get() {
        return null;
      },
      async search(q, opts) {
        received = { q, opts };
        return [wf('hit', 4, { extension: { level: 'L2' } })];
      },
    };
    const catalog = new LibraryCatalog(provider);
    expect(catalog.hasServerSearch()).toBe(true);
    const res = await catalog.search('云主机', { level: 'L2', limit: 5 });
    expect(received).toEqual({ q: '云主机', opts: { level: 'L2', limit: 5 } });
    expect(res![0].name).toBe('hit');
    expect(res![0].version).toBe(4);
  });
});
