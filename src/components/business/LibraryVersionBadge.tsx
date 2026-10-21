import React from 'react';
import type { BusinessStep } from '../../stepmodel/types';
import type { ActionDefinition } from '../../actions/types';

export interface LibraryVersionBadgeProps {
  step: BusinessStep;
  action?: ActionDefinition;
  disabled?: boolean;
  /** 用户确认升级后回调，参数为库中最新版本号 */
  onUpgrade: (latestVersion: number) => void;
}

/**
 * 流程库能力的版本标记：
 * - 显示步骤引用时固定的版本（库升级后不会自动跟随）
 * - 库中有更新版本时，提示并允许用户手动升级（升级后入参可能变化，需确认）
 */
export const LibraryVersionBadge: React.FC<LibraryVersionBadgeProps> = ({ step, action, disabled, onUpgrade }) => {
  const ref = step.libraryRef;
  if (!ref) return null;

  const pinned = ref.version;
  const latest = action?.workflowRef?.version;
  const hasNewer = pinned !== undefined && latest !== undefined && latest > pinned;

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
      {hasNewer && !disabled && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (
              confirm(
                `流程库「${ref.name}」已有新版本 v${latest}（当前引用 v${pinned}）。\n升级后入参、出参可能发生变化，请升级后检查本步骤配置。\n确定升级吗？`
              )
            ) {
              onUpgrade(latest as number);
            }
          }}
          title="升级到库中最新版本"
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 4,
            border: '1px solid #f59e0b',
            background: 'rgba(245, 158, 11, 0.12)',
            color: '#f59e0b',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ⬆ 有新版本 v{latest}
        </button>
      )}
    </>
  );
};
