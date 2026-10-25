/**
 * RepairCard — AI-generated repair proposal for run-mode failures
 *
 * Shown when the AI calls propose_repair in run mode.
 * Displays a diagnosis and a list of executable repair actions.
 */

import React, { useState } from 'react';
import type { RepairProposal, RepairAction } from '../../store/aiStore';
import { Check, Lightbulb, Pencil, Play, RotateCcw, SkipForward, Wrench, X, type LucideIcon } from 'lucide-react';

const RISK_META = {
    low:    { label: '低风险', color: 'var(--cm-status-success)' },
    medium: { label: '中风险', color: 'var(--cm-status-warning)' },
    high:   { label: '高风险', color: 'var(--cm-status-failed)' },
} as const;

const ACTION_TYPE_LABEL: Record<RepairAction['type'], string> = {
    rerun_from:      '从此任务重新运行',
    skip:            '跳过此任务',
    retry_workflow:  '重试整个工作流',
    modify_def:      '修改工作流定义',
};

const ACTION_TYPE_ICON: Record<RepairAction['type'], LucideIcon> = {
    rerun_from:      Play,
    skip:            SkipForward,
    retry_workflow:  RotateCcw,
    modify_def:      Pencil,
};

interface RepairCardProps {
    repair: RepairProposal;
    /** True when the corresponding execution actions are available */
    canExecute: boolean;
    onExecuteAction: (action: RepairAction) => void;
    onDismiss: () => void;
}

const RepairCard: React.FC<RepairCardProps> = ({ repair, canExecute, onExecuteAction, onDismiss }) => {
    // Runtime-mutating actions (rerun/skip/retry) require an inline second click before
    // firing — a single accidental click must never trigger a real rerun/skip/retry.
    const [confirmingId, setConfirmingId] = useState<string | null>(null);

    const handleExecClick = (action: RepairAction) => {
        if (confirmingId !== action.id) {
            setConfirmingId(action.id);
            return;
        }
        setConfirmingId(null);
        onExecuteAction(action);
    };

    return (
        <div className="ai-repair-card">
            <div className="ai-repair-card-header">
                <span className="ai-repair-card-icon" style={{ display: 'inline-flex', color: 'var(--cm-ai)' }}><Wrench size={18} strokeWidth={1.75} aria-hidden="true" /></span>
                <div className="ai-repair-card-title">故障诊断与修复方案</div>
                <button className="ai-repair-dismiss" onClick={onDismiss} title="关闭" aria-label="关闭修复卡片"><X size={14} strokeWidth={1.75} aria-hidden="true" /></button>
            </div>

            <div className="ai-repair-diagnosis">{repair.diagnosis}</div>

            <div className="ai-repair-actions-label">推荐修复操作</div>

            <div className="ai-repair-action-list">
                {repair.actions.map((action, idx) => {
                    const riskMeta = action.risk ? RISK_META[action.risk] : null;
                    const isModifyDef = action.type === 'modify_def';
                    return (
                        <div key={action.id} className="ai-repair-action-item">
                            <div className="ai-repair-action-main">
                                <span className="ai-repair-action-rank">{idx + 1}</span>
                                <div className="ai-repair-action-info">
                                    <div className="ai-repair-action-label">{action.label}</div>
                                    {action.description && (
                                        <div className="ai-repair-action-desc">{action.description}</div>
                                    )}
                                </div>
                                <div className="ai-repair-action-meta">
                                    {riskMeta && (
                                        <span
                                            className="ai-repair-risk-badge"
                                            style={{ color: riskMeta.color, borderColor: `color-mix(in srgb, ${riskMeta.color} 25%, transparent)` }}
                                        >
                                            {riskMeta.label}
                                        </span>
                                    )}
                                    {!isModifyDef && (
                                        confirmingId === action.id ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                                                    确认{ACTION_TYPE_LABEL[action.type]}？
                                                </span>
                                                <button
                                                    className="ai-repair-exec-btn"
                                                    onClick={() => handleExecClick(action)}
                                                    autoFocus
                                                >
                                                    <Check size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />立即执行
                                                </button>
                                                <button
                                                    className="ai-repair-exec-btn"
                                                    onClick={() => setConfirmingId(null)}
                                                >
                                                    取消
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                className="ai-repair-exec-btn"
                                                disabled={!canExecute}
                                                onClick={() => handleExecClick(action)}
                                                title={canExecute ? ACTION_TYPE_LABEL[action.type] : '当前环境不支持此操作'}
                                            >
                                                {React.createElement(ACTION_TYPE_ICON[action.type], { size: 14, strokeWidth: 1.75, 'aria-hidden': true, style: { verticalAlign: -2, marginRight: 4 } })}执行
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {!canExecute && (
                <div className="ai-repair-no-exec-hint">
                    <Lightbulb size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />集成方未提供 executionActions，操作按钮已禁用。可参考诊断内容手动修复。
                </div>
            )}
        </div>
    );
};

export default RepairCard;
