import { describe, it, expect } from 'vitest';
import { createGovernanceLibraryProvider } from './governanceLibraryProvider';
import type { LibraryListResult } from '../../library/types';

interface Call {
  url: string;
  headers: Record<string, string>;
  signal?: AbortSignal | null;
}

type Reply = { status?: number; body?: unknown; etag?: string };

/** 假 fetch：按调用顺序依次返回预设响应，并记录每次调用 */
function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string>, signal: init?.signal });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => (k.toLowerCase() === 'etag' ? (r.etag ?? null) : null) },
      json: async () => r.body,
    } as unknown as Response;
  }) as typeof fetch;
  return { impl, calls };
}

const catalog: LibraryListResult = {
  workflows: [{ def: { name: 'std-L1-通知协助-msg-send_sms', version: 2, tasks: [] } }],
};
const BASE = 'https://governance.example.com/';

describe('createGovernanceLibraryProvider.list', () => {
  it('请求目录接口，注入认证头，并带上 kind 参数', async () => {
    const { impl, calls } = fakeFetch([{ body: catalog, etag: '"v1"' }]);
    const p = createGovernanceLibraryProvider({ baseUrl: BASE, fetch: impl, headers: async () => ({ Authorization: 'Bearer t1' }) });
    const res = await p.list();
    expect(res.workflows).toHaveLength(1);
    expect(calls[0].url).toBe('https://governance.example.com/api/library/catalog?kind=WORKFLOW%2CTASK');
    expect(calls[0].headers['Authorization']).toBe('Bearer t1');
    expect(calls[0].headers['If-None-Match']).toBeUndefined();
  });

  it('第二次请求带 If-None-Match，304 时复用缓存', async () => {
    const { impl, calls } = fakeFetch([{ body: catalog, etag: '"v1"' }, { status: 304 }]);
    const p = createGovernanceLibraryProvider({ baseUrl: BASE, fetch: impl });
    const first = await p.list();
    const second = await p.list();
    expect(calls[1].headers['If-None-Match']).toBe('"v1"');
    expect(second.workflows).toEqual(first.workflows);
  });

  it('HTTP 错误与格式错误会抛出', async () => {
    const bad = createGovernanceLibraryProvider({ baseUrl: BASE, fetch: fakeFetch([{ status: 500 }]).impl });
    let msg = '';
    try {
      await bad.list();
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('HTTP 500');
    const odd = createGovernanceLibraryProvider({ baseUrl: BASE, fetch: fakeFetch([{ body: { items: [] } }]).impl });
    let msg2 = '';
    try {
      await odd.list();
    } catch (e) {
      msg2 = (e as Error).message;
    }
    expect(msg2).toContain('格式不正确');
  });

  it('把 AbortSignal 透传给 fetch', async () => {
    const { impl, calls } = fakeFetch([{ body: catalog }]);
    const p = createGovernanceLibraryProvider({ baseUrl: BASE, fetch: impl });
    const ctl = new AbortController();
    await p.list(ctl.signal);
    expect(calls[0].signal === ctl.signal).toBe(true);
  });
});

describe('createGovernanceLibraryProvider.get', () => {
  it('按名称与版本请求（名称需编码），404 返回 null', async () => {
    const { impl, calls } = fakeFetch([{ status: 404 }]);
    const p = createGovernanceLibraryProvider({ baseUrl: BASE, fetch: impl });
    expect(await p.get('std-L1-云资源-ecs-snapshot', 1)).toBeNull();
    expect(calls[0].url).toBe(
      `https://governance.example.com/api/library/workflows/${encodeURIComponent('std-L1-云资源-ecs-snapshot')}/versions/1`,
    );
  });

  it('200 返回记录；其它错误状态抛出', async () => {
    const rec = { def: { name: 'a-b-c-d-e', version: 3, tasks: [] } };
    const ok = createGovernanceLibraryProvider({ baseUrl: BASE, fetch: fakeFetch([{ body: rec }]).impl });
    expect((await ok.get('a-b-c-d-e', 3))!.def.version).toBe(3);
    const fail = createGovernanceLibraryProvider({ baseUrl: BASE, fetch: fakeFetch([{ status: 503 }]).impl });
    let msg = '';
    try {
      await fail.get('a-b-c-d-e', 3);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('HTTP 503');
  });

  it('未指定版本时取目录里的当前版本；目录里没有则返回 null', async () => {
    const rec = { def: { name: 'std-L1-通知协助-msg-send_sms', version: 2, tasks: [] } };
    const { impl, calls } = fakeFetch([{ body: catalog }, { body: rec }]);
    const p = createGovernanceLibraryProvider({ baseUrl: BASE, fetch: impl });
    expect((await p.get('std-L1-通知协助-msg-send_sms'))!.def.version).toBe(2);
    expect(calls[1].url.endsWith('/versions/2')).toBe(true);
    expect(await p.get('std-L1-不存在-x-y')).toBeNull();
    expect(calls).toHaveLength(2);
  });
});

describe('createGovernanceLibraryProvider.search', () => {
  it('默认不提供 search；enableSearch 后拼接查询参数', async () => {
    expect(createGovernanceLibraryProvider({ baseUrl: BASE }).search === undefined).toBe(true);
    const { impl, calls } = fakeFetch([{ body: [] }]);
    const p = createGovernanceLibraryProvider({ baseUrl: '', fetch: impl, enableSearch: true });
    await p.search!('短信', { level: 'L1', domain: '通知协助', limit: 5 });
    const url = new URL(calls[0].url, 'http://x');
    expect(url.pathname).toBe('/api/library/search');
    expect(url.searchParams.get('q')).toBe('短信');
    expect(url.searchParams.get('level')).toBe('L1');
    expect(url.searchParams.get('domain')).toBe('通知协助');
    expect(url.searchParams.get('limit')).toBe('5');
  });
});
