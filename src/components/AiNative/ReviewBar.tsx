/**
 * ReviewBar — AI proposal review panel with granular acceptance
 *
 * Shows a unified diff summary when AI has proposed changes.
 * - Full accept: applies all changes via setWorkflow(proposedDef)
 * - Granular accept: user selects individual changes via checkboxes,
 *   then applies only the selected subset via applyPartialProposal()
 * - Reject: discards the proposal entirely
 */

import React, { useState, useEffect } from 'react';
import type { ProposedChange } from '../../store/aiStore';
import type { PartialAcceptSelection } from '../../services/ai/toolExecutor';
import useWorkflowStore from '../../store/workflowStore';

interface ReviewBarProps {
    proposal: ProposedChange | null;
    onAccept: (selection?: PartialAcceptSelection) => void;
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

function buildFullSelection(diff: ProposedChange['diff']): PartialAcceptSelection {
    return {
        added: new Set(diff.added),
        modified: new Set(diff.modified),
        removed: new Set(diff.removed),
        propsChanged: diff.propsChanged,
        reordered: diff.reordered ?? false,
    };
}

function countSelected(sel: PartialAcceptSelection): number {
    return sel.added.size + sel.modified.size + sel.removed.size
        + (sel.propsChanged ? 1 : 0)
        + (sel.reordered ? 1 : 0);
}

const ReviewBar: React.FC<ReviewBarProps> = ({ proposal, onAccept, onReject }) => {
    const [expanded, setExpanded] = useState(false);
    const [selection, setSelection] = useState<PartialAcceptSelection | null>(null);
    const currentDef = useWorkflowStore(s => s.workflowDef);

    useEffect(() => {
        setExpanded(false);
        setSelection(proposal ? buildFullSelection(proposal.diff) : null);
    }, [proposal?.id]);

    if (!proposal || !selection) return null;

    const isStale = proposal.baselineHash !== JSON.stringify(currentDef);
    const { diff, inferredLevel } = proposal;
    const levelMeta = inferredLevel ? LEVEL_LABEL[inferredLevel] : null;

    const totalChanges = diff.added.length + diff.modified.length + diff.removed.length
        + (diff.propsChanged ? 1 : 0) + (diff.reordered ? 1 : 0);
    const selectedCount = countSelected(selection);
    const isAllSelected = selectedCount === totalChanges;
    const hasDetailContent = totalChanges > 0;

    const toggle = (kind: 'added' | 'modified' | 'removed', ref: string) => {
        setSelection(prev => {
            if (!prev) return prev;
            const set = new Set(prev[kind]);
            if (set.has(ref)) set.delete(ref); else set.add(ref);
            return { ...prev, [kind]: set };
        });
    };

    const toggleBool = (key: 'propsChanged' | 'reordered') => {
        setSelection(prev => prev ? { ...prev, [key]: !prev[key] } : prev);
    };

    const handleAccept = () => {
        if (isAllSelected) {
            onAccept();
        } else {
            onAccept(selection);
        }
    };

    const detailItems: Array<{ ref: string; kind: 'added' | 'modified' | 'removed' }> = [
        ...diff.added.map(r => ({ ref: r, kind: 'added' as const })),
        ...diff.modified.map(r => ({ ref: r, kind: 'modified' as const })),
        ...diff.removed.map(r => ({ ref: r, kind: 'removed' as const })),
    ];

    return (
        <div className="ai-review-bar">
            {isStale && (
                <div className="ai-review-stale-banner">
                    ⚠️ 画布已在审阅期间被手动修改，此方案基于旧版本。建议拒绝后重新提问。
                </div>
            )}

            {expanded && hasDetailContent && (
                <div className="ai-review-detail">
                    {diff.propsChanged && (
                        <label className="ai-review-detail-item props ai-review-detail-selectable">
                            <input
                                type="checkbox"
                                className="ai-review-checkbox"
                                checked={selection.propsChanged}
                                onChange={() => toggleBool('propsChanged')}
                            />
                            <span className="ai-review-detail-symbol" style={{ color: 'var(--color-accent)' }}>≠</span>
                            <span className="ai-review-detail-ref">工作流属性（名称/描述/超时）</span>
                            <span className="ai-review-detail-kind" style={{ color: 'var(--color-accent)' }}>属性变更</span>
                        </label>
                    )}
                    {diff.reordered && (
                        <label className="ai-review-detail-item reordered ai-review-detail-selectable">
                            <input
                                type="checkbox"
                                className="ai-review-checkbox"
                                checked={selection.reordered}
                                onChange={() => toggleBool('reordered')}
                            />
                            <span className="ai-review-detail-symbol" style={{ color: '#8b5cf6' }}>↕</span>
                            <span className="ai-review-detail-ref">任务顺序调整</span>
                            <span className="ai-review-detail-kind" style={{ color: '#8b5cf6' }}>重排</span>
                        </label>
                    )}
                    {detailItems.map(({ ref, kind }) => {
                        const m = KIND_META[kind];
                        const checked = selection[kind].has(ref);
                        return (
                            <label
                                key={`${kind}-${ref}`}
                                className={`ai-review-detail-item ${kind} ai-review-detail-selectable${!checked ? ' deselected' : ''}`}
                            >
                                <input
                                    type="checkbox"
                                    className="ai-review-checkbox"
                                    checked={checked}
                                    onChange={() => toggle(kind, ref)}
                                />
                                <span className="ai-review-detail-symbol" style={{ color: m.color }}>{m.symbol}</span>
                                <span className="ai-review-detail-ref">{ref}</span>
                                <span className="ai-review-detail-kind" style={{ color: m.color }}>{m.label}</span>
                            </label>
                        );
                    })}
                </div>
            )}

            <div className="ai-review-main-row">
                <div className="ai-review-content">
                    <div className="ai-review-icon">✨</div>
                    <div className="ai-review-info">
                        <div className="ai-review-title">
                            AI 变更方案 · {totalChanges} 处变更
                            {levelMeta && (
                                <span style={{
                                    marginLeft: 8, fontSize: 11, fontWeight: 600,
                                    padding: '1px 7px', borderRadius: 8,
                                    color: levelMeta.color, background: levelMeta.bg,
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
                            {diff.reordered && (
                                <span className="ai-diff-chip reordered">↕ 顺序调整</span>
                            )}
                            {isStale && (
                                <span className="ai-diff-chip stale">⚠ 已过期</span>
                            )}
                            {!isAllSelected && selectedCount > 0 && (
                                <span className="ai-diff-chip partial-selected">✓ 已选 {selectedCount}/{totalChanges}</span>
                            )}
                            {hasDetailContent && (
                                <button
                                    className="ai-review-detail-toggle"
                                    onClick={() => setExpanded(e => !e)}
                                    title={expanded ? '收起详情' : '展开逐项选择要应用的变更'}
                                >
                                    {expanded ? '▲ 收起' : '▼ 逐项选择'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <div className="ai-review-actions">
                    <button className="ai-review-btn reject" onClick={onReject} title="拒绝此方案，保持当前工作流不变">
                        ✕ 拒绝
                    </button>
                    <button
                        className={`ai-review-btn accept${isStale ? ' stale' : ''}${!isAllSelected && selectedCount > 0 ? ' partial' : ''}`}
                        onClick={handleAccept}
                        disabled={selectedCount === 0}
                        title={
                            selectedCount === 0 ? '请至少选择一项变更' :
                            isStale ? '⚠️ 画布已被修改，应用此方案可能覆盖手动编辑' :
                            isAllSelected ? '应用全部变更到画布' :
                            `应用选中的 ${selectedCount}/${totalChanges} 项变更`
                        }
                    >
                        {isAllSelected
                            ? `✓ 应用全部${isStale ? ' ⚠️' : ''}`
                            : `✓ 应用 ${selectedCount}/${totalChanges}`
                        }
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReviewBar;
