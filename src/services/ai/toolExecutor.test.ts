import { describe, it, expect } from 'vitest';
import {
    applyPatch, computeDiff, applyPartialProposal, describeDiff, executeToolCall,
    type PatchOp, type DiffSummary, type PartialAcceptSelection, type ToolExecutionContext,
} from './toolExecutor';
import type { WorkflowDef, TaskDef } from '../../types/conductor';
import type { WorkflowLibraryItem } from '../../types/workflowLibrary';

function task(ref: string, overrides: Partial<TaskDef> = {}): TaskDef {
    return { name: ref, taskReferenceName: ref, type: 'SIMPLE', ...overrides } as TaskDef;
}

function def(tasks: TaskDef[], overrides: Partial<WorkflowDef> = {}): WorkflowDef {
    return { name: 'wf', tasks, version: 1, schemaVersion: 2, ...overrides } as WorkflowDef;
}

function ctx(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
    return {
        workflowDef: def([task('a')]),
        validationResults: { isValid: true, errors: [], warnings: [] },
        libraryItems: [],
        ...overrides,
    };
}

// ─── Pure functions: applyPatch / computeDiff / applyPartialProposal / describeDiff ──

describe('applyPatch', () => {
    it('add_task appends to the end when no afterRef is given', () => {
        const result = applyPatch(def([task('a')]), [{ op: 'add_task', task: task('b') }]);
        expect(result.tasks.map(t => t.taskReferenceName)).toEqual(['a', 'b']);
    });

    it('add_task inserts right after afterRef', () => {
        const result = applyPatch(def([task('a'), task('c')]), [{ op: 'add_task', task: task('b'), afterRef: 'a' }]);
        expect(result.tasks.map(t => t.taskReferenceName)).toEqual(['a', 'b', 'c']);
    });

    it('update_task merges changes onto the matching task, including nested inside forkTasks', () => {
        const nested = task('inner', { timeoutSeconds: 10 });
        const wf = def([task('fork', { type: 'FORK_JOIN', forkTasks: [[nested]] } as any)]);
        const result = applyPatch(wf, [{ op: 'update_task', ref: 'inner', changes: { timeoutSeconds: 99 } }]);
        const forkTasks = (result.tasks[0] as any).forkTasks as TaskDef[][];
        expect(forkTasks[0][0].timeoutSeconds).toBe(99);
    });

    it('remove_task removes the matching task', () => {
        const result = applyPatch(def([task('a'), task('b')]), [{ op: 'remove_task', ref: 'a' }]);
        expect(result.tasks.map(t => t.taskReferenceName)).toEqual(['b']);
    });

    it('update_props merges workflow-level fields without touching tasks', () => {
        const result = applyPatch(def([task('a')]), [{ op: 'update_props', props: { description: 'new desc' } }]);
        expect(result.description).toBe('new desc');
        expect(result.tasks).toHaveLength(1);
    });

    it('add_switch_branch adds a named case and guards against overwriting an existing one', () => {
        const wf = def([task('sw', { type: 'SWITCH', decisionCases: { A: [] } } as any)]);
        const withB = applyPatch(wf, [{ op: 'add_switch_branch', ref: 'sw', caseName: 'B' }]);
        expect(Object.keys((withB.tasks[0] as any).decisionCases)).toEqual(['A', 'B']);

        const unchanged = applyPatch(withB, [{ op: 'add_switch_branch', ref: 'sw', caseName: 'A' }]);
        expect((unchanged.tasks[0] as any).decisionCases.A).toEqual([]); // not overwritten
    });

    it('add_switch_branch adds a default case only if one does not already exist', () => {
        const wf = def([task('sw', { type: 'SWITCH' } as any)]);
        const withDefault = applyPatch(wf, [{ op: 'add_switch_branch', ref: 'sw', caseName: 'default' }]);
        expect((withDefault.tasks[0] as any).defaultCase).toEqual([]);
    });

    it('add_fork_branch appends a deterministically-named branch', () => {
        const wf = def([task('fork', { type: 'FORK_JOIN', forkTasks: [] } as any)]);
        const once = applyPatch(wf, [{ op: 'add_fork_branch', ref: 'fork' }]);
        const twice = applyPatch(once, [{ op: 'add_fork_branch', ref: 'fork' }]);
        const branches = (twice.tasks[0] as any).forkTasks as TaskDef[][];
        expect(branches).toHaveLength(2);
        expect(branches[0][0].taskReferenceName).toBe('fork_branch_1');
        expect(branches[1][0].taskReferenceName).toBe('fork_branch_2');
    });
});

describe('computeDiff', () => {
    it('marks everything as added when there is no prior def', () => {
        const diff = computeDiff(null, def([task('a'), task('b')]));
        expect(diff).toEqual({ added: ['a', 'b'], modified: [], removed: [], propsChanged: false });
    });

    it('detects added / modified / removed tasks', () => {
        const before = def([task('a'), task('b')]);
        const after = def([task('a', { timeoutSeconds: 5 }), task('c')]);
        const diff = computeDiff(before, after);
        expect(diff.added).toEqual(['c']);
        expect(diff.modified).toEqual(['a']);
        expect(diff.removed).toEqual(['b']);
    });

    it('describes a timeout change in business language', () => {
        const before = def([task('a', { timeoutSeconds: 300 })]);
        const after = def([task('a', { timeoutSeconds: 600 })]);
        const detail = computeDiff(before, after).modifiedDetails?.find(d => d.ref === 'a');
        expect(detail?.changes).toEqual(['超时：5 分钟 → 10 分钟']);
    });

    it('describes a newly added retry count as "新增失败重试"', () => {
        const before = def([task('a', { retryCount: 0 })]);
        const after = def([task('a', { retryCount: 3 })]);
        const detail = computeDiff(before, after).modifiedDetails?.find(d => d.ref === 'a');
        expect(detail?.changes).toEqual(['新增失败重试（3 次）']);
    });

    it('describes a name change and reports multiple field changes together', () => {
        const before = def([task('a', { name: 'old name', timeoutSeconds: 60 })]);
        const after = def([task('a', { name: 'new name', timeoutSeconds: 120 })]);
        const detail = computeDiff(before, after).modifiedDetails?.find(d => d.ref === 'a');
        expect(detail?.changes).toEqual(['名称：「old name」→「new name」', '超时：1 分钟 → 2 分钟']);
    });

    it('falls back to a generic note when no tracked field changed but the task JSON differs', () => {
        const before = def([task('a', { description: 'x' } as any)]);
        const after = def([task('a', { description: 'y' } as any)]);
        const detail = computeDiff(before, after).modifiedDetails?.find(d => d.ref === 'a');
        expect(detail?.changes).toEqual(['配置已调整']);
    });

    it('detects workflow-level property changes', () => {
        const before = def([task('a')], { description: 'old' });
        const after = def([task('a')], { description: 'new' });
        expect(computeDiff(before, after).propsChanged).toBe(true);
    });

    it('detects task reordering among shared tasks', () => {
        const before = def([task('a'), task('b')]);
        const after = def([task('b'), task('a')]);
        expect(computeDiff(before, after).reordered).toBe(true);
    });

    it('does not flag reorder when shared task order is unchanged', () => {
        const before = def([task('a'), task('b')]);
        const after = def([task('a'), task('b'), task('c')]);
        expect(computeDiff(before, after).reordered).toBe(false);
    });
});

describe('applyPartialProposal', () => {
    const current = def([task('keep'), task('modify', { timeoutSeconds: 1 }), task('drop')]);
    const proposed = def([task('keep'), task('modify', { timeoutSeconds: 99 }), task('added')]);
    const diff: DiffSummary = { added: ['added'], modified: ['modify'], removed: ['drop'], propsChanged: false };

    function selection(overrides: Partial<PartialAcceptSelection> = {}): PartialAcceptSelection {
        return { added: new Set(), modified: new Set(), removed: new Set(), propsChanged: false, reordered: false, ...overrides };
    }

    it('excludes an added task that was not selected', () => {
        const result = applyPartialProposal(current, proposed, diff, selection());
        expect(result.tasks.map(t => t.taskReferenceName)).not.toContain('added');
    });

    it('includes an added task that was selected', () => {
        const result = applyPartialProposal(current, proposed, diff, selection({ added: new Set(['added']) }));
        expect(result.tasks.map(t => t.taskReferenceName)).toContain('added');
    });

    it('keeps the current version of a modified task when not selected', () => {
        const result = applyPartialProposal(current, proposed, diff, selection());
        const modifyTask = result.tasks.find(t => t.taskReferenceName === 'modify');
        expect(modifyTask?.timeoutSeconds).toBe(1);
    });

    it('applies the proposed version of a modified task when selected', () => {
        const result = applyPartialProposal(current, proposed, diff, selection({ modified: new Set(['modify']) }));
        const modifyTask = result.tasks.find(t => t.taskReferenceName === 'modify');
        expect(modifyTask?.timeoutSeconds).toBe(99);
    });

    it('restores the original task order when reordering was not selected', () => {
        const before = def([task('a'), task('b')]);
        const after = def([task('b'), task('a')]);
        const reorderedDiff: DiffSummary = { added: [], modified: [], removed: [], propsChanged: false, reordered: true };
        const result = applyPartialProposal(before, after, reorderedDiff, selection({ reordered: false }));
        expect(result.tasks.map(t => t.taskReferenceName)).toEqual(['a', 'b']);
    });

    it('keeps the proposed order when reordering is selected', () => {
        const before = def([task('a'), task('b')]);
        const after = def([task('b'), task('a')]);
        const reorderedDiff: DiffSummary = { added: [], modified: [], removed: [], propsChanged: false, reordered: true };
        const result = applyPartialProposal(before, after, reorderedDiff, selection({ reordered: true }));
        expect(result.tasks.map(t => t.taskReferenceName)).toEqual(['b', 'a']);
    });

    it('re-inserts a removed task at its original position when not selected for removal', () => {
        const result = applyPartialProposal(current, proposed, diff, selection());
        expect(result.tasks.map(t => t.taskReferenceName)).toContain('drop');
    });

    it('omits a removed task when selected for removal', () => {
        const result = applyPartialProposal(current, proposed, diff, selection({ removed: new Set(['drop']) }));
        expect(result.tasks.map(t => t.taskReferenceName)).not.toContain('drop');
    });

    it('merges workflow-level props only when propsChanged is selected', () => {
        const propsDiff: DiffSummary = { added: [], modified: [], removed: [], propsChanged: true };
        const currentWithDesc = def([task('a')], { description: 'old' });
        const proposedWithDesc = def([task('a')], { description: 'new' });

        const skipped = applyPartialProposal(currentWithDesc, proposedWithDesc, propsDiff, selection());
        expect(skipped.description).toBe('old');

        const applied = applyPartialProposal(currentWithDesc, proposedWithDesc, propsDiff, selection({ propsChanged: true }));
        expect(applied.description).toBe('new');
    });
});

describe('describeDiff', () => {
    it('describes a no-op diff', () => {
        expect(describeDiff({ added: [], modified: [], removed: [], propsChanged: false })).toBe('无实质性变更');
    });

    it('describes a mixed diff with all kinds of changes', () => {
        const text = describeDiff({ added: ['a'], modified: ['b'], removed: ['c'], propsChanged: true, reordered: true });
        expect(text).toContain('新增 1 个任务（a）');
        expect(text).toContain('修改 1 个任务（b）');
        expect(text).toContain('删除 1 个任务（c）');
        expect(text).toContain('调整了任务顺序');
        expect(text).toContain('修改了工作流属性');
    });
});

// ─── executeToolCall: exercised against the real workflowStore/libraryStore ──────

describe('executeToolCall', () => {
    it('replace_workflow errors when the workflow field is missing', () => {
        const result = executeToolCall('replace_workflow', {}, ctx());
        expect(result.type).toBe('error');
    });

    it('replace_workflow proposes a diff against the current def', () => {
        const result = executeToolCall('replace_workflow', { workflow: def([task('a'), task('b')]) }, ctx({ workflowDef: null }));
        expect(result.type).toBe('propose');
        expect(result.diff?.added).toEqual(expect.arrayContaining(['a', 'b']));
    });

    it('patch_workflow errors with no current workflow loaded', () => {
        const result = executeToolCall('patch_workflow', { ops: [{ op: 'add_task', task: task('x') }] as PatchOp[] }, ctx({ workflowDef: null }));
        expect(result.type).toBe('error');
    });

    it('patch_workflow errors on an empty ops list', () => {
        const result = executeToolCall('patch_workflow', { ops: [] }, ctx());
        expect(result.type).toBe('error');
    });

    it('patch_workflow proposes the patched result', () => {
        const result = executeToolCall('patch_workflow', { ops: [{ op: 'add_task', task: task('new_task') }] as PatchOp[] }, ctx());
        expect(result.type).toBe('propose');
        expect(result.proposed?.tasks.some(t => t.taskReferenceName === 'new_task')).toBe(true);
    });

    it('get_workflow_state reports empty canvas when nothing is loaded', () => {
        const result = executeToolCall('get_workflow_state', {}, ctx({ workflowDef: null }));
        expect(result.type).toBe('info');
        expect(result.text).toContain('画布为空');
    });

    it('get_workflow_state surfaces validation errors from context', () => {
        const result = executeToolCall('get_workflow_state', {}, ctx({
            validationResults: { isValid: false, errors: [{ type: 'GLOBAL', ref: '', message: '缺少必填字段' }], warnings: [] },
        }));
        expect(result.text).toContain('缺少必填字段');
    });

    it('validate_workflow reports success for a clean workflow', () => {
        const result = executeToolCall('validate_workflow', {}, ctx({ workflowDef: def([task('a')]) }));
        expect(result.text).toContain('校验通过');
    });

    it('validate_workflow surfaces the duplicate-reference-name rule', () => {
        const result = executeToolCall('validate_workflow', {}, ctx({ workflowDef: def([task('dup'), task('dup')]) }));
        expect(result.text).toContain('引用名在工作流中必须唯一');
    });

    it('search_workflow_library reports when no library is configured', () => {
        const result = executeToolCall('search_workflow_library', { query: 'foo' }, ctx({ libraryItems: [] }));
        expect(result.text).toContain('无法搜索');
    });

    it('search_workflow_library finds matches by name/description/tags', () => {
        const library: WorkflowLibraryItem[] = [
            { workflowName: 'send_email', workflowLevel: 'L1', version: '1', description: '发送邮件通知', tags: ['通知'] },
        ];
        const result = executeToolCall('search_workflow_library', { query: '邮件' }, ctx({ libraryItems: library }));
        expect(result.text).toContain('send_email');
    });

    it('search_workflow_library respects the level filter', () => {
        const library: WorkflowLibraryItem[] = [
            { workflowName: 'l1_wf', workflowLevel: 'L1', version: '1', description: '基础任务', tags: [] },
            { workflowName: 'l2_wf', workflowLevel: 'L2', version: '1', description: '业务任务', tags: [] },
        ];
        const result = executeToolCall('search_workflow_library', { query: '任务', level: 'L2' }, ctx({ libraryItems: library }));
        expect(result.text).toContain('l2_wf');
        expect(result.text).not.toContain('l1_wf');
    });

    it('replace_workflow infers L2 when the proposal references an L1 sub-workflow', () => {
        const library: WorkflowLibraryItem[] = [
            { workflowName: 'create_vm', workflowLevel: 'L1', version: '1', description: '创建虚机', tags: [] },
        ];
        const proposed = def([task('call_sub', {
            type: 'SUB_WORKFLOW',
            subWorkflowParam: { name: 'create_vm', version: 1 },
        } as any)]);
        const result = executeToolCall('replace_workflow', { workflow: proposed }, ctx({ libraryItems: library }));
        expect(result.inferredLevel).toBe('L2');
    });

    it('returns the truncated-args error without inspecting the rest of the context', () => {
        const result = executeToolCall('replace_workflow', { __truncated__: true }, ctx());
        expect(result.type).toBe('error');
        expect(result.text).toContain('截断');
    });

    it('errors on an unknown tool name', () => {
        const result = executeToolCall('does_not_exist', {}, ctx());
        expect(result.type).toBe('error');
    });
});
