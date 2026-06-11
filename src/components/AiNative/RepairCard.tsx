/**
 * RepairCard — AI-generated repair proposal for run-mode failures
 *
 * Shown when the AI calls propose_repair in run mode.
 * Displays a diagnosis and a list of executable repair actions.
 */

import React from 'react';
import type { RepairProposal, RepairAction } from '../../store/aiStore';

const RISK_META = {
    low:    { label: '低风险', color: '#10b981' },
    medium: { label: '中风险', color: '#f59e0b' },
    high:   { label: '高风险', color: '#ef4444' },
} as const;

const ACTION_TYPE_LABEL: Record<RepairAction['type'], string> = {
    rerun_from:      '从此任务重新运行',
    skip:            '跳过此任务',
    retry_workflow:  '重试整个工作流',
    modify_def:      '修改工作流定义',
};

const ACTION_TYPE_ICON: Record<RepairAction['type'], string> = {
    rerun_from:      '▶',
    skip:            '⏭',
    retry_workflow:  '↺',
    modify_def:      '✏️',
};

interface RepairCardProps {
    repair: RepairProposal;
    /** True when the corresponding execution actions are available */
    canExecute: boolean;
    onExecuteAction: (action: RepairAction) => void;
    onDismiss: () => void;
}

const RepairCard: React.FC<RepairCardProps> = ({ repair, canExecute, onExecuteAction, onDismiss }) => {
    return (
        <div className="ai-repair-card">
            <div className="ai-repair-card-header">
                <span className="ai-repair-card-icon">🔧</span>
                <div className="ai-repair-card-title">故障诊断与修复方案</div>
                <button className="ai-repair-dismiss" onClick={onDismiss} title="关闭">×</button>
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
                                            style={{ color: riskMeta.color, borderColor: riskMeta.color + '40' }}
                                        >
                                            {riskMeta.label}
                                        </span>
                                    )}
                                    {!isModifyDef && (
                                        <button
                                            className="ai-repair-exec-btn"
                                            disabled={!canExecute}
                                            onClick={() => onExecuteAction(action)}
                                            title={canExecute ? ACTION_TYPE_LABEL[action.type] : '当前环境不支持此操作'}
                                        >
                                            {ACTION_TYPE_ICON[action.type]} 执行
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {!canExecute && (
                <div className="ai-repair-no-exec-hint">
                    💡 集成方未提供 executionActions，操作按钮已禁用。可参考诊断内容手动修复。
                </div>
            )}
        </div>
    );
};

export default RepairCard;
