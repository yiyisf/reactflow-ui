import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

interface HeaderPopoverProps {
  /** 触发按钮图标（emoji） */
  icon: string;
  /** 触发按钮文字（窄屏下隐藏，仅保留图标） */
  label: string;
  /** 悬浮提示，同时作为无障碍名称 */
  title: string;
  /** menu：菜单项列表；dialog：包含表单控件的面板 */
  kind: 'menu' | 'dialog';
  /** 为 true 时在按钮右上角显示小圆点 */
  badge?: boolean;
  badgeTitle?: string;
  panelClassName?: string;
  children: (ctx: { close: () => void }) => ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), [role="menuitem"]:not([disabled])';

/**
 * 演示头部使用的轻量弹出层：按钮 + 面板。
 * - aria-haspopup / aria-expanded / aria-controls
 * - Esc 关闭并还原焦点；点击外部关闭
 * - menu 模式支持 上/下/Home/End 方向键导航
 */
export function HeaderPopover({ icon, label, title, kind, badge, badgeTitle, panelClassName, children }: HeaderPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  // 打开后把焦点移入面板
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (kind === 'menu') panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    else panel.focus();
  }, [open, kind]);

  const onTriggerKeyDown = (e: ReactKeyboardEvent) => {
    if (kind === 'menu' && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onPanelKeyDown = (e: ReactKeyboardEvent) => {
    if (kind !== 'menu') return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])');
    const items: HTMLElement[] = nodes ? Array.from(nodes) : [];
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (idx + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (idx - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Tab') setOpen(false);
    if (next >= 0) {
      e.preventDefault();
      items[next].focus();
    }
  };

  return (
    <div className="dh-popover" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`mode-btn dh-secondary-btn ${open ? 'is-open' : ''}`}
        aria-haspopup={kind === 'menu' ? 'menu' : 'dialog'}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={title}
        title={badge && badgeTitle ? `${title}（${badgeTitle}）` : title}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="dh-icon" aria-hidden="true">{icon}</span>
        <span className="dh-label">{label}</span>
        {badge && <span className="dh-badge-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className={`dh-panel ${kind === 'menu' ? 'dh-menu' : 'dh-dialog'} ${panelClassName ?? ''}`}
          role={kind === 'menu' ? 'menu' : 'dialog'}
          aria-label={title}
          tabIndex={-1}
          onKeyDown={onPanelKeyDown}
        >
          {children({ close: () => close(true) })}
        </div>
      )}
    </div>
  );
}
