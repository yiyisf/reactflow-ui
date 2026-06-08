/**
 * AiCommandCenter — AI chat panel (left side of AiWorkflowIDE)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import useAiStore from '../../store/aiStore';
import useWorkflowStore from '../../store/workflowStore';
import { streamChat } from '../../services/ai/protocolAdapter';
import { TOOL_DEFINITIONS } from '../../services/ai/toolDefs';
import { executeToolCall, describeDiff } from '../../services/ai/toolExecutor';
import { buildSystemPrompt } from '../../services/ai/systemPrompt';
import type { Message } from '../../services/ai/protocolAdapter';

interface AiCommandCenterProps {
    /** Completely replaces the built-in base prompt (advanced customization) */
    systemPrompt?: string;
    /** Appends extra context to the base prompt (e.g. team conventions) */
    systemPromptExtra?: string;
    /** Whether to show the in-app AI config button */
    showConfigButton?: boolean;
    onShowConfig: () => void;
}

const renderMarkdown = (content: string): React.ReactNode => {
    const parts = content.split(/(```[\s\S]*?```)/);
    return parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
            const inner = part.slice(3, -3);
            const nlIdx = inner.indexOf('\n');
            const code = nlIdx >= 0 ? inner.slice(nlIdx + 1) : inner;
            return <pre key={i} style={{ margin: '8px 0', padding: '8px', background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 12, overflow: 'auto' }}><code>{code}</code></pre>;
        }
        const tokens: React.ReactNode[] = [];
        const re = /(\*\*[^*]+\*\*|`[^`]+`|\n)/g;
        let last = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(part)) !== null) {
            if (match.index > last) tokens.push(part.slice(last, match.index));
            const m = match[0];
            if (m.startsWith('**')) tokens.push(<strong key={`${i}-${match.index}`}>{m.slice(2, -2)}</strong>);
            else if (m.startsWith('`')) tokens.push(<code key={`${i}-${match.index}`} style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3, fontSize: '0.9em' }}>{m.slice(1, -1)}</code>);
            else tokens.push(<br key={`${i}-${match.index}`} />);
            last = match.index + m.length;
        }
        if (last < part.length) tokens.push(part.slice(last));
        return <span key={i}>{tokens}</span>;
    });
};

const AiCommandCenter: React.FC<AiCommandCenterProps> = ({
    systemPrompt,
    systemPromptExtra,
    showConfigButton = true,
    onShowConfig,
}) => {
    const {
        messages,
        isStreaming,
        streamingText,
        config,
        addMessage,
        updateMessage,
        setStreaming,
        setStreamingText,
        appendStreamingText,
        clearMessages,
        setProposal,
    } = useAiStore();

    const workflowDef = useWorkflowStore(s => s.workflowDef);

    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingText]);

    useEffect(() => {
        return () => { abortRef.current?.abort(); };
    }, []);

    const autoResize = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    };

    const buildHistory = useCallback((userInput: string): Message[] => {
        const systemContent = buildSystemPrompt(userInput, { systemPrompt, systemPromptExtra });
        const history: Message[] = [{ role: 'system', content: systemContent }];
        const recent = messages.slice(-20);
        for (const msg of recent) {
            if (msg.id === 'welcome') continue;
            history.push({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content,
            });
        }
        history.push({ role: 'user', content: userInput });
        return history;
    }, [messages, systemPrompt, systemPromptExtra]);

    const handleSend = async () => {
        const text = inputValue.trim();
        if (!text || isStreaming) return;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        addMessage({ role: 'user', content: text });
        setInputValue('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        setStreaming(true);
        setStreamingText('');

        if (!config.apiKey) {
            addMessage({
                role: 'assistant',
                content: '⚠️ 未配置 API Key。请点击右上角 ⚙️ 按钮配置 AI 服务后重试。',
            });
            setStreaming(false);
            return;
        }

        // Add placeholder message for streaming
        const assistantMsgId = addMessage({ role: 'assistant', content: '' });

        try {
            const history = buildHistory(text);
            let fullText = '';
            const toolCalls: Array<{ id: string; name: string; args: Record<string, any> }> = [];

            for await (const event of streamChat(history, TOOL_DEFINITIONS, config, controller.signal)) {
                if (controller.signal.aborted) break;
                switch (event.type) {
                    case 'text':
                        fullText += event.content;
                        appendStreamingText(event.content);
                        break;
                    case 'tool_call':
                        toolCalls.push({ id: event.id, name: event.name, args: event.args });
                        break;
                    case 'error':
                        fullText += `\n\n❌ ${event.message}`;
                        break;
                }
            }

            // Process tool calls
            const infoLines: string[] = [];
            let hasProposal = false;

            for (const tc of toolCalls) {
                const result = executeToolCall(tc.name, tc.args);
                if (result.type === 'propose' && result.proposed && result.diff) {
                    const msgId = setProposal({
                        proposedDef: result.proposed,
                        diff: result.diff,
                        inferredLevel: result.inferredLevel,
                        messageId: assistantMsgId,
                    });
                    const changeDesc = describeDiff(result.diff);
                    infoLines.push(`\n\n---\n✅ **已生成变更方案**：${changeDesc}\n请在下方审核栏中确认或拒绝。`);
                    hasProposal = true;
                    void msgId;
                } else if (result.type === 'info' && result.text) {
                    infoLines.push(`\n\n${result.text}`);
                } else if (result.type === 'error' && result.text) {
                    infoLines.push(`\n\n❌ ${result.text}`);
                }
            }

            if (!fullText && !hasProposal && infoLines.length === 0) {
                fullText = '收到，已处理。';
            }

            const finalContent = (fullText + infoLines.join('')).trim();
            updateMessage(assistantMsgId, finalContent);

        } catch (err: any) {
            if (err.name !== 'AbortError') {
                updateMessage(assistantMsgId, `❌ AI 服务错误: ${err.message}`);
            } else {
                const current = messages.find(m => m.id === assistantMsgId);
                if (!current?.content) {
                    updateMessage(assistantMsgId, '（已中止）');
                }
            }
        } finally {
            setStreaming(false);
            setStreamingText('');
        }
    };

    const handleStop = () => { abortRef.current?.abort(); };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <>
            <div className="ai-cc-header">
                <div className="ai-cc-title">
                    <span className="ai-cc-title-icon">✨</span>
                    AI 工作流助手
                    {workflowDef && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
                            · {workflowDef.name}
                        </span>
                    )}
                </div>
                <div className="ai-cc-actions">
                    {showConfigButton && (
                        <button onClick={onShowConfig} title="配置 AI 服务">⚙️</button>
                    )}
                    <button onClick={clearMessages} title="清空对话">🗑️</button>
                </div>
            </div>

            <div className="ai-cc-messages">
                {messages.map(msg => (
                    <div key={msg.id} className={`ai-cc-msg ${msg.role}`}>
                        {msg.role === 'assistant'
                            ? renderMarkdown(msg.content)
                            : msg.content
                        }
                    </div>
                ))}

                {isStreaming && streamingText && (
                    <div className="ai-cc-streaming">
                        {renderMarkdown(streamingText)}
                        <span className="ai-streaming-cursor" />
                    </div>
                )}

                {isStreaming && !streamingText && (
                    <div className="ai-cc-thinking">
                        <div className="ai-skeleton-line" style={{ width: '80%' }} />
                        <div className="ai-skeleton-line" style={{ width: '60%' }} />
                        <div className="ai-skeleton-line" style={{ width: '70%' }} />
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="ai-cc-input-area">
                <div className="ai-cc-input-container">
                    <textarea
                        ref={textareaRef}
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onInput={autoResize}
                        onKeyDown={handleKeyDown}
                        placeholder={isStreaming ? 'AI 正在思考...' : '描述你想要的工作流...（Shift+Enter 换行）'}
                        disabled={isStreaming}
                        rows={1}
                    />
                    {isStreaming ? (
                        <button className="ai-cc-send-btn stop" onClick={handleStop} title="停止">⏹</button>
                    ) : (
                        <button className="ai-cc-send-btn" onClick={handleSend} title="发送（Enter）">🚀</button>
                    )}
                </div>
            </div>
        </>
    );
};

export default AiCommandCenter;
