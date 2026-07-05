import { describe, it, expect } from 'vitest';
import { validateWorkflow } from './validator';
import type { WorkflowDef, TaskDef } from '../types/conductor';

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
