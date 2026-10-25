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

describe('parseWorkflow · v1.3.1 编辑交互（E6 / E16）', () => {
    it('renders an empty FORK branch as a clickable plusNode bound to its branch index', () => {
        const def: WorkflowDef = {
            name: 'wf',
            tasks: [
                task('f', { type: 'FORK_JOIN', forkTasks: [[task('a')], []] } as any),
                task('j', { type: 'JOIN', joinOn: ['a'] } as any),
            ],
        } as any;
        const { nodes, edges } = parseWorkflow(def, 'TB');
        const ph = nodes.find(n => n.id === 'f_empty_branch_1')!;
        expect(ph.type).toBe('plusNode');
        expect(ph.data.parentRef).toBe('f');
        expect(ph.data.edgeData).toEqual({ forkIndex: 1 });
        const toJoin = edges.find(e => e.source === 'f_empty_branch_1' && e.target === 'j')!;
        expect(toJoin.data).toEqual({ forkIndex: 1, branchParentRef: 'f' });
    });

    it('draws a dashed "不等待" edge for branches outside a partial joinOn', () => {
        const def: WorkflowDef = {
            name: 'wf',
            tasks: [
                task('f', { type: 'FORK_JOIN', forkTasks: [[task('a')], [task('b')]] } as any),
                task('j', { type: 'JOIN', joinOn: ['a'] } as any),
            ],
        } as any;
        const { edges } = parseWorkflow(def, 'TB', { hideEmptyBranches: true });
        expect(edges.find(e => e.source === 'a' && e.target === 'j')?.data).toBeUndefined();
        expect(edges.find(e => e.source === 'b' && e.target === 'j')?.data).toEqual({ notJoined: true });
    });

    it('marks SWITCH exit edges with exitOf so "+" inserts after the SWITCH', () => {
        const def: WorkflowDef = {
            name: 'wf',
            tasks: [
                task('sw', { type: 'SWITCH', evaluatorType: 'value-param', expression: 'k', decisionCases: { x: [task('in_x')] }, defaultCase: [] } as any),
                task('next'),
            ],
        } as any;
        const { edges } = parseWorkflow(def, 'TB');
        expect(edges.find(e => e.source === 'in_x' && e.target === 'next')?.data).toEqual({ exitOf: 'sw' });
        expect(edges.find(e => e.source === 'sw_empty_default' && e.target === 'next')?.data).toEqual({ exitOf: 'sw' });
    });
});
