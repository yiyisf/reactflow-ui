import { describe, it, expect } from 'vitest';
import { normalizeLegacyTaskFields, syncForkJoinOn, findPairedJoinRef } from './conductorGenerator';
import type { TaskDef } from '../types/conductor';

const simple = (ref: string): TaskDef => ({ name: ref, taskReferenceName: ref, type: 'SIMPLE' }) as TaskDef;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const forkPair = (branches: TaskDef[][], joinOn?: string[]): TaskDef[] => [
    { name: 'f', taskReferenceName: 'f', type: 'FORK_JOIN', forkTasks: branches } as TaskDef,
    { name: 'j', taskReferenceName: 'j', type: 'JOIN', ...(joinOn ? { joinOn } : {}) } as TaskDef,
];

describe('syncForkJoinOn (E5)', () => {
    it('load mode fills a missing joinOn but keeps an explicit partial one', () => {
        const missing = forkPair([[simple('a')], [simple('b')]]);
        syncForkJoinOn(missing);
        expect(missing[1].joinOn).toEqual(['a', 'b']);

        const partial = forkPair([[simple('a')], [simple('b')]], ['a']);
        syncForkJoinOn(partial);
        expect(partial[1].joinOn).toEqual(['a']);
    });

    it('edit mode never rewrites joinOn when the branch ends did not change', () => {
        const prev = forkPair([[simple('a')], [simple('b')]], ['a']);
        const next = clone(prev);
        syncForkJoinOn(next, prev);
        expect(next[1].joinOn).toEqual(['a']);
    });

    it('edit mode follows the joined branch end and keeps unjoined branches unjoined', () => {
        const prev = forkPair([[simple('a')], [simple('b')]], ['a']);
        const next = clone(prev);
        next[0].forkTasks![0].push(simple('a2'));
        next[0].forkTasks![1].push(simple('b2'));
        syncForkJoinOn(next, prev);
        expect(next[1].joinOn).toEqual(['a2']);
    });

    it('keeps custom mid-branch entries and drops entries whose task was deleted', () => {
        const prev = forkPair([[simple('a'), simple('a_end')], [simple('b')]], ['a', 'b']);
        const next = clone(prev);
        next[0].forkTasks![1] = [];
        syncForkJoinOn(next, prev);
        expect(next[1].joinOn).toEqual(['a']);
    });

    it('appends the end of a newly filled branch', () => {
        const prev = forkPair([[simple('a')], []], ['a']);
        const next = clone(prev);
        next[0].forkTasks![1].push(simple('c'));
        syncForkJoinOn(next, prev);
        expect(next[1].joinOn).toEqual(['a', 'c']);
    });

    it('works for forks nested in branches', () => {
        const inner = forkPair([[simple('x')], [simple('y')]], ['x']);
        const prev: TaskDef[] = [{ name: 'sw', taskReferenceName: 'sw', type: 'SWITCH', decisionCases: { k: inner } } as TaskDef];
        const next = clone(prev);
        syncForkJoinOn(next, prev);
        expect(next[0].decisionCases!.k[1].joinOn).toEqual(['x']);
    });
});

describe('normalizeLegacyTaskFields (E2 / E20)', () => {
    it('moves INLINE evaluatorType and dynamic-fork simple fields into inputParameters', () => {
        const tasks = [
            { name: 'i', taskReferenceName: 'i', type: 'INLINE', evaluatorType: 'graaljs', inputParameters: { expression: '1' } },
            { name: 'd', taskReferenceName: 'd', type: 'FORK_JOIN_DYNAMIC', forkTaskWorkflow: 'child', forkTaskWorkflowVersion: '2' },
        ] as any[];
        normalizeLegacyTaskFields(tasks);
        expect(tasks[0]).toEqual({ name: 'i', taskReferenceName: 'i', type: 'INLINE', inputParameters: { expression: '1', evaluatorType: 'graaljs' } });
        expect(tasks[1].inputParameters).toEqual({ forkTaskWorkflow: 'child', forkTaskWorkflowVersion: '2' });
        expect(tasks[1].forkTaskWorkflow).toBeUndefined();
    });

    it('never overwrites a value already in inputParameters, and leaves SWITCH evaluatorType alone', () => {
        const tasks = [
            { name: 'i', taskReferenceName: 'i', type: 'INLINE', evaluatorType: 'javascript', inputParameters: { evaluatorType: 'graaljs' } },
            { name: 's', taskReferenceName: 's', type: 'SWITCH', evaluatorType: 'value-param', expression: 'k' },
        ] as any[];
        normalizeLegacyTaskFields(tasks);
        expect(tasks[0].inputParameters.evaluatorType).toBe('graaljs');
        expect(tasks[1].evaluatorType).toBe('value-param');
    });
});

describe('findPairedJoinRef (E8)', () => {
    it('finds the JOIN right after a nested FORK', () => {
        const tasks: TaskDef[] = [{ ...simple('loop'), type: 'DO_WHILE', loopOver: forkPair([[simple('a')]]) } as TaskDef];
        expect(findPairedJoinRef(tasks, 'f')).toBe('j');
    });
});

describe('syncForkJoinOn: 删除中间分支不错位（B21）', () => {
    it('removing a joined middle branch drops only its entry; later branches keep their own state', () => {
        const prev = forkPair([[simple('a')], [simple('b')], [simple('c')]], ['a', 'b']);
        const next = clone(prev);
        next[0].forkTasks!.splice(0, 1);
        syncForkJoinOn(next, prev);
        expect(next[1].joinOn).toEqual(['b']);
    });

    it('removing an unjoined branch keeps the joinOn unchanged', () => {
        const prev = forkPair([[simple('a')], [simple('b')], [simple('c')]], ['b', 'c']);
        const next = clone(prev);
        next[0].forkTasks!.splice(0, 1);
        syncForkJoinOn(next, prev);
        expect(next[1].joinOn).toEqual(['b', 'c']);
    });
});
