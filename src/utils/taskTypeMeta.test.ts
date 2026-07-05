import { describe, it, expect } from 'vitest';
import { getTaskTypeMeta, toBusinessName, TASK_TYPE_LABELS } from './taskTypeMeta';

describe('getTaskTypeMeta', () => {
    it('returns the known metadata for a recognized task type', () => {
        expect(getTaskTypeMeta('HTTP')).toEqual(TASK_TYPE_LABELS.HTTP);
    });

    it('falls back to a generic entry using the type name as the label for unknown types', () => {
        const meta = getTaskTypeMeta('SOME_FUTURE_TYPE');
        expect(meta.label).toBe('SOME_FUTURE_TYPE');
        expect(meta.icon).toBe('⚙️');
    });
});

describe('toBusinessName', () => {
    it('converts snake_case to Title Case with spaces', () => {
        expect(toBusinessName('send_email_notification')).toBe('Send Email Notification');
    });

    it('splits camelCase boundaries too', () => {
        expect(toBusinessName('sendEmail')).toBe('Send Email');
    });

    it('leaves an already-readable single word capitalized', () => {
        expect(toBusinessName('approve')).toBe('Approve');
    });
});
