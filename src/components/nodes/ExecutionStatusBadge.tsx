import React, { memo } from 'react';
import { ExecutionStatus } from '../../types/workflow';

interface ExecutionStatusBadgeProps {
    status: ExecutionStatus;
}

/**
 * 运行态状态徽章组件
 * 显示状态对应的图标和样式
 */
const ExecutionStatusBadge: React.FC<ExecutionStatusBadgeProps> = ({ status }) => {
    const getBadgeContent = () => {
        switch (status) {
            case 'SCHEDULED':
                return { icon: '○', className: 'scheduled' };
            case 'IN_PROGRESS':
                return { icon: '◐', className: 'in-progress' };
            case 'COMPLETED':
                return { icon: '✓', className: 'completed' };
            case 'COMPLETED_WITH_ERRORS':
                return { icon: '⚠', className: 'completed-with-errors' };
            case 'FAILED':
            case 'FAILED_WITH_TERMINAL_ERROR':
                return { icon: '✗', className: 'failed' };
            case 'TIMED_OUT':
                return { icon: '⏱', className: 'timed-out' };
            case 'SKIPPED':
                return { icon: '⤳', className: 'skipped' };
            case 'CANCELED':
                return { icon: '⊘', className: 'canceled' };
            default:
                return { icon: '?', className: 'unknown' };
        }
    };

    const { icon, className } = getBadgeContent();

    return (
        <div className={`execution-status-badge ${className}`} title={status}>
            <span className="badge-icon">{icon}</span>
        </div>
    );
};

export default memo(ExecutionStatusBadge);
