import { describe, it, expect } from 'vitest';
import { IDE_EVENT_NAMES } from './types';
import type { IdeEvent } from './types';
import { createTracker, sanitizeProps } from './track';
import { createOnceGuard } from './once';
import { subscribeSandboxRun, notifySandboxRun, subscribeStepAdded, notifyStepAdded } from '../store/sandboxRunObserver';
import { sourceFiles, designDoc, integrationGuide } from './sources.testutil';

/** 取 Markdown 表格里「首列反引号包住的事件名」 */
function eventNamesFromTable(md: string, startMarker: string, endMarker: string): string[] {
    const start = md.indexOf(startMarker);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = md.indexOf(endMarker, start + startMarker.length);
    const section = md.slice(start, end === -1 ? undefined : end);
    const names: string[] = [];
    for (const line of section.split('\n')) {
        if (!line.startsWith('|')) continue;
        const firstCell = line.split('|')[1] ?? '';
        for (const m of firstCell.matchAll(/`([a-z_]+)`/g)) names.push(m[1]);
    }
    return names;
}

describe('IdeEventName 与文档一致', () => {
    const code = [...IDE_EVENT_NAMES].sort();

    it('设计文档 5.2 节事件表', () => {
        const names = eventNamesFromTable(designDoc, '### 5.2', '\n## 6');
        expect([...names].sort()).toEqual(code);
    });

    it('接入指南「接入埋点」事件表', () => {
        const names = eventNamesFromTable(integrationGuide, '#### 接入埋点', '\n### 4.6');
        expect([...names].sort()).toEqual(code);
    });
});

/** 在源码中找出 track('name', { ... }) 调用 */
function scanTrackCalls(): Array<{ file: string; name: string; props: string | undefined }> {
    const calls: Array<{ file: string; name: string; props: string | undefined }> = [];
    const re = /\btrack\(\s*'([a-z_]+)'\s*(?:,\s*(\{[^}]*\}))?\s*\)/g;
    for (const file of Object.keys(sourceFiles)) {
        for (const m of sourceFiles[file].matchAll(re)) {
            calls.push({ file, name: m[1], props: m[2] });
        }
    }
    return calls;
}

/** 允许出现在 props 里的取值表达式：均为字符串 / 数字 / 布尔类的简单值，新增表达式需要先评审再加入 */
const ALLOWED_PROP_VALUES = new Set([
    'r.level', 'r.source', 'p.domain', 'targetType', 'state',
    'info.format', 'info.count', 'info.source', 'source', 'result', 'event.type',
    "'builtin'", "'import'", "'template'", "'pro'", "'business'",
]);

describe('埋点调用扫描', () => {
    const calls = scanTrackCalls();

    it('能扫描到调用（防止正则失效后测试空转）', () => {
        expect(calls.length).toBeGreaterThanOrEqual(15);
    });

    it('所有调用的事件名都在 IdeEventName 清单里', () => {
        const known = new Set<string>(IDE_EVENT_NAMES);
        for (const c of calls) expect(known.has(c.name), `${c.file}: ${c.name}`).toBe(true);
    });

    it('清单里的每个事件都至少有一处上报', () => {
        const emitted = new Set(calls.map((c) => c.name));
        for (const n of IDE_EVENT_NAMES) expect(emitted.has(n), n).toBe(true);
    });

    it('props 取值只来自白名单里的简单值（不会把对象 / 参数 / 内容塞进埋点）', () => {
        for (const c of calls) {
            if (!c.props) continue;
            const inner = c.props.slice(1, -1).trim();
            if (!inner) continue;
            for (const part of inner.split(',')) {
                const kv = part.split(':').map((s) => s.trim());
                const value = kv.length === 1 ? kv[0] : kv.slice(1).join(':');
                expect(ALLOWED_PROP_VALUES.has(value), `${c.file}: ${c.name} props 取值 ${value}`).toBe(true);
            }
        }
    });
});

describe('track() 清洗', () => {
    function run(props: Record<string, unknown>): IdeEvent {
        const out: IdeEvent[] = [];
        createTracker({ ide: 'workflow', getWorkflowName: () => 'wf', push: (e) => out.push(e), now: () => 1 })('step_added', props);
        return out[0];
    }

    it('保留 string / 有限 number / boolean', () => {
        expect(run({ a: 'x', b: 1, c: true, d: false, e: 0, f: '' }).props).toEqual({ a: 'x', b: 1, c: true, d: false, e: 0, f: '' });
    });

    it('剔除对象、数组、函数、null、undefined、NaN、Infinity、symbol、bigint', () => {
        const e = run({
            obj: { secret: 'v' },
            arr: [1, 2],
            fn: () => 1,
            nul: null,
            und: undefined,
            nan: NaN,
            inf: Infinity,
            sym: Symbol('s'),
            big: BigInt(1),
            keep: 'ok',
        });
        expect(e.props).toEqual({ keep: 'ok' });
    });

    it('全部被剔除时不带 props', () => {
        expect(run({ obj: {} }).props).toBeUndefined();
        expect(sanitizeProps(undefined)).toBeUndefined();
    });
});

describe('ide_opened 去重守卫', () => {
    it('同一实例只放行一次（模拟 StrictMode 双执行 effect）', () => {
        const guard = createOnceGuard();
        const emitted: string[] = [];
        for (let i = 0; i < 2; i++) {
            if (guard.take()) emitted.push('ide_opened');
        }
        expect(emitted).toEqual(['ide_opened']);
    });

    it('不同实例互不影响', () => {
        expect(createOnceGuard().take()).toBe(true);
        expect(createOnceGuard().take()).toBe(true);
    });
});

describe('store 观察者', () => {
    it('试跑结果通知订阅者，取消订阅后不再收到', () => {
        const got: string[] = [];
        const off = subscribeSandboxRun((r) => got.push(r));
        notifySandboxRun('COMPLETED');
        off();
        notifySandboxRun('FAILED');
        expect(got).toEqual(['COMPLETED']);
    });

    it('新增步骤通知订阅者', () => {
        const got: string[] = [];
        const off = subscribeStepAdded((s) => got.push(s));
        notifyStepAdded('builtin');
        off();
        expect(got).toEqual(['builtin']);
    });

    it('订阅者抛错不影响其他订阅者与调用方', () => {
        const got: string[] = [];
        const off1 = subscribeSandboxRun(() => { throw new Error('boom'); });
        const off2 = subscribeSandboxRun((r) => got.push(r));
        let threw = false;
        try { notifySandboxRun('COMPLETED'); } catch { threw = true; }
        expect(threw).toBe(false);
        off1();
        off2();
        expect(got).toEqual(['COMPLETED']);
    });
});
