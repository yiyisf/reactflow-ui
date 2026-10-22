import type { WorkflowDef } from '../types/conductor';
import type { RegisteredTaskDef } from '../actions/fromDefinitions';
import type {
  LibraryExtension,
  LibraryListResult,
  LibraryProvider,
  LibraryTaskRecord,
  LibraryWorkflowRecord,
} from './types';
import { normalizeVersion } from './version';

export interface ConductorLibraryProviderOptions {
  /** Conductor API 根地址，如 `https://conductor.example.com/api`（尾部斜杠可有可无） */
  baseUrl: string;
  /**
   * 认证头等，由宿主在每次请求前注入（组件库不保存任何凭据）。
   * 可返回 Promise，便于异步刷新 token。
   */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** 自定义 fetch（测试 / 网关封装）；缺省使用全局 fetch */
  fetch?: typeof fetch;
  /** 是否同时拉取已注册的原子任务定义（`/metadata/taskdefs`），默认 false */
  includeTaskDefs?: boolean;
  /** 只暴露「流程库」内的工作流（如按名前缀 / ownerEmail）；对列表与单个获取都生效 */
  filter?: (def: WorkflowDef) => boolean;
  /** 补充字段（层级、分类、图标、是否下线等）的来源由宿主决定 */
  resolveExtension?: (def: WorkflowDef) => LibraryExtension | undefined;
  /** 原子任务的补充字段来源（仅 includeTaskDefs 时使用） */
  resolveTaskExtension?: (def: RegisteredTaskDef) => LibraryExtension | undefined;
  /**
   * 网关路径不同可覆盖（相对 baseUrl）。
   * `workflow` 为单个工作流的路径：含 `{name}` 时按模板替换，否则在其后追加 `/{name}`。
   */
  paths?: { workflows?: string; workflow?: string; taskDefs?: string };
}

const DEFAULT_PATHS = {
  workflows: '/metadata/workflow',
  workflow: '/metadata/workflow',
  taskDefs: '/metadata/taskdefs',
};

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Conductor OSS 默认的流程库数据源：
 * - `GET {baseUrl}/metadata/workflow`            列出工作流（同名多版本时客户端取最大 version）
 * - `GET {baseUrl}/metadata/workflow/{name}?version={v}`  取指定版本，404 返回 null
 * - `GET {baseUrl}/metadata/taskdefs`            已注册任务（includeTaskDefs 时）
 *
 * 不内置 `search`（Conductor OSS 元数据接口没有检索能力）；需要服务端检索请自行实现 LibraryProvider。
 * 网络错误 / 非 404 的 HTTP 错误会抛出，由目录层捕获为 `error` 状态。
 */
export function createConductorLibraryProvider(options: ConductorLibraryProviderOptions): LibraryProvider {
  const paths = { ...DEFAULT_PATHS, ...(options.paths ?? {}) };

  const doFetch = (url: string, init: RequestInit): Promise<Response> => {
    const impl = options.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
    if (!impl) return Promise.reject(new Error('当前环境没有 fetch，请通过 options.fetch 传入'));
    return impl(url, init);
  };

  async function request(url: string, signal?: AbortSignal): Promise<Response> {
    const injected = options.headers ? await options.headers() : {};
    return doFetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...injected },
      signal,
    });
  }

  function toRecord(def: WorkflowDef): LibraryWorkflowRecord {
    const extension = options.resolveExtension?.(def);
    return {
      def,
      ...(extension ? { extension } : {}),
      ...(extension?.deprecated ? { deprecated: true } : {}),
    };
  }

  function workflowUrl(name: string, version?: number): string {
    const encoded = encodeURIComponent(name);
    const path = paths.workflow.includes('{name}') ? paths.workflow.replace('{name}', encoded) : `${paths.workflow.replace(/\/+$/, '')}/${encoded}`;
    const url = joinUrl(options.baseUrl, path);
    return version !== undefined ? `${url}?version=${encodeURIComponent(String(version))}` : url;
  }

  return {
    async list(signal) {
      const url = joinUrl(options.baseUrl, paths.workflows);
      const res = await request(url, signal);
      if (!res.ok) throw new Error(`获取流程库列表失败：HTTP ${res.status}（${url}）`);
      const body: unknown = await res.json();
      if (!Array.isArray(body)) throw new Error(`流程库列表返回格式不正确（期望数组）：${url}`);

      // 列表可能返回同名多版本：按 name 取最大 version
      const latest = new Map<string, WorkflowDef>();
      for (const def of body as WorkflowDef[]) {
        if (!def || typeof def.name !== 'string') continue;
        if (options.filter && !options.filter(def)) continue;
        const prev = latest.get(def.name);
        if (!prev || normalizeVersion(def.version).version >= normalizeVersion(prev.version).version) {
          latest.set(def.name, def);
        }
      }
      const result: LibraryListResult = { workflows: Array.from(latest.values()).map(toRecord) };

      if (options.includeTaskDefs) {
        const taskUrl = joinUrl(options.baseUrl, paths.taskDefs);
        const tres = await request(taskUrl, signal);
        if (!tres.ok) throw new Error(`获取任务定义失败：HTTP ${tres.status}（${taskUrl}）`);
        const tbody: unknown = await tres.json();
        if (!Array.isArray(tbody)) throw new Error(`任务定义返回格式不正确（期望数组）：${taskUrl}`);
        result.tasks = (tbody as RegisteredTaskDef[])
          .filter((d) => d && typeof d.name === 'string')
          .map((def): LibraryTaskRecord => {
            const extension = options.resolveTaskExtension?.(def);
            return { def, ...(extension ? { extension } : {}) };
          });
      }
      return result;
    },

    async get(name, version, signal) {
      const url = workflowUrl(name, version);
      const res = await request(url, signal);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`获取流程库工作流「${name}」失败：HTTP ${res.status}（${url}）`);
      const def = (await res.json()) as WorkflowDef | null;
      if (!def || typeof def.name !== 'string') return null;
      if (options.filter && !options.filter(def)) return null;
      return toRecord(def);
    },
  };
}
