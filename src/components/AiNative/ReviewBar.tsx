/**
 * ReviewBar — canvas-side status bar for the pending AI proposal (M2.2 simplified)
 *
 * The chat-inline ProposalPreviewCard is the single decision point for AI proposals
 * (business step preview, accept/reject). When the user opens the canvas drawer,
 * ReviewBar just reflects that a proposal is pending and offers the same two
 * actions — it doesn't duplicate the review UI or offer per-item selection
 * (that granular-accept UI was engineering-facing and has been removed; the
 * AI-native way to keep only part of a proposal is to say so in chat and let the
 * model regenerate). `applyPartialProposal` remains exported from toolExecutor for
 * integrators who want to build their own granular-accept UI.
 */

import React from 'react';
import { ArrowUpDown, Check, Sparkles, TriangleAlert, X } from 'lucide-react';
import type { ProposedChange } from '../../store/aiStore';
import useWorkflowStore from '../../store/workflowStore';

interface ReviewBarProps {
    proposal: ProposedChange | null;
    onAccept: () => void;
    onReject: () => void;
}

const LEVEL_LABEL: Record<string, { label: string; color: string; bg: string }> = {
    L1: { label: 'L1 原子', color: 'var(--cm-text-muted)', bg: 'color-mix(in srgb, var(--cm-text-muted) 12%, transparent)' },
    L2: { label: 'L2 业务', color: 'var(--cm-data)', bg: 'color-mix(in srgb, var(--cm-data) 12%, transparent)' },
    L3: { label: 'L3 端到端', color: 'var(--cm-ai)', bg: 'color-mix(in srgb, var(--cm-ai) 12%, transparent)' },
};

const ReviewBar: React.FC<ReviewBarProps> = ({ proposal, onAccept, onReject }) => {
    const currentDef = useWorkflowStore(s => s.workflowDef);

    if (!proposal) return null;

    const isStale = proposal.baselineHash !== JSON.stringify(currentDef);
    const { diff, inferredLevel } = proposal;
    const levelMeta = inferredLevel ? LEVEL_LABEL[inferredLevel] : null;
    const totalChanges = diff.added.length + diff.modified.length + diff.removed.length
        + (diff.propsChanged ? 1 : 0) + (diff.reordered ? 1 : 0);

    return (
        <div className="ai-review-bar">
            {isStale && (
                <div className="ai-review-stale-banner">
                    <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />画布已在审阅期间被手动修改，此方案基于旧版本。建议拒绝后重新提问。
                </div>
            )}
            <div className="ai-review-main-row">
                <div className="ai-review-content">
                    <div className="ai-review-icon"><Sparkles size={16} strokeWidth={1.75} aria-hidden="true" /></div>
                    <div className="ai-review-info">
                        <div className="ai-review-title">
                            AI 变更方案 · {totalChanges} 处变更
                            {levelMeta && (
                                <span style={{
                                    marginLeft: 8, fontSize: 11, fontWeight: 600,
                                    padding: '1px 7px', borderRadius: 8,
                                    color: levelMeta.color, background: levelMeta.bg,
                                    border: `1px solid color-mix(in srgb, ${levelMeta.color} 25%, transparent)`,
                                }}>
                                    {levelMeta.label}
                                </span>
                            )}
                        </div>
                        <div className="ai-review-chips">
                            {diff.added.length > 0 && <span className="ai-diff-chip added">+{diff.added.length} 新增</span>}
                            {diff.modified.length > 0 && <span className="ai-diff-chip modified">~{diff.modified.length} 修改</span>}
                            {diff.removed.length > 0 && <span className="ai-diff-chip removed">-{diff.removed.length} 删除</span>}
                            {diff.propsChanged && <span className="ai-diff-chip props">属性变更</span>}
                            {diff.reordered && <span className="ai-diff-chip reordered"><ArrowUpDown size={12} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 3 }} />顺序调整</span>}
                            {isStale && <span className="ai-diff-chip stale"><TriangleAlert size={12} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 3 }} />已过期</span>}
                            <span className="ai-review-detail-hint">详情与调整请在左侧对话中进行</span>
                        </div>
                    </div>
                </div>
                <div className="ai-review-actions">
                    <button className="ai-review-btn reject" onClick={onReject} title="拒绝此方案，保持当前工作流不变">
                        <X size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />拒绝
                    </button>
                    <button
                        className={`ai-review-btn accept${isStale ? ' stale' : ''}`}
                        onClick={onAccept}
                        title={isStale ? '画布已被修改，应用此方案可能覆盖手动编辑' : '应用全部变更到画布'}
                    >
                        {isStale ? <><TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />仍然应用</> : <><Check size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />应用变更</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReviewBar;
