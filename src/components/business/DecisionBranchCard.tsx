import React, { useState } from 'react';
import type { BusinessStep, BranchCase } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import type { ActionDefinition } from '../../actions/types';
import { StepListEditor } from './StepListEditor';
import ConfirmDialog from '../ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { createStepFromAction } from '../../stepmodel/factory';
import { ArrowRight, CornerDownRight, GitBranch, Lightbulb, Shuffle, X } from 'lucide-react';

export interface DecisionBranchCardProps {
  step: BusinessStep;
  upstreamSteps: BusinessStep[];
  registry?: ActionRegistry;
  disabled?: boolean;
  onChange: (updated: BusinessStep) => void;
  onOpenInsertModal: (callback: (action: ActionDefinition) => void) => void;
  /** 嵌套深度：顶层卡片为 0，其内部子控制流依次 +1 */
  depth?: number;
}

export const DecisionBranchCard: React.FC<DecisionBranchCardProps> = ({
  step,
  upstreamSteps,
  registry = defaultActionRegistry,
  disabled = false,
  onChange,
  onOpenInsertModal,
  depth = 0,
}) => {
  const branches: BranchCase[] = step.branches || [];
  const [activeBranchKey, setActiveBranchKey] = useState<string>(
    branches[0]?.caseKey || '__default__'
  );
  const [newCaseInput, setNewCaseInput] = useState('');
  const [showAddCase, setShowAddCase] = useState(false);
  const [caseError, setCaseError] = useState('');
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const activeBranch = branches.find((b) => b.caseKey === activeBranchKey) || branches[0];

  // 切换或修改当前分支内的步骤
  const handleUpdateBranchSteps = (caseKey: string, newSteps: BusinessStep[]) => {
    const nextBranches = branches.map((b) => {
      if (b.caseKey === caseKey) {
        return { ...b, steps: newSteps };
      }
      return b;
    });
    onChange({
      ...step,
      branches: nextBranches,
    });
  };

  // 添加新分支
  const handleAddBranch = () => {
    const trimmed = newCaseInput.trim();
    if (!trimmed) return;
    if (branches.some((b) => b.caseKey === trimmed)) {
      setCaseError(`分支 "${trimmed}" 已存在`);
      return;
    }
    const nextBranches = [
      ...branches,
      {
        caseKey: trimmed,
        caseLabel: `分支: ${trimmed}`,
        steps: [],
      },
    ];
    onChange({
      ...step,
      branches: nextBranches,
    });
    setActiveBranchKey(trimmed);
    setNewCaseInput('');
    setCaseError('');
    setShowAddCase(false);
  };

  // 删除分支
  const handleDeleteBranch = async (caseKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const message =
      caseKey === '__default__'
        ? '确定要删除默认分支吗？'
        : `确定要删除分支 "${caseKey}" 及其内部所有步骤吗？`;
    if (!(await confirm(message))) return;
    const nextBranches = branches.filter((b) => b.caseKey !== caseKey);
    onChange({
      ...step,
      branches: nextBranches,
    });
    if (activeBranchKey === caseKey) {
      setActiveBranchKey(nextBranches[0]?.caseKey || '');
    }
  };

  // 在当前分支追加新步骤
  const handleAddStepToCurrentBranch = () => {
    if (!activeBranch) return;
    onOpenInsertModal((action) => {
      const newChildStep: BusinessStep = createStepFromAction(action);
      handleUpdateBranchSteps(activeBranch.caseKey, [...activeBranch.steps, newChildStep]);
    });
  };

  const totalStepsInBranches = branches.reduce((acc, b) => acc + (b.steps?.length || 0), 0);

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
              background: 'color-mix(in srgb, var(--cm-ai) 15%, transparent)',
              color: 'color-mix(in srgb, var(--cm-ai) 85%, var(--text-primary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            <Shuffle size={14} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                {step.name || '条件分支路由'}
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'color-mix(in srgb, var(--cm-ai) 12%, transparent)',
                  color: 'color-mix(in srgb, var(--cm-ai) 85%, var(--text-primary))',
                  fontWeight: 600,
                  border: '1px solid color-mix(in srgb, var(--cm-ai) 30%, transparent)',
                }}
              >
                <Shuffle size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />条件路由 (Decision / Switch)
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              判断参数:{' '}
              <code
                style={{
                  color: 'var(--color-accent-text)',
                  background: 'var(--bg-secondary)',
                  padding: '1px 4px',
                  borderRadius: 4,
                }}
              >
                {step.caseParam || step.caseExpression || '未指定参数'}
              </code>{' '}
              · 共包含 {branches.length} 个分支，共 {totalStepsInBranches} 个分支内业务步骤
            </div>
          </div>
        </div>

        {/* 分支判断依据轻量修改 */}
        {!disabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>判断字段:</span>
            <input
              type="text"
              value={step.caseParam || step.caseExpression || ''}
              placeholder="如 userType 或 $.status"
              onChange={(e) =>
                onChange({
                  ...step,
                  caseParam: e.target.value,
                })
              }
              style={{
                width: 140,
                padding: '4px 8px',
                borderRadius: 4,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)',
                fontSize: 11,
              }}
            />
          </div>
        )}
      </div>

      {/* 分支切换 Tabs 栏 */}
      <div
        style={{
          padding: '8px 16px',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>分支列表:</span>
          {branches.map((b) => {
            const isActive = b.caseKey === activeBranchKey;
            const isDefault = b.caseKey === '__default__';
            return (
              <div
                key={b.caseKey}
                onClick={() => setActiveBranchKey(b.caseKey)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  background: isActive ? 'var(--color-accent-bg, color-mix(in srgb, var(--color-accent) 15%, transparent))' : 'var(--bg-secondary)',
                  color: isActive ? 'var(--color-accent-text)' : 'var(--text-secondary)',
                  border: `1px solid ${
                    isActive ? 'var(--color-accent)' : 'var(--border-primary)'
                  }`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ display: 'inline-flex' }}>{isDefault ? <CornerDownRight size={14} strokeWidth={1.75} aria-hidden="true" /> : <GitBranch size={14} strokeWidth={1.75} aria-hidden="true" />}</span>
                <span>{isDefault ? '默认分支 (Default)' : b.caseKey}</span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '0 4px',
                    borderRadius: 8,
                    background: isActive ? 'var(--color-accent)' : 'var(--bg-tertiary)',
                    color: isActive ? 'var(--color-on-accent)' : 'var(--text-muted)',
                  }}
                >
                  {b.steps?.length || 0}
                </span>

                {!disabled && branches.length > 1 && (
                  <span
                    onClick={(e) => handleDeleteBranch(b.caseKey, e)}
                    title="删除此分支"
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      marginLeft: 2,
                      cursor: 'pointer',
                    }}
                  >
                    <X size={14} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                )}
              </div>
            );
          })}

          {!disabled && !showAddCase && (
            <button
              onClick={() => setShowAddCase(true)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px dashed var(--border-secondary)',
                color: 'var(--text-muted)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              + 新增分支
            </button>
          )}

          {!disabled && showAddCase && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input
                autoFocus
                type="text"
                value={newCaseInput}
                placeholder="分支标识，如 VIP"
                onChange={(e) => {
                  setNewCaseInput(e.target.value);
                  if (caseError) setCaseError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddBranch()}
                style={{
                  padding: '3px 6px',
                  borderRadius: 4,
                  border: '1px solid var(--color-accent)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: 11,
                  width: 110,
                }}
              />
              {caseError && <span style={{ fontSize: 11, color: 'var(--cm-status-failed)' }}>{caseError}</span>}
              <button
                onClick={handleAddBranch}
                style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: 'var(--color-accent)',
                  color: 'var(--color-on-accent)',
                  border: 'none',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                确认
              </button>
              <button
                onClick={() => {
                  setShowAddCase(false);
                  setNewCaseInput('');
                  setCaseError('');
                }}
                style={{
                  padding: '3px 6px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                取消
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 当前分支的子步骤流 (Nested Step Flow) */}
      <div style={{ padding: '14px 16px', background: 'var(--bg-primary)' }}>
        {activeBranch ? (
          <div>
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
              <span>
                <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />当判断命中 <strong>{activeBranch.caseKey}</strong> 时，将依次串行执行以下步骤：
              </span>
              {!disabled && (
                <button
                  onClick={handleAddStepToCurrentBranch}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: 'var(--color-accent-bg, color-mix(in srgb, var(--color-accent) 12%, transparent))',
                    border: '1px solid var(--color-accent)',
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
                  <span>追加分支步骤</span>
                </button>
              )}
            </div>

            {/* 分支内步骤列表 */}
            {activeBranch.steps.length === 0 ? (
              <div
                style={{
                  padding: '24px 16px',
                  borderRadius: 8,
                  border: '1px dashed var(--border-secondary)',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  background: 'var(--bg-secondary)',
                }}
              >
                当前分支暂无步骤，点击右上方「+ 追加分支步骤」配置分支业务逻辑
              </div>
            ) : (
              <StepListEditor
                steps={activeBranch.steps}
                onStepsChange={(next) => handleUpdateBranchSteps(activeBranch.caseKey, next)}
                upstreamSteps={upstreamSteps}
                registry={registry}
                disabled={disabled}
                depth={depth}
                onOpenInsertModal={onOpenInsertModal}
                rowTone="secondary"
              />
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            请选择或新增一个分支进行配置
          </div>
        )}
      </div>

      {/* 底部收口说明 */}
      <div
        style={{
          padding: '6px 14px',
          background: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border-primary)',
          fontSize: 10,
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span><Lightbulb size={14} strokeWidth={1.75} aria-hidden="true" /></span>
        <span>分支执行逻辑：运行时仅会精准执行匹配的分支路径，未命中的分支步骤将安全跳过。</span>
      </div>
      {confirmState && (
        <ConfirmDialog message={confirmState.message} onConfirm={handleConfirm} onCancel={handleCancel} />
      )}
    </div>
  );
};
