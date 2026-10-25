import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { OnboardingProvider, PromotionStatus } from '../../providers/types';
import { promotionTargetName } from '../../onboarding/naming';
import type { PromotionTargetType } from '../../onboarding/naming';
import { buildPromotionTimeline, isAbortError, isTerminalPromotionState, pollPromotion } from '../../onboarding/poll';
import { ModalShell } from './ModalShell';
import {
  disabledStyle,
  ghostButton,
  hintStyle,
  labelStyle,
  noticeStyle,
  primaryButton,
} from './styles';

export interface PromotionPanelProps {
  /** 用到 requestPromotion / getPromotion */
  provider: Pick<OnboardingProvider, 'requestPromotion' | 'getPromotion'>;
  /** 当前（tmp 类型的）流程名称 */
  workflowName: string;
  /** 当前流程版本 */
  version: number;
  onClose: () => void;
  /** 提交成功（埋点：promotion_requested） */
  onRequested?: (targetType: PromotionTargetType) => void;
  /** 状态变化（埋点：promotion_state），同一状态只回调一次 */
  onStateChange?: (state: PromotionStatus['state']) => void;
  /** 关闭前已提交、尚未到终态的申请：重新打开时接着轮询，不会重复提交（R12） */
  resumeRequest?: PendingPromotion | null;
  /** 提交成功时传入申请；到达终态（SYNCED / REJECTED）时传 null。宿主据此保存 / 清除 resumeRequest */
  onRequestChange?: (request: PendingPromotion | null) => void;
}

export interface PendingPromotion {
  requestId: string;
  targetType: PromotionTargetType;
}

const TARGETS: { value: PromotionTargetType; title: string; desc: string }[] = [
  { value: 'custom', title: 'custom（自定义）', desc: '仅本产品使用的流程' },
  { value: 'std', title: 'std（通用）', desc: '面向多个产品复用的通用能力，审批更严格' },
];

function messageOf(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '请求失败，请稍后重试';
}

const DOT_COLOR: Record<string, string> = {
  done: 'var(--color-success)',
  current: 'var(--color-accent)',
  failed: 'var(--color-error)',
  pending: 'var(--text-muted)',
};

/**
 * 申请上线面板：选择目标类型 → 预览正式名称 → 提交 → 轮询进度（指数退避，30 秒封顶）。
 * 轮询在关闭面板 / 卸载时中止。
 */
export function PromotionPanel({ provider, workflowName, version, onClose, onRequested, onStateChange, resumeRequest, onRequestChange }: PromotionPanelProps) {
  const titleId = useId();
  const [targetType, setTargetType] = useState<PromotionTargetType>(resumeRequest?.targetType ?? 'custom');
  const [requestId, setRequestId] = useState<string | null>(resumeRequest?.requestId ?? null);
  const [status, setStatus] = useState<PromotionStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastStateRef = useRef<string | null>(null);
  const cbRef = useRef({ onRequested, onStateChange, onRequestChange });
  cbRef.current = { onRequested, onStateChange, onRequestChange };

  const targetName = promotionTargetName(workflowName, targetType);

  // 关闭 / 卸载时中止进行中的轮询
  useEffect(() => () => abortRef.current?.abort(), []);

  const startPolling = useCallback(async (id: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPolling(true);
    setError(null);
    try {
      await pollPromotion({
        provider,
        requestId: id,
        signal: ac.signal,
        onUpdate: (s) => {
          setStatus(s);
          if (lastStateRef.current !== s.state) {
            lastStateRef.current = s.state;
            cbRef.current.onStateChange?.(s.state);
          }
          if (isTerminalPromotionState(s.state)) cbRef.current.onRequestChange?.(null);
        },
      });
    } catch (e) {
      if (!isAbortError(e)) setError(messageOf(e));
    } finally {
      if (abortRef.current === ac) setPolling(false);
    }
  }, [provider]);

  const handleSubmit = async () => {
    if (submitting || !targetName) return;
    setSubmitting(true);
    setError(null);
    try {
      const { requestId: id } = await provider.requestPromotion({ workflowName, version, targetType });
      setRequestId(id);
      cbRef.current.onRequestChange?.({ requestId: id, targetType });
      cbRef.current.onRequested?.(targetType);
      void startPolling(id);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSubmitting(false);
    }
  };

  // 重新打开面板时接着轮询已提交的申请（只在挂载时执行一次）
  const resumeIdRef = useRef(resumeRequest?.requestId ?? null);
  useEffect(() => {
    if (resumeIdRef.current) void startPolling(resumeIdRef.current);
  }, [startPolling]);

  const submitted = requestId !== null;
  const timeline = buildPromotionTimeline(status ? status.state : submitted ? 'SUBMITTED' : null);

  const footer = submitted ? (
    <button type="button" style={primaryButton} onClick={onClose}>关闭</button>
  ) : (
    <>
      <button type="button" style={ghostButton} onClick={onClose}>取消</button>
      <button
        type="button"
        style={disabledStyle(primaryButton, submitting || !targetName)}
        disabled={submitting || !targetName}
        onClick={() => void handleSubmit()}
      >
        {submitting ? '提交中…' : '提交申请'}
      </button>
    </>
  );

  return (
    <ModalShell titleId={titleId} title="申请上线" onClose={onClose} footer={footer} width={520}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        当前流程：<code style={{ color: 'var(--text-primary)' }}>{workflowName}</code>（版本 {version}）
      </div>

      {!submitted && (
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={labelStyle}>上线为</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TARGETS.map((t) => {
              const checked = targetType === t.value;
              return (
                <label
                  key={t.value}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '10px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: checked ? 'var(--color-accent-bg)' : 'var(--bg-primary)',
                    border: `1px solid ${checked ? 'var(--color-accent)' : 'var(--border-primary)'}`,
                  }}
                >
                  <input type="radio" name="promotion-target" checked={checked} onChange={() => setTargetType(t.value)} style={{ marginTop: 3 }} />
                  <span>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>{t.desc}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={labelStyle}>正式名称预览</div>
        <code
          style={{
            display: 'block',
            padding: '8px 10px',
            borderRadius: 6,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-primary)',
            fontSize: 13,
            wordBreak: 'break-all',
          }}
        >
          {status?.targetName ?? targetName ?? '（流程名称不符合规范，无法申请）'}
        </code>
        {!submitted && <div style={hintStyle}>审批通过后，临时流程会以正式名称同步到生产环境。</div>}
      </div>

      {submitted && (
        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>审批进度</div>
          <ol aria-label="审批进度" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {timeline.map((item) => (
              <li
                key={item.state}
                aria-current={item.status === 'current' ? 'step' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: item.status === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)' }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: item.status === 'pending' ? 'transparent' : DOT_COLOR[item.status],
                    border: `2px solid ${DOT_COLOR[item.status]}`,
                    flexShrink: 0,
                  }}
                />
                <span>{item.label}</span>
                {item.status === 'current' && polling && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>进行中…</span>}
                {item.status === 'failed' && <span style={{ fontSize: 11, color: 'var(--color-error)' }}>未通过</span>}
              </li>
            ))}
          </ol>

          {status?.comment && (
            <div
              role="status"
              style={{ ...noticeStyle(status.state === 'REJECTED' ? 'error' : 'success'), marginTop: 12 }}
            >
              审批意见：{status.comment}
            </div>
          )}
          {status?.state === 'REJECTED' && (
            <div style={hintStyle}>修改流程后可重新申请上线。</div>
          )}
        </div>
      )}

      {error && (
        <div role="alert" style={{ ...noticeStyle('error'), marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            style={disabledStyle(ghostButton, submitting || polling)}
            disabled={submitting || polling}
            onClick={() => (requestId ? void startPolling(requestId) : void handleSubmit())}
          >
            重试
          </button>
        </div>
      )}
    </ModalShell>
  );
}
