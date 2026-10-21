import React from 'react';
import type { BusinessStep } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import type { ActionDefinition } from '../../actions/types';
import { DecisionBranchCard } from './DecisionBranchCard';
import { ForkJoinCard } from './ForkJoinCard';
import { LoopDoWhileCard } from './LoopDoWhileCard';

export interface NestedControlStepProps {
  step: BusinessStep;
  index: number;
  /** 当前嵌套层级（顶层卡片内的第一层子控制流为 1），用于缩进与视觉区分 */
  depth?: number;
  upstreamSteps: BusinessStep[];
  registry?: ActionRegistry;
  disabled?: boolean;
  onChange: (updated: BusinessStep) => void;
  onDelete: () => void;
  onOpenInsertModal: (callback: (action: ActionDefinition) => void) => void;
}

const ACCENT: Record<string, string> = {
  decision: '#8b5cf6',
  fork: '#3b82f6',
  loop: '#10b981',
};

/**
 * 分支 / 并行泳道 / 循环体内部的"子控制流"渲染器。
 * 通过它，DecisionBranchCard / ForkJoinCard / LoopDoWhileCard 可以互相递归嵌套，
 * 支持例如「分支 A 内再包含一个分支」「泳道内再有并行或循环」等任意层级。
 */
export const NestedControlStep: React.FC<NestedControlStepProps> = ({
  step,
  index,
  depth = 1,
  upstreamSteps,
  registry = defaultActionRegistry,
  disabled = false,
  onChange,
  onDelete,
  onOpenInsertModal,
}) => {
  const accent = ACCENT[step.controlType || 'decision'] || ACCENT.decision;
  const label =
    step.controlType === 'fork' ? '嵌套并行' : step.controlType === 'loop' ? '嵌套循环' : '嵌套分支';

  const cardProps = {
    step,
    upstreamSteps,
    registry,
    disabled,
    onChange,
    onOpenInsertModal,
  };

  return (
    <div
      style={{
        borderLeft: `3px solid ${accent}`,
        paddingLeft: 10,
        marginLeft: Math.min(depth - 1, 3) * 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: `color-mix(in srgb, ${accent} 80%, var(--text-primary))`,
          }}
        >
          #{index + 1} {label}（第 {depth} 层）
        </span>
        {!disabled && (
          <button
            onClick={onDelete}
            title="删除此嵌套控制流及其内部所有步骤"
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
      </div>

      {step.controlType === 'fork' ? (
        <ForkJoinCard {...cardProps} depth={depth} />
      ) : step.controlType === 'loop' ? (
        <LoopDoWhileCard {...cardProps} depth={depth} />
      ) : (
        <DecisionBranchCard {...cardProps} depth={depth} />
      )}
    </div>
  );
};
