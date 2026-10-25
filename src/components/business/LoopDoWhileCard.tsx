import React from 'react';
import type { BusinessStep } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import type { ActionDefinition } from '../../actions/types';
import { StepListEditor } from './StepListEditor';
import { createStepFromAction, defaultLoopCondition } from '../../stepmodel/factory';
import { validateBusinessSteps } from '../../stepmodel/validate';
import { useBusinessEditor, type InsertPickerInfo } from './BusinessEditorContext';
import { IssueList, RenameableTitle } from './StepCardParts';
import { Info, Plus, RefreshCw, Repeat } from 'lucide-react';

export interface LoopDoWhileCardProps {
  step: BusinessStep;
  upstreamSteps: BusinessStep[];
  registry?: ActionRegistry;
  disabled?: boolean;
  onChange: (updated: BusinessStep) => void;
  onOpenInsertModal: (callback: (action: ActionDefinition) => void, info?: InsertPickerInfo) => void;
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
  const ctx = useBusinessEditor();
  const conditionId = `cm-loop-${step.taskReferenceName}-condition`;
  const ownIssues = React.useMemo(() => {
    const own = validateBusinessSteps([{ ...step, loopSteps: [] }], registry)[step.taskReferenceName] || [];
    // 循环体为空的提醒按真实情况给出
    const filtered = loopSteps.length > 0 ? own.filter((i) => !i.message.startsWith('循环体内没有步骤')) : own;
    const extra = (ctx.issues[step.taskReferenceName] || []).filter((i) => !filtered.some((o) => o.message === i.message));
    return [...filtered, ...extra];
  }, [step, loopSteps.length, registry, ctx.issues]);

  // 更新循环体内步骤
  const handleUpdateLoopSteps = (newSteps: BusinessStep[]) => {
    onChange({
      ...step,
      loopSteps: newSteps,
    });
  };

  // 在循环体内追加步骤
  const handleAddStepToLoop = () => {
    onOpenInsertModal(
      (action) => {
        const newChildStep: BusinessStep = createStepFromAction(action);
        handleUpdateLoopSteps([...loopSteps, newChildStep]);
      },
      { label: `循环体 · 第 ${loopSteps.length + 1} 步` }
    );
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
              <RenameableTitle
                value={step.name}
                fallback="循环迭代处理"
                disabled={disabled}
                onRename={(name) => onChange({ ...step, name })}
              />
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

      </div>

      {/* 循环继续条件 */}
      <div
        style={{
          padding: '10px 16px',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <label htmlFor={conditionId} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            循环继续条件
          </label>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            JavaScript，每轮结束后计算，为 true 继续下一轮，为 false 结束循环
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange({ ...step, loopCondition: defaultLoopCondition(step.taskReferenceName) })}
              style={{
                marginLeft: 'auto',
                padding: '2px 8px',
                borderRadius: 4,
                background: 'transparent',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              改为最多执行 3 轮
            </button>
          )}
        </div>
        <div>
            <input
              id={conditionId}
              type="text"
              disabled={disabled}
              value={step.loopCondition ?? ''}
              placeholder={defaultLoopCondition(step.taskReferenceName)}
              onChange={(e) =>
                onChange({
                  ...step,
                  loopCondition: e.target.value,
                })
              }
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '4px 8px',
                borderRadius: 4,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)',
                fontSize: 11,
                fontFamily: 'var(--cm-font-mono, monospace)',
              }}
            />
        </div>
        <IssueList issues={ownIssues} />
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
                type="button"
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
                <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
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
              循环体内暂无步骤，点击「追加循环步骤」添加需要重复执行的动作
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
              insertLabel="循环体"
            />
          )}
        </div>
      </div>

      {/* 底部说明：只写引擎真实提供的行为 */}
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
        <Info size={14} strokeWidth={1.75} aria-hidden="true" />
        <span>
          循环至少执行一轮；条件为 false 时结束并继续向下。请确保条件最终会变为 false，例如用已执行轮次限定最大轮数。
        </span>
      </div>
    </div>
  );
};
