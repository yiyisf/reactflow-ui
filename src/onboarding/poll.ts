import type { OnboardingProvider, PromotionStatus } from '../providers/types';

/** 上线申请轮询：初始间隔、封顶间隔（毫秒） */
export const POLL_BASE_MS = 2000;
export const POLL_MAX_MS = 30000;

/** 第 attempt 次（从 0 开始）等待的时长：指数退避 2s → 4s → 8s … 封顶 30s */
export function nextPollDelay(attempt: number): number {
  const n = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  // 先限幅再求幂，避免超大 attempt 溢出
  return Math.min(POLL_MAX_MS, POLL_BASE_MS * Math.pow(2, Math.min(n, 10)));
}

export type PromotionState = PromotionStatus['state'];

/** 终态：不会再变化，轮询据此停止 */
export function isTerminalPromotionState(state: PromotionState): boolean {
  return state === 'APPROVED' || state === 'REJECTED' || state === 'SYNCED';
}

export interface TimelineItem {
  state: PromotionState;
  label: string;
  /** done 已完成 / current 进行中 / pending 未到 / failed 被驳回 */
  status: 'done' | 'current' | 'pending' | 'failed';
}

const STATE_LABEL: Record<PromotionState, string> = {
  SUBMITTED: '已提交',
  REVIEWING: '审批中',
  APPROVED: '审批通过',
  REJECTED: '已驳回',
  SYNCED: '已同步到生产',
};

export function promotionStateLabel(state: PromotionState): string {
  return STATE_LABEL[state];
}

/**
 * 进度时间线。正常路径：已提交 → 审批中 → 审批通过 → 已同步到生产；
 * 被驳回时第三项替换为「已驳回」（failed），之后不再展示「已同步」。
 */
export function buildPromotionTimeline(state: PromotionState | null): TimelineItem[] {
  const path: PromotionState[] = state === 'REJECTED'
    ? ['SUBMITTED', 'REVIEWING', 'REJECTED']
    : ['SUBMITTED', 'REVIEWING', 'APPROVED', 'SYNCED'];
  const at = state ? path.indexOf(state) : -1;
  return path.map((s, i) => {
    let status: TimelineItem['status'];
    if (s === 'REJECTED' && state === 'REJECTED') status = 'failed';
    else if (at === i) status = isTerminalPromotionState(s) ? 'done' : 'current';
    else if (i < at) status = 'done';
    else status = 'pending';
    return { state: s, label: STATE_LABEL[s], status };
  });
}

function abortError(): Error {
  const e = new Error('已取消');
  e.name = 'AbortError';
  return e;
}

export function isAbortError(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError';
}

/** 可被 AbortSignal 打断的等待 */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
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

export interface PollOptions {
  provider: Pick<OnboardingProvider, 'getPromotion'>;
  requestId: string;
  signal?: AbortSignal;
  /** 每次拿到状态时回调（含终态） */
  onUpdate?: (status: PromotionStatus) => void;
  /** 注入等待函数（测试用），默认 abortableSleep */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/**
 * 轮询上线申请直到终态（APPROVED / REJECTED / SYNCED）：先立即查一次，之后按 nextPollDelay 退避。
 * APPROVED 视为终态（审批已有结论），轮询随之停止。
 * 请求失败直接抛出（由界面显示「重试」）；signal 中止时抛 AbortError。
 */
export async function pollPromotion(opts: PollOptions): Promise<PromotionStatus> {
  const sleep = opts.sleep ?? abortableSleep;
  let attempt = 0;
  for (;;) {
    if (opts.signal?.aborted) throw abortError();
    const status = await opts.provider.getPromotion(opts.requestId, opts.signal);
    if (opts.signal?.aborted) throw abortError();
    opts.onUpdate?.(status);
    if (isTerminalPromotionState(status.state)) return status;
    await sleep(nextPollDelay(attempt), opts.signal);
    attempt += 1;
  }
}
