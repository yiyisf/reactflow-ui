import { describe, it, expect, beforeEach } from 'vitest';
import useWorkflowStore from './workflowStore';

const store = () => useWorkflowStore.getState();

const DEF = {
    name: 'loop_fork', version: 1, schemaVersion: 2,
    tasks: [
        { name: 'start', taskReferenceName: 'start', type: 'SIMPLE', inputParameters: {} },
        {
            name: 'loop', taskReferenceName: 'loop', type: 'DO_WHILE', inputParameters: {}, loopCondition: 'false',
            loopOver: [
                { name: 'step', taskReferenceName: 'step', type: 'SIMPLE', inputParameters: {} },
                {
                    name: 'fork', taskReferenceName: 'fork', type: 'FORK_JOIN_DYNAMIC', inputParameters: {},
                    dynamicForkTasksParam: 'tasks', dynamicForkTasksInputParamName: 'inputs',
                },
                { name: 'join', taskReferenceName: 'join', type: 'JOIN', inputParameters: {} },
            ],
        },
    ],
} as any;

let n = 0;
const rt = (ref: string, status: string, extra: Record<string, unknown> = {}) =>
    ({ taskId: `t${++n}`, referenceTaskName: ref, taskType: 'SIMPLE', status, ...extra });

const INSTANCE = {
    workflowId: 'wf-1', status: 'COMPLETED', workflowDefinition: DEF,
    tasks: [
        rt('start', 'COMPLETED'),
        rt('loop', 'COMPLETED', { iteration: 2, taskType: 'DO_WHILE' }),
        rt('step__1', 'COMPLETED', { iteration: 1 }),
        rt('fork__1', 'COMPLETED', { iteration: 1, taskType: 'FORK_JOIN_DYNAMIC' }),
        rt('child_a__1', 'COMPLETED', { iteration: 1 }),
        rt('join__1', 'COMPLETED', { iteration: 1, taskType: 'JOIN' }),
        rt('step__2', 'FAILED', { iteration: 2, retryCount: 0 }),
        rt('step__2', 'COMPLETED', { iteration: 2, retryCount: 1 }),
        rt('fork__2', 'COMPLETED', { iteration: 2, taskType: 'FORK_JOIN_DYNAMIC' }),
        rt('child_a__2', 'COMPLETED', { iteration: 2 }),
        rt('child_b__2', 'COMPLETED', { iteration: 2 }),
        rt('join__2', 'COMPLETED', { iteration: 2, taskType: 'JOIN' }),
    ],
};

describe('importExecutionJSON: loop + dynamic fork in a loop (R5, R9)', () => {
    beforeEach(() => {
        store().setMode('edit');
        store().importExecutionJSON(INSTANCE);
    });

    it('registers loop records under the base ref only', () => {
        const data = store().executionData!;
        expect(Object.keys(data)).not.toContain('step__1');
        expect(Object.keys(data)).not.toContain('step__2');
        expect(data.step.attempts).toHaveLength(3);
        expect(data.step.totalIterations).toBe(2);
        expect(data.step.status).toBe('COMPLETED');
        expect(store().mode).toBe('run');
    });

    it('shows the dynamic fork children of the latest iteration, and each iteration by suffix', () => {
        const byFork = store().dynamicRuntimeTasksByFork;
        expect(byFork.fork.map((t) => t.referenceTaskName)).toEqual(['child_a__2', 'child_b__2']);
        expect(byFork['fork__1'].map((t) => t.referenceTaskName)).toEqual(['child_a__1']);
    });
});

describe('R4 setSelectedTask clears the previous task\'s selected attempt', () => {
    beforeEach(() => {
        store().setMode('edit');
        store().importExecutionJSON(INSTANCE);
    });

    it('switching task clears selectedTaskInstance; re-selecting the same task keeps it', () => {
        const step = store().taskMap.step;
        store().setSelectedTask(step);
        const attempt = store().executionData!.step.attempts[0];
        store().setSelectedTaskInstance(attempt);
        store().setSelectedTask(step);
        expect(store().selectedTaskInstance).toBe(attempt);
        store().setSelectedTask(store().taskMap.start);
        expect(store().selectedTaskInstance).toBeNull();
    });
});
