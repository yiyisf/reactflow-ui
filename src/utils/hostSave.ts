import useWorkflowStore from '../store/workflowStore';
import type { WorkflowDef } from '../types/conductor';

/** 宿主保存回调：同步保存返回 void；异步保存返回 Promise，resolve 才算保存成功 */
export type HostSaveHandler = (def: WorkflowDef) => void | PromiseLike<unknown>;

/**
 * R19：把定义交给宿主保存，并在保存成功后把它记为已保存的版本（执行验证运行的就是这一份）。
 * - 宿主同步返回：交出即视为已保存（沿用原来的语义）。
 * - 宿主返回 Promise：resolve 后才标记；reject 时保持"有未保存的修改"，执行面板继续提示。
 *   reject 不在这里吞掉，宿主没处理的错误仍会像以前一样出现在控制台。
 */
export function handOffSave(onSave: HostSaveHandler, def: WorkflowDef): void {
    const result = onSave(def);
    const markSaved = () => useWorkflowStore.getState().markWorkflowSaved(def);
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        void Promise.resolve(result).then(markSaved);
        return;
    }
    markSaved();
}
