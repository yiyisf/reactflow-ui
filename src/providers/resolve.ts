import type { IdeProviders } from './types';

/** 各层来源，按优先级从高到低排列 */
export interface ProviderSources {
    /** 组件上的专用 prop（如 `libraryProvider`），优先级最高 */
    override?: Partial<IdeProviders>;
    /** 组件的 `providers` prop */
    component?: Partial<IdeProviders>;
    /** 外层 `WorkflowIdeProvider` */
    context?: Partial<IdeProviders>;
}

const FIELDS = ['library', 'onboarding', 'telemetry'] as const;

/**
 * 按字段解析：专用 prop > 组件 `providers` prop > 外层 `WorkflowIdeProvider` > 无。
 * 某一层的字段为 undefined 时才落到下一层（不是整个对象覆盖）。纯函数，每次返回新对象。
 */
export function resolveProviders(sources: ProviderSources = {}): IdeProviders {
    const layers = [sources.override, sources.component, sources.context];
    const out: IdeProviders = {};
    for (const f of FIELDS) {
        for (const layer of layers) {
            const v = layer?.[f];
            if (v !== undefined && v !== null) {
                (out as Record<string, unknown>)[f] = v;
                break;
            }
        }
    }
    return out;
}

/**
 * 稳定化：各字段引用都与 prev 相同时返回 prev 本身。
 * 宿主每次渲染新建 `providers` 对象、但 provider 实例不变时，下游拿到的仍是同一个对象，不会触发目录重载。
 */
export function stabilizeProviders(prev: IdeProviders | undefined, next: IdeProviders): IdeProviders {
    if (prev && FIELDS.every((f) => prev[f] === next[f])) return prev;
    return next;
}
