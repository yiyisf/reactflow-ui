/**
 * AI Store — state management for AI workflow assistant
 *
 * Manages: conversation history, proposed workflow (for review),
 * AI configuration, and usage metrics.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AiConfig } from '../services/ai/protocolAdapter';
import type { WorkflowDef } from '../types/conductor';
import type { DiffSummary } from '../services/ai/toolExecutor';
import type { WorkflowLevel } from '../types/workflowLibrary';
import useWorkflowStore from './workflowStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AiChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    /** If this message triggered a proposal, link it here */
    proposalId?: string;
    timestamp: number;
}

export interface ProposedChange {
    id: string;
    proposedDef: WorkflowDef;
    diff: DiffSummary;
    /** Inferred workflow level based on sub-workflow references */
    inferredLevel?: WorkflowLevel;
    /** Message that triggered this proposal */
    messageId: string;
    /**
     * JSON snapshot of the canvas workflowDef at the moment the proposal was created.
     * Used to detect stale proposals when the user has edited the canvas during review.
     */
    baselineHash: string;
}

export interface AiMetrics {
    totalProposals: number;
    acceptedProposals: number;
    rejectedProposals: number;
}

interface AiState {
    config: AiConfig;
    messages: AiChatMessage[];
    isStreaming: boolean;
    streamingText: string;
    chatPanelOpen: boolean;
    /** The current pending proposal (only one at a time) */
    pendingProposal: ProposedChange | null;
    metrics: AiMetrics;
    /** Context-aware chips shown after the user accepts a proposal */
    followUpChips: string[] | null;
}

interface AiActions {
    setConfig: (config: Partial<AiConfig>) => void;
    addMessage: (msg: Omit<AiChatMessage, 'id' | 'timestamp'>) => string;
    updateMessage: (id: string, content: string) => void;
    setStreaming: (isStreaming: boolean) => void;
    setStreamingText: (text: string) => void;
    appendStreamingText: (delta: string) => void;
    clearMessages: () => void;
    setChatPanelOpen: (open: boolean) => void;
    toggleChatPanel: () => void;
    setProposal: (proposal: Omit<ProposedChange, 'id' | 'baselineHash'>) => string;
    clearProposal: () => void;
    recordAccept: () => void;
    recordReject: () => void;
    getMetrics: () => AiMetrics;
    setFollowUpChips: (chips: string[]) => void;
    clearFollowUpChips: () => void;
}

export type AiStore = AiState & AiActions;

// ─── Constants ───────────────────────────────────────────────────────────────

const WELCOME_MESSAGE: AiChatMessage = {
    id: 'welcome',
    role: 'assistant',
    content: '你好！我是 AI 工作流助手。\n\n我可以帮你：\n- 🆕 **从零创建**工作流（描述业务场景即可）\n- ➕ **添加/修改/删除**任务节点\n- 🔀 **重构拓扑**（如串行改并行）\n- 🔍 **诊断问题**和优化建议\n\n直接告诉我你想做什么吧！',
    timestamp: Date.now(),
};

// ─── Store ───────────────────────────────────────────────────────────────────

const useAiStore = create<AiStore>()(
    persist(
        (set, get) => ({
            config: {
                provider: 'auto',
                apiKey: '',
                // baseUrl and model intentionally omitted — defaults to provider standards
                // openai:    https://api.openai.com/v1 / gpt-4o
                // anthropic: https://api.anthropic.com / claude-sonnet-4-6
            },
            messages: [WELCOME_MESSAGE],
            isStreaming: false,
            streamingText: '',
            chatPanelOpen: true,
            pendingProposal: null,
            followUpChips: null,
            metrics: {
                totalProposals: 0,
                acceptedProposals: 0,
                rejectedProposals: 0,
            },

            setConfig: (partial) => set(s => ({
                config: { ...s.config, ...partial },
            })),

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
                pendingProposal: null,
                followUpChips: null,
            }),

            setChatPanelOpen: (open) => set({ chatPanelOpen: open }),
            toggleChatPanel: () => set(s => ({ chatPanelOpen: !s.chatPanelOpen })),

            setProposal: (proposal) => {
                const id = `prop_${Date.now()}`;
                // Snapshot the current canvas state so ReviewBar can detect stale proposals
                const currentDef = useWorkflowStore.getState().workflowDef;
                const baselineHash = JSON.stringify(currentDef);
                set(s => ({
                    pendingProposal: { ...proposal, id, baselineHash },
                    metrics: { ...s.metrics, totalProposals: s.metrics.totalProposals + 1 },
                }));
                return id;
            },

            clearProposal: () => set({ pendingProposal: null }),

            recordAccept: () => set(s => ({
                metrics: { ...s.metrics, acceptedProposals: s.metrics.acceptedProposals + 1 },
                pendingProposal: null,
            })),

            recordReject: () => set(s => ({
                metrics: { ...s.metrics, rejectedProposals: s.metrics.rejectedProposals + 1 },
                pendingProposal: null,
            })),

            getMetrics: () => get().metrics,

            setFollowUpChips: (chips) => set({ followUpChips: chips }),
            clearFollowUpChips: () => set({ followUpChips: null }),
        }),
        {
            name: 'ai-workflow-config',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                // Persist provider/baseUrl/model but NOT apiKey (kept only in memory)
                config: { ...state.config, apiKey: '' },
                metrics: state.metrics,
            }),
        }
    )
);

export default useAiStore;
