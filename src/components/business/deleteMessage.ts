import type { BusinessStep } from '../../stepmodel/types';
import type { ActionRegistry } from '../../actions/registry';

/** 统计控制流内部（任意层级）的步骤数 */
export function countNestedSteps(step: BusinessStep): number {
  const children = [
    ...(step.branches || []).flatMap((b) => b.steps),
    ...(step.forkLanes || []).flatMap((l) => l.steps),
    ...(step.loopSteps || []),
  ];
  return children.reduce((n, c) => n + 1 + countNestedSteps(c), 0);
}

/** 删除步骤前的确认文案：说清删的是什么、连带删除多少内部步骤、如何恢复 */
export function confirmDeleteMessage(step: BusinessStep, registry: ActionRegistry): string {
  const name = step.name || registry.getAction(step.actionId)?.name || step.taskReferenceName;
  const nested = countNestedSteps(step);
  const extra = nested > 0 ? `，连同其中的 ${nested} 个步骤` : '';
  return `删除步骤「${name}」${extra}？删除后可按 Ctrl+Z（Mac 为 Cmd+Z）撤销。`;
}
