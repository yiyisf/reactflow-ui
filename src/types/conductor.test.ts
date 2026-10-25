import { describe, it, expect } from 'vitest';
import { parseWorkflowInputParams, serializeWorkflowInputParams } from './conductor';
import type { WorkflowDef } from './conductor';

describe('workflow input parameters (E22)', () => {
    const base = (extra: Partial<WorkflowDef> = {}): WorkflowDef => ({ name: 'wf', tasks: [], ...extra });

    it('keeps inputParameters as a list of names and stores structure in inputSchema / inputTemplate', () => {
        const patch = serializeWorkflowInputParams(
            [
                { name: 'orderId', type: 'string', required: true, description: '订单号' },
                { name: 'amount', type: 'number', defaultValue: 10, example: 42 },
            ],
            base({ inputParameters: ['orderId'] })
        );
        expect(patch.inputParameters).toEqual(['orderId', 'amount']);
        expect(patch.inputTemplate).toEqual({ amount: 10 });
        expect(patch.inputSchema?.type).toBe('JSON');
        expect(patch.inputSchema?.data).toEqual({
            type: 'object',
            properties: {
                orderId: { type: 'string', description: '订单号' },
                amount: { type: 'number', examples: [42] },
            },
            required: ['orderId'],
        });
    });

    it('round-trips through parseWorkflowInputParams', () => {
        const params = [
            { name: 'orderId', type: 'string' as const, required: true, description: '订单号' },
            { name: 'amount', type: 'number' as const, defaultValue: 10, example: 42 },
        ];
        const def = { ...base(), ...serializeWorkflowInputParams(params, base()) };
        expect(parseWorkflowInputParams(def.inputParameters, def)).toEqual(params);
    });

    it('does not create a schema for plain string params, and keeps unrelated schema / template keys', () => {
        expect(serializeWorkflowInputParams([{ name: 'a', type: 'string' }], base()).inputSchema).toBeUndefined();
        const def = base({
            inputParameters: ['a'],
            inputTemplate: { other: 1, a: 'x' },
            inputSchema: { name: 's', version: 2, type: 'JSON', data: { type: 'object', properties: { other: { type: 'number' }, a: { type: 'string' } }, required: ['other', 'a'] } },
        });
        const patch = serializeWorkflowInputParams([{ name: 'b' }], def);
        expect(patch.inputParameters).toEqual(['b']);
        expect(patch.inputTemplate).toEqual({ other: 1 });
        expect(patch.inputSchema?.name).toBe('s');
        expect(patch.inputSchema?.version).toBe(2);
        expect(patch.inputSchema?.data?.properties).toEqual({ other: { type: 'number' }, b: { type: 'string' } });
        expect(patch.inputSchema?.data?.required).toEqual(['other']);
    });

    it('still reads the legacy object-array form', () => {
        expect(parseWorkflowInputParams([{ name: 'x', type: 'number' }] as any)).toEqual([{ name: 'x', type: 'number' }]);
    });
});
