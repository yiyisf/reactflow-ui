/**
 * 示例：用「编排治理服务」实现 LibraryProvider（宿主接入参考，不从包入口导出）。
 *
 * 本文件会随 CI 一起做类型检查，并与 docs/integration-guide.md 中的示例代码保持一致
 * （文档中的类型从包名 '@yiyi_zhang/reactflow-ui' 引入，此处用相对路径，其余完全相同）。
 *
 * 治理服务接口约定（权限全部在服务端判断，前端不做任何权限过滤）：
 * - GET {baseUrl}/api/library/catalog?kind=WORKFLOW,TASK
 *     -> LibraryListResult（PUBLISHED + DEPRECATED；已下线的带 deprecated: true；def.tasks 可为空）
 *     支持 ETag / If-None-Match，未变化时返回 304
 * - GET {baseUrl}/api/library/workflows/{name}/versions/{version}
 *     -> LibraryWorkflowRecord（含完整 def）；版本不存在 / 已撤回 / 无权限一律 404
 * - GET {baseUrl}/api/library/search?q=&level=&domain=&limit=
 *     -> LibraryWorkflowRecord[]（后续提供，默认不启用，见 enableSearch）
 */
import type {
  LibraryListResult,
  LibraryProvider,
  LibrarySearchOptions,
  LibraryWorkflowRecord,
} from '../../library/types';

export interface GovernanceLibraryProviderOptions {
  /** 治理服务根地址，如 `https://governance.example.com`；同域部署可传空字符串（使用相对路径） */
  baseUrl: string;
  /**
   * 认证头等，由宿主在每次请求前注入（组件库不保存任何凭据）。
   * 可返回 Promise，便于异步刷新 token。
   */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** 自定义 fetch（测试 / 网关封装）；缺省使用全局 fetch */
  fetch?: typeof fetch;
  /** 目录包含的种类，默认工作流与原子任务都要 */
  kinds?: Array<'WORKFLOW' | 'TASK'>;
  /** 是否启用服务端检索（治理服务提供 /api/library/search 后再打开）。默认 false，AI 在本地目录内匹配 */
  enableSearch?: boolean;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

function isListResult(body: unknown): body is LibraryListResult {
  return !!body && typeof body === 'object' && Array.isArray((body as LibraryListResult).workflows);
}

/**
 * 基于治理服务的流程库数据源。
 *
 * 注意：返回的 Provider 请在组件外或用 useMemo 创建并保持引用稳定——
 * `libraryProvider` 引用一变化，IDE 就会重新加载目录。
 */
export function createGovernanceLibraryProvider(options: GovernanceLibraryProviderOptions): LibraryProvider {
  const kinds = (options.kinds ?? ['WORKFLOW', 'TASK']).join(',');

  // 目录的 ETag 缓存：服务端返回 304 时直接复用上一次的结果
  let cachedEtag: string | undefined;
  let cachedCatalog: LibraryListResult | undefined;

  async function request(path: string, init: { signal?: AbortSignal; extraHeaders?: Record<string, string> }): Promise<Response> {
    const doFetch = options.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
    if (!doFetch) throw new Error('当前环境没有 fetch，请通过 options.fetch 传入');
    const injected = options.headers ? await options.headers() : {};
    return doFetch(joinUrl(options.baseUrl, path), {
      method: 'GET',
      headers: { Accept: 'application/json', ...injected, ...(init.extraHeaders ?? {}) },
      signal: init.signal,
    });
  }

  async function list(signal?: AbortSignal): Promise<LibraryListResult> {
    const path = `/api/library/catalog?kind=${encodeURIComponent(kinds)}`;
    const res = await request(path, {
      signal,
      extraHeaders: cachedEtag && cachedCatalog ? { 'If-None-Match': cachedEtag } : undefined,
    });
    if (res.status === 304 && cachedCatalog) return cachedCatalog;
    if (!res.ok) throw new Error(`获取流程库目录失败：HTTP ${res.status}`);
    const body: unknown = await res.json();
    if (!isListResult(body)) throw new Error('流程库目录返回格式不正确（期望包含 workflows 数组）');
    cachedCatalog = body;
    cachedEtag = res.headers.get('ETag') ?? undefined;
    return body;
  }

  async function get(name: string, version?: number, signal?: AbortSignal): Promise<LibraryWorkflowRecord | null> {
    let target = version;
    if (target === undefined) {
      // 接口必须带版本号：未指定时取目录里的当前最新版本
      const catalog = cachedCatalog ?? (await list(signal));
      target = catalog.workflows.find((r) => r.def.name === name)?.def.version;
      if (target === undefined) return null;
    }
    const res = await request(`/api/library/workflows/${encodeURIComponent(name)}/versions/${encodeURIComponent(String(target))}`, { signal });
    // 不存在 / 已撤回 / 无权限：服务端统一返回 404，对应「版本不可用」
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`获取流程库工作流「${name}」v${target} 失败：HTTP ${res.status}`);
    const record = (await res.json()) as LibraryWorkflowRecord | null;
    if (!record || !record.def || typeof record.def.name !== 'string') return null;
    return record;
  }

  async function search(query: string, opts: LibrarySearchOptions = {}, signal?: AbortSignal): Promise<LibraryWorkflowRecord[]> {
    const params = new URLSearchParams();
    params.set('q', query);
    if (opts.level) params.set('level', opts.level);
    if (opts.domain) params.set('domain', opts.domain);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    const res = await request(`/api/library/search?${params.toString()}`, { signal });
    if (!res.ok) throw new Error(`检索流程库失败：HTTP ${res.status}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new Error('流程库检索返回格式不正确（期望数组）');
    return body as LibraryWorkflowRecord[];
  }

  return { list, get, ...(options.enableSearch ? { search } : {}) };
}
