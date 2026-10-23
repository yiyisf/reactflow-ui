import type { CSSProperties } from 'react';

/** 自助接入组件共用的内联样式：只使用主题 CSS 变量，弹窗根节点另行设置 data-mode / data-brand */

export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 4,
};

export const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 32,
  padding: '0 8px',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
};

export const hintStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  marginTop: 4,
};

export const errorStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-error)',
  margin: '4px 0 0',
};

export const buttonBase: CSSProperties = {
  height: 32,
  padding: '0 14px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

export const primaryButton: CSSProperties = {
  ...buttonBase,
  background: 'var(--color-accent)',
  color: 'var(--color-accent-text)',
  border: '1px solid var(--color-accent)',
};

export const ghostButton: CSSProperties = {
  ...buttonBase,
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-primary)',
};

export function disabledStyle(base: CSSProperties, disabled: boolean): CSSProperties {
  return disabled ? { ...base, opacity: 0.5, cursor: 'not-allowed' } : base;
}

export const noticeStyle = (kind: 'error' | 'warning' | 'success'): CSSProperties => ({
  padding: '8px 10px',
  borderRadius: 6,
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--text-primary)',
  background: 'var(--bg-primary)',
  border: `1px solid var(--color-${kind})`,
});
