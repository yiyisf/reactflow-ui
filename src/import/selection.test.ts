import { describe, it, expect } from 'vitest';
import { applyToVisible, initialSelection, visibleSlice } from './selection';

const ops = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `op${i}` }));

describe('R16 import selection', () => {
    it('selects everything only when everything is shown', () => {
        expect(initialSelection(ops(3), 200).size).toBe(3);
        expect(initialSelection(ops(200), 200).size).toBe(200);
        expect(initialSelection(ops(201), 200).size).toBe(0);
    });

    it('reports hidden rows', () => {
        const { visible, hiddenCount } = visibleSlice(ops(250), 200);
        expect(visible).toHaveLength(200);
        expect(hiddenCount).toBe(50);
        expect(visibleSlice(ops(5), 200).hiddenCount).toBe(0);
    });

    it('select-all never adds hidden rows', () => {
        const all = ops(250);
        const { visible } = visibleSlice(all, 200);
        const sel = applyToVisible(new Set<string>(), visible, true);
        expect(sel.size).toBe(200);
        expect(sel.has('op249')).toBe(false);
        const none = applyToVisible(new Set(['op0', 'op249']), visible, false);
        expect([...none]).toEqual(['op249']);
    });
});
