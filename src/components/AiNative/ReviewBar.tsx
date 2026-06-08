/**
 * ReviewBar — AI proposal review panel
 *
 * Shows a unified diff summary when AI has proposed changes.
 * One-click accept applies setWorkflow(proposedDef).
 * One-click reject discards the proposal.
 * Expandable detail section lists every changed task reference.
 */

import React, { useState, useEffect } from 'react';
import type { ProposedChange } from '../../store/aiStore';

interface ReviewBarProps {
    proposal: ProposedChange | null;
    onAccept: () => void;
    onReject: () => void;
}

const KIND_META = {
    added:    { symbol: '+', label: '新增', color: '#10b981' },
    modified: { symbol: '~', label: '修改', color: '#f59e0b' },
    removed:  { symbol: '−', label: '删除', color: '#ef4444' },
} as const;

const LEVEL_LABEL: Record<string, { label: string; color: string; bg: string }> = {
    L1: { label: 'L1 原子', color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
    L2: { label: 'L2 业务', color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)' },
    L3: { label: 'L3 端到端', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
};

const ReviewBar: React.FC<ReviewBarProps> = ({ proposal, onAccept, onReject }) => {
    const [expanded, setExpanded] = useState(false);

    // Reset expand state whenever a new proposal replaces the previous one
    useEffect(() => { setExpanded(false); }, [proposal?.id]);

    if (!proposal) return null;

    const { diff, inferredLevel } = proposal;
    const totalChanges = diff.added.length + diff.modified.length + diff.removed.length + (diff.propsChanged ? 1 : 0);
    const levelMeta = inferredLevel ? LEVEL_LABEL[inferredLevel] : null;

    const detailItems: Array<{ ref: string; kind: 'added' | 'modified' | 'removed' }> = [
        ...diff.added.map(r => ({ ref: r, kind: 'added' as const })),
        ...diff.modified.map(r => ({ ref: r, kind: 'modified' as const })),
        ...diff.removed.map(r => ({ ref: r, kind: 'removed' as const })),
    ];

    // totalChanges > 0 is the correct gate: includes propsChanged-only proposals
    const hasDetailContent = totalChanges > 0;

    return (
        <div className="ai-review-bar">
            {/* Expandable diff detail */}
            {expanded && hasDetailContent && (
                <div className="ai-review-detail">
                    {diff.propsChanged && (
                        <div className="ai-review-detail-item props">
                            <span className="ai-review-detail-symbol" style={{ color: 'var(--color-accent)' }}>≠</span>
                            <span className="ai-review-detail-ref">工作流属性（名称/描述/超时）</span>
                            <span className="ai-review-detail-kind" style={{ color: 'var(--color-accent)' }}>属性变更</span>
                        </div>
                    )}
                    {detailItems.map(({ ref, kind }) => {
                        const m = KIND_META[kind];
                        return (
                            <div key={`${kind}-${ref}`} className={`ai-review-detail-item ${kind}`}>
                                <span className="ai-review-detail-symbol" style={{ color: m.color }}>{m.symbol}</span>
                                <span className="ai-review-detail-ref">{ref}</span>
                                <span className="ai-review-detail-kind" style={{ color: m.color }}>{m.label}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Main bar */}
            <div className="ai-review-content">
                <div className="ai-review-icon">✨</div>
                <div className="ai-review-info">
                    <div className="ai-review-title">
                        AI 变更方案 · {totalChanges} 处变更
                        {levelMeta && (
                            <span style={{
                                marginLeft: 8,
                                fontSize: 11,
                                fontWeight: 600,
                                padding: '1px 7px',
                                borderRadius: 8,
                                color: levelMeta.color,
                                background: levelMeta.bg,
                                border: `1px solid ${levelMeta.color}40`,
                            }}>
                                {levelMeta.label}
                            </span>
                        )}
                    </div>
                    <div className="ai-review-chips">
                        {diff.added.length > 0 && (
                            <span className="ai-diff-chip added">+{diff.added.length} 新增</span>
                        )}
                        {diff.modified.length > 0 && (
                            <span className="ai-diff-chip modified">~{diff.modified.length} 修改</span>
                        )}
                        {diff.removed.length > 0 && (
                            <span className="ai-diff-chip removed">-{diff.removed.length} 删除</span>
                        )}
                        {diff.propsChanged && (
                            <span className="ai-diff-chip props">属性变更</span>
                        )}
                        {hasDetailContent && (
                            <button
                                className="ai-review-detail-toggle"
                                onClick={() => setExpanded(e => !e)}
                                title={expanded ? '收起详情' : '展开查看每个变更的任务'}
                            >
                                {expanded ? '▲ 收起' : '▼ 详情'}
                            </button>
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
