/**
 * IdeStoresContext — per-`<AiWorkflowIDE>`-instance state isolation (M3.2)
 *
 * Before this, aiStore/libraryStore/toolRegistry were module-level singletons:
 * two `<AiWorkflowIDE>` mounted on the same page shared one conversation, one
 * pending proposal, one workflow library, one set of custom tools — the second
 * instance would silently stomp the first. AiWorkflowIDE now creates a fresh
 * set of these per mount (via createAiStore/createLibraryStore/new ToolRegistry)
 * and provides them through this context; every AiNative component and the
 * AgentRunner it constructs read from `useIdeStores()` instead of importing the
 * default singletons directly.
 *
 * `workflowStore` (the canvas/task-graph state) is NOT part of this context yet —
 * it remains a shared singleton because it's also consumed by WorkflowIDE's much
 * larger component tree (nodes, panels) that this pass didn't migrate. That's a
 * documented follow-up, not an oversight: see docs/design/双IDE组件架构审查.md §2.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { UseBoundStore, StoreApi } from 'zustand';
import type { AiStore } from './aiStore';
import type { LibraryStore } from './libraryStore';
import type { ToolRegistry } from '../services/ai/toolRegistry';

export interface IdeStores {
    aiStore: UseBoundStore<StoreApi<AiStore>>;
    libraryStore: UseBoundStore<StoreApi<LibraryStore>>;
    toolRegistry: ToolRegistry;
}

const IdeStoresContext = createContext<IdeStores | null>(null);

export function IdeStoresProvider({ stores, children }: { stores: IdeStores; children: ReactNode }) {
    return <IdeStoresContext.Provider value={stores}>{children}</IdeStoresContext.Provider>;
}

/** Reads the per-instance stores. Throws if used outside `<AiWorkflowIDE>` — every AiNative component is always rendered under it. */
export function useIdeStores(): IdeStores {
    const ctx = useContext(IdeStoresContext);
    if (!ctx) {
        throw new Error('useIdeStores() must be called within <AiWorkflowIDE> — no IdeStoresContext.Provider found above this component.');
    }
    return ctx;
}

/**
 * Non-throwing variant for components shared with WorkflowIDE (e.g. WorkflowDesigner),
 * which renders both under `<AiWorkflowIDE>` (provider present) and standalone under
 * `<WorkflowIDE>` (no provider — falls back to the module singleton there instead).
 */
export function useIdeStoresOptional(): IdeStores | null {
    return useContext(IdeStoresContext);
}
