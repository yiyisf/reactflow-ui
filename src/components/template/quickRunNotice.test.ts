import { describe, it, expect } from 'vitest';
import { describeQuickRun, describeQuickRunError } from './quickRunNotice';

describe('U1: 模板试跑结果按真实状态描述', () => {
    it('[U1-01] 成功：中文状态与任务数', () => {
        const n = describeQuickRun('每日快照', { status: 'COMPLETED', tasks: [{}, {}] as any });
        expect(n.status).toBe('COMPLETED');
        expect(n.text).toContain('试跑成功');
        expect(n.text).toContain('2 个任务');
    });

    it('[U1-02] 失败：写出失败任务与原因，不再说「通过」', () => {
        const n = describeQuickRun('每日快照', {
            status: 'FAILED',
            tasks: [
                { referenceTaskName: 'check_host', status: 'COMPLETED' },
                { referenceTaskName: 'create_snap', status: 'FAILED', reasonForIncompletion: '磁盘只读' },
            ] as any,
        });
        expect(n.status).toBe('FAILED');
        expect(n.text).toContain('试跑失败');
        expect(n.text).toContain('任务「create_snap」失败');
        expect(n.text).toContain('磁盘只读');
        expect(n.text).not.toContain('通过');
    });

    it('[U1-03] 超时、终止、试跑出错都如实说明', () => {
        expect(describeQuickRun('t', { status: 'TERMINATED', tasks: [], reasonForIncompletion: '库存不足' } as any).text).toMatch(/已终止.*库存不足/);
        expect(describeQuickRun('t', { status: 'TIMED_OUT', tasks: [{ referenceTaskName: 'w', status: 'TIMED_OUT' }] } as any).text).toContain('任务「w」已超时');
        expect(describeQuickRunError('t', new Error('定义为空'))).toEqual({ status: 'FAILED', text: '《t》试跑出错：定义为空。检查模板定义后重试。' });
    });
});
