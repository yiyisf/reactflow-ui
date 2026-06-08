/**
 * AiCommandCenter — AI chat panel (left side of AiWorkflowIDE)
 *
 * Tabs: 对话 | 工作流库
 * Features: welcome chips, API-key onboarding, pending-proposal guard,
 *           streaming messages, tool-call pipeline.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import useAiStore from '../../store/aiStore';
import useWorkflowStore from '../../store/workflowStore';
import useLibraryStore from '../../store/libraryStore';
import { streamChat } from '../../services/ai/protocolAdapter';
import { TOOL_DEFINITIONS } from '../../services/ai/toolDefs';
import { executeToolCall, describeDiff } from '../../services/ai/toolExecutor';
import { buildSystemPrompt } from '../../services/ai/systemPrompt';
import LibraryPanel from './LibraryPanel';
import type { Message } from '../../services/ai/protocolAdapter';

interface AiCommandCenterProps {
    systemPrompt?: string;
    systemPromptExtra?: string;
    showConfigButton?: boolean;
    onShowConfig: () => void;
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

const renderMarkdown = (content: string): React.ReactNode => {
    const parts = content.split(/(```[\s\S]*?```)/);
    return parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
            const inner = part.slice(3, -3);
            const nlIdx = inner.indexOf('\n');
            const code = nlIdx >= 0 ? inner.slice(nlIdx + 1) : inner;
            return <pre key={i} style={{ margin: '8px 0', padding: '8px', background: 'var(--bg-primary)', borderRadius: 6, fontSize: 12, overflow: 'auto', border: '1px solid var(--border-primary)' }}><code>{code}</code></pre>;
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

// ─── Welcome chips logic ──────────────────────────────────────────────────────

function buildWelcomeChips(
    hasWorkflow: boolean,
    libraryItems: { workflowLevel: string; description: string }[],
): string[] {
    if (!hasWorkflow) {
        const l2 = libraryItems.filter(i => i.workflowLevel === 'L2').slice(0, 2);
        if (l2.length > 0) {
            return [
                `帮我创建一个使用「${l2[0].description}」的工作流`,
                ...(l2[1] ? [`组合「${l2[1].description}」和审批步骤成一个完整流程`] : []),
                '从零创建一个用户注册通知流程',
                '设计一个 CI/CD 部署流水线',
            ].slice(0, 4);
        }
        return [
            '创建一个订单审批流程',
            '设计一个 CI/CD 部署流水线',
            '创建一个用户注册通知流程',
            '帮我搭建一个数据同步工作流',
        ];
    }
    return [
        '解读一下当前工作流的业务逻辑',
        '检查并修复当前工作流的问题',
        '为当前流程添加失败重试机制',
        '把当前流程改成并行执行',
    ];
}

// ─── Component ────────────────────────────────────────────────────────────────

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
        pendingProposal,
        addMessage,
        updateMessage,
        setStreaming,
        setStreamingText,
        appendStreamingText,
        clearMessages,
        setProposal,
        recordReject,
    } = useAiStore();

    const workflowDef = useWorkflowStore(s => s.workflowDef);
    const libraryItems = useLibraryStore(s => s.items);

    const [inputValue, setInputValue] = useState('');
    const [activeTab, setActiveTab] = useState<'chat' | 'library'>('chat');
    const [toolStatus, setToolStatus] = useState<string>(''); // e.g. "正在搜索工作流库…"
    // Pending proposal guard: stores the blocked message text
    const [guardBlocked, setGuardBlocked] = useState<string | null>(null);

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

    const handleSendText = useCallback(async (text: string) => {
        if (!text.trim() || isStreaming) return;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        addMessage({ role: 'user', content: text });
        setInputValue('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        setStreaming(true);
        setStreamingText('');
        setToolStatus('');

        if (!config.apiKey) {
            addMessage({
                role: 'assistant',
                content: '⚠️ 未配置 API Key。请点击上方 ⚙️ 按钮配置 AI 服务后重试。',
            });
            setStreaming(false);
            return;
        }

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

            // Process tool calls sequentially
            const infoLines: string[] = [];
            let hasProposal = false;

            for (const tc of toolCalls) {
                const statusMap: Record<string, string> = {
                    get_workflow_state: '正在读取工作流状态…',
                    search_workflow_library: '正在搜索工作流库…',
                    validate_workflow: '正在校验工作流…',
                    replace_workflow: '正在生成新工作流…',
                    patch_workflow: '正在应用变更…',
                };
                setToolStatus(statusMap[tc.name] ?? `执行 ${tc.name}…`);

                const result = await Promise.resolve(executeToolCall(tc.name, tc.args));

                if (result.type === 'propose' && result.proposed && result.diff) {
                    setProposal({
                        proposedDef: result.proposed,
                        diff: result.diff,
                        inferredLevel: result.inferredLevel,
                        messageId: assistantMsgId,
                    });
                    const changeDesc = describeDiff(result.diff);
                    const levelNote = result.inferredLevel ? ` · ${result.inferredLevel}` : '';
                    infoLines.push(`\n\n---\n✅ **已生成变更方案${levelNote}**：${changeDesc}\n请在下方审核栏中确认或拒绝。`);
                    hasProposal = true;
                } else if (result.type === 'info' && result.text) {
                    infoLines.push(`\n\n${result.text}`);
                } else if (result.type === 'error' && result.text) {
                    infoLines.push(`\n\n❌ ${result.text}`);
                }
            }

            setToolStatus('');

            if (!fullText && !hasProposal && infoLines.length === 0) {
                fullText = '收到，已处理。';
            }

            const finalContent = (fullText + infoLines.join('')).trim();
            updateMessage(assistantMsgId, finalContent);

        } catch (err: any) {
            setToolStatus('');
            if (err.name !== 'AbortError') {
                updateMessage(assistantMsgId, `❌ AI 服务错误: ${err.message}`);
            } else {
                // Read from store directly to avoid stale closure snapshot
                const cur = useAiStore.getState().messages.find(m => m.id === assistantMsgId);
                if (!cur?.content) updateMessage(assistantMsgId, '（已中止）');
            }
        } finally {
            setStreaming(false);
            setStreamingText('');
            setToolStatus('');
        }
    }, [isStreaming, config, buildHistory]);

    const handleSend = useCallback(() => {
        const text = inputValue.trim();
        if (!text) return;
        // A3: Pending Proposal Guard
        if (pendingProposal) {
            setGuardBlocked(text);
            return;
        }
        handleSendText(text);
    }, [inputValue, pendingProposal, handleSendText]);

    const handleChipClick = useCallback((chip: string) => {
        if (pendingProposal) {
            setGuardBlocked(chip);
            return;
        }
        handleSendText(chip);
    }, [pendingProposal, handleSendText]);

    const handleStop = () => { abortRef.current?.abort(); };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Guard confirm: discard proposal and send the blocked message
    const handleGuardConfirm = useCallback(() => {
        const blocked = guardBlocked;
        setGuardBlocked(null);
        recordReject();
        if (blocked) handleSendText(blocked);
    }, [guardBlocked, recordReject, handleSendText]);

    const welcomeChips = buildWelcomeChips(!!workflowDef, libraryItems);
    const hasLibrary = libraryItems.length > 0;
    const noApiKey = !config.apiKey && showConfigButton;

    return (
        <>
            {/* Tab bar */}
            <div className="ai-panel-tabs">
                <button
                    className={`ai-panel-tab ${activeTab === 'chat' ? 'active' : ''}`}
                    onClick={() => setActiveTab('chat')}
                >
                    💬 对话
                </button>
                {hasLibrary && (
                    <button
                        className={`ai-panel-tab ${activeTab === 'library' ? 'active' : ''}`}
                        onClick={() => setActiveTab('library')}
                    >
                        📚 工作流库
                        <span className="ai-panel-tab-count">{libraryItems.length}</span>
                    </button>
                )}
            </div>

            {/* Library panel */}
            {activeTab === 'library' && <LibraryPanel />}

            {/* Chat panel */}
            {activeTab === 'chat' && (
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
                        {/* A1: Onboarding card when no API key */}
                        {noApiKey && (
                            <div className="ai-onboarding-card">
                                <div className="ai-onboarding-icon">🤖</div>
                                <div className="ai-onboarding-title">配置 AI 服务，开始使用</div>
                                <div className="ai-onboarding-desc">
                                    只需填写 API Key，即可用自然语言创建和编辑工作流。支持 OpenAI、Anthropic、DeepSeek、Groq 等主流服务。
                                </div>
                                <button className="ai-onboarding-btn" onClick={onShowConfig}>
                                    ⚙️ 立即配置
                                </button>
                            </div>
                        )}

                        {/* Messages */}
                        {messages.map(msg => (
                            <React.Fragment key={msg.id}>
                                <div className={`ai-cc-msg ${msg.role}`}>
                                    {msg.role === 'assistant'
                                        ? renderMarkdown(msg.content)
                                        : msg.content
                                    }
                                </div>
                                {/* A2: Welcome chips below the welcome message */}
                                {msg.id === 'welcome' && (
                                    <div className="ai-welcome-chips">
                                        {welcomeChips.map(chip => (
                                            <button
                                                key={chip}
                                                className="ai-welcome-chip"
                                                onClick={() => handleChipClick(chip)}
                                                disabled={isStreaming}
                                            >
                                                {chip}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </React.Fragment>
                        ))}

                        {/* Tool call status */}
                        {isStreaming && toolStatus && (
                            <div className="ai-tool-status">
                                <span className="ai-tool-spinner" />
                                {toolStatus}
                            </div>
                        )}

                        {/* Streaming text */}
                        {isStreaming && streamingText && (
                            <div className="ai-cc-streaming">
                                {renderMarkdown(streamingText)}
                                <span className="ai-streaming-cursor" />
                            </div>
                        )}

                        {/* Thinking skeleton */}
                        {isStreaming && !streamingText && !toolStatus && (
                            <div className="ai-cc-thinking">
                                <div className="ai-skeleton-line" style={{ width: '80%' }} />
                                <div className="ai-skeleton-line" style={{ width: '60%' }} />
                                <div className="ai-skeleton-line" style={{ width: '70%' }} />
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* A3: Pending Proposal Guard dialog */}
                    {guardBlocked && (
                        <div className="ai-guard-overlay">
                            <div className="ai-guard-dialog">
                                <div className="ai-guard-icon">⚠️</div>
                                <div className="ai-guard-title">有未审核的变更方案</div>
                                <div className="ai-guard-desc">
                                    发送新消息将放弃当前 AI 提案，画布不会有任何变更。
                                </div>
                                <div className="ai-guard-actions">
                                    <button className="ai-guard-btn secondary" onClick={() => setGuardBlocked(null)}>
                                        先去审核
                                    </button>
                                    <button className="ai-guard-btn primary" onClick={handleGuardConfirm}>
                                        放弃方案，继续发送
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

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
            )}
        </>
    );
};

export default AiCommandCenter;
