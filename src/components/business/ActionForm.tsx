import React from 'react';
import type { BusinessStep } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import { DataPillInput } from './DataPillInput';

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

  // Fallback for technical Conductor tasks not mapped to business actions
  if (step.isProFallback || !action) {
    return (
      <div
        style={{
          padding: 16,
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 8,
          border: '1px dashed var(--border-secondary, rgba(255, 255, 255, 0.2))',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🔧</span>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary, #f8fafc)', fontSize: 14 }}>
              {step.name || step.taskReferenceName} (底层技术步骤)
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)' }}>
              任务类型: {step.rawTaskDef?.type || 'CUSTOM'}
            </div>
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-secondary, #b0bec5)', lineHeight: 1.6, margin: 0 }}>
          该步骤属于底层控制流或未映射的 Conductor 任务。在业务模式下已为您无损保留其参数与依赖关系。如需深度修改其底层 JQ 脚本或 JSON Schema，请切换至右上方「全景画布模式」。
        </p>
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
      {/* Action Header Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '10px 12px',
          background: 'var(--bg-primary, #0f172a)',
          borderRadius: 8,
          border: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
        }}
      >
        <span style={{ fontSize: 24 }}>{action.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary, #f8fafc)' }}>
              {action.name}
            </span>
            {action.riskLevel === 'sensitive' && (
              <span
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'rgba(239, 68, 68, 0.18)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  fontWeight: 600,
                }}
              >
                ⚠️ 敏感变更
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>
            {action.description}
          </div>
        </div>
      </div>

      {/* Sensitive Risk Alert Banner */}
      {action.riskLevel === 'sensitive' && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            fontSize: 12,
            color: '#fca5a5',
            lineHeight: 1.5,
          }}
        >
          💡 <strong>操作安全网</strong>：此步骤会直接影响真实云主机的运行状态（关机、重启、变配或下线）。建议在流程设计中，于本步骤之前放置一个「人工确认/审批」步骤，确保生产稳定性。
        </div>
      )}

      {/* Dynamic Action Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {action.fields.map((field) => {
          const val = step.values[field.key] ?? field.defaultValue;

          return (
            <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-primary, #f8fafc)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {field.label}
                  {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                {field.help && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
                    {field.help}
                  </span>
                )}
              </div>

              {/* Render field control based on type */}
              {field.type === 'select' ? (
                <select
                  disabled={disabled}
                  value={val ?? ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 6,
                    background: 'var(--bg-primary, #0f172a)',
                    border: '1px solid var(--border-secondary, rgba(255,255,255,0.2))',
                    color: 'var(--text-primary, #f8fafc)',
                    fontSize: 13,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'boolean' ? (
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--text-secondary, #b0bec5)',
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={Boolean(val)}
                    onChange={(e) => handleFieldChange(field.key, e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span>开启 / 启用</span>
                </label>
              ) : field.acceptsPills ? (
                <DataPillInput
                  disabled={disabled}
                  value={val}
                  placeholder={field.placeholder}
                  multiline={field.type === 'textarea'}
                  upstreamSteps={upstreamSteps}
                  workflowInputParams={workflowInputParams}
                  registry={registry}
                  onChange={(nextVal) => handleFieldChange(field.key, nextVal)}
                />
              ) : field.type === 'textarea' ? (
                <textarea
                  disabled={disabled}
                  rows={3}
                  value={val ?? ''}
                  placeholder={field.placeholder}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'var(--bg-primary, #0f172a)',
                    border: '1px solid var(--border-secondary, rgba(255,255,255,0.2))',
                    color: 'var(--text-primary, #f8fafc)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <input
                  disabled={disabled}
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={val ?? ''}
                  placeholder={field.placeholder}
                  onChange={(e) =>
                    handleFieldChange(
                      field.key,
                      field.type === 'number' ? Number(e.target.value) : e.target.value
                    )
                  }
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'var(--bg-primary, #0f172a)',
                    border: '1px solid var(--border-secondary, rgba(255,255,255,0.2))',
                    color: 'var(--text-primary, #f8fafc)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
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
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 6,
            border: '1px solid var(--border-primary, rgba(255,255,255,0.08))',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted, #94a3b8)',
              marginBottom: 6,
            }}
          >
            📋 本步骤产生的数据（可被后续步骤引用）:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {action.outputs.map((out) => (
              <span
                key={out.key}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--text-secondary, #b0bec5)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>🏷️</span>
                <span>{out.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)', fontFamily: 'monospace' }}>
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
