import React, { memo } from 'react';
import { ExecutionStatus } from '../../types/workflow';
import { Ban, Check, Circle, CircleHelp, LoaderCircle, SkipForward, Timer, TriangleAlert, X, type LucideIcon } from 'lucide-react';

interface ExecutionStatusBadgeProps {
    status: ExecutionStatus;
}

/**
 * 运行态状态徽章组件
 * 显示状态对应的图标和样式
 */
/* Icon + Chinese word per status (CMASTER rule 5: colour + icon + word). The word is the tooltip and accessible name,
   since the badge itself is a small dot on the node corner. */
const BADGE: Record<string, { icon: LucideIcon; className: string; label: string }> = {
    SCHEDULED: { icon: Circle, className: 'scheduled', label: '等待中' },
    IN_PROGRESS: { icon: LoaderCircle, className: 'in-progress', label: '运行中' },
    COMPLETED: { icon: Check, className: 'completed', label: '成功' },
    COMPLETED_WITH_ERRORS: { icon: TriangleAlert, className: 'completed-with-errors', label: '带错完成' },
    FAILED: { icon: X, className: 'failed', label: '失败' },
    FAILED_WITH_TERMINAL_ERROR: { icon: X, className: 'failed', label: '失败' },
    TIMED_OUT: { icon: Timer, className: 'timed-out', label: '已超时' },
    SKIPPED: { icon: SkipForward, className: 'skipped', label: '已跳过' },
    CANCELED: { icon: Ban, className: 'canceled', label: '已取消' },
};
const UNKNOWN = { icon: CircleHelp, className: 'unknown', label: '未知' };

const ExecutionStatusBadge: React.FC<ExecutionStatusBadgeProps> = ({ status }) => {
    const { icon: Icon, className, label } = BADGE[status] ?? UNKNOWN;

    return (
        <div className={`execution-status-badge ${className}`} title={`${label}（${status}）`} role="img" aria-label={`状态：${label}`}>
            <span className="badge-icon"><Icon size={12} strokeWidth={2.25} aria-hidden="true" /></span>
        </div>
    );
};

export default memo(ExecutionStatusBadge);
