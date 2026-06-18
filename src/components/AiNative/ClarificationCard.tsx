import React from 'react';
import type { PendingClarification } from '../../store/aiStore';

interface ClarificationCardProps {
    clarification: PendingClarification;
    onSelect: (optionLabel: string) => void;
    onCustom: () => void;
}

const ClarificationCard: React.FC<ClarificationCardProps> = ({ clarification, onSelect, onCustom }) => {
    return (
        <div className="ai-clarification-card">
            {clarification.context && (
                <div className="ai-clarification-context">{clarification.context}</div>
            )}
            <div className="ai-clarification-question">{clarification.question}</div>
            <div className="ai-clarification-options">
                {clarification.options.map(opt => (
                    <button
                        key={opt.id}
                        className="ai-clarification-option"
                        onClick={() => onSelect(opt.label)}
                    >
                        {opt.icon && <span className="ai-clarification-option-icon">{opt.icon}</span>}
                        <span className="ai-clarification-option-label">{opt.label}</span>
                        <span className="ai-clarification-option-desc">{opt.description}</span>
                    </button>
                ))}
                <button className="ai-clarification-option custom" onClick={onCustom}>
                    <span className="ai-clarification-option-icon">✏️</span>
                    <span className="ai-clarification-option-label">自定义描述</span>
                    <span className="ai-clarification-option-desc">手动输入您的具体需求</span>
                </button>
            </div>
        </div>
    );
};

export default ClarificationCard;
