import React, { useEffect, useMemo, useState } from 'react';
import type { BusinessStep, BranchCase } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import type { ActionDefinition } from '../../actions/types';
import { StepListEditor } from './StepListEditor';
import ConfirmDialog from '../ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { createStepFromAction, DEFAULT_CASE_PARAM } from '../../stepmodel/factory';
import { validateBusinessSteps } from '../../stepmodel/validate';
import { DataPillInput } from './DataPillInput';
import { containsStepRef, useBusinessEditor, type InsertPickerInfo } from './BusinessEditorContext';
import { IconButton, IssueList, RenameableTitle } from './StepCardParts';
import { countNestedSteps } from './deleteMessage';
import { ArrowRight, CornerDownRight, GitBranch, Lightbulb, Plus, Shuffle, X } from 'lucide-react';

export interface DecisionBranchCardProps {
  step: BusinessStep;
  upstreamSteps: BusinessStep[];
  registry?: ActionRegistry;
  disabled?: boolean;
  onChange: (updated: BusinessStep) => void;
  onOpenInsertModal: (callback: (action: ActionDefinition) => void, info?: InsertPickerInfo) => void;
  /** 嵌套深度：顶层卡片为 0，其内部子控制流依次 +1 */
  depth?: number;
}

const DEFAULT_KEY = '__default__';
const branchName = (key: string) => (key === DEFAULT_KEY ? '默认分支' : `分支 ${key}`);

const smallInput: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 4,
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-secondary)',
  color: 'var(--text-primary)',
  fontSize: 12,
  fontFamily: 'var(--cm-font-mono, monospace)',
  outline: 'none',
};

export const DecisionBranchCard: React.FC<DecisionBranchCardProps> = ({
  step,
  upstreamSteps,
  registry = defaultActionRegistry,
  disabled = false,
  onChange,
  onOpenInsertModal,
  depth = 0,
}) => {
  const ctx = useBusinessEditor();
  const branches: BranchCase[] = step.branches || [];
  const [activeBranchKey, setActiveBranchKey] = useState<string>(branches[0]?.caseKey || DEFAULT_KEY);
  const [newCaseInput, setNewCaseInput] = useState('');
  const [showAddCase, setShowAddCase] = useState(false);
  const [caseError, setCaseError] = useState('');
  const local = useConfirm();
  const confirmFn = ctx.confirm ?? local.confirm;

  const activeBranch = branches.find((b) => b.caseKey === activeBranchKey) || branches[0];
  const isSwitch = step.rawTaskDef?.type === 'SWITCH';
  const expressionMode = step.caseExpression !== undefined;
  const paramName = step.caseParam ?? '';
  const idBase = `cm-decision-${step.taskReferenceName}`;

  // 本步骤自身的问题（判断依据、分支数量），以及工作流校验器给出的整步问题
  const ownIssues = useMemo(() => {
    const own = validateBusinessSteps([{ ...step, branches: branches.map((b) => ({ ...b, steps: [] })) }], registry)[
      step.taskReferenceName
    ] || [];
    const extra = (ctx.issues[step.taskReferenceName] || []).filter((i) => !own.some((o) => o.message === i.message));
    return [...own, ...extra];
  }, [step, branches, registry, ctx.issues]);
  const valueIssue = ownIssues.find((i) => i.field && i.field === paramName);

  // 定位请求：切到包含目标步骤的分支
  const focus = ctx.focusRequest;
  useEffect(() => {
    if (!focus) return;
    const hit = branches.find((b) => containsStepRef(b.steps, focus.ref));
    if (hit) setActiveBranchKey(hit.caseKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  const handleUpdateBranchSteps = (caseKey: string, newSteps: BusinessStep[]) => {
    onChange({
      ...step,
      branches: branches.map((b) => (b.caseKey === caseKey ? { ...b, steps: newSteps } : b)),
    });
  };

  const handleAddBranch = () => {
    const trimmed = newCaseInput.trim();
    if (!trimmed) {
      setCaseError('请填写分支标识，例如 VIP');
      return;
    }
    if (trimmed === DEFAULT_KEY || branches.some((b) => b.caseKey === trimmed)) {
      setCaseError(`分支「${trimmed}」已存在，请换一个标识`);
      return;
    }
    // 新分支放在默认分支之前
    const others = branches.filter((b) => b.caseKey !== DEFAULT_KEY);
    const def = branches.filter((b) => b.caseKey === DEFAULT_KEY);
    onChange({
      ...step,
      branches: [...others, { caseKey: trimmed, caseLabel: `分支: ${trimmed}`, steps: [] }, ...def],
    });
    setActiveBranchKey(trimmed);
    setNewCaseInput('');
    setCaseError('');
    setShowAddCase(false);
  };

  const cancelAddBranch = () => {
    setShowAddCase(false);
    setNewCaseInput('');
    setCaseError('');
  };

  // 默认分支始终存在（Conductor 语义：未命中任何分支时执行，为空即跳过），只能删除普通分支
  const handleDeleteBranch = async (b: BranchCase) => {
    const nested = b.steps.reduce((n, s) => n + 1 + countNestedSteps(s), 0);
    const message = `删除分支「${b.caseKey}」${nested > 0 ? `及其中的 ${nested} 个步骤` : ''}？删除后可按 Ctrl+Z 撤销。`;
    if (!(await confirmFn(message, '删除分支'))) return;
    const nextBranches = branches.filter((x) => x.caseKey !== b.caseKey);
    onChange({ ...step, branches: nextBranches });
    if (activeBranchKey === b.caseKey) setActiveBranchKey(nextBranches[0]?.caseKey || DEFAULT_KEY);
  };

  const handleAddStepToCurrentBranch = () => {
    if (!activeBranch) return;
    const target = activeBranch;
    onOpenInsertModal(
      (action) => handleUpdateBranchSteps(target.caseKey, [...target.steps, createStepFromAction(action)]),
      { label: `${branchName(target.caseKey)} · 第 ${target.steps.length + 1} 步` }
    );
  };

  // 判断依据：按数据取值（参数名 + 绑定的取值）或按表达式
  const setMode = (mode: 'param' | 'expression') => {
    if (mode === 'expression' && !expressionMode) {
      onChange({ ...step, caseExpression: '' });
    } else if (mode === 'param' && expressionMode) {
      const name = step.caseParam || DEFAULT_CASE_PARAM;
      onChange({ ...step, caseExpression: undefined, caseParam: name, values: { [name]: '', ...step.values } });
    }
  };

  const renameParam = (next: string) => {
    const values = { ...step.values };
    const current = paramName ? values[paramName] : undefined;
    if (paramName) delete values[paramName];
    if (next) values[next] = current ?? '';
    onChange({ ...step, caseParam: next, values });
  };

  const totalStepsInBranches = branches.reduce((acc, b) => acc + (b.steps?.length || 0), 0);
  const modeButton = (mode: 'param' | 'expression', text: string) => {
    const active = (mode === 'expression') === expressionMode;
    return (
      <button
        type="button"
        aria-pressed={active}
        disabled={disabled}
        onClick={() => setMode(mode)}
        style={{
          padding: '3px 10px',
          borderRadius: 4,
          border: 'none',
          background: active ? 'var(--color-accent)' : 'transparent',
          color: active ? 'var(--color-on-accent)' : 'var(--text-secondary)',
          fontSize: 11,
          fontWeight: 600,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {text}
      </button>
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
          gap: 10,
        }}
      >
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
            flexShrink: 0,
          }}
        >
          <Shuffle size={14} strokeWidth={1.75} aria-hidden="true" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <RenameableTitle
              value={step.name}
              fallback="条件分支路由"
              disabled={disabled}
              onRename={(name) => onChange({ ...step, name })}
            />
            <span
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 4,
                background: 'color-mix(in srgb, var(--cm-ai) 12%, transparent)',
                color: 'color-mix(in srgb, var(--cm-ai) 85%, var(--text-primary))',
                fontWeight: 600,
                border: '1px solid color-mix(in srgb, var(--cm-ai) 30%, transparent)',
                fontFamily: 'var(--cm-font-mono, monospace)',
              }}
            >
              {isSwitch ? 'SWITCH' : 'DECISION'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            共 {branches.length} 个分支（含默认分支），分支内共 {totalStepsInBranches} 个步骤
          </div>
        </div>
      </div>

      {/* 判断依据 */}
      <div
        style={{
          padding: '10px 16px',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>判断依据</span>
          <span
            role="group"
            aria-label="判断方式"
            style={{
              display: 'inline-flex',
              background: 'var(--bg-highlight)',
              borderRadius: 6,
              padding: 2,
              border: '1px solid var(--border-secondary)',
            }}
          >
            {modeButton('param', '按数据取值')}
            {modeButton('expression', '按表达式')}
          </span>
        </div>

        {expressionMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor={`${idBase}-expr`} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              判断表达式（JavaScript，结果与各分支标识比较，相同则执行该分支）
            </label>
            <textarea
              id={`${idBase}-expr`}
              disabled={disabled}
              rows={2}
              value={step.caseExpression ?? ''}
              placeholder={isSwitch ? '例如 $.amount > 100 ? "big" : "small"' : '例如 $.env == "prod" ? "prod" : "test"'}
              onChange={(e) => onChange({ ...step, caseExpression: e.target.value })}
              style={{ ...smallInput, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor={`${idBase}-value`} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                判断取值（运行时与各分支标识比较，都不相同时执行默认分支）
              </label>
              <DataPillInput
                id={`${idBase}-value`}
                disabled={disabled || !paramName}
                invalid={!!valueIssue}
                value={paramName ? step.values?.[paramName] ?? '' : ''}
                placeholder="插入要判断的数据，例如上游步骤的状态或全局入参"
                upstreamSteps={upstreamSteps}
                registry={registry}
                onChange={(v) => onChange({ ...step, values: { ...step.values, [paramName]: v } })}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor={`${idBase}-param`} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                参数名
              </label>
              <input
                id={`${idBase}-param`}
                type="text"
                disabled={disabled}
                value={paramName}
                placeholder="如 userType"
                onChange={(e) => renameParam(e.target.value.trim())}
                style={{ ...smallInput, width: 120 }}
              />
            </div>
          </div>
        )}
        <IssueList issues={ownIssues} />
      </div>

      {/* 分支切换 */}
      <div
        style={{
          padding: '8px 16px',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>分支列表:</span>
        {branches.map((b) => {
          const isActive = b.caseKey === activeBranchKey;
          const isDefault = b.caseKey === DEFAULT_KEY;
          return (
            <span
              key={b.caseKey}
              style={{
                borderRadius: 6,
                background: isActive
                  ? 'var(--color-accent-bg, color-mix(in srgb, var(--color-accent) 15%, transparent))'
                  : 'var(--bg-secondary)',
                border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--border-primary)'}`,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveBranchKey(b.caseKey)}
                style={{
                  padding: '4px 10px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-accent-text)' : 'var(--text-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'inherit',
                }}
              >
                {isDefault ? (
                  <CornerDownRight size={14} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <GitBranch size={14} strokeWidth={1.75} aria-hidden="true" />
                )}
                <span>{isDefault ? '默认分支' : b.caseKey}</span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '0 4px',
                    borderRadius: 8,
                    background: isActive ? 'var(--color-accent)' : 'var(--bg-tertiary)',
                    color: isActive ? 'var(--color-on-accent)' : 'var(--text-muted)',
                  }}
                  aria-label={`${b.steps?.length || 0} 个步骤`}
                >
                  {b.steps?.length || 0}
                </span>
              </button>
              {!disabled && !isDefault && (
                <IconButton label={`删除分支 ${b.caseKey}`} onClick={() => handleDeleteBranch(b)}>
                  <X size={14} strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
              )}
            </span>
          );
        })}

        {!disabled && !showAddCase && (
          <button
            type="button"
            onClick={() => setShowAddCase(true)}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              background: 'transparent',
              border: '1px dashed var(--border-secondary)',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
            新增分支
          </button>
        )}

        {!disabled && showAddCase && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <input
              autoFocus
              type="text"
              aria-label="分支标识"
              value={newCaseInput}
              placeholder="分支标识，如 VIP"
              onChange={(e) => {
                setNewCaseInput(e.target.value);
                if (caseError) setCaseError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddBranch();
                if (e.key === 'Escape') cancelAddBranch();
              }}
              style={{ ...smallInput, border: '1px solid var(--color-accent)', width: 120 }}
            />
            <button
              type="button"
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
              添加分支
            </button>
            <button
              type="button"
              onClick={cancelAddBranch}
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
            {caseError && (
              <span role="alert" style={{ fontSize: 11, color: 'var(--cm-status-failed)' }}>
                {caseError}
              </span>
            )}
          </span>
        )}
      </div>

      {/* 当前分支的子步骤流 */}
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
                gap: 8,
              }}
            >
              <span>
                <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
                {activeBranch.caseKey === DEFAULT_KEY ? (
                  <>判断取值与所有分支标识都不相同时，依次执行以下步骤：</>
                ) : (
                  <>
                    判断结果为 <strong>{activeBranch.caseKey}</strong> 时，依次执行以下步骤：
                  </>
                )}
              </span>
              {!disabled && (
                <button
                  type="button"
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
                    flexShrink: 0,
                  }}
                >
                  <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>追加分支步骤</span>
                </button>
              )}
            </div>

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
                {activeBranch.caseKey === DEFAULT_KEY
                  ? '默认分支暂无步骤：未命中任何分支时直接跳过，继续执行后续步骤'
                  : '当前分支暂无步骤，点击「追加分支步骤」配置'}
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
                insertLabel={branchName(activeBranch.caseKey)}
              />
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>请选择或新增一个分支进行配置</div>
        )}
      </div>

      {/* 底部说明 */}
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
        <Lightbulb size={14} strokeWidth={1.75} aria-hidden="true" />
        <span>运行时只执行命中的一个分支，其余分支的步骤会被跳过。</span>
      </div>
      {local.confirmState && (
        <ConfirmDialog
          message={local.confirmState.message}
          confirmLabel={local.confirmState.confirmLabel}
          onConfirm={local.handleConfirm}
          onCancel={local.handleCancel}
        />
      )}
    </div>
  );
};
