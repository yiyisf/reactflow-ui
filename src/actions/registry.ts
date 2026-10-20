import type { ActionDefinition, ActionCategory } from './types';
import type { TaskDef } from '../types/conductor';
import { BUILTIN_ECS_ACTIONS } from './builtin/ecs';
import { BUILTIN_COMMON_ACTIONS } from './builtin/common';

export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();

  constructor(initialActions: ActionDefinition[] = []) {
    this.registerAll(initialActions);
  }

  register(action: ActionDefinition): void {
    this.actions.set(action.id, action);
  }

  registerAll(actions: ActionDefinition[]): void {
    for (const action of actions) {
      this.register(action);
    }
  }

  getAction(id: string): ActionDefinition | undefined {
    return this.actions.get(id);
  }

  getAllActions(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }

  getActionsByCategory(category?: ActionCategory): ActionDefinition[] {
    const all = this.getAllActions();
    if (!category) return all;
    return all.filter((a) => a.category === category);
  }

  /**
   * Given a Conductor TaskDef, attempt to find a matching ActionDefinition
   * and decompile it into friendly form values.
   */
  findActionForTask(task: TaskDef): { action: ActionDefinition; values: Record<string, any> } | null {
    // 1. Direct _actionId lookup
    const explicitActionId = task.inputParameters?._actionId;
    if (explicitActionId && typeof explicitActionId === 'string') {
      const matched = this.getAction(explicitActionId);
      if (matched && matched.decompile) {
        const values = matched.decompile(task);
        if (values) {
          return { action: matched, values };
        }
      }
    }

    // 2. Fallback heuristic check through all registered actions
    for (const action of this.actions.values()) {
      if (action.decompile) {
        const values = action.decompile(task);
        if (values) {
          return { action, values };
        }
      }
    }

    return null;
  }
}

/**
 * Global default ActionRegistry pre-populated with Cloud Host (ECS) and Common actions
 */
export const defaultActionRegistry = new ActionRegistry([
  ...BUILTIN_ECS_ACTIONS,
  ...BUILTIN_COMMON_ACTIONS,
]);
