/**
 * AI Event types for audit logging and analytics.
 *
 * Pass an `onAiEvent` callback to <AiWorkflowIDE> to receive all AI lifecycle events.
 *
 * ```tsx
 * <AiWorkflowIDE
 *   onAiEvent={(event) => auditLog.record(event)}
 * />
 * ```
 */

export type AiEventType =
    | 'proposal:created'
    | 'proposal:accepted'
    | 'proposal:accepted:partial'
    | 'proposal:rejected'
    | 'plan:created'
    | 'plan:executed'
    | 'plan:cancelled'
    | 'repair:proposed'
    /** User clicked the inline second-click confirmation before a runtime-mutating repair action fires */
    | 'repair:confirmed'
    | 'repair:executed'
    | 'repair:dismissed'
    | 'tool:called'
    | 'undo:applied'
    /** AI request failed (network/HTTP/provider error). The user only ever sees a humanized
     *  message — the raw diagnostic text is only available here, via `rawMessage`. */
    | 'ai:error';

export interface AiEvent {
    type: AiEventType;
    timestamp: number;
    /** For tool:called events */
    tool?: string;
    /** For repair:executed / repair:confirmed events */
    repairActionType?: string;
    /** For proposal events: change counts */
    diff?: { added: number; modified: number; removed: number };
    /** For proposal:accepted:partial: selected vs total change count */
    selectedCount?: number;
    totalCount?: number;
    /** Inferred workflow level (L1/L2/L3) for proposal events */
    inferredLevel?: string;
    /** For ai:error events: the raw underlying error text (HTTP status, provider message, etc.) — not shown to the user */
    rawMessage?: string;
}
