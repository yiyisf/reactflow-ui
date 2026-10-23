import { useId, useMemo, useState } from 'react';
import type { ProductInfo } from '../../providers/types';
import type { WorkflowNameType } from '../../library/naming';
import type { WorkflowLevel } from '../../types/workflowLibrary';
import { buildWorkflowName, suggestFuncSlug, validateNameParts } from '../../onboarding/naming';
import type { WorkflowNameParts } from '../../onboarding/naming';
import { errorStyle, hintStyle, inputStyle, labelStyle } from './styles';

export interface WorkflowNameBuilderProps {
  /** 可选的所属产品（我的产品）；业务域取自所选产品 */
  products: ProductInfo[];
  /** 允许的业务域列表；提供时参与校验 */
  domains?: string[];
  /** 试用环境：类型固定为 tmp；否则可选 custom / std */
  trial: boolean;
  value: WorkflowNameParts;
  onChange: (next: WorkflowNameParts) => void;
  disabled?: boolean;
}

const LEVELS: WorkflowLevel[] = ['L1', 'L2', 'L3'];
const LEVEL_HINT: Record<WorkflowLevel, string> = {
  L1: 'L1 最上层，可调用 L2 / L3',
  L2: 'L2 中间层，可调用 L3',
  L3: 'L3 最底层，原子能力',
};
const PROD_TYPES: WorkflowNameType[] = ['custom', 'std'];

/**
 * 五段式命名生成器：`类型-层级-业务域-产品-功能`。
 * 受控组件：类型（试用固定 tmp）、层级、产品（下拉我的产品，业务域随产品带出）、功能（自由输入，推荐 snake_case），
 * 实时预览完整名称并用 `validateWorkflowName` 校验。
 */
export function WorkflowNameBuilder({ products, domains, trial, value, onChange, disabled }: WorkflowNameBuilderProps) {
  const uid = useId();
  const [funcTouched, setFuncTouched] = useState(false);

  const effective: WorkflowNameParts = useMemo(
    () => ({ ...value, type: trial ? 'tmp' : value.type === 'std' ? 'std' : 'custom' }),
    [value, trial],
  );
  const fullName = buildWorkflowName(effective);
  const errors = useMemo(() => validateNameParts(effective, domains && domains.length > 0 ? domains : undefined), [effective, domains]);
  // 功能为空时只在用户操作过功能输入框后才报错，避免一打开就满屏红字
  const visibleErrors = errors.filter((e) => funcTouched || value.func.trim() !== '' || e.indexOf('功能不能为空') < 0);

  const slug = suggestFuncSlug(value.func);
  const showSlugHint = value.func.trim() !== '' && slug !== '' && slug !== value.func.trim();

  const set = (patch: Partial<WorkflowNameParts>) => onChange({ ...effective, ...patch });

  const selectedProduct = products.find((p) => p.name === value.product);
  const idOf = (s: string) => `${uid}-${s}`;
  const fieldBox = { minWidth: 0 } as const;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div style={fieldBox}>
          <label htmlFor={idOf('type')} style={labelStyle}>类型</label>
          {trial ? (
            <select id={idOf('type')} value="tmp" disabled style={{ ...inputStyle, opacity: 0.7 }} aria-describedby={idOf('type-hint')}>
              <option value="tmp">tmp（临时）</option>
            </select>
          ) : (
            <select
              id={idOf('type')}
              value={effective.type}
              disabled={disabled}
              onChange={(e) => set({ type: e.target.value as WorkflowNameType })}
              style={inputStyle}
              aria-describedby={idOf('type-hint')}
            >
              {PROD_TYPES.map((t) => (
                <option key={t} value={t}>{t === 'custom' ? 'custom（自定义）' : 'std（通用）'}</option>
              ))}
            </select>
          )}
          <div id={idOf('type-hint')} style={hintStyle}>
            {trial ? '试用环境固定为临时流程，会被定期清理' : '生产环境可选自定义或通用'}
          </div>
        </div>

        <div style={fieldBox}>
          <label htmlFor={idOf('level')} style={labelStyle}>层级</label>
          <select
            id={idOf('level')}
            value={effective.level}
            disabled={disabled}
            onChange={(e) => set({ level: e.target.value as WorkflowLevel })}
            style={inputStyle}
            aria-describedby={idOf('level-hint')}
          >
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <div id={idOf('level-hint')} style={hintStyle}>{LEVEL_HINT[effective.level]}</div>
        </div>

        <div style={fieldBox}>
          <label htmlFor={idOf('product')} style={labelStyle}>产品</label>
          <select
            id={idOf('product')}
            value={selectedProduct ? selectedProduct.name : ''}
            disabled={disabled || products.length === 0}
            onChange={(e) => {
              const p = products.find((x) => x.name === e.target.value);
              set({ product: p?.name ?? '', domain: p?.domain ?? '' });
            }}
            style={inputStyle}
            aria-describedby={idOf('product-hint')}
          >
            <option value="">{products.length === 0 ? '暂无产品' : '请选择产品'}</option>
            {products.map((p) => (
              <option key={p.name} value={p.name}>{p.name}{p.status === 'PENDING' ? '（待生效）' : ''}</option>
            ))}
          </select>
          <div id={idOf('product-hint')} style={hintStyle}>来自「我的产品」</div>
        </div>

        <div style={fieldBox}>
          <label htmlFor={idOf('domain')} style={labelStyle}>业务域</label>
          <input
            id={idOf('domain')}
            value={selectedProduct ? selectedProduct.domain : value.domain}
            readOnly
            style={{ ...inputStyle, opacity: 0.8 }}
            placeholder="随产品带出"
            aria-describedby={idOf('domain-hint')}
          />
          <div id={idOf('domain-hint')} style={hintStyle}>由所选产品决定</div>
        </div>

        <div style={{ ...fieldBox, gridColumn: '1 / -1' }}>
          <label htmlFor={idOf('func')} style={labelStyle}>功能</label>
          <input
            id={idOf('func')}
            value={value.func}
            disabled={disabled}
            onChange={(e) => set({ func: e.target.value })}
            onBlur={() => setFuncTouched(true)}
            placeholder="例如 create_vm（推荐小写 snake_case）"
            style={inputStyle}
            aria-describedby={idOf('func-hint')}
            aria-invalid={funcTouched && value.func.trim() === ''}
          />
          <div id={idOf('func-hint')} style={hintStyle}>
            说明这个流程做什么，用 snake_case 更易检索
            {showSlugHint && (
              <>
                {' · 建议：'}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => set({ func: slug })}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-accent)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', textDecoration: 'underline' }}
                >
                  {slug}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={labelStyle}>完整名称预览</div>
        <code
          aria-live="polite"
          data-testid="name-preview"
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
          {fullName}
        </code>
        {visibleErrors.length > 0 && (
          <ul role="alert" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {visibleErrors.map((e) => <li key={e} style={errorStyle}>{e}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
