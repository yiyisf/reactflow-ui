import { describe, it, expect } from 'vitest';
import { createConductorLibraryProvider } from './conductorProvider';
import { LibraryCatalog } from './catalog';
import type { WorkflowDef } from '../types/conductor';

interface Call {
  url: string;
  init: RequestInit;
}

/** 假 fetch：按 URL 返回预设响应，并记录每次调用 */
function fakeFetch(routes: Record<string, { status?: number; body?: unknown } | Error>) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const route = routes[url];
    if (route === undefined) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    if (route instanceof Error) throw route;
    const status = route.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => route.body } as unknown as Response;
  }) as typeof fetch;
  return { impl, calls };
}

const def = (name: string, version: number, extra: Partial<WorkflowDef> = {}): WorkflowDef =>
  ({ name, version, tasks: [], ...extra }) as WorkflowDef;

const BASE = 'https://conductor.example.com/api';

describe('createConductorLibraryProvider — 路径', () => {
  it('list 使用 GET {baseUrl}/metadata/workflow，baseUrl 尾部斜杠不影响', async () => {
    const { impl, calls } = fakeFetch({ [`${BASE}/metadata/workflow`]: { body: [] } });
    const p = createConductorLibraryProvider({ baseUrl: `${BASE}///`, fetch: impl });
    await p.list();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/metadata/workflow`);
    expect(calls[0].init.method).toBe('GET');
  });

  it('get 使用 /metadata/workflow/{name}?version={v}；version 缺省时不带参数；名称会被转义', async () => {
    const { impl, calls } = fakeFetch({
      [`${BASE}/metadata/workflow/create_vm?version=3`]: { body: def('create_vm', 3) },
      [`${BASE}/metadata/workflow/create_vm`]: { body: def('create_vm', 9) },
      [`${BASE}/metadata/workflow/a%2Fb%20c?version=1`]: { body: def('a/b c', 1) },
    });
    const p = createConductorLibraryProvider({ baseUrl: BASE, fetch: impl });
    expect((await p.get('create_vm', 3))!.def.version).toBe(3);
    expect((await p.get('create_vm'))!.def.version).toBe(9);
    expect((await p.get('a/b c', 1))!.def.name).toBe('a/b c');
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/metadata/workflow/create_vm?version=3`,
      `${BASE}/metadata/workflow/create_vm`,
      `${BASE}/metadata/workflow/a%2Fb%20c?version=1`,
    ]);
  });

  it('网关路径可覆盖；workflow 路径支持 {name} 模板', async () => {
    const { impl, calls } = fakeFetch({
      [`${BASE}/gw/wf-list`]: { body: [def('a', 1)] },
      [`${BASE}/gw/wf/a/detail?version=2`]: { body: def('a', 2) },
      [`${BASE}/gw/tasks`]: { body: [{ name: 't' }] },
    });
    const p = createConductorLibraryProvider({
      baseUrl: BASE,
      fetch: impl,
      includeTaskDefs: true,
      paths: { workflows: '/gw/wf-list', workflow: '/gw/wf/{name}/detail', taskDefs: '/gw/tasks' },
    });
    const list = await p.list();
    expect(list.workflows).toHaveLength(1);
    expect(list.tasks!.map((t) => t.def.name)).toEqual(['t']);
    expect((await p.get('a', 2))!.def.version).toBe(2);
    expect(calls.map((c) => c.url)).toEqual([`${BASE}/gw/wf-list`, `${BASE}/gw/tasks`, `${BASE}/gw/wf/a/detail?version=2`]);
  });

  it('未开启 includeTaskDefs 时不请求 taskdefs；开启后返回任务记录', async () => {
    const routes = {
      [`${BASE}/metadata/workflow`]: { body: [def('a', 1)] },
      [`${BASE}/metadata/taskdefs`]: { body: [{ name: 'send_mail', inputKeys: ['to'] }] },
    };
    const off = fakeFetch(routes);
    const r1 = await createConductorLibraryProvider({ baseUrl: BASE, fetch: off.impl }).list();
    expect(r1.tasks).toBeUndefined();
    expect(off.calls).toHaveLength(1);

    const on = fakeFetch(routes);
    const r2 = await createConductorLibraryProvider({
      baseUrl: BASE,
      fetch: on.impl,
      includeTaskDefs: true,
      resolveTaskExtension: (d) => (d.name === 'send_mail' ? { level: 'L1', tags: ['通知'] } : undefined),
    }).list();
    expect(on.calls).toHaveLength(2);
    expect(r2.tasks![0].def.name).toBe('send_mail');
    expect(r2.tasks![0].extension).toEqual({ level: 'L1', tags: ['通知'] });
  });
});

describe('createConductorLibraryProvider — 去重 / 404 / 错误', () => {
  it('列表同名多版本时，客户端按 name 取最大 version', async () => {
    const { impl } = fakeFetch({
      [`${BASE}/metadata/workflow`]: { body: [def('a', 2), def('b', 1), def('a', 5), def('a', 3)] },
    });
    const { workflows } = await createConductorLibraryProvider({ baseUrl: BASE, fetch: impl }).list();
    const byName = Object.fromEntries(workflows.map((w) => [w.def.name, w.def.version]));
    expect(byName).toEqual({ a: 5, b: 1 });
  });

  it('get 返回 404 时为 null（不抛错）', async () => {
    const { impl } = fakeFetch({ [`${BASE}/metadata/workflow/gone?version=1`]: { status: 404 } });
    const p = createConductorLibraryProvider({ baseUrl: BASE, fetch: impl });
    expect(await p.get('gone', 1)).toBeNull();
  });

  it('非 404 的 HTTP 错误、网络错误会抛出', async () => {
    const { impl } = fakeFetch({
      [`${BASE}/metadata/workflow`]: { status: 500 },
      [`${BASE}/metadata/workflow/x?version=1`]: { status: 503 },
      [`${BASE}/metadata/workflow/net`]: new Error('Failed to fetch'),
    });
    const p = createConductorLibraryProvider({ baseUrl: BASE, fetch: impl });
    let listErr = '';
    try {
      await p.list();
    } catch (e) {
      listErr = (e as Error).message;
    }
    expect(listErr).toContain('HTTP 500');
    let getErr = '';
    try {
      await p.get('x', 1);
    } catch (e) {
      getErr = (e as Error).message;
    }
    expect(getErr).toContain('HTTP 503');
    let netErr = '';
    try {
      await p.get('net');
    } catch (e) {
      netErr = (e as Error).message;
    }
    expect(netErr).toBe('Failed to fetch');
  });

  it('列表返回非数组时给出明确错误', async () => {
    const { impl } = fakeFetch({ [`${BASE}/metadata/workflow`]: { body: { oops: true } } });
    let msg = '';
    try {
      await createConductorLibraryProvider({ baseUrl: BASE, fetch: impl }).list();
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('格式不正确');
  });

  it('网络错误经目录层被捕获为 error 状态，不影响其它功能', async () => {
    const { impl } = fakeFetch({ [`${BASE}/metadata/workflow`]: new Error('offline') });
    const catalog = new LibraryCatalog(createConductorLibraryProvider({ baseUrl: BASE, fetch: impl }));
    await catalog.load();
    expect(catalog.getSnapshot().status).toBe('error');
    expect(catalog.getSnapshot().error!.message).toBe('offline');
  });
});

describe('createConductorLibraryProvider — headers / signal', () => {
  it('每次请求前调用 headers()（支持异步刷新 token），并带 Accept 头', async () => {
    const { impl, calls } = fakeFetch({
      [`${BASE}/metadata/workflow`]: { body: [] },
      [`${BASE}/metadata/workflow/a`]: { body: def('a', 1) },
    });
    let n = 0;
    const p = createConductorLibraryProvider({
      baseUrl: BASE,
      fetch: impl,
      headers: async () => ({ Authorization: `Bearer token-${++n}` }),
    });
    await p.list();
    await p.get('a');
    const h = (i: number) => calls[i].init.headers as Record<string, string>;
    expect(h(0).Authorization).toBe('Bearer token-1');
    expect(h(1).Authorization).toBe('Bearer token-2');
    expect(h(0).Accept).toBe('application/json');
  });

  it('abort 信号透传给 fetch', async () => {
    const { impl, calls } = fakeFetch({ [`${BASE}/metadata/workflow`]: { body: [] } });
    const ac = new AbortController();
    await createConductorLibraryProvider({ baseUrl: BASE, fetch: impl }).list(ac.signal);
    expect(calls[0].init.signal === ac.signal).toBe(true);
  });
});

describe('createConductorLibraryProvider — filter / resolveExtension', () => {
  const routes = {
    [`${BASE}/metadata/workflow`]: {
      body: [def('lib_create_vm', 2), def('lib_notify', 1), def('private_flow', 1)],
    },
    [`${BASE}/metadata/workflow/private_flow?version=1`]: { body: def('private_flow', 1) },
    [`${BASE}/metadata/workflow/lib_notify?version=1`]: { body: def('lib_notify', 1) },
  };

  it('filter 只暴露流程库内的工作流，对 list 与 get 都生效', async () => {
    const { impl } = fakeFetch(routes);
    const p = createConductorLibraryProvider({ baseUrl: BASE, fetch: impl, filter: (d) => d.name.startsWith('lib_') });
    expect((await p.list()).workflows.map((w) => w.def.name)).toEqual(['lib_create_vm', 'lib_notify']);
    expect(await p.get('private_flow', 1)).toBeNull();
    expect((await p.get('lib_notify', 1))!.def.name).toBe('lib_notify');
  });

  it('resolveExtension 的结果进入记录；extension.deprecated 同步为记录的 deprecated', async () => {
    const { impl } = fakeFetch(routes);
    const p = createConductorLibraryProvider({
      baseUrl: BASE,
      fetch: impl,
      resolveExtension: (d) =>
        d.name === 'lib_create_vm'
          ? { level: 'L2', displayName: '创建云主机', tags: ['云'] }
          : d.name === 'lib_notify'
            ? { level: 'L1', deprecated: true }
            : undefined,
    });
    const { workflows } = await p.list();
    const by = Object.fromEntries(workflows.map((w) => [w.def.name, w]));
    expect(by.lib_create_vm.extension).toEqual({ level: 'L2', displayName: '创建云主机', tags: ['云'] });
    expect(by.lib_create_vm.deprecated).toBeUndefined();
    expect(by.lib_notify.deprecated).toBe(true);
    expect(by.private_flow.extension).toBeUndefined();
    expect((await p.get('lib_notify', 1))!.deprecated).toBe(true);
  });

  it('与目录配合：加载后取每个 name 的最新版本，extension 的层级进入条目', async () => {
    const { impl } = fakeFetch({
      [`${BASE}/metadata/workflow`]: { body: [def('a', 1), def('a', 4)] },
    });
    const catalog = new LibraryCatalog(
      createConductorLibraryProvider({ baseUrl: BASE, fetch: impl, resolveExtension: () => ({ level: 'L3' }) }),
    );
    await catalog.load();
    expect(catalog.latest('a')!.version).toBe(4);
    expect(catalog.latest('a')!.level).toBe('L3');
  });

  it('没有 fetch 实现时给出明确错误', async () => {
    const original = (globalThis as { fetch?: typeof fetch }).fetch;
    (globalThis as { fetch?: typeof fetch }).fetch = undefined;
    try {
      let msg = '';
      try {
        await createConductorLibraryProvider({ baseUrl: BASE }).list();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toContain('fetch');
    } finally {
      (globalThis as { fetch?: typeof fetch }).fetch = original;
    }
  });
});
