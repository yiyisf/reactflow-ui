import React from 'react';
import type { BusinessStep } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import type { ActionDefinition } from '../../actions/types';
import { StepListEditor } from './StepListEditor';
import { createStepFromAction } from '../../stepmodel/factory';
import { OctagonX, RefreshCw, Repeat } from 'lucide-react';

export interface LoopDoWhileCardProps {
  step: BusinessStep;
  upstreamSteps: BusinessStep[];
  registry?: ActionRegistry;
  disabled?: boolean;
  onChange: (updated: BusinessStep) => void;
  onOpenInsertModal: (callback: (action: ActionDefinition) => void) => void;
  /** 嵌套深度：顶层卡片为 0，其内部子控制流依次 +1 */
  depth?: number;
}

export const LoopDoWhileCard: React.FC<LoopDoWhileCardProps> = ({
  step,
  upstreamSteps,
  registry = defaultActionRegistry,
  disabled = false,
  onChange,
  onOpenInsertModal,
  depth = 0,
}) => {
  const loopSteps: BusinessStep[] = step.loopSteps || [];

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
      const newChildStep: BusinessStep = createStepFromAction(action);
      handleUpdateLoopSteps([...loopSteps, newChildStep]);
    });
  };

  return (
    <div
      style={{
        borderRadius: 12,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-secondary)',
        boxShadow: 'var(--cm-shadow-float)',
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
              background: 'var(--color-accent-bg, color-mix(in srgb, var(--color-accent) 15%, transparent))',
              color: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            <Repeat size={14} strokeWidth={1.75} aria-hidden="true" />
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
                  background: 'var(--color-accent-bg, color-mix(in srgb, var(--color-accent) 12%, transparent))',
                  color: 'var(--color-accent-text)',
                  fontWeight: 600,
                  border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
                }}
              >
                <Repeat size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />循环迭代 (Do-While Loop)
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
            border: '2px dashed color-mix(in srgb, var(--color-accent) 45%, var(--border-secondary))',
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
              <span><RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" /></span>
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
                  background: 'var(--color-accent-bg, color-mix(in srgb, var(--color-accent) 10%, transparent))',
                  border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
                  color: 'var(--color-accent-text)',
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
            <StepListEditor
              steps={loopSteps}
              onStepsChange={handleUpdateLoopSteps}
              upstreamSteps={upstreamSteps}
              registry={registry}
              disabled={disabled}
              depth={depth}
              onOpenInsertModal={onOpenInsertModal}
              rowTone="primary"
              indexPrefix="轮内 "
              accentIndexBadge
            />
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
        <span><OctagonX size={14} strokeWidth={1.75} aria-hidden="true" /></span>
        <span>
          <strong>跳出与安全保护</strong>：当条件表达式评估为 false 时自动跳出循环向下继续；引擎内置循环熔断保护，防止生产环境死循环。
        </span>
      </div>
    </div>
  );
};
