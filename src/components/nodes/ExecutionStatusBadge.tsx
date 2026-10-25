import React, { memo } from 'react';
import { ExecutionStatus } from '../../types/workflow';
import { getStatusMeta } from '../../utils/statusMeta';

interface ExecutionStatusBadgeProps {
    status: ExecutionStatus;
}

/**
 * 运行态状态徽章组件
 * Icon + Chinese word per status (CMASTER rule 5: colour + icon + word), from the shared status helper. The word is
 * the tooltip and accessible name, since the badge itself is a small dot on the node corner.
 */
const ExecutionStatusBadge: React.FC<ExecutionStatusBadgeProps> = ({ status }) => {
    const { icon: Icon, className, label } = getStatusMeta(status);

    return (
        <div className={`execution-status-badge ${className}`} title={`${label}（${status}）`} role="img" aria-label={`状态：${label}`}>
            <span className="badge-icon"><Icon size={12} strokeWidth={2.25} aria-hidden="true" /></span>
        </div>
    );
};

export default memo(ExecutionStatusBadge);
