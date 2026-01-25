import React from 'react';
import './ParameterSuggester.css';

export interface Suggestion {
    label: string;
    value: string;
    description: string;
}

interface ParameterSuggesterProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (value: string) => void;
    suggestions: Suggestion[];
    anchorRect?: DOMRect;
}

const ParameterSuggester: React.FC<ParameterSuggesterProps> = ({
    isOpen,
    onClose,
    onSelect,
    suggestions,
    anchorRect
}) => {
    if (!isOpen || !anchorRect) return null;

    const style: React.CSSProperties = {
        position: 'fixed',
        top: anchorRect.bottom + 8,
        left: Math.max(anchorRect.left - 200, 20),
        width: '280px',
        zIndex: 3000,
    };

    return (
        <>
            <div className="suggester-overlay" onClick={onClose} />
            <div className="parameter-suggester-popover glass-panel" style={style}>
                <div className="suggester-header">
                    <span className="sparkle-icon">✨</span>
                    AI Suggestions
                </div>
                <div className="suggester-list">
                    {suggestions.length === 0 ? (
                        <div className="suggester-empty">Analyzing context...</div>
                    ) : (
                        suggestions.map((s, idx) => (
                            <div
                                key={idx}
                                className="suggestion-item"
                                onClick={() => {
                                    onSelect(s.value);
                                    onClose();
                                }}
                            >
                                <div className="suggestion-label">{s.label}</div>
                                <div className="suggestion-value">{s.value}</div>
                                <div className="suggestion-desc">{s.description}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    );
};

export default ParameterSuggester;
