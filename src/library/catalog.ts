import type { WorkflowLevel, WorkflowLibraryItem } from '../types/workflowLibrary';
import type { TaskSchema } from '../services/ai/schemaRegistry';
import { normalizeVersion } from './version';
import type {
  LibraryLoadStatus,
  LibraryProvider,
  LibrarySearchOptions,
  LibraryTaskRecord,
  LibraryWorkflowRecord,
} from './types';

/** 规范化后的目录条目（每个 name 只有一个最新版本） */
export interface LibraryEntry {
  name: string;
  /** 统一为整数 */
  version: number;
  versionLabel?: string;
  description?: string;
  level?: WorkflowLevel;
  tags: string[];
  deprecated: boolean;
  record: LibraryWorkflowRecord;
  /** 条目来源：Provider 提供，或静态 prop（workflowLibrary）。同名时 Provider 优先 */
  source: 'provider' | 'static';
}

/** 目录状态快照（引用在每次变化时更新，供 useSyncExternalStore 使用） */
export interface LibraryCatalogSnapshot {
  status: LibraryLoadStatus;
  error?: Error;
  /** 每次数据 / 状态变化递增，便于作为 useMemo 依赖 */
  revision: number;
}

export interface LibraryCatalogOptions {
  /** 兼容旧 `workflowLibrary` prop 的静态条目 */
  staticItems?: WorkflowLibraryItem[];
  /** 兼容旧 `taskSchemas` prop 的静态 Schema */
  staticTaskSchemas?: TaskSchema[];
}

/** 把一条记录规范化为目录条目 */
export function entryFromRecord(
  record: LibraryWorkflowRecord,
  source: LibraryEntry['source'],
  onLossy?: (name: string, label: string) => void,
): LibraryEntry {
  const nv = normalizeVersion(record.def.version);
  const versionLabel = record.versionLabel ?? nv.label;
  if (nv.lossy && onLossy) onLossy(record.def.name, nv.label ?? String(record.def.version));
  return {
    name: record.def.name,
    version: nv.version,
    versionLabel,
    description: record.def.description,
    level: record.extension?.level,
    tags: record.extension?.tags ?? [],
    deprecated: record.deprecated ?? record.extension?.deprecated ?? false,
    record,
    source,
  };
}

/** 静态条目转为记录（无任务体，仅摘要） */
function recordFromStaticItem(item: WorkflowLibraryItem): { record: LibraryWorkflowRecord; lossyLabel?: string } {
  const nv = normalizeVersion(item.version);
  return {
    record: {
      def: { name: item.workflowName, description: item.description, version: nv.version, tasks: [] },
      extension: { level: item.workflowLevel, tags: item.tags ?? [] },
      versionLabel: nv.label,
    },
    lossyLabel: nv.lossy ? nv.label : undefined,
  };
}

/** 同名取最大 version；同版本后者覆盖前者 */
function pickLatest(entries: LibraryEntry[]): LibraryEntry[] {
  const byName = new Map<string, LibraryEntry>();
  for (const e of entries) {
    const prev = byName.get(e.name);
    if (!prev || e.version >= prev.version) byName.set(e.name, e);
  }
  return Array.from(byName.values());
}

/**
 * 流程库目录：把 Provider 与静态 prop 规范化成一份数据。
 * 每个实例独立（不是全局单例）；通过 subscribe / getSnapshot 接入 React。
 */
export class LibraryCatalog {
  private provider?: LibraryProvider;
  private staticItems: WorkflowLibraryItem[] = [];
  private staticSchemas: TaskSchema[] = [];

  private providerEntries: LibraryEntry[] = [];
  private providerTasks: LibraryTaskRecord[] = [];
  private merged = new Map<string, LibraryEntry>();

  private versionCache = new Map<string, LibraryWorkflowRecord>();
  private warned = new Set<string>();
  private listeners = new Set<() => void>();
  /** 每次 load / setProvider 递增，用于丢弃过期的异步结果 */
  private generation = 0;
  private controller: AbortController | null = null;
  private snapshot: LibraryCatalogSnapshot = { status: 'idle', revision: 0 };

  constructor(provider?: LibraryProvider, options: LibraryCatalogOptions = {}) {
    this.provider = provider;
    this.staticItems = options.staticItems ?? [];
    this.staticSchemas = options.staticTaskSchemas ?? [];
    this.rebuild();
  }

  // ── 配置 ────────────────────────────────────────────────────────────────

  /** 更换数据源：丢弃旧数据与缓存，状态回到 idle（需再调用 load） */
  setProvider(provider?: LibraryProvider): void {
    if (provider === this.provider) return;
    this.provider = provider;
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.providerEntries = [];
    this.providerTasks = [];
    this.versionCache.clear();
    this.rebuild();
    this.setState({ status: 'idle', error: undefined });
  }

  /** 更新静态条目 / Schema（对应旧 prop 变化） */
  setStatic(options: LibraryCatalogOptions): void {
    if (options.staticItems !== undefined) this.staticItems = options.staticItems;
    if (options.staticTaskSchemas !== undefined) this.staticSchemas = options.staticTaskSchemas;
    this.rebuild();
    this.setState({});
  }

  hasProvider(): boolean {
    return !!this.provider;
  }

  /** Provider 是否支持服务端检索 */
  hasServerSearch(): boolean {
    return typeof this.provider?.search === 'function';
  }

  // ── 加载 ────────────────────────────────────────────────────────────────

  /**
   * 拉取目录：同名多版本去重取最大 version。
   * 同一时刻只保留最新一次加载：新的 load / reload / setProvider / abort 会取消上一次（abort 其请求并丢弃其结果）；
   * 传入的 signal 被 abort 时同样取消。网络错误记为 error 状态，不抛出。
   */
  async load(signal?: AbortSignal): Promise<void> {
    const provider = this.provider;
    if (!provider) return;
    const gen = ++this.generation;
    this.controller?.abort();
    const ctl = new AbortController();
    this.controller = ctl;
    const onOuterAbort = () => ctl.abort();
    if (signal) {
      if (signal.aborted) ctl.abort();
      else signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    this.setState({ status: 'loading', error: undefined });
    try {
      const result = await provider.list(ctl.signal);
      if (gen !== this.generation) return;
      if (ctl.signal.aborted) {
        this.setState({ status: 'idle' });
        return;
      }
      this.providerEntries = pickLatest(result.workflows.map((r) => entryFromRecord(r, 'provider', this.warnLossy)));
      this.providerTasks = result.tasks ?? [];
      this.rebuild();
      this.setState({ status: 'ready', error: undefined });
    } catch (e) {
      if (gen !== this.generation) return;
      if (ctl.signal.aborted) {
        this.setState({ status: 'idle' });
        return;
      }
      this.setState({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) });
    } finally {
      signal?.removeEventListener('abort', onOuterAbort);
      if (this.controller === ctl) this.controller = null;
    }
  }

  /** 重新加载（供 UI「点击重试」使用） */
  reload(): Promise<void> {
    return this.load();
  }

  /** 取消进行中的加载（组件卸载时调用）；已加载的数据保留 */
  abort(): void {
    if (!this.controller) return;
    this.generation++;
    this.controller.abort();
    this.controller = null;
    if (this.snapshot.status === 'loading') this.setState({ status: 'idle' });
  }

  // ── 读取 ────────────────────────────────────────────────────────────────

  latest(name: string): LibraryEntry | undefined {
    return this.merged.get(name);
  }

  entries(): LibraryEntry[] {
    return Array.from(this.merged.values());
  }

  /** Provider 提供的原子任务定义 */
  tasks(): LibraryTaskRecord[] {
    return this.providerTasks;
  }

  /** 静态 Schema（Provider 未覆盖的部分由 projections 合并） */
  staticTaskSchemas(): TaskSchema[] {
    return this.staticSchemas;
  }

  /**
   * 取指定版本的完整定义（历史版本按需获取并缓存）。
   * 找不到返回 null；网络错误向上抛出，由调用方决定如何提示。
   */
  async getVersion(name: string, version: number, signal?: AbortSignal): Promise<LibraryWorkflowRecord | null> {
    const key = `${name}@${version}`;
    const cached = this.versionCache.get(key);
    if (cached) return cached;

    const entry = this.merged.get(name);
    if (entry?.source === 'static') {
      // 静态条目只有摘要；版本匹配时直接返回，否则交给 Provider（若有）
      if (entry.version === version) return entry.record;
    }
    const provider = this.provider;
    if (!provider) return null;

    const gen = this.generation;
    const record = await provider.get(name, version, signal);
    if (record && gen === this.generation) this.versionCache.set(key, record);
    return record;
  }

  /**
   * 服务端检索。Provider 未实现 search 时返回 null，调用方应退回本地匹配。
   * 结果不并入目录（只是一次查询的命中）。
   */
  async search(query: string, opts?: LibrarySearchOptions, signal?: AbortSignal): Promise<LibraryEntry[] | null> {
    const provider = this.provider;
    if (!provider?.search) return null;
    const records = await provider.search(query, opts, signal);
    return pickLatest(records.map((r) => entryFromRecord(r, 'provider', this.warnLossy)));
  }

  // ── 订阅（useSyncExternalStore） ────────────────────────────────────────

  getSnapshot = (): LibraryCatalogSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  // ── 内部 ────────────────────────────────────────────────────────────────

  private warnLossy = (name: string, label: string): void => {
    const key = `${name}@${label}`;
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(`[LibraryCatalog] 流程库「${name}」的版本号「${label}」不是整数，已按主版本号规范化。`);
  };

  /** Provider 条目优先，静态条目补充同名之外的部分 */
  private rebuild(): void {
    const next = new Map<string, LibraryEntry>();
    for (const e of this.providerEntries) next.set(e.name, e);
    const staticEntries = pickLatest(
      this.staticItems.map((item) => {
        const { record, lossyLabel } = recordFromStaticItem(item);
        if (lossyLabel) this.warnLossy(item.workflowName, lossyLabel);
        return entryFromRecord(record, 'static');
      }),
    );
    for (const e of staticEntries) {
      if (!next.has(e.name)) next.set(e.name, e);
    }
    this.merged = next;
  }

  private setState(patch: Partial<Omit<LibraryCatalogSnapshot, 'revision'>>): void {
    this.snapshot = { ...this.snapshot, ...patch, revision: this.snapshot.revision + 1 };
    for (const l of Array.from(this.listeners)) l();
  }
}
