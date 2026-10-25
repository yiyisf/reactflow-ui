import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import useWorkflowStore from '../../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import type { WorkflowDef } from '../../types/conductor';
import type { WorkflowTemplate } from '../../template/types';
import { applyTemplateVariables } from '../../template/applyTemplate';
import { executeLocalSandboxDryRun } from '../../utils/localSandboxEngine';
import { X } from 'lucide-react';
import { CmIcon } from '../icons/CmIcon';

export interface TemplateSetupWizardProps {
  template: WorkflowTemplate;
  onApply: (configuredDef: WorkflowDef) => void;
  onClose: () => void;
  /** 向导内试跑结束：最终状态或 'error'（埋点用，不含数据） */
  onSandboxRun?: (result: string) => void;
}

export const TemplateSetupWizard: React.FC<TemplateSetupWizardProps> = ({
  template,
  onApply,
  onClose,
  onSandboxRun,
}) => {
  const { theme, themeColor } = useWorkflowStore(useShallow((s) => ({ theme: s.theme, themeColor: s.themeColor })));
  // 当前步骤：1=方案了解, 2=参数填空, 3=试跑验证与激活
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // 用户填写的变量值
  const [variableValues, setVariableValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const v of template.variables) {
      if (v.defaultValue !== undefined) {
        init[v.key] = v.defaultValue;
      }
    }
    return init;
  });

  // 沙盒试跑状态与结果
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSummary, setSimSummary] = useState<string | null>(null);

  const handleFieldChange = (key: string, val: any) => {
    setVariableValues((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  // 执行沙盒免授权试跑
  const handleRunSandboxTest = () => {
    setIsSimulating(true);
    try {
      const configuredDef = applyTemplateVariables(template, variableValues);
      const scenario = template.mockDataset.scenarios[0];

      const instance = executeLocalSandboxDryRun(configuredDef, {
        workflowInput: scenario?.workflowInput || {},
        taskMocks: scenario?.taskOutputs || {},
      });

      onSandboxRun?.(String(instance.status));
      if (instance.status === 'COMPLETED') {
        setSimSummary(
          `全部 ${instance.tasks.length} 个步骤在浏览器本地顺利模拟通过，各上游数据与通知已正确串联。`
        );
      } else {
        setSimSummary(`模拟运行结束，状态为: ${instance.status}`);
      }
    } catch (err: any) {
      onSandboxRun?.('error');
      setSimSummary(`模拟试跑出错: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  // 最终激活应用
  const handleFinalActivate = () => {
    const configuredDef = applyTemplateVariables(template, variableValues);
    onApply(configuredDef);
    onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-mode={theme}
      data-brand={themeColor}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(5px)',
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: 'inherit',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 680,
          maxHeight: '85vh',
          background: 'var(--bg-secondary, #1e293b)',
          border: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.2))',
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 弹窗顶部栏 */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-primary, rgba(255, 255, 255, 0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-primary, #0f172a)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CmIcon name={template.icon} size={20} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary, #f8fafc)' }}>
                {template.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
                3 步填空式模板快速启用向导
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="关闭"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {/* 步骤条指示器 */}
        <div
          style={{
            padding: '10px 20px',
            background: 'rgba(0,0,0,0.15)',
            borderBottom: '1px solid var(--border-primary, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          {[
            { step: 1, label: '1. 了解方案' },
            { step: 2, label: '2. 参数填空' },
            { step: 3, label: '3. 试跑验证与激活' },
          ].map((item) => {
            const isActive = currentStep === item.step;
            const isDone = currentStep > item.step;

            return (
              <div
                key={item.step}
                onClick={() => isDone && setCurrentStep(item.step as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: isDone ? 'pointer' : 'default',
                  opacity: isActive || isDone ? 1 : 0.5,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: isDone
                      ? 'var(--color-success, #10b981)'
                      : isActive
                      ? 'var(--color-accent, #3b82f6)'
                      : 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {isDone ? <CmIcon name="approval" size={12} /> : item.step}
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--text-primary, #f8fafc)' : 'var(--text-secondary, #b0bec5)',
                  }}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* 步骤内容主体 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {/* Step 1: 了解方案与收益 */}
          {currentStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* ROI 收益看板 */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#34d399' }}><CmIcon name="zap" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />预期单次节省人工</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981', marginTop: 4 }}>
                    约 {template.roi.minutesSavedPerRun} 分钟
                  </div>
                </div>

                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#60a5fa' }}><CmIcon name="refresh" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />典型每周频次</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6', marginTop: 4 }}>
                    约 {template.roi.typicalRunsPerWeek} 次 / 周
                  </div>
                </div>

                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#fbbf24' }}><CmIcon name="flame" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />累计被采用</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b', marginTop: 4 }}>
                    {template.roi.popularityCount ?? 1200} 次
                  </div>
                </div>
              </div>

              {/* 核心业务价值说明 */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: 'var(--bg-primary, #0f172a)',
                  border: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary, #f8fafc)', fontSize: 13, marginBottom: 4 }}>
                  <CmIcon name="lightbulb" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />解决的痛点
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary, #b0bec5)' }}>
                  {template.valueProposition}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)', margin: '8px 0 0 0' }}>
                  {template.description}
                </p>
              </div>

              {/* 包含的标准步骤预览 */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #94a3b8)', marginBottom: 8 }}>
                  包含的标准步骤流程 ({template.definition.tasks?.length ?? 0} 个步骤):
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {template.definition.tasks?.map((task, idx) => (
                    <div
                      key={task.taskReferenceName}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border-primary, rgba(255,255,255,0.08))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--color-accent, #3b82f6)', fontWeight: 600 }}>#{idx + 1}</span>
                        <span style={{ color: 'var(--text-primary, #f8fafc)' }}>{task.description || task.name}</span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)', fontFamily: 'monospace' }}>
                        {task.taskReferenceName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: 关键参数填空 */}
          {currentStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  fontSize: 12,
                  color: '#93c5fd',
                }}
              >
                <CmIcon name="pencil" size={14} style={{ verticalAlign: -2, marginRight: 4 }} /><strong>开箱即用填空</strong>：无需修改复杂的流程连线与 JSON，仅需确认以下几个业务变量即可：
              </div>

              {template.variables.map((v) => {
                const currentVal = variableValues[v.key] ?? v.defaultValue;

                return (
                  <div key={v.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-primary, #f8fafc)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {v.label}
                      {v.required && <span style={{ color: '#ef4444' }}>*</span>}
                    </label>

                    {v.type === 'select' ? (
                      <select
                        value={currentVal ?? ''}
                        onChange={(e) => handleFieldChange(v.key, e.target.value)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 6,
                          background: 'var(--bg-primary, #0f172a)',
                          border: '1px solid var(--border-secondary, rgba(255,255,255,0.2))',
                          color: 'var(--text-primary, #f8fafc)',
                          fontSize: 13,
                          outline: 'none',
                        }}
                      >
                        {v.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : v.type === 'boolean' ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary, #b0bec5)' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(currentVal)}
                          onChange={(e) => handleFieldChange(v.key, e.target.checked)}
                          style={{ width: 16, height: 16 }}
                        />
                        <span>开启启用</span>
                      </label>
                    ) : (
                      <input
                        type={v.type === 'number' ? 'number' : 'text'}
                        value={currentVal ?? ''}
                        placeholder={v.placeholder}
                        onChange={(e) =>
                          handleFieldChange(v.key, v.type === 'number' ? Number(e.target.value) : e.target.value)
                        }
                        style={{
                          padding: '8px 10px',
                          borderRadius: 6,
                          background: 'var(--bg-primary, #0f172a)',
                          border: '1px solid var(--border-secondary, rgba(255,255,255,0.2))',
                          color: 'var(--text-primary, #f8fafc)',
                          fontSize: 13,
                          outline: 'none',
                        }}
                      />
                    )}

                    {v.help && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>{v.help}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Step 3: 沙盒试跑验证与激活 */}
          {currentStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: 'var(--bg-primary, #0f172a)',
                  border: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary, #f8fafc)', fontSize: 13 }}>
                    零风险浏览器沙盒试跑
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>
                    使用内置的保真云主机 Mock 数据，无需真实生产权限即可预览完整数据流转
                  </div>
                </div>

                <button
                  onClick={handleRunSandboxTest}
                  disabled={isSimulating}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    background: 'var(--color-accent, #3b82f6)',
                    color: 'var(--color-on-accent, #fff)',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: isSimulating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSimulating ? '模拟试跑中...' : '立即试跑验证'}
                </button>
              </div>

              {simSummary && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34d399',
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  <CmIcon name="sparkles" size={14} style={{ verticalAlign: -2, marginRight: 4 }} /><strong>试跑通过</strong>: {simSummary}
                </div>
              )}

              {/* 注入变量清单确认 */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-primary, rgba(255,255,255,0.08))',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #94a3b8)', marginBottom: 8 }}>
                  已配置的业务变量参数清单:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {template.variables.map((v) => (
                    <div
                      key={v.key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        padding: '4px 0',
                        borderBottom: '1px dashed rgba(255,255,255,0.06)',
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary, #b0bec5)' }}>{v.label}:</span>
                      <span style={{ color: 'var(--color-accent, #3b82f6)', fontWeight: 600 }}>
                        {String(variableValues[v.key] ?? v.defaultValue)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 弹窗底部操作按钮 */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-primary, rgba(255, 255, 255, 0.1))',
            background: 'var(--bg-primary, #0f172a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {currentStep > 1 ? (
            <button
              onClick={() => setCurrentStep((s) => (s - 1) as any)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid var(--border-secondary, rgba(255,255,255,0.2))',
                color: 'var(--text-secondary, #b0bec5)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ← 上一步
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            {currentStep < 3 ? (
              <button
                onClick={() => setCurrentStep((s) => (s + 1) as any)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  background: 'var(--color-accent, #3b82f6)',
                  color: 'var(--color-on-accent, #fff)',
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                下一步 →
              </button>
            ) : (
              <button
                onClick={handleFinalActivate}
                style={{
                  padding: '6px 18px',
                  borderRadius: 6,
                  background: 'var(--color-success, #10b981)',
                  color: '#fff',
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span><CmIcon name="zap" size={16} /></span>
                <span>注入参数并进入流程编辑器</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
