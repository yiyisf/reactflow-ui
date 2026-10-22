import type { LibraryLoadStatus } from './types';

/**
 * 流程库能力徽标的状态（纯函数，便于单测）。
 *
 * | 场景 | 状态 |
 * |---|---|
 * | 步骤未记录版本 | unpinned：沿用原定义，不显示任何提示 |
 * | 库中有更高版本 | upgradable：「⬆ 有新版本 vN」，由用户确认差异后手动升级 |
 * | 固定版本在库中不存在 / 已下线 | unavailable：「⚠ 版本不可用」，保持原样编译，不自动改版本 |
 * | 目录加载中 / 加载失败 | pinned：不显示新版本提示，不影响编辑与编译 |
 */
export type LibraryBadgeState =
  | { kind: 'unpinned' }
  | { kind: 'pinned'; pinned: number }
  | { kind: 'upgradable'; pinned: number; latest: number }
  | { kind: 'unavailable'; pinned: number; reason: 'deprecated' | 'removed' | 'missing-version' };

export interface LibraryBadgeInputs {
  /** 步骤上记录的固定版本 */
  pinned: number | undefined;
  /**
   * 目录加载状态。`undefined` 表示没有流程库目录参与（仅有 `actions` prop），
   * 此时沿用旧行为：只按动作上记录的最新版本提示升级，不判断「版本不可用」。
   */
  catalogStatus: LibraryLoadStatus | undefined;
  /** 库中（或动作上记录的）当前最新版本；不存在时为 undefined */
  latest: { version: number; deprecated: boolean } | undefined;
  /** 固定版本是否仍存在于库中（异步检查结果；undefined = 未知，按存在处理） */
  pinnedExists: boolean | undefined;
}

export function resolveLibraryBadgeState(input: LibraryBadgeInputs): LibraryBadgeState {
  const { pinned, catalogStatus, latest, pinnedExists } = input;
  if (pinned === undefined) return { kind: 'unpinned' };

  // 没有目录：旧行为
  if (catalogStatus === undefined) {
    return latest && latest.version > pinned
      ? { kind: 'upgradable', pinned, latest: latest.version }
      : { kind: 'pinned', pinned };
  }

  // 目录没有加载成功时一律不提示（失败不应误报「版本不可用」）
  if (catalogStatus !== 'ready') return { kind: 'pinned', pinned };

  if (!latest) return { kind: 'unavailable', pinned, reason: 'removed' };
  if (latest.deprecated) return { kind: 'unavailable', pinned, reason: 'deprecated' };
  if (pinned > latest.version) return { kind: 'unavailable', pinned, reason: 'missing-version' };
  if (pinned < latest.version) {
    if (pinnedExists === false) return { kind: 'unavailable', pinned, reason: 'missing-version' };
    return { kind: 'upgradable', pinned, latest: latest.version };
  }
  return pinnedExists === false
    ? { kind: 'unavailable', pinned, reason: 'missing-version' }
    : { kind: 'pinned', pinned };
}

/** 「版本不可用」的原因说明（用于徽标 tooltip） */
export function describeUnavailable(name: string, pinned: number, reason: 'deprecated' | 'removed' | 'missing-version'): string {
  switch (reason) {
    case 'deprecated':
      return `流程库「${name}」已下线 / 不建议新引用。本步骤仍按固定的 v${pinned} 编译，不会自动改变版本。`;
    case 'removed':
      return `流程库中已找不到「${name}」。本步骤仍按固定的 v${pinned} 编译，不会自动改变版本，请确认运行环境中该版本是否仍可用。`;
    default:
      return `流程库中不存在「${name}」的 v${pinned}。本步骤仍按固定版本编译，不会自动改变版本，请确认运行环境中该版本是否仍可用。`;
  }
}
