import type { WorkflowDef } from '../types/conductor';

/**
 * R21：两份定义内容是否相同（同一对象，或序列化后完全一致）。
 * 用于识别受控用法下宿主把 onWorkflowChange 的结果原样回写成 workflowDef prop 的情况。
 */
export function isSameWorkflow(a: WorkflowDef | null | undefined, b: WorkflowDef | null | undefined): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}
