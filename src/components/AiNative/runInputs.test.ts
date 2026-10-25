import { describe, it, expect } from 'vitest';
import { coerceRunInputs } from './runInputs';

describe('coerceRunInputs (WorkflowRunCard)', () => {
    it('converts values by declared type', () => {
        const { input, errors } = coerceRunInputs(
            [
                { name: 'count', type: 'number' },
                { name: 'dryRun', type: 'boolean' },
                { name: 'tags', type: 'array' },
                { name: 'meta', type: 'object' },
                { name: 'id', type: 'string' },
            ],
            { count: '3', dryRun: 'false', tags: '["a","b"]', meta: '{"k":1}', id: '007' },
        );
        expect(errors).toEqual({});
        expect(input).toEqual({ count: 3, dryRun: false, tags: ['a', 'b'], meta: { k: 1 }, id: '007' });
    });

    it('parses JSON-looking text for untyped (legacy string[]) params and keeps other text as strings', () => {
        const { input } = coerceRunInputs([{ name: 'payload' }, { name: 'name' }], { payload: '{"a":[1,2]}', name: '42' });
        expect(input).toEqual({ payload: { a: [1, 2] }, name: '42' });
    });

    it('reports invalid values instead of sending them', () => {
        const { input, errors } = coerceRunInputs(
            [{ name: 'count', type: 'number' }, { name: 'meta', type: 'object' }],
            { count: 'abc', meta: '[1]' },
        );
        expect(input).toEqual({});
        expect(errors.count).toContain('数字');
        expect(errors.meta).toContain('JSON 对象');
    });

    it('uses defaults for empty fields, omits empty optional ones and flags empty required ones', () => {
        const { input, errors } = coerceRunInputs(
            [{ name: 'region', defaultValue: 'cn-hangzhou' }, { name: 'note' }, { name: 'owner', required: true }],
            { region: '', note: '', owner: '' },
        );
        expect(input).toEqual({ region: 'cn-hangzhou' });
        expect(errors.owner).toContain('必填');
    });
});
