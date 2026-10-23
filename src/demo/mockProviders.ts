/**
 * Demo 专用：一次提供全部模拟扩展点。不从包入口导出。
 * 包含流程库、自助接入（onboarding）与控制台埋点。
 */
import type { IdeProviders } from '../providers/types';
import type { IdeEvent, TelemetrySink } from '../telemetry/types';
import { createMockGovernanceProvider, createMockOnboardingProvider } from './mockGovernance';
import type { MockOnboardingProviderOptions } from './mockGovernance';

/** 控制台 sink：按批次分组打印 `[telemetry]`，便于在演示站直接观察事件与属性 */
export const consoleSink: TelemetrySink = {
    track(events: IdeEvent[]) {
        console.groupCollapsed(`[telemetry] ${events.length} 条事件`);
        for (const e of events) {
            console.log(
                `${new Date(e.at).toLocaleTimeString()} ${e.name}`,
                { ide: e.ide, workflowName: e.workflowName, ...(e.props ?? {}) },
            );
        }
        console.groupEnd();
    },
};

export function createMockProviders(options: { onboarding?: MockOnboardingProviderOptions } = {}): IdeProviders {
    return {
        library: createMockGovernanceProvider(),
        onboarding: createMockOnboardingProvider(options.onboarding),
        telemetry: consoleSink,
    };
}
