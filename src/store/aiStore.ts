/**
 * AI Store — 独立于 workflowStore 的 AI 状态管理
 *
 * 管理对话历史、待审核操作队列、AI 配置和指标。
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AiConfig } from '../services/ai/protocolAdapter';
import type { PendingOperation } from '../services/ai/toolExecutor';

// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface AiChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    /** 该回复关联的 tool calls（用于 ReviewBar 显示） */
    pendingOpIds?: string[];
    timestamp: number;
}

export interface AiMetrics {
    totalSuggestions: number;
    acceptedSuggestions: number;
    rejectedSuggestions: number;
    undoCount: number;
}

interface AiState {
    // ─── 配置 ───
    config: AiConfig;

    // ─── 对话 ───
    messages: AiChatMessage[];
    isStreaming: boolean;
    streamingText: string;
    chatPanelOpen: boolean;

    // ─── 待审核操作 ───
    pendingOps: PendingOperation[];

    // ─── 指标 ───
    metrics: AiMetrics;
}

interface AiActions {
    // 配置
    setConfig: (config: Partial<AiConfig>) => void;

    // 对话
    addMessage: (msg: Omit<AiChatMessage, 'id' | 'timestamp'>) => string;
    updateMessage: (id: string, content: string) => void;
    setStreaming: (isStreaming: boolean) => void;
    setStreamingText: (text: string) => void;
    appendStreamingText: (delta: string) => void;
    clearMessages: () => void;
    setChatPanelOpen: (open: boolean) => void;
    toggleChatPanel: () => void;

    // 待审核操作
    addPendingOp: (op: Omit<PendingOperation, 'id' | 'status'>) => string;
    addPendingOps: (ops: Array<Omit<PendingOperation, 'id' | 'status'>>) => string[];
    acceptOp: (id: string) => void;
    rejectOp: (id: string) => void;
    acceptAllOps: () => void;
    rejectAllOps: () => void;
    clearPendingOps: () => void;

    // 指标
    recordAccept: (count?: number) => void;
    recordReject: (count?: number) => void;
    recordUndo: () => void;
    getMetrics: () => AiMetrics;
}

export type AiStore = AiState & AiActions;

// ─── 常量 ────────────────────────────────────────────────────────────────────

const WELCOME_MESSAGE: AiChatMessage = {
    id: 'welcome',
    role: 'assistant',
    content: '你好！我是你的 AI 工作流助手。\n\n我可以帮你：\n- 🆕 **从零创建**工作流（描述你的业务场景即可）\n- ➕ **添加/修改/删除**任务节点\n- 🔀 **重构拓扑**（如串行改并行）\n- 🔍 **诊断问题**和优化建议\n\n直接告诉我你想做什么吧！',
    timestamp: Date.now(),
};

// ─── Store ───────────────────────────────────────────────────────────────────

const useAiStore = create<AiStore>()(
    persist(
        (set, get) => ({
            // ─── 初始状态 ───
            config: {
                provider: 'auto',
                apiKey: '',
                baseUrl: 'https://api.openai.com/v1',
                model: 'gpt-4o',
            },
            messages: [WELCOME_MESSAGE],
            isStreaming: false,
            streamingText: '',
            chatPanelOpen: true,
            pendingOps: [],
            metrics: {
                totalSuggestions: 0,
                acceptedSuggestions: 0,
                rejectedSuggestions: 0,
                undoCount: 0,
            },

            // ─── 配置 ───
            setConfig: (partial) => set(s => ({
                config: { ...s.config, ...partial },
            })),

            // ─── 对话 ───
            addMessage: (msg) => {
                const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                const message: AiChatMessage = { ...msg, id, timestamp: Date.now() };
                set(s => ({ messages: [...s.messages, message] }));
                return id;
            },

            updateMessage: (id, content) => set(s => ({
                messages: s.messages.map(m => m.id === id ? { ...m, content } : m),
            })),

            setStreaming: (isStreaming) => set({ isStreaming }),
            setStreamingText: (text) => set({ streamingText: text }),
            appendStreamingText: (delta) => set(s => ({ streamingText: s.streamingText + delta })),

            clearMessages: () => set({
                messages: [WELCOME_MESSAGE],
                streamingText: '',
                isStreaming: false,
                pendingOps: [],
            }),

            setChatPanelOpen: (open) => set({ chatPanelOpen: open }),
            toggleChatPanel: () => set(s => ({ chatPanelOpen: !s.chatPanelOpen })),

            // ─── 待审核操作 ───
            addPendingOp: (op) => {
                const id = `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                const pending: PendingOperation = { ...op, id, status: 'pending' };
                set(s => ({
                    pendingOps: [...s.pendingOps, pending],
                    metrics: { ...s.metrics, totalSuggestions: s.metrics.totalSuggestions + 1 },
                }));
                return id;
            },

            addPendingOps: (ops) => {
                const ids: string[] = [];
                const pendingList: PendingOperation[] = [];
                ops.forEach(op => {
                    const id = `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                    ids.push(id);
                    pendingList.push({ ...op, id, status: 'pending' });
                });
                set(s => ({
                    pendingOps: [...s.pendingOps, ...pendingList],
                    metrics: { ...s.metrics, totalSuggestions: s.metrics.totalSuggestions + pendingList.length },
                }));
                return ids;
            },

            acceptOp: (id) => set(s => ({
                pendingOps: s.pendingOps.map(op => op.id === id ? { ...op, status: 'accepted' } : op),
            })),

            rejectOp: (id) => set(s => ({
                pendingOps: s.pendingOps.map(op => op.id === id ? { ...op, status: 'rejected' } : op),
            })),

            acceptAllOps: () => set(s => ({
                pendingOps: s.pendingOps.map(op => op.status === 'pending' ? { ...op, status: 'accepted' } : op),
            })),

            rejectAllOps: () => set(s => ({
                pendingOps: s.pendingOps.map(op => op.status === 'pending' ? { ...op, status: 'rejected' } : op),
            })),

            clearPendingOps: () => set({ pendingOps: [] }),

            // ─── 指标 ───
            recordAccept: (count = 1) => set(s => ({
                metrics: { ...s.metrics, acceptedSuggestions: s.metrics.acceptedSuggestions + count },
            })),

            recordReject: (count = 1) => set(s => ({
                metrics: { ...s.metrics, rejectedSuggestions: s.metrics.rejectedSuggestions + count },
            })),

            recordUndo: () => set(s => ({
                metrics: { ...s.metrics, undoCount: s.metrics.undoCount + 1 },
            })),

            getMetrics: () => get().metrics,
        }),
        {
            name: 'ai-workflow-config',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                config: state.config,
                metrics: state.metrics,
                // 不持久化对话历史和 pending ops
            }),
        }
    )
);

export default useAiStore;
