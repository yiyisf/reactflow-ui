/**
 * Proposal Preview — builds a business-readable step list for an AI proposal (M2.2)
 *
 * Merges the current canvas def with the proposed def + diff into a single ordered
 * list the ProposalPreviewCard renders directly, so users can see what changed
 * without opening the canvas. Removed tasks are spliced back in at their original
 * position (struck through) rather than silently disappearing.
 */

import type { WorkflowDef, TaskDef } from '../types/conductor';
import type { DiffSummary } from '../services/ai/toolExecutor';

export type ProposalStepStatus = 'unchanged' | 'added' | 'modified' | 'removed';

export interface ProposalStep {
    ref: string;
    task: TaskDef;
    status: ProposalStepStatus;
    /** Only present for 'modified' steps — field-level change descriptions */
    changes?: string[];
}

export function buildProposalSteps(
    currentDef: WorkflowDef | null,
    proposedDef: WorkflowDef,
    diff: DiffSummary,
): ProposalStep[] {
    const currentMap = new Map((currentDef?.tasks ?? []).map(t => [t.taskReferenceName, t]));
    const addedSet = new Set(diff.added);
    const modifiedSet = new Set(diff.modified);
    const detailsMap = new Map((diff.modifiedDetails ?? []).map(d => [d.ref, d.changes]));

    const steps: ProposalStep[] = [];
    for (const task of proposedDef.tasks ?? []) {
        const ref = task.taskReferenceName;
        if (addedSet.has(ref)) {
            steps.push({ ref, task, status: 'added' });
        } else if (modifiedSet.has(ref)) {
            steps.push({ ref, task, status: 'modified', changes: detailsMap.get(ref) });
        } else {
            steps.push({ ref, task, status: 'unchanged' });
        }
    }

    // Splice removed tasks back in at their original position (same technique as
    // applyPartialProposal's reinsertion logic) so the preview shows a struck-through
    // "removed" row in context, rather than losing track of where it used to sit.
    const origOrder = new Map((currentDef?.tasks ?? []).map((t, i) => [t.taskReferenceName, i]));
    for (const ref of diff.removed) {
        const task = currentMap.get(ref);
        if (!task) continue;
        const origIdx = origOrder.get(ref) ?? 0;
        let insertAt = 0;
        for (let i = 0; i < steps.length; i++) {
            const stepOrigIdx = origOrder.get(steps[i].ref);
            if (stepOrigIdx !== undefined && stepOrigIdx <= origIdx) insertAt = i + 1;
        }
        steps.splice(insertAt, 0, { ref, task, status: 'removed' });
    }

    return steps;
}
