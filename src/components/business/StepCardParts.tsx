import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  LoaderCircle,
  Pencil,
  Plus,
  SkipForward,
  Timer,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { StepIssue } from '../../stepmodel/validate';
import { runStatusBadge, type RunStatusBadge } from './runStatus';
import { CmIcon } from '../icons/CmIcon';

const ICON = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;

const RUN_ICONS: Record<RunStatusBadge['icon'], LucideIcon> = {
  check: Check,
  x: X,
  timer: Timer,
  skip: SkipForward,
  loader: LoaderCircle,
  circle: Circle,
  ban: Ban,
  alert: TriangleAlert,
};

const pill = (color: string): React.CSSProperties => ({
  fontSize: 11,
  padding: '1px 6px',
  borderRadius: 4,
  background: `color-mix(in srgb, ${color} 15%, transparent)`,
  color,
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
});

/** 校验问题徽标：错误 =「N 项待修正」，仅提醒 =「N 项提醒」（颜色 + 图标 + 文字） */
export const IssueBadge: React.FC<{ issues: StepIssue[] }> = ({ issues }) => {
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.level === 'error').length;
  const color = errors > 0 ? 'var(--cm-status-failed)' : 'var(--cm-status-warning)';
  const Icon = errors > 0 ? CircleAlert : TriangleAlert;
  const text = errors > 0 ? `${errors} 项待修正` : `${issues.length} 项提醒`;
  return (
    <span style={pill(color)} title={issues.map((i) => i.message).join('\n')}>
      <Icon {...ICON} />
      {text}
    </span>
  );
};

/** 试跑结果徽标：按真实状态显示（成功 / 失败 / 已超时 / 已跳过 / 运行中 / 等待中） */
export const RunBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return null;
  const b = runStatusBadge(status);
  const Icon = RUN_ICONS[b.icon];
  return (
    <span style={pill(b.color)} title={`试跑结果：${b.label}（${status}）`}>
      <Icon {...ICON} />
      试跑{b.label}
    </span>
  );
};

export const SensitiveTag: React.FC = () => (
  <span style={{ ...pill('var(--cm-status-failed)'), fontSize: 10 }} title="此步骤会直接改动真实资源">
    <CmIcon name="alert" size={14} />
    敏感
  </span>
);

/** 步骤级问题（非字段级）列表，显示在卡片展开区或控制流卡片内 */
export const IssueList: React.FC<{ issues: StepIssue[] }> = ({ issues }) => {
  if (issues.length === 0) return null;
  return (
    <ul role="list" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {issues.map((it, i) => {
        const color = it.level === 'error' ? 'var(--cm-status-failed)' : 'var(--cm-status-warning)';
        const Icon = it.level === 'error' ? CircleAlert : TriangleAlert;
        return (
          <li key={i} style={{ fontSize: 11, color, display: 'flex', alignItems: 'flex-start', gap: 4, lineHeight: 1.5 }}>
            <Icon {...ICON} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{it.message}</span>
          </li>
        );
      })}
    </ul>
  );
};

interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}

export const IconButton: React.FC<IconButtonProps> = ({ label, onClick, disabled, danger, children }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    style={{
      background: 'none',
      border: 'none',
      borderRadius: 4,
      color: disabled ? 'var(--cm-text-disabled)' : danger ? 'var(--cm-status-failed)' : 'var(--text-secondary)',
      cursor: disabled ? 'default' : 'pointer',
      padding: 4,
      display: 'inline-flex',
      alignItems: 'center',
    }}
  >
    {children}
  </button>
);

/** 上移 / 下移 / 删除（顶层与嵌套步骤共用） */
export const MoveDeleteButtons: React.FC<{
  index: number;
  count: number;
  onMove: (to: number) => void;
  onDelete: () => void;
}> = ({ index, count, onMove, onDelete }) => (
  <>
    <IconButton label="上移" disabled={index === 0} onClick={() => onMove(index - 1)}>
      <ArrowUp {...ICON} />
    </IconButton>
    <IconButton label="下移" disabled={index >= count - 1} onClick={() => onMove(index + 1)}>
      <ArrowDown {...ICON} />
    </IconButton>
    <IconButton label="删除步骤" danger onClick={onDelete}>
      <Trash2 {...ICON} />
    </IconButton>
  </>
);

/** 步骤之间的"插入步骤"按钮 */
export const InsertStepButton: React.FC<{ onClick: () => void; label?: string; compact?: boolean }> = ({
  onClick,
  label = '插入步骤',
  compact,
}) => (
  <div style={{ display: 'flex', justifyContent: 'center', margin: compact ? '-2px 0' : '-4px 0' }}>
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: compact ? '1px 8px' : '4px 12px',
        borderRadius: 16,
        background: 'var(--bg-tertiary)',
        border: '1px dashed var(--border-secondary)',
        color: 'var(--text-muted)',
        fontSize: compact ? 10 : 11,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-accent)';
        e.currentTarget.style.color = 'var(--color-accent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-secondary)';
        e.currentTarget.style.color = 'var(--text-muted)';
      }}
    >
      <Plus {...ICON} size={compact ? 12 : 14} />
      <span>{label}</span>
    </button>
  </div>
);

/** 步骤名称输入：Enter 保存，Esc 取消，失焦保存；清空则恢复默认名称 */
const NameInput: React.FC<{
  initial: string;
  fallback: string;
  onDone: (name: string | null) => void;
  fontSize: number;
}> = ({ initial, fallback, onDone, fontSize }) => {
  const [draft, setDraft] = useState(initial);
  const finish = (save: boolean) => onDone(save ? draft.trim() || fallback : null);
  return (
    <input
      autoFocus
      aria-label="步骤名称"
      value={draft}
      placeholder={fallback}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
      style={{
        flex: 1,
        minWidth: 120,
        padding: '3px 8px',
        borderRadius: 4,
        border: '1px solid var(--color-accent)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        fontSize,
        fontWeight: 600,
        outline: 'none',
        fontFamily: 'inherit',
      }}
    />
  );
};

/**
 * 可重命名的标题（控制流卡片用）：用于区分同类步骤，例如两个"条件分支"。
 */
export const RenameableTitle: React.FC<{
  value: string;
  fallback: string;
  disabled?: boolean;
  onRename: (name: string) => void;
  fontSize?: number;
}> = ({ value, fallback, disabled, onRename, fontSize = 14 }) => {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <NameInput
        initial={value}
        fallback={fallback}
        fontSize={fontSize}
        onDone={(name) => {
          setEditing(false);
          if (name !== null && name !== value) onRename(name);
        }}
      />
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      <span style={{ fontWeight: 600, fontSize, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || fallback}
      </span>
      {!disabled && (
        <IconButton label="重命名步骤" onClick={() => setEditing(true)}>
          <Pencil {...ICON} size={12} />
        </IconButton>
      )}
    </span>
  );
};

export interface StepCardHeaderProps {
  /** 用于 aria-controls 的展开区域 id */
  bodyId: string;
  indexLabel: string;
  icon?: string;
  title: string;
  /** 改名后显示动作名，未改名时显示说明 */
  subtitle?: string;
  /** 默认名称（清空名称时恢复为它） */
  defaultTitle: string;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  compact?: boolean;
  accentIndex?: boolean;
  onRename?: (name: string) => void;
  /** 标题后的徽标（敏感、版本、校验、试跑） */
  badges?: React.ReactNode;
  /** 右侧操作按钮（AI 介绍、上移、下移、删除） */
  actions?: React.ReactNode;
}

/**
 * 普通动作步骤的卡片头部（顶层卡片与分支 / 泳道 / 循环体内的嵌套步骤共用）。
 * 展开 / 收起是一个真正的按钮（键盘可操作，aria-expanded）；重命名、排序、删除是其旁边独立的按钮。
 */
export const StepCardHeader: React.FC<StepCardHeaderProps> = ({
  bodyId,
  indexLabel,
  icon,
  title,
  subtitle,
  defaultTitle,
  expanded,
  onToggle,
  disabled,
  compact,
  accentIndex,
  onRename,
  badges,
  actions,
}) => {
  const [renaming, setRenaming] = useState(false);
  const titleSize = compact ? 11 : 14;

  return (
    <div
      style={{
        padding: compact ? '4px 6px' : '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 4 : 8,
        background: expanded ? 'color-mix(in srgb, var(--color-accent) 5%, transparent)' : 'transparent',
        flexWrap: compact ? 'wrap' : 'nowrap',
      }}
    >
      {renaming ? (
        <NameInput
          initial={title}
          fallback={defaultTitle}
          fontSize={titleSize}
          onDone={(name) => {
            setRenaming(false);
            if (name !== null && name !== title) onRename?.(name);
          }}
        />
      ) : (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: compact ? 6 : 10,
            background: 'none',
            border: 'none',
            padding: compact ? '2px 0' : '4px 0',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'inherit',
            fontFamily: 'inherit',
          }}
        >
          {!compact && (
            <span
              style={{
                minWidth: 28,
                height: 24,
                padding: '0 6px',
                borderRadius: 6,
                background: accentIndex
                  ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                  : 'var(--bg-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--color-accent-text)',
                border: '1px solid var(--border-primary)',
                flexShrink: 0,
              }}
            >
              {indexLabel}
            </span>
          )}
          <CmIcon name={icon} size={compact ? 14 : 18} />
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontWeight: 600,
                fontSize: titleSize,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </span>
            {subtitle && !compact && (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {subtitle}
              </span>
            )}
          </span>
          <ChevronDown
            {...ICON}
            size={compact ? 12 : 14}
            style={{
              marginLeft: 'auto',
              flexShrink: 0,
              color: 'var(--text-muted)',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          />
        </button>
      )}

      {badges && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{badges}</span>}

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {!disabled && onRename && !renaming && (
          <IconButton label="重命名步骤" onClick={() => setRenaming(true)}>
            <Pencil {...ICON} />
          </IconButton>
        )}
        {actions}
      </span>
    </div>
  );
};
