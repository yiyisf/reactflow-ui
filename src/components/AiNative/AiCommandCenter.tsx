/**
 * AiCommandCenter — AI 对话命令中心 (主交互区)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import useAiStore from '../../store/aiStore';
import { streamChat } from '../../services/ai/protocolAdapter';
import { TOOL_DEFINITIONS } from '../../services/ai/toolDefs';
import { previewToolCall } from '../../services/ai/toolExecutor';
import { buildSystemPrompt } from '../../services/ai/systemPrompt';
import type { Message } from '../../services/ai/protocolAdapter';

interface AiCommandCenterProps {
    systemPromptExtra?: string;
    onShowConfig: () => void;
}

/** Lightweight markdown renderer */
const renderMarkdown = (content: string): React.ReactNode => {
    const parts = content.split(/(```[\s\S]*?```)/);
    return parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
            const inner = part.slice(3, -3);
            const nlIdx = inner.indexOf('\n');
            const code = nlIdx >= 0 ? inner.slice(nlIdx + 1) : inner;
            return <pre key={i}><code>{code}</code></pre>;
        }
        // Inline: bold, code, newlines
        const tokens: React.ReactNode[] = [];
        const re = /(\*\*[^*]+\*\*|`[^`]+`|\n)/g;
        let last = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(part)) !== null) {
            if (match.index > last) tokens.push(part.slice(last, match.index));
            const m = match[0];
            if (m.startsWith('**')) tokens.push(<strong key={`${i}-${match.index}`}>{m.slice(2, -2)}</strong>);
            else if (m.startsWith('`')) tokens.push(<code key={`${i}-${match.index}`}>{m.slice(1, -1)}</code>);
            else tokens.push(<br key={`${i}-${match.index}`} />);
            last = match.index + m.length;
        }
        if (last < part.length) tokens.push(part.slice(last));
        return <span key={i}>{tokens}</span>;
    });
};

const AiCommandCenter: React.FC<AiCommandCenterProps> = ({ systemPromptExtra, onShowConfig }) => {
    const {
        messages,
        isStreaming,
        streamingText,
        config,
        addMessage,
        setStreaming,
        setStreamingText,
        appendStreamingText,
        clearMessages,
        addPendingOps,
    } = useAiStore();

    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingText]);

    // Cleanup
    useEffect(() => {
        return () => { abortRef.current?.abort(); };
    }, []);

    const autoResize = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    };

    // Build chat history for API
    const buildHistory = useCallback((userInput: string): Message[] => {
        const systemContent = buildSystemPrompt(userInput, systemPromptExtra);
        const history: Message[] = [{ role: 'system', content: systemContent }];

        // Add conversation history (last 20 messages max to limit tokens)
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
    }, [messages, systemPromptExtra]);

    const handleSend = async () => {
        const text = inputValue.trim();
        if (!text || isStreaming) return;

        // Abort previous
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        // Add user message
        addMessage({ role: 'user', content: text });
        setInputValue('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        setStreaming(true);
        setStreamingText('');

        // Check if API key is configured
        if (!config.apiKey) {
            addMessage({
                role: 'assistant',
                content: '⚠️ 未配置 API Key。请点击右上角 ⚙️ 按钮配置 AI 服务后重试。',
            });
            setStreaming(false);
            return;
        }

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

                    case 'done':
                        break;
                }
            }

            // Process tool calls → pending operations
            if (toolCalls.length > 0) {
                const ops = toolCalls.map(tc => {
                    const { description } = previewToolCall(tc.name, tc.args);
                    return {
                        toolName: tc.name,
                        toolCallId: tc.id,
                        args: tc.args,
                        description,
                    };
                });

                const opIds = addPendingOps(ops);

                // Append operation summary to text
                if (!fullText) {
                    fullText = '我为你规划了以下操作，请在下方审核栏中确认：';
                }

                addMessage({
                    role: 'assistant',
                    content: fullText,
                    pendingOpIds: opIds,
                });
            } else if (fullText) {
                addMessage({ role: 'assistant', content: fullText });
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                addMessage({
                    role: 'assistant',
                    content: `❌ AI 服务错误: ${err.message}`,
                });
            }
        } finally {
            setStreaming(false);
            setStreamingText('');
        }
    };

    const handleStop = () => {
        abortRef.current?.abort();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <>
            {/* Header */}
            <div className="ai-cc-header">
                <div className="ai-cc-title">
                    <span className="ai-cc-title-icon">✨</span>
                    AI 工作流助手
                </div>
                <div className="ai-cc-actions">
                    <button onClick={onShowConfig} title="配置">⚙️</button>
                    <button onClick={clearMessages} title="清空对话">🗑️</button>
                </div>
            </div>

            {/* Messages */}
            <div className="ai-cc-messages">
                {messages.map(msg => (
                    <div key={msg.id} className={`ai-cc-msg ${msg.role}`}>
                        {msg.role === 'assistant'
                            ? renderMarkdown(msg.content)
                            : msg.content
                        }
                    </div>
                ))}

                {/* Streaming */}
                {isStreaming && streamingText && (
                    <div className="ai-cc-streaming">
                        {renderMarkdown(streamingText)}
                        <span className="ai-streaming-cursor" />
                    </div>
                )}

                {/* Thinking */}
                {isStreaming && !streamingText && (
                    <div className="ai-cc-thinking">
                        <div className="ai-skeleton-line" style={{ width: '80%' }} />
                        <div className="ai-skeleton-line" style={{ width: '60%' }} />
                        <div className="ai-skeleton-line" style={{ width: '70%' }} />
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
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
                        <button className="ai-cc-send-btn stop" onClick={handleStop} title="停止">
                            ⏹
                        </button>
                    ) : (
                        <button className="ai-cc-send-btn" onClick={handleSend} title="发送">
                            🚀
                        </button>
                    )}
                </div>
            </div>
        </>
    );
};

export default AiCommandCenter;
