import { describe, it, expect } from 'vitest';
import {
    createDefaultTask,
    createJoinTaskFor,
    describeTaskRemoval,
    parseJsonDraft,
    patchTaskDefinitionField,
    prepareTaskForPaste,
    readTaskDefinitionField,
    validateBranchName,
    validateTaskRefName,
} from './taskEditing';
import type { TaskDef, WorkflowDef } from '../types/conductor';

const simple = (ref: string, extra: Partial<TaskDef> = {}): TaskDef =>
    ({ name: ref, taskReferenceName: ref, type: 'SIMPLE', ...extra }) as TaskDef;

describe('createDefaultTask', () => {
    it('SWITCH: evaluatorType + expression, the expression key exists in inputParameters', () => {
        const t = createDefaultTask('SWITCH', 'sw', 'sw');
        expect(t.evaluatorType).toBe('value-param');
        expect(t.inputParameters?.[t.expression!]).toBeDefined();
        expect(t.caseValueParam).toBeUndefined();
    });

    it('INLINE / HTTP / KAFKA_PUBLISH put their config under inputParameters', () => {
        expect(createDefaultTask('INLINE', 'i', 'i').inputParameters?.evaluatorType).toBe('graaljs');
        expect((createDefaultTask('INLINE', 'i', 'i') as any).evaluatorType).toBeUndefined();
        expect(createDefaultTask('HTTP', 'h', 'h').inputParameters?.http_request?.uri).toBeTruthy();
        expect((createDefaultTask('HTTP', 'h', 'h') as any).httpRequest).toBeUndefined();
        expect(createDefaultTask('KAFKA_PUBLISH', 'k', 'k').inputParameters?.kafka_request?.topic).toBeTruthy();
    });

    it('DO_WHILE loopCondition references its own iteration', () => {
        expect(createDefaultTask('DO_WHILE', 'l', 'loop_1').loopCondition).toContain("$.loop_1['iteration']");
    });

    it('createJoinTaskFor picks a free ref and joins every non-empty branch', () => {
        const fork = { ...createDefaultTask('FORK_JOIN', 'f', 'f'), forkTasks: [[simple('a')], [], [simple('b'), simple('c')]] };
        const join = createJoinTaskFor(fork, new Set(['f_join']));
        expect(join.taskReferenceName).toBe('f_join_2');
        expect(join.joinOn).toEqual(['a', 'c']);
    });
});

describe('validateTaskRefName (E7)', () => {
    const def = { tasks: [simple('a'), { ...simple('sw'), type: 'SWITCH', decisionCases: { x: [simple('nested')] } } as TaskDef] };

    it('accepts an unchanged or fresh valid name', () => {
        expect(validateTaskRefName(def, 'a', 'a')).toBeNull();
        expect(validateTaskRefName(def, 'fresh_1', 'a')).toBeNull();
    });

    it('rejects duplicates anywhere in the tree, bad characters, reserved and empty names', () => {
        expect(validateTaskRefName(def, 'nested', 'a')).toContain('已被其他任务使用');
        expect(validateTaskRefName(def, 'has space', 'a')).toContain('不支持的字符');
        expect(validateTaskRefName(def, 'workflow', 'a')).toContain('保留字');
        expect(validateTaskRefName(def, '__x', 'a')).toContain('两个下划线');
        expect(validateTaskRefName(def, '  ', 'a')).toContain('不能为空');
    });
});

describe('validateBranchName (E14)', () => {
    const sw = { ...simple('sw'), type: 'SWITCH', decisionCases: { a: [], b: [] } } as TaskDef;
    it('rejects duplicates, the reserved default and empty names', () => {
        expect(validateBranchName(sw, 'b', 'a')).toContain('已存在');
        expect(validateBranchName(sw, 'default', 'a')).toContain('保留名');
        expect(validateBranchName(sw, '', 'a')).toContain('不能为空');
        expect(validateBranchName(sw, 'a', 'a')).toBeNull();
        expect(validateBranchName(sw, 'c')).toBeNull();
    });
});

describe('describeTaskRemoval (E13)', () => {
    const def = {
        tasks: [
            { ...simple('fork'), type: 'FORK_JOIN', forkTasks: [[simple('a'), simple('b')], [simple('c')]] } as TaskDef,
            { ...simple('join'), type: 'JOIN', joinOn: ['b', 'c'] } as TaskDef,
            { ...simple('loop'), type: 'DO_WHILE', loopOver: [simple('l1')] } as TaskDef,
            simple('plain'),
        ],
    };

    it('deleting a JOIN says the FORK and its branch tasks go too', () => {
        const r = describeTaskRemoval(def, 'join');
        expect(r.message).toContain('"fork"');
        expect(r.message).toContain('3 个任务');
        expect(r.removedRefs.sort()).toEqual(['a', 'b', 'c', 'fork', 'join']);
    });

    it('deleting a FORK names the paired JOIN', () => {
        expect(describeTaskRemoval(def, 'fork').message).toContain('"join"');
    });

    it('containers mention their inner tasks; plain tasks get a simple question', () => {
        expect(describeTaskRemoval(def, 'loop').message).toContain('循环体中的 1 个任务');
        expect(describeTaskRemoval(def, 'plain').message).toContain('删除任务 "plain"');
    });
});

describe('prepareTaskForPaste (E15)', () => {
    it('renames the whole subtree and rewrites internal references only', () => {
        const fork: TaskDef = {
            ...simple('fork'), type: 'FORK_JOIN',
            forkTasks: [[simple('a'), simple('b', { inputParameters: { x: '${a.output.v}', y: '${outside.output.v}' } })]],
        } as TaskDef;
        const { task, join } = prepareTaskForPaste(fork, new Set(['fork', 'a', 'b', 'outside']), '_copy');
        expect(task.taskReferenceName).toBe('fork_copy');
        const [a, b] = task.forkTasks![0];
        expect(a.taskReferenceName).toBe('a_copy');
        expect(b.inputParameters).toEqual({ x: '${a_copy.output.v}', y: '${outside.output.v}' });
        expect(join?.type).toBe('JOIN');
        expect(join?.joinOn).toEqual(['b_copy']);
    });

    it('avoids collisions with existing refs', () => {
        const { task } = prepareTaskForPaste(simple('a'), new Set(['a', 'a_copy']), '_copy');
        expect(task.taskReferenceName).toBe('a_copy_2');
    });
});

describe('taskDefinition fields (E19)', () => {
    it('reads embedded values first and falls back to legacy top-level values', () => {
        expect(readTaskDefinitionField(simple('a', { timeoutSeconds: 5 } as any), 'timeoutSeconds')).toBe(5);
        expect(readTaskDefinitionField(simple('a', { timeoutSeconds: 5, taskDefinition: { timeoutSeconds: 9 } } as any), 'timeoutSeconds')).toBe(9);
    });

    it('writes into taskDefinition, migrates legacy fields and keeps responseTimeoutSeconds valid', () => {
        const t = simple('worker', { retryLogic: 'FIXED' } as any);
        const patch = patchTaskDefinitionField(t, 'timeoutSeconds', 60, 'ops@example.com');
        expect(patch.taskDefinition).toEqual({
            name: 'worker', ownerEmail: 'ops@example.com', retryLogic: 'FIXED', timeoutSeconds: 60, responseTimeoutSeconds: 60,
        });
        expect('retryLogic' in patch && patch.retryLogic === undefined).toBe(true);
    });

    it('clearing a value removes it from taskDefinition', () => {
        const t = simple('w', { taskDefinition: { name: 'w', retryDelaySeconds: 3 } } as any);
        expect(patchTaskDefinitionField(t, 'retryDelaySeconds', undefined).taskDefinition).toEqual({ name: 'w' });
    });
});

describe('parseJsonDraft (E18)', () => {
    it('parses valid JSON and explains invalid drafts', () => {
        expect(parseJsonDraft('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
        const bad = parseJsonDraft('{"a":');
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.error).toContain('JSON 格式有误');
        expect(parseJsonDraft('', { allowEmpty: true })).toEqual({ ok: true, value: {} });
        expect(parseJsonDraft('[1]', { requireObject: true }).ok).toBe(false);
    });
});

describe('type sanity', () => {
    it('createDefaultTask returns a task usable inside a WorkflowDef', () => {
        const def: WorkflowDef = { name: 'wf', tasks: [createDefaultTask('WAIT', 'w', 'w')] };
        expect(def.tasks[0].inputParameters).toEqual({ duration: '30s' });
    });
});
