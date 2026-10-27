import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import useWorkflowStore from '../../store/workflowStore';
import type { OnboardingProvider, ProductInfo } from '../../providers/types';
import type { WorkflowLevel } from '../../types/workflowLibrary';
import type { IdeEventName } from '../../telemetry/types';
import { isPromotableName } from '../../onboarding/naming';
import { OnboardingWizard } from './OnboardingWizard';
import type { OnboardingCreateResult } from './OnboardingWizard';
import { PromotionPanel } from './PromotionPanel';
import type { PendingPromotion } from './PromotionPanel';
import { OnboardingGuideCard } from './OnboardingGuideCard';
import { useOnboardingData } from './useOnboardingData';
import type { OnboardingData } from './useOnboardingData';
import { Rocket } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';

/** 向导创建骨架后、选择了模板 / 导入时暂存的流程身份，供宿主在后续步骤里保留名称 */
export interface PendingIdentity {
  name: string;
  description: string;
  ownerEmail?: string;
}

export interface OnboardingControllerOptions {
  /** 解析后的 providers.onboarding；不存在时一切入口都不出现 */
  provider: OnboardingProvider | undefined;
  /** useTelemetry 返回的 track */
  track: (name: IdeEventName, props?: Record<string, unknown>) => void;
  /** 只读 / 运行态时隐藏入口 */
  disabled?: boolean;
  /** 向导「模板中心」起点的回调；不提供则隐藏该选项 */
  onPickTemplate?: () => void;
  /** 向导「从接口导入」起点的回调；不提供则隐藏该选项 */
  onImportApi?: () => void;
  ownerEmail?: string;
}

export interface OnboardingController {
  enabled: boolean;
  data: OnboardingData;
  /** 向导选择的层级；宿主没有传 currentWorkflowLevel 时作为默认值 */
  level: WorkflowLevel | undefined;
  wizardOpen: boolean;
  promoOpen: boolean;
  /** 「新建流程」会替换画布上的流程，正在请用户确认 */
  confirmReplace: boolean;
  resolveConfirmReplace: (proceed: boolean) => void;
  openWizard: () => void;
  openPromotion: () => void;
  /** 当前流程是否可申请上线（名称可解析且类型为 tmp） */
  canPromote: boolean;
  /** 是否显示空画布的「开始试用」引导 */
  showGuide: boolean;
  dismissGuide: () => void;
  /** 取走并清空暂存的流程身份（选了模板 / 导入后使用） */
  takePendingIdentity: () => PendingIdentity | null;
  provider: OnboardingProvider | undefined;
  /** 以下供 OnboardingOverlays 使用 */
  close: () => void;
  handleCreate: (r: OnboardingCreateResult) => void;
  handleTrialStarted: (p: ProductInfo) => void;
  onPickTemplate?: () => void;
  onImportApi?: () => void;
  ownerEmail?: string;
  track: OnboardingControllerOptions['track'];
  /** 已提交、未到终态的上线申请（按流程名称与版本） */
  getPendingPromotion: (name: string, version: number) => PendingPromotion | null;
  setPendingPromotion: (name: string, version: number, request: PendingPromotion | null) => void;
}

/**
 * IDE 内部使用：把自助接入的状态与动作集中在一处，IDE 只需渲染
 * `<OnboardingToolbarButtons>`、`<OnboardingOverlays>` 与（可选）引导卡片。
 */
export function useOnboardingController(opts: OnboardingControllerOptions): OnboardingController {
  const { provider, track, disabled, onPickTemplate, onImportApi, ownerEmail } = opts;
  const data = useOnboardingData(provider);
  const { addProduct } = data;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [level, setLevel] = useState<WorkflowLevel | undefined>(undefined);
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const pendingRef = useRef<PendingIdentity | null>(null);
  // R12: submitted promotion requests per workflow name + version, so reopening the panel resumes polling
  const promotionsRef = useRef<Record<string, PendingPromotion>>({});

  const workflowName = useWorkflowStore((s) => s.workflowDef?.name);
  const hasWorkflow = useWorkflowStore((s) => !!s.workflowDef);

  // provider 换了：关闭弹窗、重置状态
  useEffect(() => {
    setWizardOpen(false);
    setPromoOpen(false);
    setLevel(undefined);
    setGuideDismissed(false);
    pendingRef.current = null;
    promotionsRef.current = {};
  }, [provider]);

  const enabled = !!provider && !disabled;
  // P2: the skeleton's ownerEmail comes from the host option, else from the onboarding context user
  const effectiveOwnerEmail = ownerEmail ?? data.context?.user?.email;

  const handleCreate = useCallback((r: OnboardingCreateResult) => {
    const store = useWorkflowStore.getState();
    // R8: replacing an existing workflow stays undoable; only a fresh canvas starts a clean history.
    const hadWorkflow = (store.workflowDef?.tasks?.length ?? 0) > 0;
    store.setWorkflow(r.def);
    store.setMode('edit');
    if (!hadWorkflow) useWorkflowStore.temporal.getState().clear();
    setLevel(r.level);
    pendingRef.current = r.source === 'blank'
      ? null
      : { name: r.def.name, description: r.def.description ?? '', ownerEmail: r.def.ownerEmail };
    track('workflow_created', { level: r.level, source: r.source });
  }, [track]);

  const handleTrialStarted = useCallback((p: ProductInfo) => {
    addProduct(p);
    track('trial_started', { domain: p.domain });
  }, [addProduct, track]);

  const trialEnabled = data.context?.trialEnabled === true;
  const showGuide = enabled
    && data.status === 'ready'
    && trialEnabled
    && data.products.length === 0
    && !hasWorkflow
    && !guideDismissed
    && !wizardOpen;

  return {
    enabled,
    data,
    level,
    wizardOpen,
    promoOpen,
    openWizard: () => {
      // R8: a workflow on the canvas would be replaced — ask first.
      if ((useWorkflowStore.getState().workflowDef?.tasks?.length ?? 0) > 0) {
        setConfirmReplace(true);
        return;
      }
      pendingRef.current = null;
      setWizardOpen(true);
    },
    confirmReplace,
    resolveConfirmReplace: (proceed: boolean) => {
      setConfirmReplace(false);
      if (!proceed) return;
      pendingRef.current = null;
      setWizardOpen(true);
    },
    openPromotion: () => setPromoOpen(true),
    canPromote: enabled && hasWorkflow && isPromotableName(workflowName),
    showGuide,
    dismissGuide: () => setGuideDismissed(true),
    takePendingIdentity: () => {
      const p = pendingRef.current;
      pendingRef.current = null;
      return p;
    },
    provider,
    close: () => { setWizardOpen(false); setPromoOpen(false); },
    handleCreate,
    handleTrialStarted,
    onPickTemplate,
    onImportApi,
    ownerEmail: effectiveOwnerEmail,
    track,
    getPendingPromotion: (name, version) => promotionsRef.current[`${name}@${version}`] ?? null,
    setPendingPromotion: (name, version, request) => {
      const key = `${name}@${version}`;
      if (request) promotionsRef.current[key] = request;
      else delete promotionsRef.current[key];
    },
  };
}

const toolbarBtn = (accent: boolean, disabled: boolean): CSSProperties => ({
  height: 28,
  padding: '0 10px',
  background: accent ? 'var(--color-accent-bg)' : 'transparent',
  color: accent ? 'var(--color-accent)' : 'var(--text-secondary)',
  border: `1px solid ${accent ? 'var(--color-accent)' : 'var(--border-primary)'}`,
  borderRadius: 6,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.55 : 1,
  fontSize: 12,
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontFamily: 'inherit',
});

/** 工具栏入口：「新建流程」与「申请上线」。没有 onboarding provider 时不渲染任何内容 */
export function OnboardingToolbarButtons({ c }: { c: OnboardingController }) {
  if (!c.enabled) return null;
  const { status } = c.data;
  const ready = status === 'ready';
  return (
    <>
      {status === 'error' && (
        <button type="button" style={toolbarBtn(false, false)} onClick={c.data.reload} title={c.data.error ?? '加载自助接入信息失败'}>
          自助接入加载失败 · 重试
        </button>
      )}
      <button
        type="button"
        style={toolbarBtn(true, !ready)}
        disabled={!ready}
        onClick={c.openWizard}
        title={ready ? '按命名规范新建流程（选择产品 → 命名 → 起点）' : status === 'loading' ? '正在加载自助接入信息…' : '自助接入暂不可用'}
      >
        <span aria-hidden="true">＋</span>
        <span>新建流程</span>
      </button>
      <button
        type="button"
        style={toolbarBtn(false, !c.canPromote)}
        disabled={!c.canPromote}
        onClick={c.openPromotion}
        title={c.canPromote ? '把当前临时流程申请上线到生产' : '仅类型为 tmp 的临时流程可以申请上线'}
      >
        <span aria-hidden="true"><Rocket size={14} strokeWidth={1.75} aria-hidden="true" /></span>
        <span>申请上线</span>
      </button>
    </>
  );
}

/** 弹窗：向导与申请上线面板（Portal 渲染，自带主题属性） */
export function OnboardingOverlays({ c }: { c: OnboardingController }) {
  const name = useWorkflowStore((s) => s.workflowDef?.name);
  const version = useWorkflowStore((s) => s.workflowDef?.version);
  const { provider, data } = c;
  if (!provider || !c.enabled) return null;
  return (
    <>
      {c.confirmReplace && (
        <ConfirmDialog
          message="新建流程会替换当前画布上的流程。替换后可以用撤销（⌘Z / Ctrl+Z）找回。继续新建吗？"
          confirmLabel="继续新建"
          onConfirm={() => c.resolveConfirmReplace(true)}
          onCancel={() => c.resolveConfirmReplace(false)}
        />
      )}
      {c.wizardOpen && data.context && (
        <OnboardingWizard
          provider={provider}
          trialEnabled={data.context.trialEnabled}
          products={data.products}
          domains={data.domains}
          defaultLevel={c.level}
          ownerEmail={c.ownerEmail}
          onClose={c.close}
          onCreate={c.handleCreate}
          onTrialStarted={c.handleTrialStarted}
          onPickTemplate={c.onPickTemplate}
          onImportApi={c.onImportApi}
        />
      )}
      {c.promoOpen && name && (
        <PromotionPanel
          provider={provider}
          workflowName={name}
          version={version ?? 1}
          onClose={c.close}
          onRequested={(targetType) => c.track('promotion_requested', { targetType })}
          onStateChange={(state) => c.track('promotion_state', { state })}
          resumeRequest={c.getPendingPromotion(name, version ?? 1)}
          onRequestChange={(req) => c.setPendingPromotion(name, version ?? 1, req)}
        />
      )}
    </>
  );
}

/** 空画布引导：覆盖整个 IDE 的半透明层（不拦截点击），卡片居中；仅 `c.showGuide` 时渲染 */
export function OnboardingGuideOverlay({ c }: { c: OnboardingController }) {
  if (!c.showGuide) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        pointerEvents: 'none',
        background: 'color-mix(in srgb, var(--bg-primary) 82%, transparent)',
      }}
    >
      <div style={{ pointerEvents: 'auto' }}>
        <OnboardingGuideCard onStart={c.openWizard} onDismiss={c.dismissGuide} />
      </div>
    </div>
  );
}
