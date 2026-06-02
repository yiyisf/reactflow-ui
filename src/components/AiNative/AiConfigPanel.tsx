/**
 * AiConfigPanel — AI 服务配置弹窗
 *
 * 支持 OpenAI（含兼容服务）和 Anthropic 两种协议。
 * 选择提供商后自动填充标准 URL 和默认模型名。
 */

import React, { useState } from 'react';
import useAiStore from '../../store/aiStore';
import { PROVIDER_DEFAULTS } from '../../services/ai/protocolAdapter';
import type { AiConfig } from '../../services/ai/protocolAdapter';

interface AiConfigPanelProps {
    onClose: () => void;
}

// 常见提供商预设
const PROVIDER_PRESETS = [
    { label: 'OpenAI',      provider: 'openai',    baseUrl: PROVIDER_DEFAULTS.openai.baseUrl,    model: 'gpt-4o',               group: 'openai' },
    { label: 'Anthropic',   provider: 'anthropic', baseUrl: PROVIDER_DEFAULTS.anthropic.baseUrl, model: PROVIDER_DEFAULTS.anthropic.model, group: 'anthropic' },
    { label: 'Mistral',     provider: 'openai',    baseUrl: 'https://api.mistral.ai/v1',          model: 'mistral-large-latest',  group: 'openai' },
    { label: 'DeepSeek',    provider: 'openai',    baseUrl: 'https://api.deepseek.com/v1',        model: 'deepseek-chat',         group: 'openai' },
    { label: 'Groq',        provider: 'openai',    baseUrl: 'https://api.groq.com/openai/v1',     model: 'llama-3.3-70b-versatile', group: 'openai' },
    { label: 'Together.ai', provider: 'openai',    baseUrl: 'https://api.together.xyz/v1',        model: 'meta-llama/Llama-3-70b-chat-hf', group: 'openai' },
    { label: 'Ollama (本地)',provider: 'openai',   baseUrl: 'http://localhost:11434/v1',           model: 'qwen2.5:72b',           group: 'openai' },
    { label: '自定义',      provider: 'openai',    baseUrl: '',                                   model: '',                      group: 'custom' },
] as const;

const AiConfigPanel: React.FC<AiConfigPanelProps> = ({ onClose }) => {
    const { config, setConfig } = useAiStore();

    const [draft, setDraft] = useState<AiConfig>({
        provider: config.provider || 'auto',
        apiKey: config.apiKey || '',
        baseUrl: config.baseUrl || '',
        model: config.model || '',
    });

    // Track which preset is active for UI highlight
    const [activePreset, setActivePreset] = useState<string>(() => {
        const match = PROVIDER_PRESETS.find(
            p => p.baseUrl === (config.baseUrl || '') && p.provider === (config.provider || 'auto')
        );
        return match?.label ?? '自定义';
    });

    const handlePreset = (preset: typeof PROVIDER_PRESETS[number]) => {
        setActivePreset(preset.label);
        setDraft(d => ({
            ...d,
            provider: preset.provider,
            baseUrl: preset.baseUrl,
            model: preset.model || d.model,
        }));
    };

    const handleSave = () => {
        // Strip empty strings so protocolAdapter can apply per-provider defaults
        const cleaned: AiConfig = {
            provider: draft.provider,
            apiKey: draft.apiKey.trim(),
        };
        if (draft.baseUrl?.trim()) cleaned.baseUrl = draft.baseUrl.trim();
        if (draft.model?.trim()) cleaned.model = draft.model.trim();
        setConfig(cleaned);
        onClose();
    };

    const resolvedProvider = draft.provider === 'anthropic' ? 'anthropic' : 'openai';
    const urlPlaceholder = resolvedProvider === 'anthropic'
        ? PROVIDER_DEFAULTS.anthropic.baseUrl
        : PROVIDER_DEFAULTS.openai.baseUrl;
    const modelPlaceholder = resolvedProvider === 'anthropic'
        ? PROVIDER_DEFAULTS.anthropic.model
        : PROVIDER_DEFAULTS.openai.model;

    return (
        <div className="ai-config-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="ai-config-dialog" style={{ width: 440 }}>
                <h3>⚙️ AI 服务配置</h3>

                {/* Provider presets */}
                <div className="ai-config-field">
                    <label>快速选择</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {PROVIDER_PRESETS.map(p => (
                            <button
                                key={p.label}
                                onClick={() => handlePreset(p)}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid',
                                    borderColor: activePreset === p.label ? 'var(--color-accent)' : 'var(--border-primary)',
                                    background: activePreset === p.label ? 'var(--color-accent-bg, rgba(59,130,246,0.1))' : 'var(--bg-tertiary)',
                                    color: activePreset === p.label ? 'var(--color-accent)' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    fontWeight: activePreset === p.label ? 600 : 400,
                                    fontFamily: 'inherit',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Protocol indicator */}
                <div style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    marginBottom: 12,
                }}>
                    {resolvedProvider === 'anthropic' ? (
                        <>协议: <strong style={{ color: 'var(--text-secondary)' }}>Anthropic Messages API</strong> — 使用 x-api-key 鉴权</>
                    ) : (
                        <>协议: <strong style={{ color: 'var(--text-secondary)' }}>OpenAI Chat Completions API</strong> — 兼容 Mistral、DeepSeek、Groq、Ollama 等</>
                    )}
                </div>

                {/* API Key */}
                <div className="ai-config-field">
                    <label>API Key <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                        type="password"
                        value={draft.apiKey}
                        onChange={e => setDraft({ ...draft, apiKey: e.target.value })}
                        placeholder={resolvedProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                        autoFocus
                    />
                </div>

                {/* Base URL */}
                <div className="ai-config-field">
                    <label>
                        API Base URL
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400 }}>
                            留空使用默认地址
                        </span>
                    </label>
                    <input
                        type="text"
                        value={draft.baseUrl ?? ''}
                        onChange={e => setDraft({ ...draft, baseUrl: e.target.value })}
                        placeholder={urlPlaceholder}
                    />
                </div>

                {/* Model */}
                <div className="ai-config-field">
                    <label>
                        模型
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400 }}>
                            留空使用默认模型
                        </span>
                    </label>
                    <input
                        type="text"
                        value={draft.model ?? ''}
                        onChange={e => setDraft({ ...draft, model: e.target.value })}
                        placeholder={modelPlaceholder}
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                    />
                </div>

                <div className="ai-config-btns">
                    <button className="cancel" onClick={onClose}>取消</button>
                    <button
                        className="save"
                        onClick={handleSave}
                        disabled={!draft.apiKey.trim()}
                        style={{ opacity: draft.apiKey.trim() ? 1 : 0.5, cursor: draft.apiKey.trim() ? 'pointer' : 'not-allowed' }}
                    >
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AiConfigPanel;
