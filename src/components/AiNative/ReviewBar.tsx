/**
 * ReviewBar — AI proposal review panel
 *
 * Shows a unified diff summary when AI has proposed changes.
 * One-click accept applies setWorkflow(proposedDef).
 * One-click reject discards the proposal.
 */

import React from 'react';
import type { ProposedChange } from '../../store/aiStore';

interface ReviewBarProps {
    proposal: ProposedChange | null;
    onAccept: () => void;
    onReject: () => void;
}

const ReviewBar: React.FC<ReviewBarProps> = ({ proposal, onAccept, onReject }) => {
    if (!proposal) return null;

    const { diff } = proposal;
    const totalChanges = diff.added.length + diff.modified.length + diff.removed.length + (diff.propsChanged ? 1 : 0);

    return (
        <div className="ai-review-bar">
            <div className="ai-review-content">
                <div className="ai-review-icon">✨</div>
                <div className="ai-review-info">
                    <div className="ai-review-title">AI 变更方案 · {totalChanges} 处变更</div>
                    <div className="ai-review-chips">
                        {diff.added.length > 0 && (
                            <span className="ai-diff-chip added" title={diff.added.join(', ')}>
                                +{diff.added.length} 新增
                            </span>
                        )}
                        {diff.modified.length > 0 && (
                            <span className="ai-diff-chip modified" title={diff.modified.join(', ')}>
                                ~{diff.modified.length} 修改
                            </span>
                        )}
                        {diff.removed.length > 0 && (
                            <span className="ai-diff-chip removed" title={diff.removed.join(', ')}>
                                -{diff.removed.length} 删除
                            </span>
                        )}
                        {diff.propsChanged && (
                            <span className="ai-diff-chip props">属性变更</span>
                        )}
                    </div>
                </div>
            </div>
            <div className="ai-review-actions">
                <button className="ai-review-btn reject" onClick={onReject} title="拒绝此方案，保持当前工作流不变">
                    ✕ 拒绝
                </button>
                <button className="ai-review-btn accept" onClick={onAccept} title="应用此方案到画布">
                    ✓ 应用
                </button>
            </div>
        </div>
    );
};

export default ReviewBar;
