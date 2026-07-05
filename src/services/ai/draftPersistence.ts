/**
 * Draft Persistence — 刷新不丢工作（M1.4）
 *
 * AiWorkflowIDE 默认所有状态存于内存，刷新页面即丢失全部编辑。这里提供一个
 * 可选的、集成方显式开启的 localStorage 草稿机制：workflowDef + 对话 + 待确认
 * 提案定期写入本地存储，挂载时检测到草稿则恢复现场。
 *
 * 默认不开启（`draftPersist={false}`）——是否写宿主页面的 localStorage 由集成方决定。
 */

import type { WorkflowDef } from '../../types/conductor';
import type { AiChatMessage, ProposedChange } from '../../store/aiStore';

export interface IdeDraft {
    workflowDef: WorkflowDef | null;
    messages: AiChatMessage[];
    pendingProposal: ProposedChange | null;
    savedAt: number;
}

/** 判断草稿是否包含有意义的内容（避免刚挂载、仅有欢迎语时就落一份空草稿） */
export function isMeaningfulDraft(workflowDef: WorkflowDef | null, messages: AiChatMessage[], pendingProposal: ProposedChange | null): boolean {
    return !!workflowDef || messages.some(m => m.id !== 'welcome') || !!pendingProposal;
}

export function loadDraft(key: string): IdeDraft | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.savedAt !== 'number' || !Array.isArray(parsed.messages)) return null;
        return parsed as IdeDraft;
    } catch {
        // Malformed JSON or storage disabled — treat as "no draft" rather than throwing.
        return null;
    }
}

export function saveDraft(key: string, draft: IdeDraft): void {
    try {
        localStorage.setItem(key, JSON.stringify(draft));
    } catch {
        // Quota exceeded or storage disabled — draft persistence is best-effort.
    }
}

export function clearDraft(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore
    }
}
