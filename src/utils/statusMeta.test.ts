import { describe, it, expect } from 'vitest';
import { getStatusMeta, statusLabel, KNOWN_STATUSES } from './statusMeta';

const ALL = [
    'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'FAILED_WITH_TERMINAL_ERROR',
    'TIMED_OUT', 'SKIPPED', 'CANCELED', 'RUNNING', 'TERMINATED', 'PAUSED',
];

describe('statusMeta', () => {
    it('covers every Conductor task and workflow status', () => {
        expect([...KNOWN_STATUSES].sort()).toEqual([...ALL].sort());
    });

    it.each(ALL)('%s has a Chinese label, an icon and a colour token', (status) => {
        const m = getStatusMeta(status);
        expect(/[一-龥]/.test(m.label)).toBe(true);
        expect(m.label).not.toBe('未知');
        expect(m.icon).toBeTruthy();
        expect(m.iconName.length).toBeGreaterThan(0);
        expect(m.color).toMatch(/^var\(--cm-/);
        expect(m.className).toBe(status.toLowerCase().replace(/_/g, '-'));
    });

    it('uses the rule-5 words', () => {
        expect(statusLabel('IN_PROGRESS')).toBe('运行中');
        expect(statusLabel('RUNNING')).toBe('运行中');
        expect(statusLabel('COMPLETED')).toBe('成功');
        expect(statusLabel('FAILED')).toBe('失败');
        expect(statusLabel('TIMED_OUT')).toBe('已超时');
        expect(statusLabel('SKIPPED')).toBe('已跳过');
        expect(statusLabel('SCHEDULED')).toBe('等待中');
        expect(statusLabel('CANCELED')).toBe('已取消');
        expect(statusLabel('TERMINATED')).toBe('已终止');
        expect(statusLabel('PAUSED')).toBe('已暂停');
        expect(statusLabel('COMPLETED_WITH_ERRORS')).toBe('带错完成');
    });

    it('classifies terminal / failure / active', () => {
        expect(getStatusMeta('COMPLETED').terminal).toBe(true);
        expect(getStatusMeta('COMPLETED').isFailure).toBe(false);
        for (const s of ['FAILED', 'FAILED_WITH_TERMINAL_ERROR', 'TIMED_OUT', 'TERMINATED']) {
            expect(getStatusMeta(s).isFailure).toBe(true);
        }
        for (const s of ['SCHEDULED', 'IN_PROGRESS', 'RUNNING', 'PAUSED']) {
            expect(getStatusMeta(s).isActive).toBe(true);
            expect(getStatusMeta(s).terminal).toBe(false);
        }
        expect(getStatusMeta('SKIPPED').isFailure).toBe(false);
    });

    it('never throws on unknown, empty or lower-case input', () => {
        expect(getStatusMeta(undefined).label).toBe('未知');
        expect(getStatusMeta('').label).toBe('未知');
        expect(getStatusMeta('WHATEVER').className).toBe('unknown');
        expect(getStatusMeta('completed').label).toBe('成功');
    });
});
