/**
 * AiConfigPanel — AI 服务配置弹窗
 */

import React, { useState } from 'react';
import useAiStore from '../../store/aiStore';

interface AiConfigPanelProps {
    onClose: () => void;
}

const AiConfigPanel: React.FC<AiConfigPanelProps> = ({ onClose }) => {
    const { config, setConfig } = useAiStore();
    const [draft, setDraft] = useState({ ...config });

    const handleSave = () => {
        setConfig(draft);
        onClose();
    };

    return (
        <div className="ai-config-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="ai-config-dialog">
                <h3>⚙️ AI 配置</h3>

                <div className="ai-config-field">
                    <label>提供商</label>
                    <select
                        value={draft.provider}
                        onChange={e => setDraft({ ...draft, provider: e.target.value as any })}
                    >
                        <option value="auto">自动检测</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                    </select>
                </div>

                <div className="ai-config-field">
                    <label>API Base URL</label>
                    <input
                        type="text"
                        value={draft.baseUrl}
                        onChange={e => setDraft({ ...draft, baseUrl: e.target.value })}
                        placeholder="https://api.openai.com/v1"
                    />
                </div>

                <div className="ai-config-field">
                    <label>API Key</label>
                    <input
                        type="password"
                        value={draft.apiKey}
                        onChange={e => setDraft({ ...draft, apiKey: e.target.value })}
                        placeholder="sk-..."
                    />
                </div>

                <div className="ai-config-field">
                    <label>模型</label>
                    <input
                        type="text"
                        value={draft.model}
                        onChange={e => setDraft({ ...draft, model: e.target.value })}
                        placeholder="gpt-4o / claude-sonnet-4-20250514"
                    />
                </div>

                <div className="ai-config-btns">
                    <button className="cancel" onClick={onClose}>取消</button>
                    <button className="save" onClick={handleSave}>保存</button>
                </div>
            </div>
        </div>
    );
};

export default AiConfigPanel;
