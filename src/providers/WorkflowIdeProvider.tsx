import { createContext, useContext, useRef } from 'react';
import type { ReactNode } from 'react';
import type { IdeProviders } from './types';
import { resolveProviders, stabilizeProviders } from './resolve';

const EMPTY_PROVIDERS: IdeProviders = Object.freeze({}) as IdeProviders;

const IdeProvidersContext = createContext<IdeProviders>(EMPTY_PROVIDERS);

/** 按字段保持引用稳定的 providers（内部复用） */
function useStableProviders(next: IdeProviders): IdeProviders {
    const ref = useRef<IdeProviders | undefined>(undefined);
    const stable = stabilizeProviders(ref.current, next);
    ref.current = stable;
    return stable;
}

export interface WorkflowIdeProviderProps {
    providers: IdeProviders;
    children: ReactNode;
}

/**
 * 统一注册扩展点：宿主配置一次，其下所有 `WorkflowIDE` / `AiWorkflowIDE` 共用。
 * `providers` 对象每次渲染重新创建也没关系——只有某个 provider 引用变化时才会通知下游。
 *
 * ```tsx
 * <WorkflowIdeProvider providers={{ library, telemetry }}>
 *   <WorkflowIDE … />
 * </WorkflowIdeProvider>
 * ```
 */
export function WorkflowIdeProvider({ providers, children }: WorkflowIdeProviderProps) {
    const stable = useStableProviders(resolveProviders({ component: providers }));
    return <IdeProvidersContext.Provider value={stable}>{children}</IdeProvidersContext.Provider>;
}

/** 读取外层 `WorkflowIdeProvider` 提供的扩展点；没有外层时返回空对象（不抛错） */
export function useIdeProviders(): IdeProviders {
    return useContext(IdeProvidersContext);
}

/**
 * IDE 内部使用：合并「专用 prop > 组件 providers prop > 外层 Provider」，结果按字段引用稳定。
 */
export function useResolvedProviders(
    componentProviders: IdeProviders | undefined,
    override?: Partial<IdeProviders>,
): IdeProviders {
    const context = useContext(IdeProvidersContext);
    return useStableProviders(resolveProviders({ override, component: componentProviders, context }));
}
