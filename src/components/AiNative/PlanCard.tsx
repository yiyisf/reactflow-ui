/**
 * PlanCard — displays an AI-proposed multi-step execution plan
 *
 * Shown in the chat when the AI calls propose_plan before executing a
 * complex multi-step operation. The user can confirm or cancel.
 */

import React from 'react';
import type { PendingPlan } from '../../store/aiStore';
import { CircleCheck, ClipboardList, Library, Pencil, Play, RefreshCw, Search, Wrench, X, type LucideIcon } from 'lucide-react';

const TOOL_ICON: Record<string, LucideIcon> = {
    replace_workflow: RefreshCw,
    patch_workflow: Pencil,
    get_workflow_state: Search,
    validate_workflow: CircleCheck,
    search_workflow_library: Library,
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
                <span className="ai-plan-card-icon" style={{ display: 'inline-flex', color: 'var(--cm-ai)' }}><ClipboardList size={18} strokeWidth={1.75} aria-hidden="true" /></span>
                <div className="ai-plan-card-title">{plan.title}</div>
            </div>

            <ol className="ai-plan-step-list">
                {plan.steps.map(s => (
                    <li key={s.step} className="ai-plan-step">
                        <span className="ai-plan-step-num">{s.step}</span>
                        <span className="ai-plan-step-action">{s.action}</span>
                        {s.tool && (
                            <span className="ai-plan-step-tool" title={s.tool}>
                                {React.createElement(TOOL_ICON[s.tool] ?? Wrench, { size: 14, strokeWidth: 1.75, 'aria-hidden': true })}
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
                    <X size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />取消
                </button>
                <button className="ai-plan-btn execute" onClick={onExecute}>
                    <Play size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />执行方案
                </button>
            </div>
        </div>
    );
};

export default PlanCard;
