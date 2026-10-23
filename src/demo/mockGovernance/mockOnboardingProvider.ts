import type {
  OnboardingContext,
  OnboardingProvider,
  ProductInfo,
  PromotionStatus,
  StartTrialResult,
} from '../../providers/types';
import { parseWorkflowName } from '../../library/naming';
import { promotionTargetName } from '../../onboarding/naming';
import type { PromotionTargetType } from '../../onboarding/naming';
import { DEMO_DOMAINS } from './libraryData';
import { createMockServerError } from './mockGovernanceProvider';

/**
 * 演示用「自助接入」服务端模拟（仅 Demo 使用，不从包入口导出）。
 *
 * 对应治理服务接口：
 * - listDomains → GET /api/library/domains
 * - listMyProducts → GET /api/products/mine
 * - startTrial → POST /api/onboarding/trial（产品已存在且当前用户不是成员 → conflict）
 * - requestPromotion / getPromotion → POST /api/onboarding/promote、GET /api/onboarding/promote/{id}
 *
 * 全部在内存中，带模拟延迟，可注入失败，尊重 AbortSignal。
 */

export interface MockOnboardingProviderOptions {
  /** 模拟网络延迟（毫秒），默认 400；0 = 不延迟 */
  latencyMs?: number;
  /** 当前环境，默认 TEST；PROD 时 trialEnabled 为 false */
  env?: 'TEST' | 'PROD';
  /** 演示用户，默认 { id: 'demo-user', name: '演示用户' } */
  user?: { id: string; name: string };
  /** 演示用户已有的产品；默认含一个 ecs。传 [] 可看到空画布的「开始试用」引导 */
  initialProducts?: ProductInfo[];
  /** 业务域列表，默认取演示流程库的业务域 */
  domains?: string[];
  /** 已被其他负责人占用的产品名 → 负责人（登记同名产品会得到 conflict），默认含 cmdb */
  foreignProducts?: Record<string, { id: string; name: string }[]>;
  /** 上线申请是否被驳回，默认 false */
  rejectPromotions?: boolean;
}

export interface MockOnboardingProvider extends OnboardingProvider {
  /** 让接下来的 count 次请求失败（默认 1 次） */
  failNext(count?: number): void;
  /** 开 / 关「所有请求都失败」 */
  setFailing(on: boolean): void;
  setLatency(ms: number): void;
  /** 之后提交的上线申请是否会被驳回 */
  setRejectPromotions(reject: boolean): void;
  /** 清空演示用户名下的产品（用于演示空画布引导） */
  resetProducts(): void;
  /** 当前演示用户的产品快照 */
  readonly products: ProductInfo[];
  /** 累计收到的请求数（不含被取消的） */
  readonly requestCount: number;
}

export const DEMO_USER = { id: 'demo-user', name: '演示用户' } as const;

/** 默认被他人占用的产品（登记会冲突） */
export const DEMO_FOREIGN_PRODUCTS: Record<string, { id: string; name: string }[]> = {
  cmdb: [
    { id: 'u-lisi', name: '李四' },
    { id: 'u-wangwu', name: '王五' },
  ],
};

function abortError(): Error {
  const e = new Error('请求已取消');
  e.name = 'AbortError';
  return e;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

interface MockPromotion {
  targetName: string;
  reject: boolean;
  polls: number;
}

export function createMockOnboardingProvider(options: MockOnboardingProviderOptions = {}): MockOnboardingProvider {
  let latency = options.latencyMs ?? 400;
  const env = options.env ?? 'TEST';
  const user = options.user ?? { ...DEMO_USER };
  let products: ProductInfo[] = (options.initialProducts ?? [
    { name: 'ecs', domain: '云资源', status: 'ACTIVE', role: 'OWNER' },
  ]).map((p) => ({ ...p }));
  const domains = options.domains ?? [...DEMO_DOMAINS];
  const foreign = options.foreignProducts ?? DEMO_FOREIGN_PRODUCTS;
  let rejectPromotions = options.rejectPromotions ?? false;

  let failRemaining = 0;
  let failing = false;
  let requests = 0;
  let seq = 0;
  const promotions = new Map<string, MockPromotion>();

  /** 公共前置：延迟（可取消）→ 计数 → 按需失败 */
  async function enter(signal?: AbortSignal): Promise<void> {
    await delay(latency, signal);
    requests += 1;
    if (failing) throw createMockServerError();
    if (failRemaining > 0) {
      failRemaining -= 1;
      throw createMockServerError();
    }
  }

  return {
    failNext(count = 1) {
      failRemaining = Math.max(0, count);
    },
    setFailing(on) {
      failing = on;
    },
    setLatency(ms) {
      latency = ms;
    },
    setRejectPromotions(reject) {
      rejectPromotions = reject;
    },
    resetProducts() {
      products = [];
    },
    get products() {
      return products.map((p) => ({ ...p }));
    },
    get requestCount() {
      return requests;
    },

    async getContext(signal): Promise<OnboardingContext> {
      await enter(signal);
      return { env, user: { ...user }, trialEnabled: env === 'TEST' };
    },

    async listDomains(signal) {
      await enter(signal);
      return [...domains];
    },

    async listMyProducts(signal) {
      await enter(signal);
      return products.map((p) => ({ ...p }));
    },

    async startTrial(input): Promise<StartTrialResult> {
      await enter();
      if (env !== 'TEST') throw new Error('当前环境不开放自助试用');
      const name = input.productName.trim();
      if (!name || name.indexOf('-') >= 0) throw new Error('产品名称不合法');
      const mine = products.find((p) => p.name === name);
      if (mine) return { status: 'ok', product: { ...mine } };
      const owners = foreign[name];
      if (owners) return { status: 'conflict', owners: owners.map((o) => ({ ...o })) };
      const product: ProductInfo = { name, domain: input.domain, status: 'ACTIVE', role: 'OWNER' };
      products = [...products, product];
      return { status: 'ok', product: { ...product } };
    },

    async requestPromotion(input) {
      await enter();
      const parsed = parseWorkflowName(input.workflowName);
      if (!parsed || parsed.type !== 'tmp') throw new Error('只有 tmp 类型的临时流程可以申请上线');
      const targetName = promotionTargetName(input.workflowName, input.targetType as PromotionTargetType);
      if (!targetName) throw new Error('流程名称不合法');
      seq += 1;
      const requestId = `promo-${seq}`;
      promotions.set(requestId, { targetName, reject: rejectPromotions, polls: 0 });
      return { requestId };
    },

    async getPromotion(requestId, signal): Promise<PromotionStatus> {
      await enter(signal);
      const p = promotions.get(requestId);
      if (!p) throw new Error('上线申请不存在');
      // 每次查询前进一步：SUBMITTED → REVIEWING → APPROVED / REJECTED → SYNCED
      const seqStates: PromotionStatus['state'][] = p.reject
        ? ['SUBMITTED', 'REVIEWING', 'REJECTED']
        : ['SUBMITTED', 'REVIEWING', 'APPROVED', 'SYNCED'];
      const state = seqStates[Math.min(p.polls, seqStates.length - 1)];
      p.polls += 1;
      const status: PromotionStatus = {
        requestId,
        state,
        updatedAt: new Date().toISOString(),
      };
      if (state === 'APPROVED' || state === 'SYNCED') status.targetName = p.targetName;
      if (state === 'APPROVED') status.comment = '审批通过';
      if (state === 'SYNCED') status.comment = '已同步到生产环境';
      if (state === 'REJECTED') status.comment = '演示驳回：功能说明不完整，请补充后重新申请';
      return status;
    },
  };
}
