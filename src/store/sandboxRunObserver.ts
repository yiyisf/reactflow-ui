/**
 * store 动作的观察者（专业模式埋点用）。
 *
 * - 试跑：专业模式的本地试跑统一经过 store 的 `runLocalSandboxDryRun`（ActionBar 一键试跑与
 *   SandboxConfigModal 都走它），在那里通知即可，不必在每个入口各自埋点。只传最终状态（或 'error'），
 *   不传输入 / 输出数据。业务模式（StepFlowEditor）与模板试跑不经过该 action，由各自的回调上报，因此不会重复。
 * - 新增步骤：画布「+」与 Cmd+K 内联 Copilot 都经过 store 的 `addNode`，来源固定为 'builtin'。
 *
 * 模块级集合：IDE 挂载时订阅、卸载时取消。store 本身是页面内单例，同一页面挂载多个 IDE 时各自都会收到通知。
 */
export type SandboxRunObserver = (result: string) => void;
export type StepAddedObserver = (source: 'builtin') => void;

const sandboxObservers = new Set<SandboxRunObserver>();
const stepObservers = new Set<StepAddedObserver>();

function emit<T>(set: Set<(v: T) => void>, value: T): void {
    set.forEach((fn) => {
        try {
            fn(value);
        } catch (err) {
            console.warn('[reactflow-ui] 埋点观察者出错，已忽略：', err);
        }
    });
}

/** 订阅试跑结果；返回取消订阅函数 */
export function subscribeSandboxRun(observer: SandboxRunObserver): () => void {
    sandboxObservers.add(observer);
    return () => {
        sandboxObservers.delete(observer);
    };
}

/** 通知试跑结果；观察者抛错不影响试跑 */
export function notifySandboxRun(result: string): void {
    emit(sandboxObservers, result);
}

/** 订阅专业模式新增步骤；返回取消订阅函数 */
export function subscribeStepAdded(observer: StepAddedObserver): () => void {
    stepObservers.add(observer);
    return () => {
        stepObservers.delete(observer);
    };
}

export function notifyStepAdded(source: 'builtin'): void {
    emit(stepObservers, source);
}
