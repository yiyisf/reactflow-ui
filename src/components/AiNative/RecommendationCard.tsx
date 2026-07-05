import React from 'react';
import type { PendingRecommendation } from '../../store/aiStore';

const MATCH_SCORE_LABEL: Record<string, string> = {
    exact: '完全匹配',
    partial: '部分匹配',
    similar: '类似场景',
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
                    return (
                        <div key={i} className="ai-recommendation-item">
                            <div className="ai-recommendation-item-header">
                                <span className="ai-recommendation-item-name">{rec.workflowName}</span>
                                <span className={`ai-recommendation-match-badge ai-rec-badge--${rec.matchScore}`}>
                                    {MATCH_SCORE_LABEL[rec.matchScore]}
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
