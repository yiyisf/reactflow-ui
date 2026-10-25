import { describe, it, expect } from 'vitest';
import type { TaskInstance } from '../types/conductor';
import { generateStorySentence, runHeadline } from './runStory';

const task = (over: Partial<TaskInstance>): TaskInstance =>
    ({ taskId: 'x', referenceTaskName: 'r', taskType: 'SIMPLE', status: 'COMPLETED', ...over }) as TaskInstance;

describe('B11 status-aware sentences', () => {
    it.each([
        ['IN_PROGRESS', '正在执行'],
        ['SCHEDULED', '等待执行'],
        ['SKIPPED', '已跳过'],
        ['TIMED_OUT', '已超时'],
        ['CANCELED', '已取消'],
        ['FAILED', '中断'],
        ['COMPLETED_WITH_ERRORS', '部分错误'],
    ])('%s does not say the step completed', (status, word) => {
        const s = generateStorySentence(task({ status: status as TaskInstance['status'] }));
        expect(s).toContain(word);
        expect(s).not.toContain('已完成。');
    });

    it('run headline follows the workflow status', () => {
        expect(runHeadline({ status: 'COMPLETED', startTime: 1000, endTime: 3500 })).toEqual({ title: '全部步骤已完成', tone: 'success', durationSec: '2.5' });
        expect(runHeadline({ status: 'RUNNING', startTime: 1000 }).title).toBe('正在运行');
        expect(runHeadline({ status: 'RUNNING', startTime: 1000 }).durationSec).toBeUndefined();
        expect(runHeadline({ status: 'TERMINATED' }).title).toBe('运行已终止');
        expect(runHeadline({ status: 'TIMED_OUT' }).title).toBe('运行已超时');
        expect(runHeadline({ status: 'PAUSED' }).title).toBe('运行已暂停');
        expect(runHeadline({ status: 'FAILED' }).tone).toBe('failed');
    });
});

describe('B12 sentences come from real output only', () => {
    it('metrics: reports the real CPU value and never says "系统运行平稳"', () => {
        const s = generateStorySentence(task({ outputData: { cpuUsagePercent: 95 } }), { actionId: 'ecs.get_monitor_metrics' });
        expect(s).toContain('95%');
        expect(s).not.toContain('平稳');
        const none = generateStorySentence(task({ outputData: {} }), { actionId: 'ecs.get_monitor_metrics' });
        expect(none).not.toContain('20%');
        expect(none).not.toContain('CPU');
    });

    it('approval: approved=false is a rejection; no invented reviewer', () => {
        const rejected = generateStorySentence(task({ taskType: 'HUMAN', outputData: { approved: false, reviewer: 'alice' } }));
        expect(rejected).toContain('alice');
        expect(rejected).toContain('驳回');
        expect(rejected).not.toContain('批准');
        const anon = generateStorySentence(task({ taskType: 'HUMAN', outputData: { approved: true } }));
        expect(anon).not.toContain('devops_lead');
        expect(anon).toContain('已批准');
    });

    it('query / run_command / snapshot omit missing values instead of inventing them', () => {
        const q = generateStorySentence(task({ outputData: {} }), { actionId: 'ecs.query_instance' });
        expect(q).not.toContain('RUNNING');
        expect(q).not.toContain('未绑定');
        const cmd = generateStorySentence(task({ outputData: {} }), { actionId: 'ecs.run_command' });
        expect(cmd).not.toContain('cmd-ok');
        const snap = generateStorySentence(task({ outputData: {} }), { actionId: 'ecs.create_snapshot' });
        expect(snap).not.toContain('s-done');
        expect(generateStorySentence(task({ outputData: { commandId: 'c-9', exitCode: 2 } }), { actionId: 'ecs.run_command' })).toContain('退出码 2');
    });

    it('JOIN summarises the real branch results', () => {
        const all = [
            task({ referenceTaskName: 'a', status: 'COMPLETED' }),
            task({ referenceTaskName: 'b', status: 'FAILED' }),
        ];
        const join = task({ taskType: 'JOIN', inputData: { joinOn: ['a', 'b'] } });
        const s = generateStorySentence(join, { allTasks: all });
        expect(s).toContain('1 个失败');
        expect(s).not.toContain('全部成功');
        const ok = generateStorySentence(join, { allTasks: [all[0], task({ referenceTaskName: 'b', status: 'COMPLETED' })] });
        expect(ok).toContain('全部成功');
        expect(generateStorySentence(task({ taskType: 'JOIN' }), { allTasks: all })).toBe('并行分支已汇合。');
    });

    it('SWITCH uses evaluationResult; DO_WHILE does not invent an iteration count', () => {
        expect(generateStorySentence(task({ taskType: 'SWITCH', outputData: { evaluationResult: ['vip'] } }))).toContain('vip');
        expect(generateStorySentence(task({ taskType: 'SWITCH', outputData: {} }))).toBe('已完成条件判断。');
        expect(generateStorySentence(task({ taskType: 'DO_WHILE', outputData: {} }))).toBe('循环已结束。');
        expect(generateStorySentence(task({ taskType: 'DO_WHILE', iteration: 3 }))).toContain('3 轮');
    });
});
