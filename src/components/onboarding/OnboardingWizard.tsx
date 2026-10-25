import { useCallback, useId, useMemo, useState } from 'react';
import type { OnboardingProvider, ProductInfo } from '../../providers/types';
import type { WorkflowDef } from '../../types/conductor';
import type { WorkflowLevel } from '../../types/workflowLibrary';
import { buildWorkflowName, buildSkeletonWorkflow } from '../../onboarding/naming';
import {
  WIZARD_STEPS,
  WIZARD_STEP_LABEL,
  availableSources,
  canAdvance,
  createInitialDraft,
  draftToNameParts,
  nextStep,
  prevStep,
  productStepError,
} from '../../onboarding/wizardState';
import type { StartSource, WizardDraft, WizardStep } from '../../onboarding/wizardState';
import { ModalShell } from './ModalShell';
import { WorkflowNameBuilder } from './WorkflowNameBuilder';
import {
  disabledStyle,
  errorStyle,
  ghostButton,
  hintStyle,
  inputStyle,
  labelStyle,
  noticeStyle,
  primaryButton,
} from './styles';
import { Check } from 'lucide-react';

export interface OnboardingCreateResult {
  /** 向导生成的骨架定义（名称已按规范拼好） */
  def: WorkflowDef;
  /** 所选层级，宿主可据此设置 `currentWorkflowLevel` */
  level: WorkflowLevel;
  /** 起点：空白 / 模板中心 / 从接口导入 */
  source: StartSource;
}

export interface OnboardingWizardProps {
  /** 只用到 startTrial；传完整的 OnboardingProvider 即可 */
  provider: Pick<OnboardingProvider, 'startTrial'>;
  /** 当前环境是否开放自助试用（决定能否登记新产品、类型是否固定 tmp） */
  trialEnabled: boolean;
  /** 我的产品 */
  products: ProductInfo[];
  /** 业务域列表 */
  domains: string[];
  /** 默认层级，默认 L2 */
  defaultLevel?: WorkflowLevel;
  /** 写入骨架定义的负责人邮箱 */
  ownerEmail?: string;
  onClose: () => void;
  /** 完成：交给宿主把骨架设为当前流程 */
  onCreate: (result: OnboardingCreateResult) => void;
  /** 新产品登记成功（宿主可刷新「我的产品」、上报 trial_started） */
  onTrialStarted?: (product: ProductInfo) => void;
  /** 选择「从模板中心开始」：创建骨架后调用，宿主打开模板中心；不提供则隐藏该选项 */
  onPickTemplate?: () => void;
  /** 选择「从接口导入」：创建骨架后调用，宿主打开导入面板；不提供则隐藏该选项 */
  onImportApi?: () => void;
}

const SOURCE_TEXT: Record<StartSource, { title: string; desc: string }> = {
  blank: { title: '空白流程', desc: '从一个空画布开始，自己添加步骤' },
  template: { title: '从模板中心开始', desc: '选择场景模板，按向导填空即可得到可用流程' },
  import: { title: '从接口导入', desc: '粘贴 OpenAPI / Postman / curl，把已有接口变成步骤' },
};

function messageOf(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '请求失败，请稍后重试';
}

/**
 * 自助接入向导（3 步弹窗）：产品 → 命名 → 起点。
 * - 试用环境可登记新产品（startTrial）；产品被他人占用时提示联系负责人；
 * - 接口失败停在当前步，显示「重试」，已填内容保留；
 * - 完成后用 `onCreate({ def, level, source })` 交给宿主设置当前流程。
 */
export function OnboardingWizard({
  provider,
  trialEnabled,
  products,
  domains,
  defaultLevel = 'L2',
  ownerEmail,
  onClose,
  onCreate,
  onTrialStarted,
  onPickTemplate,
  onImportApi,
}: OnboardingWizardProps) {
  const titleId = useId();
  const uid = useId();
  const [step, setStep] = useState<WizardStep>('product');
  // 本次向导内新登记的产品：与宿主传入的 products 合并，宿主刷新前也能立即选用
  const [registered, setRegistered] = useState<ProductInfo[]>([]);
  const allProducts = useMemo(() => {
    const extra = registered.filter((r) => !products.some((p) => p.name === r.name));
    return [...products, ...extra];
  }, [products, registered]);
  const ctx = useMemo(() => ({ trial: trialEnabled, products: allProducts }), [trialEnabled, allProducts]);
  const [draft, setDraft] = useState<WizardDraft>(() => createInitialDraft({ trial: trialEnabled, products }, defaultLevel));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ id: string; name: string }[] | null>(null);

  const patch = useCallback((p: Partial<WizardDraft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setError(null);
    setConflict(null);
  }, []);

  const sources = availableSources({ hasTemplate: !!onPickTemplate, hasImport: !!onImportApi });
  const productError = productStepError(draft, ctx, domains);
  const stepOk = canAdvance(step, draft, ctx, domains);
  const stepIndex = WIZARD_STEPS.indexOf(step);

  /** 第 1 步「下一步」：登记新产品要先调 startTrial；已有产品直接前进 */
  const handleProductNext = useCallback(async () => {
    if (draft.productMode === 'existing') {
      setStep('naming');
      return;
    }
    setBusy(true);
    setError(null);
    setConflict(null);
    try {
      const res = await provider.startTrial({
        productName: draft.productName.trim(),
        domain: draft.domain,
        systemCode: draft.systemCode.trim() || undefined,
      });
      if (res.status === 'conflict') {
        setConflict(res.owners);
        return;
      }
      setRegistered((r) => [...r.filter((x) => x.name !== res.product.name), res.product]);
      setDraft((d) => ({ ...d, productMode: 'existing', productName: res.product.name, domain: res.product.domain }));
      onTrialStarted?.(res.product);
      setStep('naming');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }, [draft.productMode, draft.productName, draft.domain, draft.systemCode, provider, onTrialStarted]);

  const handleFinish = useCallback(() => {
    const name = buildWorkflowName(draftToNameParts(draft, trialEnabled));
    const def = buildSkeletonWorkflow({ name, description: draft.description, ownerEmail });
    onCreate({ def, level: draft.level, source: draft.source });
    onClose();
    // 骨架创建后再交给宿主打开模板中心 / 导入面板
    if (draft.source === 'template') onPickTemplate?.();
    else if (draft.source === 'import') onImportApi?.();
  }, [draft, trialEnabled, ownerEmail, onCreate, onClose, onPickTemplate, onImportApi]);

  const handleNext = () => {
    if (busy || !stepOk) return;
    if (step === 'product') void handleProductNext();
    else setStep(nextStep(step));
  };

  const isLast = step === 'start';
  const nextLabel = step === 'product' && draft.productMode === 'new' ? '登记并继续' : '下一步';

  const footer = (
    <>
      {stepIndex > 0 && (
        <button type="button" style={disabledStyle(ghostButton, busy)} disabled={busy} onClick={() => setStep(prevStep(step))}>
          上一步
        </button>
      )}
      <span style={{ flex: 1 }} />
      <button type="button" style={ghostButton} onClick={onClose}>取消</button>
      {isLast ? (
        <button type="button" style={primaryButton} onClick={handleFinish}>创建流程</button>
      ) : (
        <button type="button" style={disabledStyle(primaryButton, busy || !stepOk)} disabled={busy || !stepOk} onClick={handleNext}>
          {busy ? '处理中…' : nextLabel}
        </button>
      )}
    </>
  );

  return (
    <ModalShell titleId={titleId} title="新建流程" onClose={onClose} footer={footer} width={600}>
      <ol aria-label="步骤" style={{ display: 'flex', gap: 8, listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
        {WIZARD_STEPS.map((s, i) => {
          const active = s === step;
          const done = i < stepIndex;
          return (
            <li
              key={s}
              aria-current={active ? 'step' : undefined}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '6px 0',
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                borderRadius: 6,
                color: active ? 'var(--color-accent-text)' : done ? 'var(--color-success)' : 'var(--text-muted)',
                background: active ? 'var(--color-accent)' : 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              {i + 1}. {WIZARD_STEP_LABEL[s]}{done ? <Check size={12} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginLeft: 4 }} /> : null}
            </li>
          );
        })}
      </ol>

      {step === 'product' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor={`${uid}-pm`} style={labelStyle}>所属产品</label>
            <select
              id={`${uid}-pm`}
              value={draft.productMode === 'new' ? '__new__' : draft.productName}
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__new__') patch({ productMode: 'new', productName: '', domain: '' });
                else {
                  const p = allProducts.find((x) => x.name === v);
                  patch({ productMode: 'existing', productName: v, domain: p?.domain ?? '' });
                }
              }}
              style={inputStyle}
            >
              {allProducts.length === 0 && draft.productMode === 'existing' && <option value="">暂无产品</option>}
              {allProducts.map((p) => (
                <option key={p.name} value={p.name}>{p.name}（{p.domain}）</option>
              ))}
              {trialEnabled && <option value="__new__">＋ 登记新产品（开始试用）</option>}
            </select>
            {!trialEnabled && allProducts.length === 0 && (
              <p style={{ ...errorStyle, marginTop: 6 }}>当前环境不开放自助试用，且你还没有所属产品，请联系平台管理员。</p>
            )}
          </div>

          {draft.productMode === 'new' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label htmlFor={`${uid}-pn`} style={labelStyle}>产品名称</label>
                <input
                  id={`${uid}-pn`}
                  value={draft.productName}
                  disabled={busy}
                  onChange={(e) => patch({ productName: e.target.value })}
                  placeholder="例如 ecs（不含 -）"
                  style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor={`${uid}-pd`} style={labelStyle}>业务域</label>
                <select
                  id={`${uid}-pd`}
                  value={draft.domain}
                  disabled={busy}
                  onChange={(e) => patch({ domain: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">请选择业务域</option>
                  {domains.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label htmlFor={`${uid}-ps`} style={labelStyle}>系统编码（可选）</label>
                <input
                  id={`${uid}-ps`}
                  value={draft.systemCode}
                  disabled={busy}
                  onChange={(e) => patch({ systemCode: e.target.value })}
                  style={inputStyle}
                />
                <div style={hintStyle}>登记后你自动成为该产品的负责人，可以马上开始试用。</div>
              </div>
            </div>
          )}

          {draft.productMode === 'new' && draft.productName !== '' && productError && (
            <p style={errorStyle}>{productError}</p>
          )}

          {conflict && (
            <div role="alert" style={{ ...noticeStyle('warning'), marginTop: 12 }}>
              产品「{draft.productName.trim()}」已存在，请联系负责人把你加入该产品：
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {conflict.map((o) => <li key={o.id}>{o.name}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {step === 'naming' && (
        <div>
          <WorkflowNameBuilder
            products={allProducts}
            domains={domains}
            trial={trialEnabled}
            value={draftToNameParts(draft, trialEnabled)}
            onChange={(n) => patch({ type: n.type, level: n.level, domain: n.domain, productName: n.product, func: n.func })}
          />
          <div style={{ marginTop: 14 }}>
            <label htmlFor={`${uid}-desc`} style={labelStyle}>流程说明（可选）</label>
            <textarea
              id={`${uid}-desc`}
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={3}
              placeholder="一句话说明这个流程做什么，会写入流程描述"
              style={{ ...inputStyle, height: 'auto', padding: 8, resize: 'vertical' }}
            />
          </div>
        </div>
      )}

      {step === 'start' && (
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={labelStyle}>选择起点</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sources.map((s) => {
              const checked = draft.source === s;
              return (
                <label
                  key={s}
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
                  <input type="radio" name={`${uid}-src`} checked={checked} onChange={() => patch({ source: s })} style={{ marginTop: 3 }} />
                  <span>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{SOURCE_TEXT[s].title}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>{SOURCE_TEXT[s].desc}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
            将创建：<code style={{ color: 'var(--text-primary)' }}>{buildWorkflowName(draftToNameParts(draft, trialEnabled))}</code>
          </div>
        </fieldset>
      )}

      {error && (
        <div role="alert" style={{ ...noticeStyle('error'), marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" style={disabledStyle(ghostButton, busy)} disabled={busy} onClick={handleNext}>重试</button>
        </div>
      )}
    </ModalShell>
  );
}
