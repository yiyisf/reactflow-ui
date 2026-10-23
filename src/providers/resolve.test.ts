import { describe, it, expect } from 'vitest';
import { resolveProviders, stabilizeProviders } from './resolve';
import type { IdeProviders, OnboardingProvider } from './types';
import type { LibraryProvider } from '../library/types';
import type { TelemetrySink } from '../telemetry/types';

const lib = (n: string) => ({ __n: n } as unknown as LibraryProvider);
const sink = (n: string) => ({ __n: n, track() {} } as unknown as TelemetrySink);
const onb = (n: string) => ({ __n: n } as unknown as OnboardingProvider);

describe('resolveProviders 解析顺序', () => {
    it('没有任何来源 → 空对象', () => {
        expect(resolveProviders()).toEqual({});
        expect(resolveProviders({})).toEqual({});
    });

    it('专用 prop > 组件 providers > 外层 Provider', () => {
        const a = lib('override'), b = lib('component'), c = lib('context');
        expect(resolveProviders({ override: { library: a }, component: { library: b }, context: { library: c } }).library).toBe(a);
        expect(resolveProviders({ component: { library: b }, context: { library: c } }).library).toBe(b);
        expect(resolveProviders({ context: { library: c } }).library).toBe(c);
    });

    it('按字段回落：高优先级层缺少某字段时取下一层，而不是整个对象覆盖', () => {
        const l1 = lib('1'), t1 = sink('1'), o1 = onb('1'), t2 = sink('2');
        const r = resolveProviders({
            override: { library: undefined },
            component: { telemetry: t2 },
            context: { library: l1, telemetry: t1, onboarding: o1 },
        });
        expect(r.library).toBe(l1);
        expect(r.telemetry).toBe(t2);
        expect(r.onboarding).toBe(o1);
    });

    it('只有 libraryProvider（专用 prop）时与旧行为一致', () => {
        const l = lib('only');
        const r = resolveProviders({ override: { library: l } });
        expect(r.library).toBe(l);
        expect(r.telemetry).toBeUndefined();
        expect(r.onboarding).toBeUndefined();
    });

    it('未提供的字段不出现在结果里', () => {
        const r = resolveProviders({ component: { library: lib('x') } });
        expect(Object.keys(r)).toEqual(['library']);
    });
});

describe('stabilizeProviders 按字段稳定', () => {
    it('宿主每次新建 providers 对象但实例不变 → 返回同一引用', () => {
        const l = lib('same'), t = sink('same');
        const first = stabilizeProviders(undefined, resolveProviders({ component: { library: l, telemetry: t } }));
        const second = stabilizeProviders(first, resolveProviders({ component: { library: l, telemetry: t } }));
        expect(second).toBe(first);
        expect(second.library).toBe(l);
    });

    it('某个 provider 实例变化 → 返回新对象，其余字段保持原引用', () => {
        const l = lib('a'), t = sink('a'), l2 = lib('b');
        const first = stabilizeProviders(undefined, resolveProviders({ component: { library: l, telemetry: t } }));
        const next = stabilizeProviders(first, resolveProviders({ component: { library: l2, telemetry: t } }));
        expect(next === first).toBe(false);
        expect(next.library).toBe(l2);
        expect(next.telemetry).toBe(t);
    });

    it('字段从有到无 → 视为变化', () => {
        const first: IdeProviders = { library: lib('a') };
        const next = stabilizeProviders(first, {});
        expect(next === first).toBe(false);
        expect(next.library).toBeUndefined();
    });
});
