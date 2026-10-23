import { ghostButton, primaryButton } from './styles';

export interface OnboardingGuideCardProps {
  onStart: () => void;
  /** 提供时显示「暂不使用」，用于露出画布原有的空状态 */
  onDismiss?: () => void;
}

/**
 * 空画布上的「开始试用」引导卡片。
 * 仅在测试环境开放自助试用且用户还没有所属产品时由宿主显示。
 */
export function OnboardingGuideCard({ onStart, onDismiss }: OnboardingGuideCardProps) {
  return (
    <div
      role="region"
      aria-label="开始试用引导"
      style={{
        maxWidth: 420,
        padding: '24px 28px',
        textAlign: 'center',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 12,
        boxShadow: '0 8px 28px rgba(0, 0, 0, 0.18)',
      }}
    >
      <div aria-hidden="true" style={{ fontSize: 32, marginBottom: 8 }}>🚀</div>
      <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>开始试用编排平台</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        登记你的产品、按规范命名，几分钟内就能在测试环境建出第一个流程，试跑通过后再申请上线。
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button type="button" style={primaryButton} onClick={onStart}>开始试用</button>
        {onDismiss && <button type="button" style={ghostButton} onClick={onDismiss}>暂不使用</button>}
      </div>
    </div>
  );
}
