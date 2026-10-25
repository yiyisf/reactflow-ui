import React, { useMemo, useState } from 'react';
import type { BusinessStep } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import { validateBusinessSteps } from '../../stepmodel/validate';
import { DataPillInput } from './DataPillInput';
import { useBusinessEditor } from './BusinessEditorContext';
import { IssueList } from './StepCardParts';
import { CircleAlert, ClipboardList, Lightbulb, Tag, Wrench } from 'lucide-react';

export interface ActionFormProps {
  step: BusinessStep;
  upstreamSteps: BusinessStep[];
  workflowInputParams?: any[];
  registry?: ActionRegistry;
  onChange: (updatedStep: BusinessStep) => void;
  disabled?: boolean;
}

export const ActionForm: React.FC<ActionFormProps> = ({
  step,
  upstreamSteps,
  workflowInputParams,
  registry = defaultActionRegistry,
  onChange,
  disabled = false,
}) => {
  const action = registry.getAction(step.actionId);
  const ctx = useBusinessEditor();
  const inputParams = workflowInputParams ?? ctx.workflowInputParams;

  // 字段级校验（必填 / 数字）就地计算；工作流校验器给出的整步问题来自上下文
  const fieldIssues = useMemo(() => validateBusinessSteps([step], registry)[step.taskReferenceName] || [], [step, registry]);
  const stepIssues = (ctx.issues[step.taskReferenceName] || []).filter(
    (i) => !i.field && !fieldIssues.some((f) => f.message === i.message)
  );

  // Fallback for technical Conductor tasks not mapped to business actions
  if (step.isProFallback || !action) {
    return (
      <div
        style={{
          padding: 16,
          background: 'var(--bg-highlight)',
          borderRadius: 8,
          border: '1px dashed var(--border-secondary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}><Wrench size={20} strokeWidth={1.75} aria-hidden="true" /></span>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
              {step.name || step.taskReferenceName} (底层技术步骤)
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              任务类型: {step.rawTaskDef?.type || 'CUSTOM'}
            </div>
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
          该步骤属于底层控制流或未映射的 Conductor 任务。在业务模式下已为您无损保留其参数与依赖关系。如需深度修改其底层 JQ 脚本或 JSON Schema，请切换至右上方「全景画布模式」。
        </p>
        <IssueList issues={stepIssues} />
      </div>
    );
  }

  const handleFieldChange = (key: string, val: any) => {
    const nextValues = { ...step.values, [key]: val };
    onChange({
      ...step,
      values: nextValues,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sensitive Risk Alert Banner */}
      {action.riskLevel === 'sensitive' && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)',
            fontSize: 12,
            color: 'var(--color-error)',
            lineHeight: 1.5,
          }}
        >
          <Lightbulb size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} /><strong>操作安全网</strong>：此步骤会直接影响真实云主机的运行状态（关机、重启、变配或下线）。建议在流程设计中，于本步骤之前放置一个「人工确认/审批」步骤，确保生产稳定性。
        </div>
      )}

      <IssueList issues={stepIssues} />

      {/* Dynamic Action Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {action.fields.map((field) => {
          const val = step.values[field.key] ?? field.defaultValue;
          const controlId = `cm-field-${step.taskReferenceName}-${field.key}`;
          const issue = fieldIssues.find((i) => i.field === field.key);
          const errorId = issue ? `${controlId}-error` : undefined;
          const helpId = field.help ? `${controlId}-help` : undefined;
          const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;
          const controlBorder = issue ? '1px solid var(--cm-status-failed)' : '1px solid var(--border-secondary)';

          return (
            <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label
                  htmlFor={field.type === 'boolean' ? undefined : controlId}
                  id={`${controlId}-label`}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {field.label}
                  {field.required && <span style={{ color: 'var(--cm-status-failed)' }} aria-label="必填">*</span>}
                </label>
                {field.help && (
                  <span id={helpId} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {field.help}
                  </span>
                )}
              </div>

              {/* Render field control based on type */}
              {field.type === 'select' ? (
                <SelectField
                  id={controlId}
                  invalid={!!issue}
                  describedBy={describedBy}
                  value={val}
                  options={field.options ?? []}
                  allowDynamic={field.acceptsPills !== false}
                  disabled={disabled}
                  placeholder={field.placeholder}
                  upstreamSteps={upstreamSteps}
                  workflowInputParams={inputParams}
                  registry={registry}
                  onChange={(nextVal) => handleFieldChange(field.key, nextVal)}
                />
              ) : field.type === 'boolean' ? (
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <input
                    type="checkbox"
                    aria-labelledby={`${controlId}-label`}
                    disabled={disabled}
                    checked={Boolean(val)}
                    onChange={(e) => handleFieldChange(field.key, e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span>开启 / 启用</span>
                </label>
              ) : field.acceptsPills || (val !== null && typeof val === 'object') ? (
                <DataPillInput
                  id={controlId}
                  invalid={!!issue}
                  describedBy={describedBy}
                  disabled={disabled}
                  value={val}
                  placeholder={field.placeholder}
                  multiline={field.type === 'textarea'}
                  upstreamSteps={upstreamSteps}
                  workflowInputParams={inputParams}
                  registry={registry}
                  onChange={(nextVal) => handleFieldChange(field.key, nextVal)}
                />
              ) : field.type === 'textarea' ? (
                <textarea
                  id={controlId}
                  aria-invalid={!!issue || undefined}
                  aria-describedby={describedBy}
                  disabled={disabled}
                  rows={3}
                  value={val ?? ''}
                  placeholder={field.placeholder}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'var(--bg-secondary)',
                    border: controlBorder,
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <input
                  id={controlId}
                  aria-invalid={!!issue || undefined}
                  aria-describedby={describedBy}
                  disabled={disabled}
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={val ?? ''}
                  placeholder={field.placeholder}
                  onChange={(e) =>
                    handleFieldChange(
                      field.key,
                      // 清空数字字段保存为空（编译时回落默认值），不变成 0：0 可能有特殊含义（如"永久保留"）
                      field.type === 'number'
                        ? e.target.value === ''
                          ? ''
                          : Number(e.target.value)
                        : e.target.value
                    )
                  }
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'var(--bg-secondary)',
                    border: controlBorder,
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              )}
              {issue && (
                <div
                  id={errorId}
                  style={{ fontSize: 11, color: 'var(--cm-status-failed)', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <CircleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
                  {issue.message}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Expected Outputs summary */}
      {action.outputs.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: '10px 12px',
            background: 'var(--bg-tertiary)',
            borderRadius: 6,
            border: '1px solid var(--border-primary)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted)',
              marginBottom: 6,
            }}
          >
            <ClipboardList size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />本步骤产生的数据（可被后续步骤引用）:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {action.outputs.map((out) => (
              <span
                key={out.key}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span><Tag size={14} strokeWidth={1.75} aria-hidden="true" /></span>
                <span>{out.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  ({out.key})
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/** 值中含 ${...} 引用时视为动态取值 */
const isExpression = (v: unknown): boolean => typeof v === 'string' && v.includes('${');

interface SelectFieldProps {
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  value: any;
  options: { label: string; value: any }[];
  /** 是否允许改为「插入数据」动态取值（字段 acceptsPills 显式为 false 时不允许） */
  allowDynamic: boolean;
  disabled: boolean;
  placeholder?: string;
  upstreamSteps: BusinessStep[];
  workflowInputParams?: any[];
  registry: ActionRegistry;
  onChange: (val: any) => void;
}

/**
 * 下拉字段：默认从可选项中选择；也可切换为「插入数据」，引用上游步骤输出或全局入参（运行时取值）。
 * 已保存的值是 ${...} 表达式时自动处于动态取值状态。
 */
const SelectField: React.FC<SelectFieldProps> = ({
  id,
  invalid,
  describedBy,
  value,
  options,
  allowDynamic,
  disabled,
  placeholder,
  upstreamSteps,
  workflowInputParams,
  registry,
  onChange,
}) => {
  const [dynamic, setDynamic] = useState(() => isExpression(value));
  const [justSwitched, setJustSwitched] = useState(false);

  const smallButton: React.CSSProperties = {
    flexShrink: 0,
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-primary)',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  };

  if (allowDynamic && dynamic) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <DataPillInput
          id={id}
          invalid={invalid}
          describedBy={describedBy}
          disabled={disabled}
          value={isExpression(value) ? value : ''}
          placeholder={placeholder || '插入上游数据，运行时取值'}
          upstreamSteps={upstreamSteps}
          workflowInputParams={workflowInputParams}
          registry={registry}
          defaultShowPicker={justSwitched}
          onChange={onChange}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            动态取值：运行时的值需为可选项之一（{options.map((o) => o.label).join(' / ')}）
          </span>
          <button
            type="button"
            disabled={disabled}
            style={smallButton}
            onClick={() => {
              setDynamic(false);
              setJustSwitched(false);
              // 改回选择时，表达式不是合法选项，回到第一个可选项
              if (isExpression(value)) onChange(options[0]?.value ?? '');
            }}
          >
            改为选择
          </button>
        </div>
      </div>
    );
  }

  // 当前值不在可选项里（如专业模式改过的值）时，单独列出"当前值"，不让下拉框假装选中第一项
  const hasValue = value !== undefined && value !== null && value !== '';
  const inOptions = options.some((o) => String(o.value) === String(value));
  const selectValue = hasValue ? String(value) : '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        value={selectValue}
        onChange={(e) => {
          // 选项值可能是数字（如 60 / 300），按原类型写回
          const opt = options.find((o) => String(o.value) === e.target.value);
          onChange(opt ? opt.value : e.target.value);
        }}
        style={{
          flex: 1,
          minWidth: 0,
          padding: '7px 10px',
          borderRadius: 6,
          background: 'var(--bg-secondary)',
          border: invalid ? '1px solid var(--cm-status-failed)' : '1px solid var(--border-secondary)',
          color: 'var(--text-primary)',
          fontSize: 13,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        {!hasValue && (
          <option value="" disabled>
            请选择
          </option>
        )}
        {hasValue && !inOptions && <option value={selectValue}>当前值：{selectValue}</option>}
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
      {allowDynamic && (
        <button
          type="button"
          disabled={disabled}
          title="改为引用上游步骤输出或全局入参，运行时取值"
          style={smallButton}
          onClick={() => {
            setDynamic(true);
            setJustSwitched(true);
          }}
        >
          <Tag size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />插入数据
        </button>
      )}
    </div>
  );
};
