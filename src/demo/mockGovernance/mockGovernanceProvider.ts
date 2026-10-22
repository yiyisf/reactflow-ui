import type { WorkflowLevel } from '../../types/workflowLibrary';
import type {
  LibraryListResult,
  LibraryProvider,
  LibrarySearchOptions,
  LibraryWorkflowRecord,
} from '../../library/types';
import { createDemoLibraryData } from './libraryData';
import type { MockWorkflowEntry, MockWorkflowVersion } from './libraryData';

/**
 * 演示用「编排治理服务」模拟实现（仅 Demo 使用，不从包入口导出）。
 *
 * 行为对齐真实治理服务的 `/api/library/*`：
 * - `list`：每个名称只返回当前最新的 PUBLISHED / DEPRECATED 版本；已下线的带 `deprecated: true`；
 *   列表只含摘要（`def.tasks` 为空，schema 完整），与真实服务一致。
 * - `get(name, version)`：返回完整定义；版本被撤回（WITHDRAWN）/ 不存在 / 无权限一律返回 `null`（等价 HTTP 404）。
 * - `search`：按关键字 / 层级 / 业务域过滤，已下线的能力不出现在检索结果中（不建议新引用）。
 * - 模拟网络延迟、可注入失败、尊重 `AbortSignal`。
 */

export interface MockGovernanceProviderOptions {
  /** 模拟网络延迟（毫秒），默认 400；设为 0 则不延迟 */
  latencyMs?: number;
  /** 每次请求随机失败的概率（0–1），默认 0；单测请使用 `failNext` 获得确定性 */
  failureRate?: number;
  /** 随机数来源（测试注入），默认 Math.random */
  random?: () => number;
}

export interface MockGovernanceProvider extends LibraryProvider {
  /** 让接下来的 count 次请求（list / get / search）失败，默认 1 次 */
  failNext(count?: number): void;
  /** 修改随机失败概率 */
  setFailureRate(rate: number): void;
  /** 修改模拟延迟 */
  setLatency(ms: number): void;
  /** 累计收到的请求数（不含被 abort 的），便于演示与测试观察 */
  readonly requestCount: number;
}

/** 模拟的服务端故障，message 为中文便于直接在界面显示 */
export function createMockServerError(): Error {
  return new Error('编排治理服务暂时不可用（模拟故障：HTTP 503）');
}

function abortError(): Error {
  const e = new Error('请求已取消');
  e.name = 'AbortError';
  return e;
}

/** 可被 AbortSignal 打断的延迟 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 取名称下当前可见的最新版本（PUBLISHED / DEPRECATED，且版本号最大） */
function currentVersion(entry: MockWorkflowEntry): MockWorkflowVersion | undefined {
  const visible = entry.versions.filter((v) => v.status !== 'WITHDRAWN');
  if (visible.length === 0) return undefined;
  return visible.reduce((a, b) => (b.record.def.version! >= a.record.def.version! ? b : a));
}

/** 列表摘要：去掉任务体，保留 schema 与扩展字段 */
function toSummary(record: LibraryWorkflowRecord): LibraryWorkflowRecord {
  return { ...record, def: { ...record.def, tasks: [] } };
}

function matchesQuery(record: LibraryWorkflowRecord, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const ext = record.extension;
  const haystack = [
    record.def.name,
    record.def.description,
    ext?.displayName,
    ext?.domain,
    ...(ext?.tags ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  // 多个关键字（空格分隔）需全部命中
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

export function createMockGovernanceProvider(options: MockGovernanceProviderOptions = {}): MockGovernanceProvider {
  const data = createDemoLibraryData();
  const byName = new Map<string, MockWorkflowEntry>(data.workflows.map((e) => [e.name, e]));
  const random = options.random ?? Math.random;

  let latencyMs = options.latencyMs ?? 400;
  let failureRate = options.failureRate ?? 0;
  let pendingFailures = 0;
  let requestCount = 0;

  /** 所有请求的公共入口：延迟 → 取消检查 → 故障注入 */
  async function gate(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw abortError();
    requestCount++;
    await delay(latencyMs, signal);
    if (pendingFailures > 0) {
      pendingFailures--;
      throw createMockServerError();
    }
    if (failureRate > 0 && random() < failureRate) throw createMockServerError();
  }

  return {
    async list(signal): Promise<LibraryListResult> {
      await gate(signal);
      const workflows: LibraryWorkflowRecord[] = [];
      for (const entry of byName.values()) {
        const cur = currentVersion(entry);
        if (cur) workflows.push(structuredClone(toSummary(cur.record)));
      }
      return { workflows, tasks: structuredClone(data.tasks) };
    },

    async get(name, version, signal): Promise<LibraryWorkflowRecord | null> {
      await gate(signal);
      const entry = byName.get(name);
      if (!entry) return null;
      const target =
        version === undefined
          ? currentVersion(entry)
          : entry.versions.find((v) => v.record.def.version === version);
      // 已撤回 / 不存在：等价 404
      if (!target || target.status === 'WITHDRAWN') return null;
      return structuredClone(target.record);
    },

    async search(query, opts: LibrarySearchOptions = {}, signal): Promise<LibraryWorkflowRecord[]> {
      await gate(signal);
      const level: WorkflowLevel | undefined = opts.level;
      const hits: LibraryWorkflowRecord[] = [];
      for (const entry of byName.values()) {
        const cur = currentVersion(entry);
        // 已下线能力不建议新引用，不出现在检索结果中
        if (!cur || cur.status === 'DEPRECATED') continue;
        const ext = cur.record.extension;
        if (level && ext?.level !== level) continue;
        if (opts.domain && ext?.domain !== opts.domain) continue;
        if (!matchesQuery(cur.record, query)) continue;
        hits.push(structuredClone(toSummary(cur.record)));
        if (opts.limit !== undefined && hits.length >= opts.limit) break;
      }
      return hits;
    },

    failNext(count = 1) {
      pendingFailures += Math.max(0, count);
    },
    setFailureRate(rate) {
      failureRate = Math.min(1, Math.max(0, rate));
    },
    setLatency(ms) {
      latencyMs = Math.max(0, ms);
    },
    get requestCount() {
      return requestCount;
    },
  };
}
