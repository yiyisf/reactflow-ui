import React, { useEffect, useState } from 'react';
import type { BusinessStep } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import type { ActionDefinition } from '../../actions/types';
import { createStepFromAction } from '../../stepmodel/factory';
import { collectIssues } from '../../stepmodel/validate';
import { applyUpgradeToValues, collectReferencedOutputKeys } from '../../library/diff';
import { ActionForm } from './ActionForm';
import { NestedControlStep } from './NestedControlStep';
import { LibraryVersionBadge } from './LibraryVersionBadge';
import { useBusinessEditor, stepDomId, type InsertPickerInfo } from './BusinessEditorContext';
import { InsertStepButton, IssueBadge, MoveDeleteButtons, RunBadge, SensitiveTag, StepCardHeader } from './StepCardParts';
import { confirmDeleteMessage } from './deleteMessage';

export interface StepListEditorProps {
  steps: BusinessStep[];
  onStepsChange: (next: BusinessStep[]) => void;
  /** 本列表之前的所有上游步骤（用于参数胶囊联想）；列表内前序步骤会自动追加 */
  upstreamSteps: BusinessStep[];
  registry?: ActionRegistry;
  disabled?: boolean;
  /** 本列表所在容器的嵌套深度（顶层容器为 0） */
  depth: number;
  onOpenInsertModal: (callback: (action: ActionDefinition) => void, info?: InsertPickerInfo) => void;
  /** regular：分支 / 循环体内的宽松行；compact：并行泳道内的窄列行 */
  variant?: 'regular' | 'compact';
  /** 行背景色调；展开区域使用相反色调，保持层次 */
  rowTone?: 'primary' | 'secondary';
  /** 序号徽标前缀，如「轮内 」 */
  indexPrefix?: string;
  /** 序号徽标是否使用强调色（默认为中性底色） */
  accentIndexBadge?: boolean;
  /** 动作选择器标题中的位置说明前缀，如"分支 VIP" */
  insertLabel?: string;
}

/**
 * 分支 / 并行泳道 / 循环体共用的"子步骤列表"：
 * - 普通动作渲染为可展开的表单行，头部与顶层卡片相同（改名、排序、版本徽标、敏感标记、校验与试跑状态）
 * - 步骤之间可插入新步骤
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
  insertLabel,
}) => {
  const ctx = useBusinessEditor();
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);
  const compact = variant === 'compact';

  const rowBg = rowTone === 'secondary' ? 'var(--bg-secondary)' : 'var(--bg-primary)';
  const bodyBg = rowTone === 'secondary' ? 'var(--bg-primary)' : 'var(--bg-secondary)';

  // 定位请求：命中本列表中的普通步骤时展开并滚动到它
  const focus = ctx.focusRequest;
  useEffect(() => {
    if (!focus) return;
    const hit = steps.find((s) => s.taskReferenceName === focus.ref && !s.controlType);
    if (!hit) return;
    setExpandedChildId(hit.id);
    requestAnimationFrame(() =>
      document.getElementById(stepDomId(hit.taskReferenceName))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    );
    // 只响应新的定位请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  const replaceAt = (idx: number, updated: BusinessStep) => {
    const next = [...steps];
    next[idx] = updated;
    onStepsChange(next);
  };

  const removeAt = async (idx: number) => {
    const target = steps[idx];
    const ok = ctx.confirm ? await ctx.confirm(confirmDeleteMessage(target, registry), '删除') : true;
    if (!ok) return;
    if (expandedChildId === target.id) setExpandedChildId(null);
    onStepsChange(steps.filter((_, i) => i !== idx));
  };

  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onStepsChange(next);
  };

  const insertAt = (idx: number) =>
    onOpenInsertModal(
      (action) => {
        const created = createStepFromAction(action);
        const next = [...steps];
        next.splice(idx, 0, created);
        onStepsChange(next);
        if (!created.controlType) setExpandedChildId(created.id);
      },
      { label: `${insertLabel ? `${insertLabel} · ` : ''}第 ${idx + 1} 步` }
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {steps.map((childStep, cIdx) => {
        const upstream = [...upstreamSteps, ...steps.slice(0, cIdx)];
        const between = !disabled && cIdx > 0 && (
          <InsertStepButton compact onClick={() => insertAt(cIdx)} label="在此插入" />
        );

        if (childStep.controlType) {
          return (
            <React.Fragment key={childStep.id}>
              {between}
              <NestedControlStep
                step={childStep}
                index={cIdx}
                count={steps.length}
                depth={depth + 1}
                upstreamSteps={upstream}
                registry={registry}
                disabled={disabled}
                onChange={(updatedChild) => replaceAt(cIdx, updatedChild)}
                onDelete={() => removeAt(cIdx)}
                onMove={(to) => moveTo(cIdx, to)}
                onOpenInsertModal={onOpenInsertModal}
              />
            </React.Fragment>
          );
        }

        const childAction = registry.getAction(childStep.actionId);
        const isExpanded = expandedChildId === childStep.id;
        const toggle = () => setExpandedChildId(isExpanded ? null : childStep.id);
        const bodyId = `${stepDomId(childStep.taskReferenceName)}-body`;
        const defaultTitle = childAction?.name || childStep.taskReferenceName;
        const title = childStep.name || defaultTitle;
        const renamed = !!childAction && title !== childAction.name;

        return (
          <React.Fragment key={childStep.id}>
            {between}
            <div
              id={stepDomId(childStep.taskReferenceName)}
              style={{
                borderRadius: compact ? 6 : 8,
                background: rowBg,
                border: isExpanded ? '1px solid var(--color-accent)' : '1px solid var(--border-primary)',
                overflow: 'hidden',
                transition: compact ? undefined : 'all 0.15s ease',
              }}
            >
              <StepCardHeader
                bodyId={bodyId}
                indexLabel={`${indexPrefix}#${cIdx + 1}`}
                icon={childAction?.icon}
                title={title}
                subtitle={renamed ? childAction?.name : childStep.taskReferenceName}
                defaultTitle={defaultTitle}
                expanded={isExpanded}
                onToggle={toggle}
                disabled={disabled}
                compact={compact}
                accentIndex={accentIndexBadge}
                onRename={childStep.isProFallback ? undefined : (name) => replaceAt(cIdx, { ...childStep, name })}
                badges={
                  <>
                    {childAction?.riskLevel === 'sensitive' && <SensitiveTag />}
                    <LibraryVersionBadge
                      step={childStep}
                      action={childAction}
                      disabled={disabled}
                      catalog={ctx.libraryCatalog}
                      getReferencedOutputs={() => collectReferencedOutputKeys(childStep.taskReferenceName, ctx.allSteps)}
                      onUpgrade={(v, diff) =>
                        replaceAt(cIdx, {
                          ...childStep,
                          libraryRef: { name: childStep.libraryRef!.name, version: v },
                          ...(diff ? { values: applyUpgradeToValues(childStep.values, diff) } : {}),
                        })
                      }
                    />
                    <IssueBadge issues={collectIssues(childStep, ctx.issues)} />
                    <RunBadge status={ctx.runStatus?.[childStep.taskReferenceName]} />
                  </>
                }
                actions={
                  !disabled && (
                    <MoveDeleteButtons
                      index={cIdx}
                      count={steps.length}
                      onMove={(to) => moveTo(cIdx, to)}
                      onDelete={() => removeAt(cIdx)}
                    />
                  )
                }
              />

              {isExpanded && (
                <div
                  id={bodyId}
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
          </React.Fragment>
        );
      })}
    </div>
  );
};
