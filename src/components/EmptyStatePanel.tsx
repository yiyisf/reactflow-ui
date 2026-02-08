import React, { useState } from 'react';
import useWorkflowStore from '../store/workflowStore';
import './EmptyStatePanel.css';

interface EmptyStatePanelProps {
    onRequestImport?: () => void;
}

const EmptyStatePanel: React.FC<EmptyStatePanelProps> = ({ onRequestImport }) => {
    const { createBlankWorkflow } = useWorkflowStore();
    const [name, setName] = useState('');

    const handleBlank = () => {
        createBlankWorkflow(name || undefined);
        useWorkflowStore.temporal.getState().clear();
    };

    const handleAI = () => {
        // 如果没有工作流，先创建空白工作流再打开 AI
        createBlankWorkflow(name || undefined);
        useWorkflowStore.temporal.getState().clear();
        window.dispatchEvent(new CustomEvent('open-ai-chat'));
    };

    return (
        <div className="empty-state-panel">
            <h2 className="empty-state-title">创建新工作流</h2>
            <p className="empty-state-subtitle">
                从空白画布开始设计，或让 AI 帮你生成完整流程
            </p>

            <input
                className="empty-state-name-input"
                type="text"
                placeholder="工作流名称（可选）"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleBlank();
                }}
            />

            <div className="empty-state-actions">
                <button className="empty-state-btn primary" onClick={handleBlank}>
                    <span className="empty-state-btn-icon">📄</span>
                    空白工作流
                </button>
                <button className="empty-state-btn" onClick={handleAI}>
                    <span className="empty-state-btn-icon">✨</span>
                    AI 生成
                </button>
                {onRequestImport && (
                    <button className="empty-state-btn" onClick={onRequestImport}>
                        <span className="empty-state-btn-icon">📤</span>
                        导入 JSON
                    </button>
                )}
            </div>
        </div>
    );
};

export default EmptyStatePanel;
