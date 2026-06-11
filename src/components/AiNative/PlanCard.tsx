/**
 * PlanCard — displays an AI-proposed multi-step execution plan
 *
 * Shown in the chat when the AI calls propose_plan before executing a
 * complex multi-step operation. The user can confirm or cancel.
 */

import React from 'react';
import type { PendingPlan } from '../../store/aiStore';

const TOOL_ICON: Record<string, string> = {
    replace_workflow: '🔄',
    patch_workflow: '✏️',
    get_workflow_state: '🔍',
    validate_workflow: '✅',
    search_workflow_library: '📚',
};

interface PlanCardProps {
    plan: PendingPlan;
    onExecute: () => void;
    onCancel: () => void;
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, onExecute, onCancel }) => {
    return (
        <div className="ai-plan-card">
            <div className="ai-plan-card-header">
                <span className="ai-plan-card-icon">📋</span>
                <div className="ai-plan-card-title">{plan.title}</div>
            </div>

            <ol className="ai-plan-step-list">
                {plan.steps.map(s => (
                    <li key={s.step} className="ai-plan-step">
                        <span className="ai-plan-step-num">{s.step}</span>
                        <span className="ai-plan-step-action">{s.action}</span>
                        {s.tool && (
                            <span className="ai-plan-step-tool" title={s.tool}>
                                {TOOL_ICON[s.tool] ?? '🔧'}
                            </span>
                        )}
                    </li>
                ))}
            </ol>

            {plan.summary && (
                <div className="ai-plan-card-summary">{plan.summary}</div>
            )}

            <div className="ai-plan-card-actions">
                <button className="ai-plan-btn cancel" onClick={onCancel}>
                    ✕ 取消
                </button>
                <button className="ai-plan-btn execute" onClick={onExecute}>
                    ▶ 执行方案
                </button>
            </div>
        </div>
    );
};

export default PlanCard;
