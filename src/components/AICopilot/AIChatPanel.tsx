import React, { useState, useRef, useEffect, useCallback } from 'react';
import './AIChatPanel.css';
import DiffCard from './DiffCard';
import MermaidBlock from './MermaidBlock';
import WorkflowRunCard from './WorkflowRunCard';

import useWorkflowStore from '../../store/workflowStore';
import { callAICopilotStream, CONDUCTOR_SYSTEM_PROMPT, ChatMessage, AIServiceConfig } from '../../services/aiService';
import { generateWorkflowSuggestionPrompt } from '../../services/promptTemplates';
import { AIChatMessage } from '../../types/workflow';
import { applyWorkflowDiff, parseDiffFromAIResponse } from '../../utils/workflowDiff';
import { TaskType } from '../../types/conductor';
import { WorkflowInstance } from '../../types/conductor';

interface AIChatPanelProps {
    aiConfig?: Partial<AIServiceConfig>;
    onTriggerExecution?: (
        workflowName: string,
        version: number,
        input: Record<string, any>
    ) => Promise<{ workflowId: string }>;
    onPollExecution?: (workflowId: string) => Promise<WorkflowInstance | null>;
    executionPollInterval?: number;
}

const WELCOME_MESSAGE: AIChatMessage = {
    id: '1',
    role: 'ai',
    content: '你好！我是您的流程助手。我可以帮你生成工作流框架、优化逻辑或提供参数配置建议。你想实现什么样的流程？',
};

/** Parse content into segments: text, code(lang, code), mermaid */
interface TextSegment { kind: 'text'; content: string }
interface CodeSegment { kind: 'code'; lang: string; code: string }
type Segment = TextSegment | CodeSegment;

function parseSegments(content: string): Segment[] {
    const segments: Segment[] = [];
    const re = /```(\w*)\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
        if (m.index > lastIndex) {
            segments.push({ kind: 'text', content: content.slice(lastIndex, m.index) });
        }
        segments.push({ kind: 'code', lang: m[1] ?? '', code: m[2] ?? '' });
        lastIndex = m.index + m[0].length;
    }
    if (lastIndex < content.length) {
        segments.push({ kind: 'text', content: content.slice(lastIndex) });
    }
    return segments;
}

const renderInline = (text: string): React.ReactNode => {
    const tokens: React.ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\n)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        if (match.index > lastIndex) tokens.push(text.slice(lastIndex, match.index));
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
    if (lastIndex < text.length) tokens.push(text.slice(lastIndex));
    return tokens;
};

const renderMessageContent = (content: string): React.ReactNode => {
    const segments = parseSegments(content);
    return segments.map((seg, i) => {
        if (seg.kind === 'code') {
            if (seg.lang === 'mermaid') {
                return <MermaidBlock key={i} code={seg.code} />;
            }
            return (
                <pre key={i} style={{ position: 'relative' }}>
                    {seg.lang && (
                        <span style={{
                            position: 'absolute', top: 4, right: 8,
                            fontSize: 10, color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)', userSelect: 'none',
                        }}>
                            {seg.lang}
                        </span>
                    )}
                    <code>{seg.code}</code>
                </pre>
            );
        }
        return <span key={i}>{renderInline(seg.content)}</span>;
    });
};

/** Quick action chips shown in the header */
const QUICK_ACTIONS = [
    { label: '🗺 业务视图', prompt: '请分析当前工作流并用 Mermaid 流程图展示业务视角的执行流程，使用业务人员能理解的语言，隐藏纯技术节点。' },
    { label: '▶ 发起执行', isRunForm: true },
    { label: '📋 分析工作流', prompt: '请分析当前工作流的设计逻辑，识别潜在风险点并给出优化建议。' },
];

const AIChatPanel: React.FC<AIChatPanelProps> = ({
    aiConfig,
    onTriggerExecution,
    onPollExecution,
    executionPollInterval = 3000,
}) => {
    const {
        workflowDef,
        setWorkflow,
        mode,
        showCanvasDrawer,
        setShowCanvasDrawer,
    } = useWorkflowStore();

    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [messages, setMessages] = useState<AIChatMessage[]>([WELCOME_MESSAGE]);
    const [streamingContent, setStreamingContent] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const handleApplyDiff = useCallback((msg: AIChatMessage) => {
        if (!msg.diff || msg.applied || !workflowDef) return;
        const { next, inverse } = applyWorkflowDiff(workflowDef, msg.diff);
        setWorkflow(next);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, applied: true, inverse } : m));
    }, [workflowDef, setWorkflow]);

    const handleUndoDiff = useCallback((msg: AIChatMessage) => {
        if (!msg.inverse || !msg.applied || !workflowDef) return;
        const { next } = applyWorkflowDiff(workflowDef, msg.inverse);
        setWorkflow(next);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, applied: false, inverse: undefined } : m));
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

    useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

    useEffect(() => {
        const handler = () => { /* panel is always open now */ };
        window.addEventListener('open-ai-chat', handler);
        return () => window.removeEventListener('open-ai-chat', handler);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingContent]);

    const buildChatHistory = useCallback((userInput: string): ChatMessage[] => {
        const history: ChatMessage[] = [
            { role: 'system', content: CONDUCTOR_SYSTEM_PROMPT }
        ];
        for (const msg of messages) {
            if (msg.role === 'user' && msg.content) {
                history.push({ role: 'user', content: msg.content });
            } else if (msg.role === 'ai' && msg.content && !msg.thinking && !msg.cardType) {
                history.push({ role: 'assistant', content: msg.content });
            }
        }
        const prompt = generateWorkflowSuggestionPrompt(userInput, workflowDef);
        history.push({ role: 'user', content: prompt });
        return history;
    }, [messages, workflowDef]);

    const showRunForm = useCallback(() => {
        const runCard: AIChatMessage = {
            id: Date.now().toString(),
            role: 'ai',
            cardType: 'run_card',
        };
        setMessages(prev => [...prev, runCard]);
    }, []);

    const handleSend = async (retryContent?: string) => {
        const text = retryContent || inputValue.trim();
        if (!text || isLoading) return;

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
                    const demoWorkflow = {
                        name: 'demo_approval_workflow',
                        description: '演示审批流程',
                        tasks: [
                            { name: 'submit_request', taskReferenceName: 'submit_request', type: 'SIMPLE' as TaskType, inputParameters: {} },
                            { name: 'human_approval', taskReferenceName: 'human_approval', type: 'HUMAN' as TaskType, inputParameters: {} },
                            { name: 'process_result', taskReferenceName: 'process_result', type: 'SIMPLE' as TaskType, inputParameters: {} },
                        ],
                    };
                    const aiMsg: AIChatMessage = {
                        id: (Date.now() + 1).toString(),
                        role: 'ai',
                        content: '**演示模式**：未检测到 API Key，以下是一个示例审批流程供体验。请在标题栏 🤖 按钮中配置真实 API Key 以启用 AI 功能。',
                        diff: {
                            kind: 'replace',
                            summary: '生成三步审批流程（演示）',
                            rows: [
                                { kind: 'add', desc: 'submit_request — 提交申请任务' },
                                { kind: 'add', desc: 'human_approval — 人工审批任务' },
                                { kind: 'add', desc: 'process_result — 处理审批结果' },
                            ],
                            payload: demoWorkflow,
                        },
                    };
                    setMessages(prev => [...prev, aiMsg]);
                    setIsLoading(false);
                }, 800);
                return;
            }

            const apiConfig: Record<string, string> = { apiKey };
            if (baseUrl) apiConfig.baseUrl = baseUrl;
            if (model) apiConfig.model = model;

            const chatHistory = buildChatHistory(text);

            const fullResponse = await callAICopilotStream(
                chatHistory,
                apiConfig,
                (token) => { setStreamingContent(prev => prev + token); },
                () => { /* done */ },
                controller.signal
            );

            // Check if AI wants to show run form
            if (fullResponse.includes('%%SHOW_RUN_FORM%%') || fullResponse.toLowerCase().includes('show_run_form')) {
                const cleanedResponse = fullResponse.replace(/%%SHOW_RUN_FORM%%/g, '').trim();
                if (cleanedResponse) {
                    setMessages(prev => [...prev, {
                        id: (Date.now() + 1).toString(),
                        role: 'ai',
                        content: cleanedResponse,
                    }]);
                }
                showRunForm();
                setStreamingContent('');
                return;
            }

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
                setStreamingContent(prev => {
                    if (prev) {
                        setMessages(p => [...p, {
                            id: (Date.now() + 1).toString(),
                            role: 'ai',
                            content: prev,
                        }]);
                    }
                    return '';
                });
            } else {
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'ai',
                    content: `抱歉，目前无法连接到 AI 服务: ${err.message}`,
                }]);
                setStreamingContent('');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleStop = () => { abortRef.current?.abort(); };

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

    const handleQuickAction = (action: typeof QUICK_ACTIONS[number]) => {
        if (action.isRunForm) {
            showRunForm();
        } else if (action.prompt) {
            handleSend(action.prompt);
        }
    };

    // Only render in edit mode
    if (mode !== 'edit') return null;

    return (
        <div className="ai-chat-panel-primary">
            {/* Header */}
            <div className="ai-header">
                <div className="ai-title">
                    <span className="ai-sparkles">✨</span>
                    AI 助手
                    {workflowDef && (
                        <span style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            fontWeight: 400,
                            marginLeft: 6,
                            maxWidth: 120,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {workflowDef.name}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {/* Canvas drawer toggle */}
                    <button
                        className={`ai-canvas-btn${showCanvasDrawer ? ' active' : ''}`}
                        onClick={() => setShowCanvasDrawer(!showCanvasDrawer)}
                        title={showCanvasDrawer ? '关闭画布' : '查看画布'}
                    >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="1" y="3" width="14" height="10" rx="1.5" />
                            <line x1="9" y1="3" x2="9" y2="13" />
                            <circle cx="11.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                            <circle cx="11.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
                        </svg>
                        {showCanvasDrawer ? '关闭画布' : '查看画布'}
                    </button>
                    <button className="ai-close" onClick={handleClear} title="清空对话">🗑</button>
                </div>
            </div>

            {/* Quick action chips */}
            {workflowDef && (
                <div style={{
                    display: 'flex',
                    gap: 6,
                    padding: '6px 14px',
                    borderBottom: '1px solid var(--border-primary)',
                    flexWrap: 'wrap',
                    background: 'rgba(0,0,0,0.04)',
                }}>
                    {QUICK_ACTIONS.map(action => (
                        <button
                            key={action.label}
                            onClick={() => handleQuickAction(action)}
                            disabled={isLoading}
                            style={{
                                padding: '3px 10px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-strong)',
                                borderRadius: 20,
                                color: 'var(--text-secondary)',
                                fontSize: 11,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                transition: 'all 0.15s',
                                whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'var(--bg-tertiary)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'var(--bg-secondary)';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Messages */}
            <div className="ai-messages">
                {messages.map(msg => {
                    if (msg.cardType === 'run_card') {
                        return (
                            <div key={msg.id} className="message ai" style={{ padding: '6px 4px', background: 'transparent', border: 'none' }}>
                                <WorkflowRunCard
                                    onTriggerExecution={onTriggerExecution}
                                    onPollExecution={onPollExecution}
                                    executionPollInterval={executionPollInterval}
                                />
                            </div>
                        );
                    }

                    return (
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
                            {msg.role === 'ai' && msg.content && !msg.cardType && (
                                <button
                                    className="copy-btn"
                                    onClick={() => handleCopy(msg)}
                                    title="复制"
                                >
                                    {copiedId === msg.id ? '✓' : '📋'}
                                </button>
                            )}
                        </div>
                    );
                })}

                {isLoading && streamingContent && (
                    <div className="message ai" style={{ opacity: 0.9 }}>
                        <div className="message-content">
                            {renderMessageContent(streamingContent)}
                        </div>
                        <span className="streaming-cursor">▊</span>
                    </div>
                )}
                {isLoading && !streamingContent && (
                    <div className="message ai thinking-skeleton">
                        <div className="skeleton-line" style={{ width: '80%' }} />
                        <div className="skeleton-line" style={{ width: '60%' }} />
                        <div className="skeleton-line" style={{ width: '70%' }} />
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="ai-input-area">
                <div className="ai-input-container">
                    <textarea
                        ref={textareaRef}
                        className="ai-input"
                        placeholder={isLoading ? 'AI 正在响应...' : '描述您的需求…（Shift+Enter 换行）'}
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onInput={autoResize}
                        onKeyDown={handleKeyPress}
                        disabled={isLoading}
                        rows={2}
                    />
                    {isLoading ? (
                        <button className="ai-send stop" onClick={handleStop} title="停止生成">⏹</button>
                    ) : (
                        <button className="ai-send" onClick={() => handleSend()} title="发送">🚀</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AIChatPanel;
