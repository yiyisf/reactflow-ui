import { describe, it, expect } from 'vitest';
import { notifySandboxRun, notifyStepAdded, subscribeSandboxRun, subscribeStepAdded } from './sandboxRunObserver';

describe('sandboxRunObserver: one store event is reported once', () => {
    it('with two IDEs subscribed, only the latest one receives the sandbox run', () => {
        const a: string[] = [];
        const b: string[] = [];
        const offA = subscribeSandboxRun((r) => a.push(r));
        const offB = subscribeSandboxRun((r) => b.push(r));
        notifySandboxRun('COMPLETED');
        expect(a).toEqual([]);
        expect(b).toEqual(['COMPLETED']);
        offB();
        notifySandboxRun('FAILED');
        expect(a).toEqual(['FAILED']);
        offA();
        notifySandboxRun('COMPLETED');
        expect(a).toEqual(['FAILED']);
    });

    it('step_added follows the same rule; an observer error does not throw', () => {
        const seen: string[] = [];
        const off1 = subscribeStepAdded((s) => seen.push(`1:${s}`));
        const off2 = subscribeStepAdded(() => { throw new Error('boom'); });
        const warn = console.warn;
        console.warn = () => {};
        try {
            expect(() => notifyStepAdded('builtin')).not.toThrow();
        } finally {
            console.warn = warn;
        }
        expect(seen).toEqual([]);
        off2();
        notifyStepAdded('builtin');
        expect(seen).toEqual(['1:builtin']);
        off1();
    });
});
