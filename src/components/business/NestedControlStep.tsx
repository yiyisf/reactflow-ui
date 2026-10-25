import React from 'react';
import type { BusinessStep } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import type { ActionDefinition } from '../../actions/types';
import { collectIssues } from '../../stepmodel/validate';
import { DecisionBranchCard } from './DecisionBranchCard';
import { ForkJoinCard } from './ForkJoinCard';
import { LoopDoWhileCard } from './LoopDoWhileCard';
import { useBusinessEditor, stepDomId, type InsertPickerInfo } from './BusinessEditorContext';
import { IconButton, IssueBadge, MoveDeleteButtons } from './StepCardParts';
import { Trash2 } from 'lucide-react';

export interface NestedControlStepProps {
  step: BusinessStep;
  index: number;
  /** 同一列表中的步骤数（提供 onMove 时用于判断能否上移 / 下移） */
  count?: number;
  /** 当前嵌套层级（顶层卡片内的第一层子控制流为 1），用于缩进与视觉区分 */
  depth?: number;
  upstreamSteps: BusinessStep[];
  registry?: ActionRegistry;
  disabled?: boolean;
  onChange: (updated: BusinessStep) => void;
  /** 删除（调用方负责确认） */
  onDelete: () => void;
  /** 提供时显示上移 / 下移 */
  onMove?: (toIndex: number) => void;
  onOpenInsertModal: (callback: (action: ActionDefinition) => void, info?: InsertPickerInfo) => void;
}

const ACCENT: Record<string, string> = {
  decision: 'var(--cm-ai)',
  fork: 'var(--color-accent)',
  loop: 'var(--cm-status-success)',
};

/**
 * 分支 / 并行泳道 / 循环体内部的"子控制流"渲染器。
 * 通过它，DecisionBranchCard / ForkJoinCard / LoopDoWhileCard 可以互相递归嵌套，
 * 支持例如「分支 A 内再包含一个分支」「泳道内再有并行或循环」等任意层级。
 */
export const NestedControlStep: React.FC<NestedControlStepProps> = ({
  step,
  index,
  count = 1,
  depth = 1,
  upstreamSteps,
  registry = defaultActionRegistry,
  disabled = false,
  onChange,
  onDelete,
  onMove,
  onOpenInsertModal,
}) => {
  const ctx = useBusinessEditor();
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
      id={stepDomId(step.taskReferenceName)}
      style={{
        borderLeft: `3px solid ${accent}`,
        paddingLeft: 10,
        marginLeft: Math.min(depth - 1, 3) * 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: `color-mix(in srgb, ${accent} 80%, var(--text-primary))`,
            }}
          >
            #{index + 1} {label}（第 {depth} 层）
          </span>
          <IssueBadge issues={collectIssues(step, ctx.issues)} />
        </span>
        {!disabled && (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {onMove ? (
              <MoveDeleteButtons index={index} count={count} onMove={onMove} onDelete={onDelete} />
            ) : (
              <IconButton label="删除此嵌套控制流及其内部所有步骤" danger onClick={onDelete}>
                <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
            )}
          </span>
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
