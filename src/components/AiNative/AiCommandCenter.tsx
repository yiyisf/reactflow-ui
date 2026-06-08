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

// ─── Template gallery ─────────────────────────────────────────────────────────

interface WorkflowTemplate {
    icon: string;
    name: string;
    desc: string;
    prompt: string;
}

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
    { icon: '📦', name: '订单处理', desc: '下单→支付→发货', prompt: '创建一个电商订单处理流程：下单确认、支付验证、库存扣减、发货通知' },
    { icon: '👤', name: '员工审批', desc: '申请→审批→执行', prompt: '创建一个员工申请审批流程：提交申请、直属领导审批、HR审批、结果通知' },
    { icon: '🚀', name: 'CI/CD', desc: '构建→测试→发布', prompt: '创建一个CI/CD部署流水线：代码检出、构建镜像、单元测试、推送镜像、部署发布' },
    { icon: '📧', name: '消息通知', desc: '触发→处理→发送', prompt: '创建一个消息通知工作流：接收事件、处理数据、并行发送邮件和短信通知' },
    { icon: '🔄', name: '数据同步', desc: '读取→转换→写入', prompt: '创建一个数据同步流程：从数据库读取数据、JQ转换格式、写入目标系统、发送完成通知' },
    { icon: '🔍', name: 'AI 内容审核', desc: '提交→AI审→人工', prompt: '创建一个AI辅助内容审核流程：提交内容、AI初审打分、条件分支（分数低则人工复核）、发布或拒绝' },
];

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
        return [];  // template gallery replaces chips when canvas is empty and no library
    }
    return [
        '解读一下当前工作流的业务逻辑',
        '检查并修复当前工作流的问题',
        '为当前流程添加失败重试机制',
        '把当前流程改成并行执行',
    ];
}

// ─── Node context chips ───────────────────────────────────────────────────────

function buildNodeChips(taskRef: string, taskType: string): string[] {
    const base = [
        `解释「${taskRef}」节点的作用`,
        `为「${taskRef}」添加失败重试机制`,
    ];
    if (taskType === 'HTTP') return [...base, `修改「${taskRef}」的请求参数和输出映射`];
    if (taskType === 'HUMAN') return [...base, `调整「${taskRef}」的审批超时和通知方式`];
    if (taskType === 'SUB_WORKFLOW') return [...base, `说明「${taskRef}」子工作流的输入输出`];
    if (taskType === 'SWITCH' || taskType === 'DECISION') return [...base, `为「${taskRef}」增加一个分支条件`];
    if (taskType === 'FORK_JOIN' || taskType === 'FORK_JOIN_DYNAMIC') return [...base, `在「${taskRef}」的并行分支中添加新任务`];
    return [...base, `在「${taskRef}」之后插入一个新任务`];
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
        followUpChips,
        addMessage,
        updateMessage,
        setStreaming,
        setStreamingText,
        appendStreamingText,
        clearMessages,
        setProposal,
        recordReject,
        clearFollowUpChips,
    } = useAiStore();

    const workflowDef = useWorkflowStore(s => s.workflowDef);
    const selectedTask = useWorkflowStore(s => s.selectedTask);
    const setSelectedTask = useWorkflowStore(s => s.setSelectedTask);
    const libraryItems = useLibraryStore(s => s.items);

    const [inputValue, setInputValue] = useState('');
    const [activeTab, setActiveTab] = useState<'chat' | 'library'>('chat');
    const [toolStatus, setToolStatus] = useState<string>(''); // e.g. "正在搜索工作流库…"
    // Pending proposal guard: stores the blocked message text
    const [guardBlocked, setGuardBlocked] = useState<string | null>(null);
    // D2: last failed input for retry
    const [retryInput, setRetryInput] = useState<string | null>(null);

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
        setRetryInput(null);           // clear any previous retry state
        clearFollowUpChips();          // D1: dismiss follow-up chips on new message
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
                setRetryInput(text);   // D2: allow one-click retry
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
        clearFollowUpChips();
        handleSendText(chip);
    }, [pendingProposal, handleSendText, clearFollowUpChips]);

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
    // D3: show template gallery when canvas is empty and only welcome msg exists
    const showTemplates = !workflowDef && messages.length === 1 && messages[0].id === 'welcome' && libraryItems.length === 0;

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
                                {/* A2: Welcome chips / D3: Template gallery below welcome msg */}
                                {msg.id === 'welcome' && (
                                    <>
                                        {/* D3: Template gallery replaces chips when canvas is empty */}
                                        {showTemplates && (
                                            <div className="ai-template-gallery">
                                                <div className="ai-template-gallery-label">快速开始 — 选择一个场景模板</div>
                                                <div className="ai-template-grid">
                                                    {WORKFLOW_TEMPLATES.map(t => (
                                                        <button
                                                            key={t.name}
                                                            className="ai-template-card"
                                                            onClick={() => handleChipClick(t.prompt)}
                                                            disabled={isStreaming}
                                                            title={t.prompt}
                                                        >
                                                            <span className="ai-template-icon">{t.icon}</span>
                                                            <span className="ai-template-name">{t.name}</span>
                                                            <span className="ai-template-desc">{t.desc}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {/* Regular chips (library-driven or has-workflow) */}
                                        {welcomeChips.length > 0 && (
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
                                    </>
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

                        {/* D1: Follow-up chips after proposal acceptance */}
                        {followUpChips && followUpChips.length > 0 && !isStreaming && (
                            <div className="ai-follow-up-chips">
                                <div className="ai-follow-up-label">继续优化</div>
                                {followUpChips.map(chip => (
                                    <button
                                        key={chip}
                                        className="ai-welcome-chip follow-up"
                                        onClick={() => handleChipClick(chip)}
                                    >
                                        {chip}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* D2: Retry button after AI error */}
                        {retryInput && !isStreaming && (
                            <div className="ai-retry-row">
                                <button
                                    className="ai-retry-btn"
                                    onClick={() => { const t = retryInput; setRetryInput(null); handleSendText(t); }}
                                >
                                    ↺ 重试上一条消息
                                </button>
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

                    {/* E2: Selected node context strip */}
                    {selectedTask && !isStreaming && (
                        <div className="ai-node-context-strip">
                            <div className="ai-node-context-header">
                                <span className="ai-node-context-label">
                                    <span className="ai-node-context-type">{selectedTask.type}</span>
                                    <span className="ai-node-context-ref">{selectedTask.taskReferenceName}</span>
                                </span>
                                <button
                                    className="ai-node-context-dismiss"
                                    onClick={() => setSelectedTask(null)}
                                    title="取消选中"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="ai-node-context-chips">
                                {buildNodeChips(selectedTask.taskReferenceName, selectedTask.type).map(chip => (
                                    <button
                                        key={chip}
                                        className="ai-node-context-chip"
                                        onClick={() => handleChipClick(chip)}
                                    >
                                        {chip}
                                    </button>
                                ))}
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
