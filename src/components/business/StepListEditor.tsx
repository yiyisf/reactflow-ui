import React, { useState } from 'react';
import type { BusinessStep } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import type { ActionDefinition } from '../../actions/types';
import { ActionForm } from './ActionForm';
import { NestedControlStep } from './NestedControlStep';
import { CmIcon } from '../icons/CmIcon';

export interface StepListEditorProps {
  steps: BusinessStep[];
  onStepsChange: (next: BusinessStep[]) => void;
  /** 本列表之前的所有上游步骤（用于参数胶囊联想）；列表内前序步骤会自动追加 */
  upstreamSteps: BusinessStep[];
  registry?: ActionRegistry;
  disabled?: boolean;
  /** 本列表所在容器的嵌套深度（顶层容器为 0） */
  depth: number;
  onOpenInsertModal: (callback: (action: ActionDefinition) => void) => void;
  /** regular：分支 / 循环体内的宽松行；compact：并行泳道内的窄列行 */
  variant?: 'regular' | 'compact';
  /** 行背景色调；展开区域使用相反色调，保持层次 */
  rowTone?: 'primary' | 'secondary';
  /** 序号徽标前缀，如「轮内 」 */
  indexPrefix?: string;
  /** 序号徽标是否使用强调色（默认为中性底色） */
  accentIndexBadge?: boolean;
}

/**
 * 分支 / 并行泳道 / 循环体共用的"子步骤列表"：
 * - 普通动作渲染为可展开的表单行
 * - 控制流步骤（分支 / 并行 / 循环）交给 NestedControlStep 递归渲染，因此可任意层级嵌套
 */
export const StepListEditor: React.FC<StepListEditorProps> = ({
  steps,
  onStepsChange,
  upstreamSteps,
  registry = defaultActionRegistry,
  disabled = false,
  depth,
  onOpenInsertModal,
  variant = 'regular',
  rowTone = 'primary',
  indexPrefix = '',
  accentIndexBadge = false,
}) => {
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);
  const compact = variant === 'compact';

  const rowBg = rowTone === 'secondary' ? 'var(--bg-secondary)' : 'var(--bg-primary)';
  const bodyBg = rowTone === 'secondary' ? 'var(--bg-primary)' : 'var(--bg-secondary)';

  const replaceAt = (idx: number, updated: BusinessStep) => {
    const next = [...steps];
    next[idx] = updated;
    onStepsChange(next);
  };
  const removeAt = (idx: number) => onStepsChange(steps.filter((_, i) => i !== idx));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {steps.map((childStep, cIdx) => {
        const upstream = [...upstreamSteps, ...steps.slice(0, cIdx)];

        if (childStep.controlType) {
          return (
            <NestedControlStep
              key={childStep.id}
              step={childStep}
              index={cIdx}
              depth={depth + 1}
              upstreamSteps={upstream}
              registry={registry}
              disabled={disabled}
              onChange={(updatedChild) => replaceAt(cIdx, updatedChild)}
              onDelete={() => removeAt(cIdx)}
              onOpenInsertModal={onOpenInsertModal}
            />
          );
        }

        const childAction = registry.getAction(childStep.actionId);
        const isExpanded = expandedChildId === childStep.id;
        const toggle = () => setExpandedChildId(isExpanded ? null : childStep.id);

        return (
          <div
            key={childStep.id}
            style={{
              borderRadius: compact ? 6 : 8,
              background: rowBg,
              border: isExpanded ? '1px solid var(--color-accent)' : '1px solid var(--border-primary)',
              overflow: 'hidden',
              transition: compact ? undefined : 'all 0.15s ease',
            }}
          >
            <div
              onClick={toggle}
              style={{
                padding: compact ? '6px 8px' : '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 8, overflow: 'hidden' }}>
                {!compact && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: accentIndexBadge
                        ? 'var(--color-accent-bg, color-mix(in srgb, var(--color-accent) 12%, transparent))'
                        : 'var(--bg-tertiary)',
                      color: 'var(--color-accent-text)',
                    }}
                  >
                    {indexPrefix}#{cIdx + 1}
                  </span>
                )}
                <CmIcon name={childAction?.icon} size={compact ? 14 : 16} />
                {compact ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {childStep.name || childAction?.name}
                  </span>
                ) : (
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {childStep.name || childAction?.name || childStep.taskReferenceName}
                    </span>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {childStep.taskReferenceName}
                    </div>
                  </div>
                )}
              </div>

              <div
                style={{ display: 'flex', alignItems: 'center', gap: compact ? 4 : 6 }}
                onClick={(e) => e.stopPropagation()}
              >
                {!disabled && (
                  <button
                    onClick={() => removeAt(cIdx)}
                    title="删除此步骤"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--cm-status-failed)',
                      cursor: 'pointer',
                      fontSize: compact ? 11 : 12,
                      padding: compact ? '1px 3px' : '2px 4px',
                    }}
                  >
                    <CmIcon name="trash" size={16} />
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
                  onClick={toggle}
                >
                  ▼
                </span>
              </div>
            </div>

            {isExpanded && (
              <div
                style={{
                  padding: compact ? 10 : '12px 14px',
                  borderTop: '1px solid var(--border-primary)',
                  background: bodyBg,
                }}
              >
                <ActionForm
                  step={childStep}
                  upstreamSteps={upstream}
                  registry={registry}
                  disabled={disabled}
                  onChange={(updatedChild) => replaceAt(cIdx, updatedChild)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
