import { describe, it, expect } from 'vitest';
import { validateWorkflow } from './validator';
import type { WorkflowDef, TaskDef } from '../types/conductor';
import { BUILTIN_WORKFLOW_TEMPLATES } from '../template/builtin/templates';
import { defaultActionRegistry } from '../actions/registry';

function task(ref: string, overrides: Partial<TaskDef> = {}): TaskDef {
    return { name: ref, taskReferenceName: ref, type: 'SIMPLE', ...overrides } as TaskDef;
}

describe('validateWorkflow', () => {
    it('reports an error for a null def', () => {
        const result = validateWorkflow(null);
        expect(result.isValid).toBe(false);
        expect(result.errors[0].message).toContain('工作流定义为空');
    });

    it('is valid for a minimal single-task workflow', () => {
        const def: WorkflowDef = { name: 'wf', version: 1, tasks: [task('a')] } as any;
        const result = validateWorkflow(def);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('requires at least one task', () => {
        const def: WorkflowDef = { name: 'wf', version: 1, tasks: [] } as any;
        const result = validateWorkflow(def);
        expect(result.errors.some(e => e.message.includes('至少一个任务'))).toBe(true);
    });

    it('flags duplicate task reference names', () => {
        const def: WorkflowDef = { name: 'wf', version: 1, tasks: [task('dup'), task('dup')] } as any;
        const result = validateWorkflow(def);
        expect(result.errors.some(e => e.message.includes('唯一'))).toBe(true);
    });

    it('flags a taskReferenceName that violates the allowed pattern', () => {
        const def: WorkflowDef = { name: 'wf', version: 1, tasks: [task('bad ref!')] } as any;
        const result = validateWorkflow(def);
        expect(result.errors.some(e => e.message.includes('仅允许字母、数字和下划线'))).toBe(true);
    });

    it('flags an HTTP task missing the required uri as an error and missing method as a warning', () => {
        const def: WorkflowDef = {
            name: 'wf', version: 1,
            tasks: [task('http1', { type: 'HTTP', inputParameters: { http_request: {} } } as any)],
        } as any;
        const result = validateWorkflow(def);
        expect(result.errors.some(e => e.message.includes('请求地址'))).toBe(true);
        expect(result.warnings.some(w => w.message.includes('Method'))).toBe(true);
    });

    it('detects an illegal cycle between tasks (excluding DO_WHILE)', () => {
        // SWITCH branch that loops back to an earlier task creates a genuine cycle.
        const def: WorkflowDef = {
            name: 'wf', version: 1,
            tasks: [
                task('start'),
                task('sw', { type: 'SWITCH', decisionCases: { back: [task('start')] } } as any),
            ],
        } as any;
        const result = validateWorkflow(def);
        expect(result.errors.some(e => e.message.toLowerCase().includes('环') || e.message.toLowerCase().includes('cycle'))).toBe(true);
    });
});

describe('validateWorkflow · v1.3.1 结构规则（E21）', () => {
    const wf = (tasks: TaskDef[], extra: Record<string, unknown> = {}) => ({ name: 'wf', version: 1, tasks, ...extra }) as unknown as WorkflowDef;
    const fork = (ref: string, branches: TaskDef[][]) => task(ref, { type: 'FORK_JOIN', forkTasks: branches } as any);
    const join = (ref: string, joinOn: string[]) => task(ref, { type: 'JOIN', joinOn } as any);

    it('flags ${x.output} pointing at a task that does not exist', () => {
        const result = validateWorkflow(wf([task('a', { inputParameters: { v: '${ghost.output.value}' } })]));
        expect(result.errors.some(e => e.ref === 'a' && e.message.includes('${ghost.output.value}'))).toBe(true);
    });

    it('does not flag references to existing upstream tasks or workflow input', () => {
        const result = validateWorkflow(wf([
            task('a'),
            task('b', { inputParameters: { v: '${a.output.value}', w: '${workflow.input.x}' } }),
        ]));
        expect(result.errors).toEqual([]);
    });

    it('requires a SWITCH expression', () => {
        const result = validateWorkflow(wf([
            task('sw', { type: 'SWITCH', evaluatorType: 'value-param', decisionCases: { a: [task('x')] } } as any),
        ]));
        expect(result.errors.some(e => e.ref === 'sw' && e.message.includes('expression'))).toBe(true);
    });

    it('accepts a SWITCH with evaluatorType + expression', () => {
        const ok = validateWorkflow(wf([
            task('sw', { type: 'SWITCH', evaluatorType: 'javascript', expression: '"a"', decisionCases: { a: [task('x')] } } as any),
        ]));
        expect(ok.errors).toEqual([]);
    });

    it('[E25-01] SWITCH 只写了 caseValueParam / caseExpression 时报错并给出改法（Conductor 保存会拒绝）', () => {
        for (const legacyFields of [{ caseValueParam: 'k' }, { caseExpression: '$.k' }]) {
            const legacy = validateWorkflow(wf([
                task('sw', { type: 'SWITCH', ...legacyFields, inputParameters: { k: '1' }, decisionCases: { a: [task('x')] } } as any),
            ]));
            const err = legacy.errors.find(e => e.ref === 'sw' && e.message.includes('caseValueParam'));
            expect(err?.message).toMatch(/expression/);
        }
        // DECISION 仍用 caseValueParam，不受影响
        const decision = validateWorkflow(wf([
            task('d', { type: 'DECISION', caseValueParam: 'k', inputParameters: { k: '1' }, decisionCases: { a: [task('x')] } } as any),
        ]));
        expect(decision.errors).toEqual([]);
    });

    it('[E25-02] SWITCH 有 expression 没有 evaluatorType 时报错', () => {
        const result = validateWorkflow(wf([
            task('sw', { type: 'SWITCH', expression: 'k', inputParameters: { k: '1' }, decisionCases: { a: [task('x')] } } as any),
        ]));
        expect(result.errors.some(e => e.ref === 'sw' && e.message.includes('evaluatorType'))).toBe(true);
    });

    it('[E24-01] TERMINATE 没填 terminationStatus 只警告，填错才报错', () => {
        const missing = validateWorkflow(wf([task('t', { type: 'TERMINATE', inputParameters: {} } as any)]));
        expect(missing.errors).toEqual([]);
        expect(missing.warnings.some(w => w.ref === 't' && w.message.includes('terminationStatus'))).toBe(true);
        const wrong = validateWorkflow(wf([task('t', { type: 'TERMINATE', inputParameters: { terminationStatus: 'DONE' } } as any)]));
        expect(wrong.errors.some(e => e.ref === 't')).toBe(true);
    });

    it('requires FORK_JOIN to be immediately followed by JOIN', () => {
        const bad = validateWorkflow(wf([fork('f', [[task('a')], [task('b')]]), task('between'), join('j', ['a', 'b'])]));
        expect(bad.errors.some(e => e.ref === 'f' && e.message.includes('JOIN'))).toBe(true);
        const good = validateWorkflow(wf([fork('f', [[task('a')], [task('b')]]), join('j', ['a'])]));
        expect(good.errors).toEqual([]);
    });

    it('requires FORK_JOIN_DYNAMIC to be immediately followed by JOIN', () => {
        const result = validateWorkflow(wf([
            task('d', { type: 'FORK_JOIN_DYNAMIC', dynamicForkTasksParam: 'dt', dynamicForkTasksInputParamName: 'di', inputParameters: { dt: [], di: {} } } as any),
        ]));
        expect(result.errors.some(e => e.ref === 'd' && e.message.includes('JOIN'))).toBe(true);
    });

    it('flags joinOn entries that reference missing tasks', () => {
        const result = validateWorkflow(wf([fork('f', [[task('a')]]), join('j', ['a', 'nope'])]));
        expect(result.errors.some(e => e.ref === 'j' && e.message.includes('"nope"'))).toBe(true);
    });

    it('treats TERMINATED as a valid termination status', () => {
        const result = validateWorkflow(wf([task('t', { type: 'TERMINATE', inputParameters: { terminationStatus: 'TERMINATED' } } as any)]));
        expect(result.errors).toEqual([]);
    });

    it('does not require version (Conductor defaults it to 1)', () => {
        const result = validateWorkflow({ name: 'wf', tasks: [task('a')] } as any);
        expect(result.errors).toEqual([]);
    });
});

describe('validateWorkflow · v1.3.2 E26 补齐的规则', () => {
    const wf = (tasks: TaskDef[]) => ({ name: 'wf', version: 1, tasks }) as unknown as WorkflowDef;
    const errorsOf = (t: Record<string, unknown>) => validateWorkflow(wf([task('t', t as any)])).errors.filter(e => e.ref === 't').map(e => e.message);

    it('[E26-01] KAFKA_PUBLISH 缺 kafka_request.topic / bootStrapServers 报错，旧写法（直接放 inputParameters）也报', () => {
        expect(errorsOf({ type: 'KAFKA_PUBLISH', inputParameters: { kafka_request: { topic: 't', bootStrapServers: 'k:9092', value: {} } } })).toEqual([]);
        const missing = errorsOf({ type: 'KAFKA_PUBLISH', inputParameters: { topic: 't' } });
        expect(missing.some(m => m.includes('kafka_request.topic'))).toBe(true);
        expect(missing.some(m => m.includes('bootStrapServers'))).toBe(true);
    });

    it('[E26-02] EVENT 缺 sink 报错', () => {
        expect(errorsOf({ type: 'EVENT', inputParameters: {} }).some(m => m.includes('sink'))).toBe(true);
        expect(errorsOf({ type: 'EVENT', sink: 'conductor', inputParameters: {} })).toEqual([]);
    });

    it('[E26-03] WAIT 同时有 duration 与 until 报错，只有一个时通过', () => {
        expect(errorsOf({ type: 'WAIT', inputParameters: { duration: '10s', until: '2026-11-01 10:00 CST' } }).some(m => m.includes('二选一'))).toBe(true);
        expect(errorsOf({ type: 'WAIT', inputParameters: { duration: '10s' } })).toEqual([]);
        expect(errorsOf({ type: 'WAIT', inputParameters: { until: '2026-11-01 10:00 CST' } })).toEqual([]);
    });

    it('[E26-04] INLINE 只认 expression，写在 scriptExpression 里会提示移过去', () => {
        expect(errorsOf({ type: 'INLINE', inputParameters: { evaluatorType: 'graaljs', expression: '1' } })).toEqual([]);
        const lambdaStyle = errorsOf({ type: 'INLINE', inputParameters: { evaluatorType: 'graaljs', scriptExpression: '1' } });
        expect(lambdaStyle.some(m => m.includes('scriptExpression') && m.includes('expression'))).toBe(true);
    });

    it('[E26-05] 内置模板与业务模式的通知动作不触发 SWITCH / EVENT / KAFKA / WAIT 新规则', () => {
        const newRule = /caseValueParam|evaluatorType|sink|kafka_request|二选一|scriptExpression/;
        for (const tpl of BUILTIN_WORKFLOW_TEMPLATES) {
            const hits = validateWorkflow(tpl.definition).errors.filter(e => newRule.test(e.message));
            expect(hits, tpl.id).toEqual([]);
        }
        const notify = defaultActionRegistry.getAction('notify.send_message')!;
        const compiled = notify.compile({ channel: 'webhook_dingtalk', title: 't', content: 'c' }, { taskReferenceName: 'n' } as any);
        expect(compiled.sink).toBe('conductor');
    });
});
