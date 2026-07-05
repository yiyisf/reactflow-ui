/**
 * ProposalPreviewCard — business step preview for AI proposals (UX Phase A / M2.2)
 *
 * Replaces the old "+N 新增 ~N 修改" number-chip summary with an actual preview of
 * what the workflow will look like: every step in business language, added steps
 * highlighted green, modified steps yellow with a one-line change description,
 * removed steps struck through in place. The goal is that a non-technical user can
 * tell what changed in ~10 seconds without opening the canvas.
 */

import React, { useState } from 'react';
import type { ProposedChange } from '../../store/aiStore';
import { buildProposalSteps } from '../../utils/proposalPreview';
import { getTaskTypeMeta } from '../../utils/taskTypeMeta';
import { workflowToMermaid } from '../../utils/workflowToMermaid';
import MermaidBlock from './MermaidBlock';
import type { WorkflowDef } from '../../types/conductor';

interface ProposalPreviewCardProps {
    proposal: ProposedChange;
    currentDef: WorkflowDef | null;
    isStale: boolean;
    onAccept: () => void;
    onReject: () => void;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    added: { label: '+ 新增', className: 'added' },
    modified: { label: '~ 修改', className: 'modified' },
    removed: { label: '− 删除', className: 'removed' },
};

const ProposalPreviewCard: React.FC<ProposalPreviewCardProps> = ({ proposal, currentDef, isStale, onAccept, onReject }) => {
    const [showDiagram, setShowDiagram] = useState(false);
    const { proposedDef, diff, inferredLevel } = proposal;
    const steps = buildProposalSteps(currentDef, proposedDef, diff);
    const totalSteps = steps.filter(s => s.status !== 'removed').length;

    let mermaidCode: string | null = null;
    if (showDiagram) {
        try {
            mermaidCode = workflowToMermaid(proposedDef);
        } catch {
            mermaidCode = null;
        }
    }

    return (
        <div className={`ai-proposal-card${isStale ? ' stale' : ''}`}>
            <div className="ai-proposal-card-header">
                <span className="ai-proposal-card-icon">{isStale ? '⚠️' : '✦'}</span>
                <span className="ai-proposal-card-title">
                    {isStale ? '变更方案（画布已修改）' : `变更方案 · ${proposedDef.name || '工作流'}`}
                </span>
                {inferredLevel && <span className="ai-proposal-diff-chip level">{inferredLevel}</span>}
            </div>

            {isStale && (
                <div className="ai-proposal-stale-warning" role="alert">
                    画布在方案生成后已被手动修改，确认应用可能覆盖您的编辑。建议拒绝后重新提问。
                </div>
            )}

            <div className="ai-proposal-steps">
                {steps.map((step, i) => {
                    const meta = getTaskTypeMeta(step.task.type);
                    const badge = STATUS_BADGE[step.status];
                    return (
                        <div key={step.ref} className={`ai-proposal-step ${step.status}`}>
                            <span className="ai-proposal-step-num">{i + 1}</span>
                            <span className="ai-proposal-step-icon">{meta.icon}</span>
                            <span className="ai-proposal-step-name">{step.task.name || step.ref}</span>
                            {badge && <span className={`ai-proposal-step-badge ${badge.className}`}>{badge.label}</span>}
                            {step.status === 'modified' && step.changes && step.changes.length > 0 && (
                                <span className="ai-proposal-step-changes">{step.changes.join('，')}</span>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="ai-proposal-summary-row">
                <span className="ai-proposal-summary-text">
                    共 {totalSteps} 步
                    {diff.added.length > 0 && ` · ${diff.added.length} 新增`}
                    {diff.modified.length > 0 && ` · ${diff.modified.length} 修改`}
                    {diff.removed.length > 0 && ` · ${diff.removed.length} 删除`}
                </span>
                <button className="ai-proposal-diagram-toggle" onClick={() => setShowDiagram(v => !v)}>
                    {showDiagram ? '收起流程图' : '查看流程图'}
                </button>
            </div>

            {showDiagram && mermaidCode && <MermaidBlock code={mermaidCode} />}

            <div className="ai-proposal-card-actions">
                <button className="ai-proposal-btn reject" onClick={onReject}>✕ 拒绝</button>
                <button
                    className={`ai-proposal-btn accept${isStale ? ' stale' : ''}`}
                    onClick={onAccept}
                    title={isStale ? '⚠️ 方案基于旧版画布，应用后可能覆盖手动编辑' : undefined}
                >
                    {isStale ? '⚠ 仍然应用' : '✓ 应用变更'}
                </button>
            </div>

            <div className="ai-proposal-followup-hint">💬 也可以直接告诉我还要怎么调整</div>
        </div>
    );
};

export default ProposalPreviewCard;
