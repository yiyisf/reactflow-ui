import { describe, it, expect } from 'vitest';
import { buildProposalSteps } from './proposalPreview';
import type { WorkflowDef, TaskDef } from '../types/conductor';
import type { DiffSummary } from '../services/ai/toolExecutor';

function task(ref: string, overrides: Partial<TaskDef> = {}): TaskDef {
    return { name: ref, taskReferenceName: ref, type: 'SIMPLE', ...overrides } as TaskDef;
}

function def(tasks: TaskDef[]): WorkflowDef {
    return { name: 'wf', tasks, version: 1 } as WorkflowDef;
}

describe('buildProposalSteps', () => {
    it('marks every task as added when there is no current def', () => {
        const proposed = def([task('a'), task('b')]);
        const diff: DiffSummary = { added: ['a', 'b'], modified: [], removed: [], propsChanged: false };
        const steps = buildProposalSteps(null, proposed, diff);
        expect(steps.map(s => [s.ref, s.status])).toEqual([['a', 'added'], ['b', 'added']]);
    });

    it('labels unchanged / added / modified steps using proposedDef order', () => {
        const current = def([task('a'), task('b')]);
        const proposed = def([task('a'), task('b', { timeoutSeconds: 60 }), task('c')]);
        const diff: DiffSummary = {
            added: ['c'], modified: ['b'], removed: [], propsChanged: false,
            modifiedDetails: [{ ref: 'b', changes: ['超时：未设置 → 1 分钟'] }],
        };
        const steps = buildProposalSteps(current, proposed, diff);
        expect(steps.map(s => s.ref)).toEqual(['a', 'b', 'c']);
        expect(steps[0].status).toBe('unchanged');
        expect(steps[1].status).toBe('modified');
        expect(steps[1].changes).toEqual(['超时：未设置 → 1 分钟']);
        expect(steps[2].status).toBe('added');
    });

    it('splices a removed task back in at its original position', () => {
        const current = def([task('a'), task('b'), task('c')]);
        const proposed = def([task('a'), task('c')]); // 'b' was removed
        const diff: DiffSummary = { added: [], modified: [], removed: ['b'], propsChanged: false };
        const steps = buildProposalSteps(current, proposed, diff);
        expect(steps.map(s => [s.ref, s.status])).toEqual([
            ['a', 'unchanged'],
            ['b', 'removed'],
            ['c', 'unchanged'],
        ]);
    });

    it('places a removed first task at the very start', () => {
        const current = def([task('a'), task('b')]);
        const proposed = def([task('b')]); // 'a' was removed
        const diff: DiffSummary = { added: [], modified: [], removed: ['a'], propsChanged: false };
        const steps = buildProposalSteps(current, proposed, diff);
        expect(steps.map(s => s.ref)).toEqual(['a', 'b']);
        expect(steps[0].status).toBe('removed');
    });

    it('ignores a removed ref that no longer exists in currentDef (defensive)', () => {
        const current = def([task('a')]);
        const proposed = def([task('a')]);
        const diff: DiffSummary = { added: [], modified: [], removed: ['ghost'], propsChanged: false };
        const steps = buildProposalSteps(current, proposed, diff);
        expect(steps.map(s => s.ref)).toEqual(['a']);
    });
});
