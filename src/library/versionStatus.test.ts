import { describe, it, expect } from 'vitest';
import { resolveLibraryBadgeState, describeUnavailable, type LibraryBadgeInputs } from './versionStatus';

const base: LibraryBadgeInputs = {
  pinned: 3,
  catalogStatus: 'ready',
  latest: { version: 3, deprecated: false },
  pinnedExists: undefined,
};
const state = (patch: Partial<LibraryBadgeInputs>) => resolveLibraryBadgeState({ ...base, ...patch });

describe('resolveLibraryBadgeState — 有目录', () => {
  it('未记录版本：unpinned', () => {
    expect(state({ pinned: undefined, latest: { version: 9, deprecated: false } })).toEqual({ kind: 'unpinned' });
  });

  it('固定版本等于库最新版本：pinned', () => {
    expect(state({})).toEqual({ kind: 'pinned', pinned: 3 });
  });

  it('库发布新版本：显示「有新版本」，仍固定在旧版本（不自动跟随）', () => {
    expect(state({ latest: { version: 5, deprecated: false } })).toEqual({ kind: 'upgradable', pinned: 3, latest: 5 });
  });

  it('固定版本已不在库中（异步检查为不存在）：版本不可用', () => {
    expect(state({ latest: { version: 5, deprecated: false }, pinnedExists: false })).toEqual({
      kind: 'unavailable', pinned: 3, reason: 'missing-version',
    });
  });

  it('固定版本检查结果未知时按存在处理，不误报', () => {
    expect(state({ latest: { version: 5, deprecated: false }, pinnedExists: undefined }).kind).toBe('upgradable');
  });

  it('固定版本高于库最新版本：版本不可用', () => {
    expect(state({ pinned: 7, latest: { version: 5, deprecated: false } })).toEqual({
      kind: 'unavailable', pinned: 7, reason: 'missing-version',
    });
  });

  it('流程在库中已下线：版本不可用（原因 deprecated），即使有更新版本也不提示升级', () => {
    expect(state({ latest: { version: 5, deprecated: true } })).toEqual({ kind: 'unavailable', pinned: 3, reason: 'deprecated' });
  });

  it('流程已从库中移除：版本不可用（原因 removed）', () => {
    expect(state({ latest: undefined })).toEqual({ kind: 'unavailable', pinned: 3, reason: 'removed' });
  });
});

describe('resolveLibraryBadgeState — 目录未就绪 / 无目录', () => {
  it('目录加载失败 / 加载中 / 未加载：不显示新版本提示，也不误报版本不可用', () => {
    for (const catalogStatus of ['error', 'loading', 'idle'] as const) {
      expect(state({ catalogStatus, latest: { version: 9, deprecated: false } })).toEqual({ kind: 'pinned', pinned: 3 });
      expect(state({ catalogStatus, latest: undefined })).toEqual({ kind: 'pinned', pinned: 3 });
    }
  });

  it('没有目录（仅 actions prop）：沿用旧行为，按动作上的最新版本提示升级', () => {
    expect(state({ catalogStatus: undefined, latest: { version: 4, deprecated: false } })).toEqual({
      kind: 'upgradable', pinned: 3, latest: 4,
    });
    expect(state({ catalogStatus: undefined, latest: { version: 3, deprecated: false } })).toEqual({ kind: 'pinned', pinned: 3 });
    expect(state({ catalogStatus: undefined, latest: undefined })).toEqual({ kind: 'pinned', pinned: 3 });
  });
});

describe('describeUnavailable', () => {
  it('说明保持原样编译、不会自动改版本', () => {
    for (const reason of ['deprecated', 'removed', 'missing-version'] as const) {
      const text = describeUnavailable('ecs_delivery', 3, reason);
      expect(text).toContain('ecs_delivery');
      expect(text).toContain('不会自动改变版本');
    }
  });
});
