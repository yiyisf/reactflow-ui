import type { WorkflowLevel } from '../types/workflowLibrary';

const RANK: Record<WorkflowLevel, number> = { L1: 1, L2: 2, L3: 3 };

/**
 * 分层调用规则：高层可调用低层及同层，禁止反向跨层。
 * L3 -> L3/L2/L1；L2 -> L2/L1；L1 -> L1。任一方层级未知时视为允许（不做限制）。
 */
export function canCallLevel(caller: WorkflowLevel | undefined, callee: WorkflowLevel | undefined): boolean {
  if (!caller || !callee) return true;
  return RANK[callee] <= RANK[caller];
}
