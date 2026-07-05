/**
 * Library Store — sub-workflow catalog state
 *
 * Kept separate from aiStore to avoid circular dependencies (aiStore imports
 * types from toolExecutor, which used to read this store directly; since M2.1
 * toolExecutor is pure and AgentRunner passes library items in explicitly, but
 * the separate store is still worth keeping for its narrow, focused shape).
 *
 * Populated by AiWorkflowIDE when the workflowLibrary prop changes.
 * Read by AgentRunner (search_workflow_library / system prompt catalog) via
 * whichever instance the owning `<AiWorkflowIDE>` created — see createLibraryStore.
 */

import { create } from 'zustand';
import type { WorkflowLibraryItem } from '../types/workflowLibrary';

interface LibraryState {
    items: WorkflowLibraryItem[];
}

interface LibraryActions {
    setLibrary: (items: WorkflowLibraryItem[]) => void;
    clearLibrary: () => void;
}

export type LibraryStore = LibraryState & LibraryActions;

/** Creates an independent LibraryStore instance (no persistence — populated fresh from props each mount). */
export function createLibraryStore() {
    return create<LibraryStore>((set) => ({
        items: [],
        setLibrary: (items) => set({ items }),
        clearLibrary: () => set({ items: [] }),
    }));
}

const useLibraryStore = createLibraryStore();
export default useLibraryStore;
