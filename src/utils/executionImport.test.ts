import { describe, it, expect } from 'vitest';
import type { TaskInstance } from '../types/conductor';
import {
    buildExecutionData, collectDynamicForkChildren, countIterations, countRetries, findEnclosingLoopRef,
    pickAttemptForIteration, selectExecutionForIteration, splitIterationRef,
} from './executionImport';
import { analyzeExecution } from './executionAnalyzer';

let seq = 0;
const t = (ref: string, status: string, extra: Partial<TaskInstance> = {}): TaskInstance =>
    ({ taskId: `id-${++seq}`, referenceTaskName: ref, taskType: 'SIMPLE', status, seq, ...extra }) as TaskInstance;

const DEF = [
    { type: 'SIMPLE', taskReferenceName: 'start' },
    {
        type: 'DO_WHILE', taskReferenceName: 'loopA', loopOver: [
            { type: 'SIMPLE', taskReferenceName: 'a1' },
            { type: 'SWITCH', taskReferenceName: 'sw', decisionCases: { x: [{ type: 'SIMPLE', taskReferenceName: 'a2' }] } },
            { type: 'DO_WHILE', taskReferenceName: 'inner', loopOver: [{ type: 'SIMPLE', taskReferenceName: 'i1' }] },
        ],
    },
    { type: 'DO_WHILE', taskReferenceName: 'loopB', loopOver: [{ type: 'SIMPLE', taskReferenceName: 'b1' }] },
    { type: 'SIMPLE', taskReferenceName: 'retried' },
];
const KNOWN = Object.fromEntries(['start', 'loopA', 'a1', 'sw', 'a2', 'inner', 'i1', 'loopB', 'b1', 'retried'].map((r) => [r, {}]));

describe('splitIterationRef', () => {
    it('splits ref__N only when the base is a known task', () => {
        expect(splitIterationRef('a1__3', KNOWN)).toEqual({ baseRef: 'a1', iteration: 3 });
        expect(splitIterationRef('a1', KNOWN)).toEqual({ baseRef: 'a1' });
        expect(splitIterationRef('dyn__2', KNOWN)).toEqual({ baseRef: 'dyn__2' });
    });
});

describe('R5 buildExecutionData: iterations vs retries', () => {
    const tasks = [
        t('start', 'COMPLETED'),
        t('loopA', 'COMPLETED', { iteration: 2 }),
        t('a1__1', 'COMPLETED', { iteration: 1 }),
        t('a1__2', 'FAILED', { iteration: 2, retryCount: 0 }),
        t('a1__2', 'COMPLETED', { iteration: 2, retryCount: 1 }),
        t('retried', 'FAILED', { retryCount: 0 }),
        t('retried', 'FAILED', { retryCount: 1 }),
        t('retried', 'COMPLETED', { retryCount: 2 }),
    ];
    const data = buildExecutionData(tasks, KNOWN);

    it('registers a loop record once, under its base ref only', () => {
        expect(Object.keys(data).sort()).toEqual(['a1', 'loopA', 'retried', 'start']);
        expect(data.a1.attempts).toHaveLength(3);
        expect(data.a1.totalIterations).toBe(2);
        expect(data.a1.status).toBe('COMPLETED');
    });

    it('counts iterations and retries separately', () => {
        expect(countIterations(data.a1.attempts)).toBe(2);
        expect(countRetries(data.a1.attempts)).toBe(1);
        expect(countIterations(data.retried.attempts)).toBe(0);
        expect(countRetries(data.retried.attempts)).toBe(2);
        expect(countRetries(data.start.attempts)).toBe(0);
    });

    it('analyzeExecution does not double-count loop tasks nor treat iterations as retries', () => {
        const summary = analyzeExecution(data, null);
        expect(summary.totalTasks).toBe(4);
        const a1 = summary.steps.find((s) => s.taskRef === 'a1')!;
        expect(a1.retryCount).toBe(1);
        expect(a1.iterationCount).toBe(2);
        expect(summary.steps.find((s) => s.taskRef === 'retried')!.retryCount).toBe(2);
        expect(summary.steps.find((s) => s.taskRef === 'start')!.retryCount).toBe(0);
    });

    it('a loop with three clean iterations has zero retries', () => {
        const d = buildExecutionData([t('b1__1', 'COMPLETED'), t('b1__2', 'COMPLETED'), t('b1__3', 'COMPLETED')], KNOWN);
        expect(countRetries(d.b1.attempts)).toBe(0);
        expect(countIterations(d.b1.attempts)).toBe(3);
        expect(analyzeExecution(d, null).steps[0].retryCount).toBe(0);
    });
});

describe('R3 loop iteration selection', () => {
    it('finds the innermost enclosing loop', () => {
        expect(findEnclosingLoopRef(DEF, 'a1')).toBe('loopA');
        expect(findEnclosingLoopRef(DEF, 'a2')).toBe('loopA');
        expect(findEnclosingLoopRef(DEF, 'i1')).toBe('inner');
        expect(findEnclosingLoopRef(DEF, 'inner')).toBe('loopA');
        expect(findEnclosingLoopRef(DEF, 'b1')).toBe('loopB');
        expect(findEnclosingLoopRef(DEF, 'start')).toBeNull();
        expect(findEnclosingLoopRef(DEF, 'loopA')).toBeNull();
    });

    it('takes the last attempt of the iteration', () => {
        const attempts = [
            t('a1__2', 'FAILED', { iteration: 2, retryCount: 0 }),
            t('a1__2', 'COMPLETED', { iteration: 2, retryCount: 1 }),
        ];
        expect(pickAttemptForIteration(attempts, 2)?.status).toBe('COMPLETED');
        expect(pickAttemptForIteration(attempts, 5)).toBeUndefined();
    });

    it("loop A's choice does not change loop B's nodes, nor tasks outside loops", () => {
        const data = buildExecutionData([
            t('a1__1', 'FAILED'), t('a1__2', 'COMPLETED'),
            t('b1__1', 'COMPLETED'), t('b1__2', 'FAILED'),
            t('retried', 'FAILED', { retryCount: 0 }), t('retried', 'COMPLETED', { retryCount: 1 }),
        ], KNOWN);
        const choice = { loopA: 1 };
        expect(selectExecutionForIteration(data.a1, 'loopA', choice).status).toBe('FAILED');
        expect(selectExecutionForIteration(data.b1, 'loopB', choice).status).toBe('FAILED'); // latest of B, unchanged
        expect(selectExecutionForIteration(data.b1, 'loopB', choice)).toBe(data.b1);
        expect(selectExecutionForIteration(data.retried, null, choice)).toBe(data.retried);
        expect(selectExecutionForIteration(data.b1, 'loopB', { loopB: 1 }).status).toBe('COMPLETED');
    });
});

describe('R9 dynamic fork inside a loop', () => {
    const pairs = [{ forkRef: 'fork', joinRef: 'join' }];
    const known = { fork: {}, join: {} };

    it('pairs fork__N with join__N and keeps each iteration\'s children', () => {
        const tasks = [
            t('fork__1', 'COMPLETED'), t('x__1', 'COMPLETED'), t('y__1', 'COMPLETED'), t('join__1', 'COMPLETED'),
            t('fork__2', 'COMPLETED'), t('x__2', 'FAILED'), t('join__2', 'FAILED'),
        ];
        const out = collectDynamicForkChildren(tasks, pairs, known);
        expect(out['fork__1'].map((c) => c.referenceTaskName)).toEqual(['x__1', 'y__1']);
        expect(out['fork__2'].map((c) => c.referenceTaskName)).toEqual(['x__2']);
        expect(out.fork.map((c) => c.referenceTaskName)).toEqual(['x__2']);
    });

    it('outside loops: exact refs, known tasks excluded, duplicates removed', () => {
        const tasks = [
            t('pre', 'COMPLETED'), t('fork', 'COMPLETED'), t('c1', 'COMPLETED'), t('c1', 'COMPLETED'), t('c2', 'COMPLETED'),
            t('join', 'COMPLETED'),
        ];
        const out = collectDynamicForkChildren(tasks, pairs, { ...known, pre: {} });
        expect(out.fork.map((c) => c.referenceTaskName)).toEqual(['c1', 'c2']);
    });

    it('no matching join → no entry', () => {
        expect(collectDynamicForkChildren([t('fork__1', 'IN_PROGRESS'), t('x__1', 'IN_PROGRESS')], pairs, known)).toEqual({});
    });
});
