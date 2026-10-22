import React, { useEffect, useState } from 'react';
import type { BusinessStep } from '../../stepmodel/types';
import type { ActionDefinition } from '../../actions/types';
import ConfirmDialog from '../ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import type { LibraryCatalog } from '../../library/catalog';
import { useLibraryCatalogSnapshot } from '../../library/useLibraryCatalog';
import { buildUpgradeConfirmMessage, diffWorkflowVersions, type WorkflowVersionDiff } from '../../library/diff';
import { describeUnavailable, resolveLibraryBadgeState } from '../../library/versionStatus';

export interface LibraryVersionBadgeProps {
  step: BusinessStep;
  action?: ActionDefinition;
  disabled?: boolean;
  /**
   * 流程库目录。提供后：
   * - 升级前取旧、新两个版本的定义，展示入参 / 出参差异再确认
   * - 固定版本在库中不存在 / 已下线时显示「⚠ 版本不可用」
   * 未提供时沿用旧行为（只按动作上记录的最新版本提示升级）。
   */
  catalog?: LibraryCatalog;
  /** 其它步骤中引用了本步骤哪些出参 key（用于差异里的「下游引用将失效」提示） */
  getReferencedOutputs?: () => Iterable<string>;
  /** 用户确认升级后回调：库中最新版本号，以及（能取到两个版本定义时的）升级差异 */
  onUpgrade: (latestVersion: number, diff?: WorkflowVersionDiff) => void;
}

/**
 * 流程库能力的版本标记：
 * - 显示步骤引用时固定的版本（库升级后不会自动跟随）
 * - 库中有更新版本时，提示并允许用户在看过升级差异后手动升级
 * - 固定版本不可用（不存在 / 已下线）时给出警示，保持原样编译，不自动改版本
 * - 目录加载失败时不显示新版本提示，不影响编辑与编译
 */
export const LibraryVersionBadge: React.FC<LibraryVersionBadgeProps> = ({
  step,
  action,
  disabled,
  catalog,
  getReferencedOutputs,
  onUpgrade,
}) => {
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const snapshot = useLibraryCatalogSnapshot(catalog);
  const [busy, setBusy] = useState(false);
  const [pinnedExists, setPinnedExists] = useState<boolean | undefined>(undefined);

  const ref = step.libraryRef;
  const pinned = ref?.version;
  const entry = ref ? catalog?.latest(ref.name) : undefined;
  const actionLatest = action?.workflowRef?.version;
  // 目录里没有该流程、但动作自带最新版本（来自宿主 actions prop）：按旧行为处理，避免误报「版本不可用」
  const useCatalog = !!catalog && (entry !== undefined || actionLatest === undefined);
  const latestInfo = entry
    ? { version: entry.version, deprecated: entry.deprecated }
    : actionLatest !== undefined
      ? { version: actionLatest, deprecated: false }
      : undefined;

  // 固定版本落后于最新版本时，确认旧版本是否仍存在于库中（结果按目录缓存，不会重复请求）
  const needsExistenceCheck =
    useCatalog && snapshot.status === 'ready' && pinned !== undefined && !!entry && entry.version > pinned;
  const refName = ref?.name;
  useEffect(() => {
    if (!needsExistenceCheck || !catalog || !refName || pinned === undefined) {
      setPinnedExists(undefined);
      return;
    }
    const ac = new AbortController();
    catalog
      .getVersion(refName, pinned, ac.signal)
      .then((rec) => {
        if (!ac.signal.aborted) setPinnedExists(rec !== null);
      })
      .catch(() => {
        // 取不到（网络问题等）视为未知，不误报「版本不可用」
        if (!ac.signal.aborted) setPinnedExists(undefined);
      });
    return () => ac.abort();
  }, [needsExistenceCheck, catalog, refName, pinned]);

  if (!ref) return null;

  const state = resolveLibraryBadgeState({
    pinned,
    catalogStatus: useCatalog ? snapshot.status : undefined,
    latest: latestInfo,
    pinnedExists: needsExistenceCheck ? pinnedExists : undefined,
  });

  const handleUpgradeClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state.kind !== 'upgradable') return;
    const { pinned: from, latest: to } = state;

    // 取旧、新两个版本的完整定义，算出升级差异（静态条目只有摘要，没有入参定义，不做差异）
    let diff: WorkflowVersionDiff | undefined;
    if (catalog && entry && entry.source === 'provider') {
      setBusy(true);
      try {
        const [oldRec, newRec] = await Promise.all([
          catalog.getVersion(ref.name, from),
          catalog.getVersion(ref.name, to),
        ]);
        if (oldRec && newRec) {
          diff = diffWorkflowVersions(oldRec.def, newRec.def, step.values, {
            referencedOutputs: getReferencedOutputs?.(),
          });
        }
      } catch {
        diff = undefined;
      } finally {
        setBusy(false);
      }
    }

    const message = diff
      ? buildUpgradeConfirmMessage(ref.name, from, to, diff)
      : `流程库「${ref.name}」已有新版本 v${to}（当前引用 v${from}）。升级后入参、出参可能发生变化，请升级后检查本步骤配置。确定升级吗？`;
    const ok = await confirm(message);
    if (ok) onUpgrade(to, diff);
  };

  return (
    <>
      <span
        title={
          pinned !== undefined
            ? `引用流程库「${ref.name}」，已固定版本 v${pinned}，库升级后不会自动变化`
            : `引用流程库「${ref.name}」，未固定版本，沿用原定义`
        }
        style={{
          fontSize: 10,
          padding: '1px 5px',
          borderRadius: 4,
          background: 'var(--color-accent-bg, rgba(59, 130, 246, 0.12))',
          color: 'var(--color-accent-text, #1e40af)',
          fontWeight: 600,
        }}
      >
        📚 流程库{pinned !== undefined ? ` v${pinned}` : ''}
      </span>
      {state.kind === 'upgradable' && !disabled && (
        <button
          onClick={handleUpgradeClick}
          disabled={busy}
          title="查看升级差异并升级到库中最新版本"
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 4,
            border: '1px solid #f59e0b',
            background: 'rgba(245, 158, 11, 0.12)',
            color: '#f59e0b',
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? '正在比较版本…' : `⬆ 有新版本 v${state.latest}`}
        </button>
      )}
      {state.kind === 'unavailable' && (
        <span
          title={describeUnavailable(ref.name, state.pinned, state.reason)}
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 4,
            border: '1px solid #ef4444',
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#ef4444',
            fontWeight: 600,
          }}
        >
          ⚠ 版本不可用
        </span>
      )}
      {/* 弹窗经 Portal 渲染，但 React 事件仍会冒泡到步骤头部（会误触发展开/收起），这里拦截 */}
      {confirmState && (
        <span onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog message={confirmState.message} onConfirm={handleConfirm} onCancel={handleCancel} />
        </span>
      )}
    </>
  );
};
