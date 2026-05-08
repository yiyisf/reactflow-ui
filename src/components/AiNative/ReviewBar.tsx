/**
 * ReviewBar — 批量审核 AI 操作
 */

import React from 'react';
import type { PendingOperation } from '../../services/ai/toolExecutor';

interface ReviewBarProps {
    pendingOps: PendingOperation[];
    onAcceptAll: () => void;
    onRejectAll: () => void;
    onToggleOp: (id: string) => void;
}

const OP_ICONS: Record<string, string> = {
    create_workflow: '📄',
    add_task: '➕',
    modify_task: '✏️',
    remove_task: '🗑️',
    add_decision_branch: '🔀',
    add_fork_branch: '⑂',
    set_workflow_props: '⚙️',
    replace_workflow: '🔄',
    validate_workflow: '✅',
    get_workflow_context: '📋',
};

const ReviewBar: React.FC<ReviewBarProps> = ({
    pendingOps,
    onAcceptAll,
    onRejectAll,
    onToggleOp,
}) => {
    const pendingCount = pendingOps.filter(op => op.status === 'pending').length;

    if (pendingOps.length === 0) return null;

    return (
        <div className="ai-review-bar">
            <div className="ai-review-header">
                <div className="ai-review-title">
                    待审核操作 ({pendingCount}/{pendingOps.length})
                </div>
                <div className="ai-review-actions">
                    <button className="ai-review-btn reject" onClick={onRejectAll}>
                        ✕ 全部拒绝
                    </button>
                    <button className="ai-review-btn accept" onClick={onAcceptAll}>
                        ✓ 全部接受
                    </button>
                </div>
            </div>

            <div className="ai-review-ops">
                {pendingOps.map(op => (
                    <div
                        key={op.id}
                        className={`ai-op-card ${op.status}`}
                    >
                        <span className="ai-op-icon">
                            {OP_ICONS[op.toolName] || '🔧'}
                        </span>
                        <span className="ai-op-desc">{op.description}</span>
                        <button
                            className={`ai-op-toggle ${op.status === 'accepted' ? 'checked' : ''}`}
                            onClick={() => onToggleOp(op.id)}
                            title={op.status === 'accepted' ? '取消' : '接受'}
                        >
                            {op.status === 'accepted' ? '✓' : op.status === 'rejected' ? '✕' : ''}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ReviewBar;
