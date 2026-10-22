import type { WorkflowDef } from '../types/conductor';
import type { WorkflowLevel } from '../types/workflowLibrary';
import type { ActionExtension, RegisteredTaskDef } from '../actions/fromDefinitions';

/**
 * 流程库数据源（LibraryProvider）公共类型。
 * 设计见 docs/design/流程库数据源-LibraryProvider设计.md。
 *
 * 原则：来源可换，数据只有一份（LibraryCatalog），消费方只读投影（projections）。
 */

/** Conductor 标准之外的补充字段（层级、分类、图标等由宿主决定来源） */
export interface LibraryExtension {
  level?: WorkflowLevel;
  category?: string;
  /** 业务域展示名（如「通知协助」）。取值来自服务端的全局可调整列表，不在组件库内写死；缺省时尝试从流程名称解析 */
  domain?: string;
  icon?: string;
  tags?: string[];
  displayName?: string;
  /** 已下线 / 不建议新引用（等价于 LibraryWorkflowRecord.deprecated，便于由 resolveExtension 一并给出） */
  deprecated?: boolean;
  /** 透传到 ActionExtension（字段级覆盖等） */
  action?: ActionExtension;
}

export interface LibraryWorkflowRecord {
  /** Conductor 标准 WorkflowDef（含 version: number） */
  def: WorkflowDef;
  extension?: LibraryExtension;
  /** 宿主侧可读版本号（如 "1.2.0"），仅展示用 */
  versionLabel?: string;
  /** 已下线 / 不建议新引用 */
  deprecated?: boolean;
}

export interface LibraryTaskRecord {
  /** Conductor 标准 TaskDef */
  def: RegisteredTaskDef;
  extension?: LibraryExtension;
}

export interface LibraryListResult {
  /** 每个 name 只需最新版本；可只含摘要（tasks 可为空） */
  workflows: LibraryWorkflowRecord[];
  tasks?: LibraryTaskRecord[];
}

export interface LibrarySearchOptions {
  level?: WorkflowLevel;
  /** 按业务域过滤（与 LibraryExtension.domain 同一取值） */
  domain?: string;
  limit?: number;
}

export interface LibraryProvider {
  /** 列出目录（每个流程的最新发布版本） */
  list(signal?: AbortSignal): Promise<LibraryListResult>;
  /** 取指定版本的完整定义；version 缺省为最新。找不到返回 null（不抛错） */
  get(name: string, version?: number, signal?: AbortSignal): Promise<LibraryWorkflowRecord | null>;
  /** 可选：服务端检索，大目录时由 AI 工具与选择器使用 */
  search?(query: string, opts?: LibrarySearchOptions, signal?: AbortSignal): Promise<LibraryWorkflowRecord[]>;
}

/** 目录加载状态 */
export type LibraryLoadStatus = 'idle' | 'loading' | 'ready' | 'error';
