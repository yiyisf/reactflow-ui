import { describe, it, expect } from 'vitest';
import { workflowToMermaid } from './workflowToMermaid';
import type { WorkflowDef, TaskDef } from '../types/conductor';

function task(ref: string, overrides: Partial<TaskDef> = {}): TaskDef {
    return { name: ref, taskReferenceName: ref, type: 'SIMPLE', ...overrides } as TaskDef;
}

describe('workflowToMermaid', () => {
    it('renders a bare start->end flowchart for an empty workflow', () => {
        const out = workflowToMermaid({ name: 'wf', tasks: [] } as any);
        expect(out).toBe('flowchart TD\n  __start__([开始]) --> __end__([结束])');
    });

    it('chains a linear sequence of tasks start -> a -> b -> end', () => {
        const out = workflowToMermaid({ name: 'wf', tasks: [task('a'), task('b')] } as any);
        expect(out).toContain('flowchart TD');
        expect(out).toContain('__start__ --> a');
        expect(out).toContain('a --> b');
        expect(out).toContain('b --> __end__');
    });

    it('omits technical SKIP_TYPES tasks (e.g. SET_VARIABLE) from the diagram', () => {
        const out = workflowToMermaid({
            name: 'wf',
            tasks: [task('a'), task('setvar', { type: 'SET_VARIABLE' }), task('b')],
        } as any);
        expect(out).not.toContain('setvar');
        expect(out).toContain('a --> b'); // the skipped node doesn't break the chain
    });

    it('uses a diamond shape for SWITCH tasks and a double-circle for TERMINATE', () => {
        const out = workflowToMermaid({
            name: 'wf',
            tasks: [task('decide', { type: 'SWITCH' }), task('stop', { type: 'TERMINATE' })],
        } as any);
        expect(out).toContain('decide{"decide"}');
        expect(out).toContain('stop(("stop"))');
    });

    it('sanitizes labels: strips quotes/brackets and truncates long names', () => {
        const longName = 'a'.repeat(50);
        const out = workflowToMermaid({
            name: 'wf',
            tasks: [task('a', { name: `weird "quote" <tag> [bracket]` }), task('b', { name: longName })],
        } as any);
        expect(out).not.toContain('"quote"');
        expect(out).not.toContain('<tag>');
        expect(out).toContain('…');
        expect(out).not.toContain(longName); // truncated, so the full 50-char string shouldn't appear
    });

    it('renders FORK_JOIN branches fanning out to their paired JOIN', () => {
        const out = workflowToMermaid({
            name: 'wf',
            tasks: [
                task('fork', { type: 'FORK_JOIN', forkTasks: [[task('branch_a')], [task('branch_b')]] } as any),
                task('join', { type: 'JOIN' } as any),
            ],
        } as any);
        expect(out).toContain('fork --> branch_a');
        expect(out).toContain('branch_a --> join');
        expect(out).toContain('fork --> branch_b');
        expect(out).toContain('branch_b --> join');
    });

    it('renders SWITCH decisionCases as labeled edges converging on a merge node', () => {
        const out = workflowToMermaid({
            name: 'wf',
            tasks: [task('decide', {
                type: 'SWITCH',
                decisionCases: { yes: [task('do_yes')], no: [task('do_no')] },
            } as any)],
        } as any);
        expect(out).toContain('decide -- "yes" --> do_yes');
        expect(out).toContain('decide -- "no" --> do_no');
        expect(out).toContain('do_yes --> decide_merge');
        expect(out).toContain('do_no --> decide_merge');
    });

    it('sanitizes non-alphanumeric characters out of node ids (label text is untouched)', () => {
        const out = workflowToMermaid({ name: 'wf', tasks: [task('my-task.ref')] } as any);
        // The id used for edges/node declarations must be sanitized...
        expect(out).toContain('__start__ --> my_task_ref');
        // ...while the human-readable label legitimately keeps the original ref text.
        expect(out).toContain('my_task_ref["my-task.ref"]');
    });
});
