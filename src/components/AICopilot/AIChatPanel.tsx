import React, { useState, useRef, useEffect, useCallback } from 'react';
import './AIChatPanel.css';
import DiffCard from './DiffCard';

import useWorkflowStore from '../../store/workflowStore';
import { callAICopilotStream, CONDUCTOR_SYSTEM_PROMPT, ChatMessage, AIServiceConfig } from '../../services/aiService';
import { generateWorkflowSuggestionPrompt } from '../../services/promptTemplates';
import { AIChatMessage } from '../../types/workflow';
import { applyWorkflowDiff, parseDiffFromAIResponse } from '../../utils/workflowDiff';

interface AIChatPanelProps {
    aiConfig?: Partial<AIServiceConfig>;
}

const WELCOME_MESSAGE: AIChatMessage = {
    id: '1',
    role: 'ai',
    content: '你好！我是您的流程助手。我可以帮你生成工作流框架、优化逻辑或提供参数配置建议。你想实现什么样的流程？',
};

/** Lightweight markdown renderer — no external deps */
const renderMessageContent = (content: string): React.ReactNode => {
    // Split by code blocks first
    const parts = content.split(/(```[\s\S]*?```)/);
    return parts.map((part, i) => {
        // Code block
        if (part.startsWith('```') && part.endsWith('```')) {
            const inner = part.slice(3, -3);
            const newlineIdx = inner.indexOf('\n');
            const code = newlineIdx >= 0 ? inner.slice(newlineIdx + 1) : inner;
            return <pre key={i}><code>{code}</code></pre>;
        }
        // Inline formatting
        return <span key={i}>{renderInline(part)}</span>;
    });
};

const renderInline = (text: string): React.ReactNode => {
    // Process bold, inline code, and newlines
    const tokens: React.ReactNode[] = [];
    // Split by **bold** and `inline code`
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\n)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
        if (match.index > lastIndex) {
            tokens.push(text.slice(lastIndex, match.index));
        }
        const m = match[0];
        if (m.startsWith('**') && m.endsWith('**')) {
            tokens.push(<strong key={match.index}>{m.slice(2, -2)}</strong>);
        } else if (m.startsWith('`') && m.endsWith('`')) {
            tokens.push(<code key={match.index}>{m.slice(1, -1)}</code>);
        } else if (m === '\n') {
            tokens.push(<br key={match.index} />);
        }
        lastIndex = match.index + m.length;
    }
    if (lastIndex < text.length) {
        tokens.push(text.slice(lastIndex));
    }
    return tokens;
};

const AIChatPanel: React.FC<AIChatPanelProps> = ({ aiConfig }) => {
    const { workflowDef, setWorkflow } = useWorkflowStore();
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [messages, setMessages] = useState<AIChatMessage[]>([WELCOME_MESSAGE]);
    const [streamingContent, setStreamingContent] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // ─── Diff apply / undo ────────────────────────────────────────────────
    const handleApplyDiff = useCallback((msg: AIChatMessage) => {
        if (!msg.diff || msg.applied || !workflowDef) return;
        const { next, inverse } = applyWorkflowDiff(workflowDef, msg.diff);
        setWorkflow(next);
        setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...m, applied: true, inverse } : m)),
        );
    }, [workflowDef, setWorkflow]);

    const handleUndoDiff = useCallback((msg: AIChatMessage) => {
        if (!msg.inverse || !msg.applied || !workflowDef) return;
        const { next } = applyWorkflowDiff(workflowDef, msg.inverse);
        setWorkflow(next);
        setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...m, applied: false, inverse: undefined } : m)),
        );
    }, [workflowDef, setWorkflow]);

    const autoResize = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    };

    const resetTextareaHeight = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
    };

    // Cleanup abort on unmount
    useEffect(() => {
        return () => { abortRef.current?.abort(); };
    }, []);

    // 监听外部事件打开面板
    useEffect(() => {
        const handler = () => setIsOpen(true);
        window.addEventListener('open-ai-chat', handler);
        return () => window.removeEventListener('open-ai-chat', handler);
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen, streamingContent]);

    // 构建多轮对话的完整消息历史
    const buildChatHistory = useCallback((userInput: string): ChatMessage[] => {
        const history: ChatMessage[] = [
            { role: 'system', content: CONDUCTOR_SYSTEM_PROMPT }
        ];

        for (const msg of messages) {
            if (msg.role === 'user' && msg.content) {
                history.push({ role: 'user', content: msg.content });
            } else if (msg.role === 'ai' && msg.content && !msg.thinking) {
                history.push({ role: 'assistant', content: msg.content });
            }
        }

        const prompt = generateWorkflowSuggestionPrompt(userInput, workflowDef);
        history.push({ role: 'user', content: prompt });

        return history;
    }, [messages, workflowDef]);

    const handleSend = async (retryContent?: string) => {
        const text = retryContent || inputValue.trim();
        if (!text || isLoading) return;

        // Abort previous request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const userMsg: AIChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
        };

        if (!retryContent) {
            setMessages(prev => [...prev, userMsg]);
            setInputValue('');
            resetTextareaHeight();
        }
        setIsLoading(true);
        setStreamingContent('');

        try {
            const apiKey = aiConfig?.apiKey || localStorage.getItem('AI_API_KEY') || '';
            const baseUrl = aiConfig?.baseUrl || localStorage.getItem('AI_BASE_URL') || '';
            const model = aiConfig?.model || localStorage.getItem('AI_MODEL') || '';

            if (!apiKey) {
                setTimeout(() => {
                    if (controller.signal.aborted) return;
                    const aiMsg: AIChatMessage = {
                        id: (Date.now() + 1).toString(),
                        role: 'ai',
                        content: '由于未检测到 API Key，我为您模拟了一个简单的审批流程（仅演示）。请在设置中配置 API Key 以启用真实 AI 能力。',
                    };
                    setMessages(prev => [...prev, aiMsg]);
                    setIsLoading(false);
                }, 1000);
                return;
            }

            const apiConfig: Record<string, string> = { apiKey };
            if (baseUrl) apiConfig.baseUrl = baseUrl;
            if (model) apiConfig.model = model;

            const chatHistory = buildChatHistory(text);

            const fullResponse = await callAICopilotStream(
                chatHistory,
                apiConfig,
                (token) => {
                    setStreamingContent(prev => prev + token);
                },
                () => { /* streaming done */ },
                controller.signal
            );

            // 优先解析 diff-json 块（结构化 diff），否则降级到全量 json 替换
            const diff = parseDiffFromAIResponse(fullResponse);
            let parsedDiff = diff;
            if (!parsedDiff) {
                const jsonMatch = fullResponse.match(/```json\n([\s\S]*?)\n```/);
                if (jsonMatch) {
                    try {
                        const payload = JSON.parse(jsonMatch[1]);
                        parsedDiff = {
                            kind: 'replace',
                            summary: '应用 AI 生成的工作流',
                            rows: [{ kind: 'add', desc: '全量替换为 AI 生成的工作流定义' }],
                            payload,
                        };
                    } catch { /* ignore */ }
                }
            }

            const aiMsg: AIChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: fullResponse,
                diff: parsedDiff ?? undefined,
                applied: false,
            };

            setMessages(prev => [...prev, aiMsg]);
            setStreamingContent('');
        } catch (err: any) {
            if (err.name === 'AbortError') {
                // User stopped generation — save what we have
                setStreamingContent(prev => {
                    if (prev) {
                        const interruptedMsg: AIChatMessage = {
                            id: (Date.now() + 1).toString(),
                            role: 'ai',
                            content: prev,
                        };
                        setMessages(p => [...p, interruptedMsg]);
                    }
                    return '';
                });
            } else {
                const errorMsg: AIChatMessage = {
                    id: Date.now().toString(),
                    role: 'ai',
                    content: `抱歉，目前无法连接到 AI 服务: ${err.message}`,
                };
                setMessages(prev => [...prev, errorMsg]);
                setStreamingContent('');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleStop = () => {
        abortRef.current?.abort();
    };

    const handleClear = () => {
        abortRef.current?.abort();
        setMessages([WELCOME_MESSAGE]);
        setStreamingContent('');
        setIsLoading(false);
    };

    const handleCopy = (msg: AIChatMessage) => {
        navigator.clipboard.writeText(msg.content ?? '');
        setCopiedId(msg.id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (!isOpen) {
        return (
            <div className="ai-chat-panel collapsed" onClick={() => setIsOpen(true)}>
                <div className="ai-header" style={{ borderBottom: 'none' }}>
                    <div className="ai-title">
                        <span className="ai-sparkles">✨</span>
                        AI 助手
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ai-chat-panel">
            <div className="ai-header">
                <div className="ai-title">
                    <span className="ai-sparkles">✨</span>
                    AI 助手
                </div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <button className="ai-close" onClick={handleClear} title="清空对话">🗑</button>
                    <button className="ai-close" onClick={() => setIsOpen(false)}>×</button>
                </div>
            </div>

            <div className="ai-messages">
                {messages.map((msg) => (
                    <div key={msg.id} className={`message ${msg.role}`}>
                        <div className="message-content">
                            {msg.thinking ? (
                                <div className="thinking-skeleton">
                                    <div className="skeleton-line" style={{ width: '80%' }} />
                                    <div className="skeleton-line" style={{ width: '60%' }} />
                                </div>
                            ) : msg.role === 'ai' ? (
                                renderMessageContent(msg.content ?? '')
                            ) : (
                                msg.content
                            )}
                        </div>
                        {msg.diff && !msg.thinking && (
                            <DiffCard
                                diff={msg.diff}
                                applied={msg.applied ?? false}
                                onApply={() => handleApplyDiff(msg)}
                                onUndo={() => handleUndoDiff(msg)}
                            />
                        )}
                        {msg.role === 'ai' && msg.content && (
                            <button
                                className="copy-btn"
                                onClick={() => handleCopy(msg)}
                                title="复制"
                            >
                                {copiedId === msg.id ? '✓' : '📋'}
                            </button>
                        )}
                    </div>
                ))}
                {/* Streaming content */}
                {isLoading && streamingContent && (
                    <div className="message ai" style={{ opacity: 0.9 }}>
                        <div className="message-content">
                            {renderMessageContent(streamingContent)}
                        </div>
                        <span className="streaming-cursor">▊</span>
                    </div>
                )}
                {/* Thinking skeleton */}
                {isLoading && !streamingContent && (
                    <div className="message ai thinking-skeleton">
                        <div className="skeleton-line" style={{ width: '80%' }} />
                        <div className="skeleton-line" style={{ width: '60%' }} />
                        <div className="skeleton-line" style={{ width: '70%' }} />
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="ai-input-area">
                <div className="ai-input-container">
                    <textarea
                        ref={textareaRef}
                        className="ai-input"
                        placeholder={isLoading ? "AI 正在响应..." : "描述您的需求…（Shift+Enter 换行）"}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onInput={autoResize}
                        onKeyDown={handleKeyPress}
                        disabled={isLoading}
                        rows={2}
                    />
                    {isLoading ? (
                        <button className="ai-send stop" onClick={handleStop} title="停止生成">
                            ⏹
                        </button>
                    ) : (
                        <button className="ai-send" onClick={() => handleSend()} title="发送">
                            🚀
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AIChatPanel;
