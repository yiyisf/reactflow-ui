import { describe, it, expect } from 'vitest';
import { BUILTIN_ECS_ACTIONS } from './ecs';
import { BUILTIN_COMMON_ACTIONS } from './common';
import { validateWorkflow } from '../../utils/validator';

// Every built-in action must compile to a task Conductor can run: an HTTP task without
// inputParameters.http_request fails at runtime (and the editor flags it as an error).
describe('built-in actions compile to runnable Conductor tasks', () => {
  for (const action of [...BUILTIN_ECS_ACTIONS, ...BUILTIN_COMMON_ACTIONS]) {
    it(action.id, () => {
      const values: Record<string, unknown> = {};
      for (const f of action.fields) values[f.key] = f.defaultValue ?? (f.type === 'number' ? 1 : 'x');
      const task = action.compile(values, { taskReferenceName: 'step_ref', stepIndex: 0, workflowName: 'wf' });
      if (task.type === 'HTTP') {
        expect(typeof task.inputParameters?.http_request?.uri).toBe('string');
        expect(typeof task.inputParameters?.http_request?.method).toBe('string');
      }
      const result = validateWorkflow({ name: 'wf', version: 1, tasks: [task] });
      const own = result.errors.filter((e) => e.type === 'TASK' && e.ref === 'step_ref' && /http_request|uri/i.test(e.message));
      expect(own).toEqual([]);
    });
  }
});
