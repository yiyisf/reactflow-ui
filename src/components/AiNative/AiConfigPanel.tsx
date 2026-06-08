/**
 * AiConfigPanel — AI 服务配置弹窗
 */

import React, { useState, useRef } from 'react';
import useAiStore from '../../store/aiStore';
import { PROVIDER_DEFAULTS, testConnection } from '../../services/ai/protocolAdapter';
import type { AiConfig } from '../../services/ai/protocolAdapter';

interface AiConfigPanelProps {
    onClose: () => void;
}

const PROVIDER_PRESETS = [
    { label: 'OpenAI',       provider: 'openai',    baseUrl: PROVIDER_DEFAULTS.openai.baseUrl,    model: 'gpt-4o' },
    { label: 'Anthropic',    provider: 'anthropic', baseUrl: PROVIDER_DEFAULTS.anthropic.baseUrl, model: PROVIDER_DEFAULTS.anthropic.model },
    { label: 'Mistral',      provider: 'openai',    baseUrl: 'https://api.mistral.ai/v1',          model: 'mistral-large-latest' },
    { label: 'DeepSeek',     provider: 'openai',    baseUrl: 'https://api.deepseek.com/v1',        model: 'deepseek-chat' },
    { label: 'Groq',         provider: 'openai',    baseUrl: 'https://api.groq.com/openai/v1',     model: 'llama-3.3-70b-versatile' },
    { label: 'Together.ai',  provider: 'openai',    baseUrl: 'https://api.together.xyz/v1',        model: 'meta-llama/Llama-3-70b-chat-hf' },
    { label: 'Ollama (本地)', provider: 'openai',   baseUrl: 'http://localhost:11434/v1',           model: 'qwen2.5:72b' },
    { label: '自定义',       provider: 'openai',    baseUrl: '',                                   model: '' },
] as const;

type TestState = 'idle' | 'testing' | 'ok' | 'error';

const AiConfigPanel: React.FC<AiConfigPanelProps> = ({ onClose }) => {
    const { config, setConfig } = useAiStore();

    const [draft, setDraft] = useState<AiConfig>({
        provider: config.provider || 'auto',
        apiKey: config.apiKey || '',
        baseUrl: config.baseUrl || '',
        model: config.model || '',
    });

    const [activePreset, setActivePreset] = useState<string>(() => {
        const match = PROVIDER_PRESETS.find(
            p => p.baseUrl === (config.baseUrl || '') && p.provider === (config.provider || 'auto')
        );
        return match?.label ?? '自定义';
    });

    const [testState, setTestState] = useState<TestState>('idle');
    const [testMessage, setTestMessage] = useState('');
    // Version counter — incremented on each new test; stale completions are discarded
    const testVersionRef = useRef(0);

    const resetTestResult = () => { setTestState('idle'); setTestMessage(''); };

    const handlePreset = (preset: typeof PROVIDER_PRESETS[number]) => {
        setActivePreset(preset.label);
        resetTestResult();
        setDraft(d => ({
            ...d,
            provider: preset.provider,
            baseUrl: preset.baseUrl,
            model: preset.model || d.model,
        }));
    };

    const handleTest = async () => {
        const version = ++testVersionRef.current;
        setTestState('testing');
        setTestMessage('');
        const result = await testConnection(draft);
        // Discard result if a newer test was started while this one was in flight
        if (testVersionRef.current !== version) return;
        setTestState(result.ok ? 'ok' : 'error');
        setTestMessage(result.message);
    };

    const handleSave = () => {
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

    const testColor = testState === 'ok' ? '#10b981' : testState === 'error' ? '#ef4444' : 'var(--text-muted)';

    return (
        <div className="ai-config-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="ai-config-dialog" style={{ width: 440 }}>
                <h3>⚙️ AI 服务配置</h3>

                <div className="ai-config-field">
                    <label>快速选择</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {PROVIDER_PRESETS.map(p => (
                            <button
                                key={p.label}
                                onClick={() => handlePreset(p)}
                                style={{
                                    padding: '4px 10px', borderRadius: 6, border: '1px solid',
                                    borderColor: activePreset === p.label ? 'var(--color-accent)' : 'var(--border-primary)',
                                    background: activePreset === p.label ? 'var(--color-accent-bg, rgba(59,130,246,0.1))' : 'var(--bg-tertiary)',
                                    color: activePreset === p.label ? 'var(--color-accent)' : 'var(--text-secondary)',
                                    cursor: 'pointer', fontSize: 12,
                                    fontWeight: activePreset === p.label ? 600 : 400,
                                    fontFamily: 'inherit', transition: 'all 0.15s',
                                }}
                            >{p.label}</button>
                        ))}
                    </div>
                </div>

                <div style={{
                    padding: '6px 10px', borderRadius: 6, background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 12,
                }}>
                    {resolvedProvider === 'anthropic'
                        ? <>协议: <strong style={{ color: 'var(--text-secondary)' }}>Anthropic Messages API</strong> — 使用 x-api-key 鉴权</>
                        : <>协议: <strong style={{ color: 'var(--text-secondary)' }}>OpenAI Chat Completions API</strong> — 兼容 Mistral、DeepSeek、Groq、Ollama 等</>
                    }
                </div>

                <div className="ai-config-field">
                    <label>API Key <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                        type="password"
                        value={draft.apiKey}
                        onChange={e => { setDraft({ ...draft, apiKey: e.target.value }); resetTestResult(); }}
                        placeholder={resolvedProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                        autoFocus
                    />
                </div>

                <div className="ai-config-field">
                    <label>
                        API Base URL
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400 }}>留空使用默认地址</span>
                    </label>
                    <input
                        type="text"
                        value={draft.baseUrl ?? ''}
                        onChange={e => { setDraft({ ...draft, baseUrl: e.target.value }); resetTestResult(); }}
                        placeholder={urlPlaceholder}
                    />
                </div>

                <div className="ai-config-field">
                    <label>
                        模型
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400 }}>留空使用默认模型</span>
                    </label>
                    <input
                        type="text"
                        value={draft.model ?? ''}
                        onChange={e => setDraft({ ...draft, model: e.target.value })}
                        placeholder={modelPlaceholder}
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                    />
                </div>

                {/* Test connection */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <button
                        onClick={handleTest}
                        disabled={!draft.apiKey.trim() || testState === 'testing'}
                        className="ai-test-btn"
                    >
                        {testState === 'testing' ? '⏳ 测试中…' : '🔌 测试连接'}
                    </button>
                    {testMessage && (
                        <span style={{ fontSize: 12, color: testColor, fontWeight: 500 }}>
                            {testState === 'ok' ? '✓ ' : '✕ '}{testMessage}
                        </span>
                    )}
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
