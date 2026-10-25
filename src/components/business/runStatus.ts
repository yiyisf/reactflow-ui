/**
 * 试跑 / 运行状态 → 业务卡片徽标（CMASTER 规则 5：颜色 + 图标 + 中文词，不能只靠颜色）。
 * icon 为 lucide 图标名，由组件映射为具体图标。
 */
export interface RunStatusBadge {
  label: string;
  /** 颜色 token（var(--cm-status-*)） */
  color: string;
  icon: 'check' | 'x' | 'timer' | 'skip' | 'loader' | 'circle' | 'ban' | 'alert';
}

const BADGES: Record<string, RunStatusBadge> = {
  COMPLETED: { label: '成功', color: 'var(--cm-status-success)', icon: 'check' },
  COMPLETED_WITH_ERRORS: { label: '带错完成', color: 'var(--cm-status-warning)', icon: 'alert' },
  FAILED: { label: '失败', color: 'var(--cm-status-failed)', icon: 'x' },
  FAILED_WITH_TERMINAL_ERROR: { label: '失败', color: 'var(--cm-status-failed)', icon: 'x' },
  TIMED_OUT: { label: '已超时', color: 'var(--cm-status-failed)', icon: 'timer' },
  SKIPPED: { label: '已跳过', color: 'var(--cm-status-skipped)', icon: 'skip' },
  IN_PROGRESS: { label: '运行中', color: 'var(--cm-status-running)', icon: 'loader' },
  SCHEDULED: { label: '等待中', color: 'var(--cm-status-pending)', icon: 'circle' },
  CANCELED: { label: '已取消', color: 'var(--cm-status-skipped)', icon: 'ban' },
};

export function runStatusBadge(status: string | undefined | null): RunStatusBadge {
  return (status && BADGES[status]) || { label: '等待中', color: 'var(--cm-status-pending)', icon: 'circle' };
}
