import { describe, it, expect } from 'vitest';
import { parseWorkflow } from './conductorParser';
import type { WorkflowDef, TaskDef } from '../types/conductor';

function task(ref: string, overrides: Partial<TaskDef> = {}): TaskDef {
    return { name: ref, taskReferenceName: ref, type: 'SIMPLE', ...overrides } as TaskDef;
}

describe('parseWorkflow (parseConductorWorkflow)', () => {
    it('returns empty structures for a null/task-less workflow', () => {
        const result = parseWorkflow(null as any, 'TB');
        expect(result.nodes).toEqual([]);
        expect(result.edges).toEqual([]);
        expect(result.taskMap).toEqual({});
    });

    it('creates one node per task with id === taskReferenceName', () => {
        const def: WorkflowDef = { name: 'wf', tasks: [task('a'), task('b')] } as any;
        const { nodes } = parseWorkflow(def, 'TB');
        const taskNodeIds = nodes.filter(n => n.type === 'taskNode').map(n => n.id);
        expect(taskNodeIds).toEqual(['a', 'b']);
    });

    it('populates taskMap with every task keyed by reference name', () => {
        const def: WorkflowDef = { name: 'wf', tasks: [task('a'), task('b')] } as any;
        const { taskMap } = parseWorkflow(def, 'TB');
        expect(Object.keys(taskMap)).toEqual(['a', 'b']);
        expect(taskMap.a.taskReferenceName).toBe('a');
    });

    it('connects sequential tasks with an edge', () => {
        const def: WorkflowDef = { name: 'wf', tasks: [task('a'), task('b')] } as any;
        const { edges } = parseWorkflow(def, 'TB');
        expect(edges.some(e => e.source === 'a' && e.target === 'b')).toBe(true);
    });

    it('adds workflow-start/end plus-nodes in edit mode (hideEmptyBranches: false)', () => {
        const def: WorkflowDef = { name: 'wf', tasks: [task('a')] } as any;
        const { nodes } = parseWorkflow(def, 'TB', { hideEmptyBranches: false });
        expect(nodes.some(n => n.id === '__workflow_start__')).toBe(true);
        expect(nodes.some(n => n.id === '__workflow_end__')).toBe(true);
    });

    it('omits the plus-nodes when hideEmptyBranches is true (business/run view)', () => {
        const def: WorkflowDef = { name: 'wf', tasks: [task('a')] } as any;
        const { nodes } = parseWorkflow(def, 'TB', { hideEmptyBranches: true });
        expect(nodes.some(n => n.id === '__workflow_start__')).toBe(false);
        expect(nodes.some(n => n.id === '__workflow_end__')).toBe(false);
    });

    it('parses FORK_JOIN branch tasks into nodes and registers them in taskMap', () => {
        const forkTask = task('fork', {
            type: 'FORK_JOIN',
            forkTasks: [[task('branch_a')], [task('branch_b')]],
        } as any);
        const joinTask = task('join', { type: 'JOIN', joinOn: ['branch_a', 'branch_b'] } as any);
        const def: WorkflowDef = { name: 'wf', tasks: [forkTask, joinTask] } as any;

        const { nodes, taskMap } = parseWorkflow(def, 'TB', { hideEmptyBranches: true });
        expect(nodes.some(n => n.id === 'branch_a')).toBe(true);
        expect(nodes.some(n => n.id === 'branch_b')).toBe(true);
        expect(taskMap.branch_a).toBeDefined();
        expect(taskMap.branch_b).toBeDefined();
    });

    it('parses SWITCH decisionCases branch tasks into nodes and registers them in taskMap', () => {
        const switchTask = task('decide', {
            type: 'SWITCH',
            decisionCases: { yes: [task('do_yes')], no: [task('do_no')] },
        } as any);
        const def: WorkflowDef = { name: 'wf', tasks: [switchTask] } as any;

        const { nodes, taskMap } = parseWorkflow(def, 'TB', { hideEmptyBranches: true });
        expect(nodes.some(n => n.id === 'do_yes')).toBe(true);
        expect(nodes.some(n => n.id === 'do_no')).toBe(true);
        expect(taskMap.do_yes).toBeDefined();
        expect(taskMap.do_no).toBeDefined();
    });
});
