/**
 * FailureSummaryCard — proactive failure surface for run-mode (M4.1)
 *
 * The runtime banner + welcome-message chips only appear near the top of the
 * conversation; if a workflow fails mid-conversation the user has to scroll back
 * to find a "why did this fail" suggestion. This card appears wherever the user
 * currently is the moment a failure is detected, with the failed task's own error
 * reason and a one-click path straight into diagnosis (skips having to phrase the
 * question themselves).
 */

import React from 'react';

interface FailureSummaryCardProps {
    taskRef: string;
    taskType: string;
    reason?: string;
    onDiagnose: () => void;
    onDismiss: () => void;
}

const MAX_REASON_LENGTH = 160;

const FailureSummaryCard: React.FC<FailureSummaryCardProps> = ({ taskRef, taskType, reason, onDiagnose, onDismiss }) => {
    const truncatedReason = reason && reason.length > MAX_REASON_LENGTH
        ? reason.slice(0, MAX_REASON_LENGTH) + '…'
        : reason;

    return (
        <div className="ai-failure-card" role="alert">
            <div className="ai-failure-card-header">
                <span className="ai-failure-card-icon">🔴</span>
                <span className="ai-failure-card-title">执行失败</span>
                <button className="ai-failure-card-dismiss" onClick={onDismiss} title="关闭" aria-label="关闭失败摘要">×</button>
            </div>
            <div className="ai-failure-card-task">
                失败任务：<strong>{taskRef}</strong>
                <span className="ai-failure-card-task-type"> ({taskType})</span>
            </div>
            {truncatedReason && (
                <div className="ai-failure-card-reason">{truncatedReason}</div>
            )}
            <button className="ai-failure-card-diagnose-btn" onClick={onDiagnose}>
                🔧 诊断并生成修复方案
            </button>
        </div>
    );
};

export default FailureSummaryCard;
