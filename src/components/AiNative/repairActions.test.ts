import { describe, it, expect } from 'vitest';
import { isRepairActionExecutable } from './repairActions';
import type { RepairAction } from '../../store/aiStore';

const act = (type: RepairAction['type'], taskRef?: string): RepairAction => ({ id: type, label: type, type, taskRef });
const noop = () => {};

describe('isRepairActionExecutable (A13)', () => {
    it('judges each action by its own callback, not by "any callback exists"', () => {
        const caps = { onRetry: noop };
        expect(isRepairActionExecutable(act('retry_workflow'), caps)).toBe(true);
        expect(isRepairActionExecutable(act('skip', 't1'), caps)).toBe(false);
        expect(isRepairActionExecutable(act('rerun_from', 't1'), caps)).toBe(false);
    });

    it('requires a target task for rerun / skip', () => {
        const caps = { onRerunFromTask: noop, onSkipTask: noop };
        expect(isRepairActionExecutable(act('rerun_from'), caps)).toBe(false);
        expect(isRepairActionExecutable(act('skip', 't1'), caps)).toBe(true);
    });

    it('modify_def is executable only when AI may edit the definition', () => {
        expect(isRepairActionExecutable(act('modify_def'), { canEditDefinition: true })).toBe(true);
        expect(isRepairActionExecutable(act('modify_def'), { canEditDefinition: false })).toBe(false);
    });
});
