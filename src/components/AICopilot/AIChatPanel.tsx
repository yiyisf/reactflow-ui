import React, { useState, useRef, useEffect, useCallback } from 'react';
import './AIChatPanel.css';

interface Message {
    id: string;
    role: 'user' | 'ai';
    content: string;
    type?: 'text' | 'change_suggestion';
    payload?: any;
}

import useWorkflowStore from '../../store/workflowStore';
import { callAICopilotStream, CONDUCTOR_SYSTEM_PROMPT, ChatMessage } from '../../services/aiService';
import { generateWorkflowSuggestionPrompt } from '../../services/promptTemplates';

const AIChatPanel: React.FC = () => {
    const { workflowDef, applyAIGeneratedWorkflow } = useWorkflowStore();
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'ai',
            content: '你好！我是您的流程助手。我可以帮你生成工作流框架、优化逻辑或提供参数配置建议。你想实现什么样的流程？',
            type: 'text'
        }
    ]);
    const [streamingContent, setStreamingContent] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

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

        // 将已有对话历史加入上下文
        for (const msg of messages) {
            if (msg.role === 'user') {
                history.push({ role: 'user', content: msg.content });
            } else if (msg.role === 'ai') {
                history.push({ role: 'assistant', content: msg.content });
            }
        }

        // 加入当前用户输入（使用 prompt 模板增强）
        const prompt = generateWorkflowSuggestionPrompt(userInput, workflowDef);
        history.push({ role: 'user', content: prompt });

        return history;
    }, [messages, workflowDef]);

    const handleSend = async () => {
        if (!inputValue.trim() || isLoading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue,
            type: 'text'
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsLoading(true);
        setStreamingContent('');

        try {
            const apiKey = localStorage.getItem('AI_API_KEY') || '';
            const baseUrl = localStorage.getItem('AI_BASE_URL') || '';
            const model = localStorage.getItem('AI_MODEL') || '';

            if (!apiKey) {
                // FALLBACK TO MOCK FOR DEMO PURPOSES
                setTimeout(() => {
                    const aiMsg: Message = {
                        id: (Date.now() + 1).toString(),
                        role: 'ai',
                        content: '由于未检测到 API Key，我为您模拟了一个简单的审批流程：',
                        type: 'change_suggestion',
                        payload: {
                            name: 'demo_approval',
                            tasks: [
                                { name: 'submit_request', taskReferenceName: 'submit_1', type: 'SIMPLE' },
                                { name: 'manager_approve', taskReferenceName: 'approve_1', type: 'SIMPLE' }
                            ]
                        }
                    };
                    setMessages(prev => [...prev, aiMsg]);
                    setIsLoading(false);
                }, 1000);
                return;
            }

            const apiConfig: Record<string, string> = { apiKey };
            if (baseUrl) apiConfig.baseUrl = baseUrl;
            if (model) apiConfig.model = model;

            const chatHistory = buildChatHistory(inputValue);

            // 使用流式 API
            const fullResponse = await callAICopilotStream(
                chatHistory,
                apiConfig,
                (token) => {
                    setStreamingContent(prev => prev + token);
                },
                () => {
                    // streaming done
                }
            );

            // 流结束后，解析完整响应
            const jsonMatch = fullResponse.match(/```json\n([\s\S]*?)\n```/);
            const suggestedJson = jsonMatch ? JSON.parse(jsonMatch[1]) : null;

            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: fullResponse.replace(/```json[\s\S]*?```/, ''),
                type: suggestedJson ? 'change_suggestion' : 'text',
                payload: suggestedJson
            };

            setMessages(prev => [...prev, aiMsg]);
            setStreamingContent('');
        } catch (err: any) {
            const errorMsg: Message = {
                id: Date.now().toString(),
                role: 'ai',
                content: `抱歉，目前无法连接到 AI 服务: ${err.message}`,
            };
            setMessages(prev => [...prev, errorMsg]);
            setStreamingContent('');
        } finally {
            setIsLoading(false);
        }
    };

    const applySuggestion = (payload: any) => {
        applyAIGeneratedWorkflow(payload);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
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
                <button className="ai-close" onClick={() => setIsOpen(false)}>×</button>
            </div>

            <div className="ai-messages">
                {messages.map((msg) => (
                    <div key={msg.id} className={`message ${msg.role}`}>
                        {msg.content}
                        {msg.type === 'change_suggestion' && msg.payload && (
                            <div className="change-card">
                                <div className="card-header">工作流修改建议</div>
                                <div className="card-actions">
                                    <button className="card-btn">预览</button>
                                    <button className="card-btn apply" onClick={() => applySuggestion(msg.payload)}>应用</button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                {/* 流式输出中显示正在生成的内容 */}
                {isLoading && streamingContent && (
                    <div className="message ai" style={{ opacity: 0.9 }}>
                        {streamingContent}
                        <span style={{ animation: 'blink 1s infinite' }}>▊</span>
                    </div>
                )}
                {isLoading && !streamingContent && (
                    <div className="message ai" style={{ opacity: 0.7 }}>
                        正在思考中...
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="ai-input-area">
                <div className="ai-input-container">
                    <textarea
                        className="ai-input"
                        placeholder={isLoading ? "AI 正在响应..." : "描述您的需求..."}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyPress}
                        disabled={isLoading}
                        rows={1}
                    />
                    <button className="ai-send" onClick={handleSend} title="发送" disabled={isLoading}>
                        {isLoading ? '⏳' : '🚀'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AIChatPanel;
