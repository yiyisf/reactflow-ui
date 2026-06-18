import React from 'react';
import type { PendingRecommendation } from '../../store/aiStore';

const MATCH_SCORE_META = {
    exact: { label: '完全匹配', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
    partial: { label: '部分匹配', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    similar: { label: '类似场景', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
};

interface RecommendationCardProps {
    recommendation: PendingRecommendation;
    onUseWorkflow: (workflowName: string) => void;
    onModifyWorkflow: (workflowName: string) => void;
    onCreateNew: () => void;
}

const RecommendationCard: React.FC<RecommendationCardProps> = ({
    recommendation, onUseWorkflow, onModifyWorkflow, onCreateNew,
}) => {
    return (
        <div className="ai-recommendation-card">
            <div className="ai-recommendation-header">
                <span className="ai-recommendation-icon">📋</span>
                <div>
                    <div className="ai-recommendation-title">发现相似工作流</div>
                    <div className="ai-recommendation-intent">{recommendation.userIntent}</div>
                </div>
            </div>
            <div className="ai-recommendation-list">
                {recommendation.recommendations.map((rec, i) => {
                    const meta = MATCH_SCORE_META[rec.matchScore];
                    return (
                        <div key={i} className="ai-recommendation-item">
                            <div className="ai-recommendation-item-header">
                                <span className="ai-recommendation-item-name">{rec.workflowName}</span>
                                <span className="ai-recommendation-match-badge" style={{ color: meta.color, background: meta.bg }}>
                                    {meta.label}
                                </span>
                            </div>
                            <div className="ai-recommendation-item-reason">{rec.matchReason}</div>
                            <div className="ai-recommendation-item-actions">
                                <button className="ai-rec-btn primary" onClick={() => onUseWorkflow(rec.workflowName)}>
                                    直接使用
                                </button>
                                <button className="ai-rec-btn secondary" onClick={() => onModifyWorkflow(rec.workflowName)}>
                                    基于此修改
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="ai-recommendation-footer">
                <button className="ai-rec-btn ghost" onClick={onCreateNew}>
                    不，从头创建新工作流 →
                </button>
            </div>
        </div>
    );
};

export default RecommendationCard;
