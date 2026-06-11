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
    | 'repair:executed'
    | 'repair:dismissed'
    | 'tool:called'
    | 'undo:applied';

export interface AiEvent {
    type: AiEventType;
    timestamp: number;
    /** For tool:called events */
    tool?: string;
    /** For repair:executed events */
    repairActionType?: string;
    /** For proposal events: change counts */
    diff?: { added: number; modified: number; removed: number };
    /** For proposal:accepted:partial: selected vs total change count */
    selectedCount?: number;
    totalCount?: number;
    /** Inferred workflow level (L1/L2/L3) for proposal events */
    inferredLevel?: string;
}
