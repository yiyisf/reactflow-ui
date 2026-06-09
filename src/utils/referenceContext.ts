import { WorkflowDef, TaskDef } from '../types/conductor';
import { parseWorkflowInputParams } from '../types/conductor';

export interface ReferenceOption {
  expr: string;           // e.g. "${fetch_order.output.orderId}"
  source: 'workflow_input' | 'task_output' | 'workflow_variable' | 'system';
  label: string;          // display name
  taskRef?: string;       // source task (for task_output)
  description?: string;
}

/**
 * Performs a flat pre-order traversal of all tasks in the workflow task tree,
 * returning an ordered array of taskReferenceName strings.
 */
function flattenTaskRefs(tasks: TaskDef[]): string[] {
  const result: string[] = [];

  function traverse(taskList: TaskDef[]): void {
    for (const task of taskList) {
      result.push(task.taskReferenceName);

      if (task.decisionCases) {
        for (const caseKey of Object.keys(task.decisionCases)) {
          traverse(task.decisionCases[caseKey]);
        }
      }

      if (task.defaultCase && task.defaultCase.length > 0) {
        traverse(task.defaultCase);
      }

      if (task.forkTasks) {
        for (const branch of task.forkTasks) {
          traverse(branch);
        }
      }

      if (task.loopOver && task.loopOver.length > 0) {
        traverse(task.loopOver);
      }
    }
  }

  traverse(tasks);
  return result;
}

/**
 * Returns all legally referenceable upstream data sources for a given task
 * in the workflow DAG.
 */
export function getAvailableReferences(
  workflowDef: WorkflowDef,
  currentTaskRef: string
): ReferenceOption[] {
  const references: ReferenceOption[] = [];

  // 1. Collect workflow.input.* references from inputParameters
  const inputParams = parseWorkflowInputParams(workflowDef.inputParameters ?? []);
  for (const param of inputParams) {
    references.push({
      expr: `\${workflow.input.${param.name}}`,
      source: 'workflow_input',
      label: `工作流入参: ${param.name}`,
      description: param.description,
    });
  }

  // 2. Find all ancestor task refs that appear before currentTaskRef
  const allTaskRefs = flattenTaskRefs(workflowDef.tasks ?? []);
  const currentIndex = allTaskRefs.indexOf(currentTaskRef);
  const ancestorRefs = currentIndex === -1 ? allTaskRefs : allTaskRefs.slice(0, currentIndex);

  for (const taskRef of ancestorRefs) {
    references.push({
      expr: `\${${taskRef}.output.*}`,
      source: 'task_output',
      label: `任务输出: ${taskRef}`,
      taskRef,
    });
  }

  // 3. Find SET_VARIABLE tasks that appear before currentTaskRef and add their variables
  const allTasks = flattenTasks(workflowDef.tasks ?? []);
  for (const taskRef of ancestorRefs) {
    const task = allTasks.find(t => t.taskReferenceName === taskRef);
    if (task && task.type === 'SET_VARIABLE' && task.inputParameters) {
      for (const varName of Object.keys(task.inputParameters)) {
        references.push({
          expr: `\${workflow.variables.${varName}}`,
          source: 'workflow_variable',
          label: `工作流变量: ${varName}`,
          taskRef: taskRef,
        });
      }
    }
  }

  // 4. Add system variables
  const systemVars = [
    { name: 'workflow.workflowId', label: 'System: workflowId' },
    { name: 'workflow.correlationId', label: 'System: correlationId' },
    { name: 'workflow.status', label: 'System: status' },
    { name: 'workflow.input', label: 'System: workflow input (full object)' },
  ];

  for (const sysVar of systemVars) {
    references.push({
      expr: `\${${sysVar.name}}`,
      source: 'system',
      label: sysVar.label,
    });
  }

  return references;
}

/**
 * Flattens all tasks (including nested) into a single array without ordering guarantees.
 * Used to look up task objects by taskReferenceName.
 */
function flattenTasks(tasks: TaskDef[]): TaskDef[] {
  const result: TaskDef[] = [];

  function traverse(taskList: TaskDef[]): void {
    for (const task of taskList) {
      result.push(task);

      if (task.decisionCases) {
        for (const caseKey of Object.keys(task.decisionCases)) {
          traverse(task.decisionCases[caseKey]);
        }
      }

      if (task.defaultCase && task.defaultCase.length > 0) {
        traverse(task.defaultCase);
      }

      if (task.forkTasks) {
        for (const branch of task.forkTasks) {
          traverse(branch);
        }
      }

      if (task.loopOver && task.loopOver.length > 0) {
        traverse(task.loopOver);
      }
    }
  }

  traverse(tasks);
  return result;
}

const SYSTEM_VAR_NAMES = new Set([
  'workflow.workflowId',
  'workflow.correlationId',
  'workflow.status',
  'workflow.input',
]);

/**
 * Validates whether a reference expression is resolvable given the set of
 * available references for the current task.
 */
export function isReferenceResolvable(
  expr: string,
  available: ReferenceOption[]
): { ok: boolean; reason?: 'unknown_task' | 'forward_ref' | 'malformed' | 'undeclared_input' } {
  // Must match ${...} pattern
  const match = expr.match(/^\$\{(.+)\}$/);
  if (!match) {
    return { ok: false, reason: 'malformed' };
  }

  const inner = match[1].trim();
  if (!inner) {
    return { ok: false, reason: 'malformed' };
  }

  const segments = inner.split('.');
  const root = segments[0];

  if (root === 'workflow') {
    const secondSegment = segments[1];

    if (secondSegment === 'input') {
      // workflow.input.* — check against declared workflow inputs
      const found = available.some(
        opt => opt.source === 'workflow_input' && opt.expr === expr
      );
      if (!found) {
        return { ok: false, reason: 'undeclared_input' };
      }
      return { ok: true };
    }

    if (secondSegment === 'variables') {
      // workflow.variables.* — check against known workflow_variable sources
      const found = available.some(
        opt => opt.source === 'workflow_variable' && opt.expr === expr
      );
      if (!found) {
        return { ok: false, reason: 'unknown_task' };
      }
      return { ok: true };
    }

    // Other workflow.* — check against known system vars
    const sysVarPath = segments.slice(0, 2).join('.');
    if (SYSTEM_VAR_NAMES.has(sysVarPath) || SYSTEM_VAR_NAMES.has(inner)) {
      return { ok: true };
    }

    // Unknown workflow.* path
    return { ok: false, reason: 'unknown_task' };
  }

  // <taskRef>.* — check if any available option has taskRef === root
  const found = available.some(opt => opt.taskRef === root);
  if (!found) {
    return { ok: false, reason: 'unknown_task' };
  }

  return { ok: true };
}
