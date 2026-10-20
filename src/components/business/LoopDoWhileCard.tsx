import React, { useState } from 'react';
import type { BusinessStep } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import type { ActionDefinition } from '../../actions/types';
import { ActionForm } from './ActionForm';

export interface LoopDoWhileCardProps {
  step: BusinessStep;
  upstreamSteps: BusinessStep[];
  registry?: ActionRegistry;
  disabled?: boolean;
  onChange: (updated: BusinessStep) => void;
  onOpenInsertModal: (callback: (action: ActionDefinition) => void) => void;
}

export const LoopDoWhileCard: React.FC<LoopDoWhileCardProps> = ({
  step,
  upstreamSteps,
  registry = defaultActionRegistry,
  disabled = false,
  onChange,
  onOpenInsertModal,
}) => {
  const loopSteps: BusinessStep[] = step.loopSteps || [];
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);

  // 更新循环体内步骤
  const handleUpdateLoopSteps = (newSteps: BusinessStep[]) => {
    onChange({
      ...step,
      loopSteps: newSteps,
    });
  };

  // 在循环体内追加步骤
  const handleAddStepToLoop = () => {
    onOpenInsertModal((action) => {
      const newChildStep: BusinessStep = {
        id: `step_${action.id}_${Date.now().toString(36)}`,
        actionId: action.id,
        taskReferenceName: `${action.id.replace(/\./g, '_')}_${Date.now().toString(36).slice(-4)}`,
        name: action.name,
        description: action.description,
        values: {},
        isProFallback: false,
      };
      handleUpdateLoopSteps([...loopSteps, newChildStep]);
    });
  };

  return (
    <div
      style={{
        borderRadius: 12,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-secondary)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
      }}
    >
      {/* 顶部控制流 Banner */}
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--color-accent-bg, rgba(59, 130, 246, 0.15))',
              color: 'var(--color-accent, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            🔁
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                {step.name || '循环迭代处理'}
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'var(--color-accent-bg, rgba(59, 130, 246, 0.12))',
                  color: 'var(--color-accent-text, #1e40af)',
                  fontWeight: 600,
                  border: '1px solid color-mix(in srgb, var(--color-accent, #3b82f6) 30%, transparent)',
                }}
              >
                🔁 循环迭代 (Do-While Loop)
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              循环体包含 {loopSteps.length} 个步骤 · 每次迭代执行完将重新评估跳出条件
            </div>
          </div>
        </div>

        {/* 循环条件修改 */}
        {!disabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>循环继续条件:</span>
            <input
              type="text"
              value={step.loopCondition || ''}
              placeholder="如 $.status == 'PENDING'"
              onChange={(e) =>
                onChange({
                  ...step,
                  loopCondition: e.target.value,
                })
              }
              style={{
                width: 200,
                padding: '4px 8px',
                borderRadius: 4,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)',
                fontSize: 11,
                fontFamily: 'monospace',
              }}
            />
          </div>
        )}
      </div>

      {/* 循环体卡片流容器 */}
      <div style={{ padding: '14px 16px', background: 'var(--bg-primary)' }}>
        <div
          style={{
            borderRadius: 8,
            border: '2px dashed color-mix(in srgb, var(--color-accent, #3b82f6) 45%, var(--border-secondary))',
            background: 'var(--bg-secondary)',
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔄</span>
              <span>
                <strong>循环体内部任务序列</strong> (每轮迭代将依次执行以下 {loopSteps.length} 个步骤):
              </span>
            </div>

            {!disabled && (
              <button
                onClick={handleAddStepToLoop}
                style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: 'var(--color-accent-bg, rgba(59, 130, 246, 0.1))',
                  border: '1px solid color-mix(in srgb, var(--color-accent, #3b82f6) 40%, transparent)',
                  color: 'var(--color-accent-text, #1e40af)',
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontWeight: 500,
                }}
              >
                <span>+</span>
                <span>追加循环步骤</span>
              </button>
            )}
          </div>

          {/* 循环体内步骤序列 */}
          {loopSteps.length === 0 ? (
            <div
              style={{
                padding: '20px 12px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 11,
              }}
            >
              循环体内暂无任务，请点击右上角「+ 追加循环步骤」添加轮询或重复执行动作
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loopSteps.map((childStep, cIdx) => {
                const childAction = registry.getAction(childStep.actionId);
                const isExpanded = expandedChildId === childStep.id;

                return (
                  <div
                    key={childStep.id}
                    style={{
                      borderRadius: 6,
                      background: 'var(--bg-primary)',
                      border: isExpanded
                        ? '1px solid var(--color-accent, #3b82f6)'
                        : '1px solid var(--border-primary)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      onClick={() => setExpandedChildId(isExpanded ? null : childStep.id)}
                      style={{
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: 'var(--color-accent-bg, rgba(59, 130, 246, 0.12))',
                            color: 'var(--color-accent-text, #1e40af)',
                          }}
                        >
                          轮内 #{cIdx + 1}
                        </span>
                        <span style={{ fontSize: 16 }}>{childAction?.icon || '⚙️'}</span>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {childStep.name || childAction?.name || childStep.taskReferenceName}
                          </span>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {childStep.taskReferenceName}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        {!disabled && (
                          <button
                            onClick={() => {
                              const nextSteps = loopSteps.filter((_, idx) => idx !== cIdx);
                              handleUpdateLoopSteps(nextSteps);
                            }}
                            title="删除此步骤"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: 12,
                              padding: '2px 4px',
                            }}
                          >
                            🗑️
                          </button>
                        )}
                        <span
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.15s ease',
                            cursor: 'pointer',
                          }}
                          onClick={() => setExpandedChildId(isExpanded ? null : childStep.id)}
                        >
                          ▼
                        </span>
                      </div>
                    </div>

                    {/* 展开的表单配置 */}
                    {isExpanded && (
                      <div
                        style={{
                          padding: '12px 14px',
                          borderTop: '1px solid var(--border-primary)',
                          background: 'var(--bg-secondary)',
                        }}
                      >
                        <ActionForm
                          step={childStep}
                          upstreamSteps={[...upstreamSteps, ...loopSteps.slice(0, cIdx)]}
                          registry={registry}
                          disabled={disabled}
                          onChange={(updatedChild) => {
                            const nextSteps = [...loopSteps];
                            nextSteps[cIdx] = updatedChild;
                            handleUpdateLoopSteps(nextSteps);
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 底部跳出保护说明 */}
      <div
        style={{
          padding: '8px 16px',
          background: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border-primary)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>🛑</span>
        <span>
          <strong>跳出与安全保护</strong>：当条件表达式评估为 false 时自动跳出循环向下继续；引擎内置循环熔断保护，防止生产环境死循环。
        </span>
      </div>
    </div>
  );
};
