/**
 * Library Store — sub-workflow catalog state
 *
 * Kept separate from aiStore to avoid circular dependencies
 * (toolExecutor.ts reads this store, and aiStore imports types from toolExecutor).
 *
 * Populated by AiWorkflowIDE when the workflowLibrary prop changes.
 * Read by toolExecutor (search_workflow_library) and systemPrompt (catalog injection).
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

const useLibraryStore = create<LibraryState & LibraryActions>((set) => ({
    items: [],
    setLibrary: (items) => set({ items }),
    clearLibrary: () => set({ items: [] }),
}));

export default useLibraryStore;
