/**
 * 扩展点注册：统一的 Provider 集合与自助接入（Onboarding）契约。
 * 设计见 docs/design/v1.3.0-自助接入设计.md 第 2、3.2 节。
 */
import type { LibraryProvider } from '../library/types';
import type { TelemetrySink } from '../telemetry/types';

export interface OnboardingContext {
    env: 'TEST' | 'PROD';
    /** `email` 写入向导生成的骨架流程的 ownerEmail（可选） */
    user: { id: string; name: string; email?: string };
    /** 当前环境是否开放自助试用（生产为 false） */
    trialEnabled: boolean;
}

export interface ProductInfo {
    name: string;               // 名称中的"产品"段，不含 "-"
    domain: string;             // 业务域
    status: 'PENDING' | 'ACTIVE';
    role: 'OWNER' | 'MEMBER';
}

export type StartTrialResult =
    | { status: 'ok'; product: ProductInfo }
    | { status: 'conflict'; owners: { id: string; name: string }[] };   // 产品已存在且当前用户非成员

export interface PromotionStatus {
    requestId: string;
    state: 'SUBMITTED' | 'REVIEWING' | 'APPROVED' | 'REJECTED' | 'SYNCED';
    targetName?: string;        // 生产中的正式名称（类型段已替换）
    comment?: string;
    updatedAt: string;
}

export interface OnboardingProvider {
    getContext(signal?: AbortSignal): Promise<OnboardingContext>;
    listDomains(signal?: AbortSignal): Promise<string[]>;                 // GET /api/library/domains
    listMyProducts(signal?: AbortSignal): Promise<ProductInfo[]>;         // GET /api/products/mine
    startTrial(input: { productName: string; domain: string; systemCode?: string }): Promise<StartTrialResult>; // POST /api/onboarding/trial
    requestPromotion(input: { workflowName: string; version: number; targetType: 'custom' | 'std' }): Promise<{ requestId: string }>; // POST /api/onboarding/promote
    getPromotion(requestId: string, signal?: AbortSignal): Promise<PromotionStatus>;                // GET /api/onboarding/promote/{id}
}

/** 宿主配置一次、页面内所有 IDE 共用的扩展点集合 */
export interface IdeProviders {
    /** 流程库数据源（1.2.0 已有） */
    library?: LibraryProvider;
    /** 自助接入（1.3.0；B1 仅定义契约，界面在 B2） */
    onboarding?: OnboardingProvider;
    /** 接入埋点（1.3.0） */
    telemetry?: TelemetrySink;
    // 预留：review?、templates?、executionSamples?（1.4.0 / 1.5.0）
}
