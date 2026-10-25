import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { WorkflowDef, WorkflowInstance } from '../../types/conductor';
import type { ValidationResults } from '../../types/workflow';
import type { BusinessWorkflowModel, BusinessStep } from '../../stepmodel/types';
import { compileStepModelToWorkflowDef } from '../../stepmodel/compile';
import { decompileWorkflowDefToStepModel } from '../../stepmodel/decompile';
import { collectIssues, mergeWorkflowValidation, validateBusinessSteps } from '../../stepmodel/validate';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import type { ActionDefinition } from '../../actions/types';
import { ActionForm } from './ActionForm';
import { createStepFromAction } from '../../stepmodel/factory';
import { LibraryVersionBadge } from './LibraryVersionBadge';
import { ActionPickerModal } from './ActionPickerModal';
import { DecisionBranchCard } from './DecisionBranchCard';
import { ForkJoinCard } from './ForkJoinCard';
import { LoopDoWhileCard } from './LoopDoWhileCard';
import { RunStoryTimeline } from './RunStoryTimeline';
import { executeLocalSandboxDryRunAsync } from '../../utils/localSandboxEngine';
import { validateWorkflow } from '../../utils/validator';
import type { LibraryCatalog } from '../../library/catalog';
import { applyUpgradeToValues, collectReferencedOutputKeys } from '../../library/diff';
import type { WorkflowLevel } from '../../types/workflowLibrary';
import { CmIcon } from '../icons/CmIcon';
import ConfirmDialog from '../ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import {
  BusinessEditorContext,
  containsStepRef,
  stepDomId,
  type BusinessEditorContextValue,
  type InsertPickerInfo,
} from './BusinessEditorContext';
import {
  IconButton,
  InsertStepButton,
  IssueBadge,
  MoveDeleteButtons,
  RunBadge,
  SensitiveTag,
  StepCardHeader,
} from './StepCardParts';
import { confirmDeleteMessage } from './deleteMessage';
import { Sparkles } from 'lucide-react';

export interface StepFlowEditorProps {
  workflowDef: WorkflowDef | null;
  onChange: (def: WorkflowDef) => void;
  registry?: ActionRegistry;
  readOnly?: boolean;
  workflowExecution?: WorkflowInstance;
  /** 流程库目录（由 WorkflowIDE 按 libraryProvider 创建）：用于动作选择器状态与版本徽标 */
  libraryCatalog?: LibraryCatalog;
  /** 当前正在编辑的工作流层级：提供时选择器隐藏违反分层调用规则的流程库动作 */
  currentWorkflowLevel?: WorkflowLevel;
  /** 提供时，步骤头部显示「AI 介绍」按钮，点击请 AI 介绍该步骤（AI IDE 中使用） */
  onAskAi?: (step: BusinessStep) => void;
  /** 通过动作选择器新增步骤后回调（埋点用）：source = library（流程库能力）/ builtin（内置或宿主动作） */
  onStepAdded?: (info: { source: 'library' | 'builtin' }) => void;
  /** 本地沙箱试跑结束后回调（埋点用）：result 为执行状态，或 'error'（试跑抛错） */
  onSandboxRun?: (result: string) => void;
  /** Ctrl/Cmd+S 时回调（保存当前定义）；不提供时不拦截浏览器的保存快捷键 */
  onSave?: (def: WorkflowDef) => void;
  /**
   * Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z 或 Ctrl/Cmd+Y 重做。
   * 宿主有自己的撤销历史（如 WorkflowIDE 的 store）时传入；不传时卡片视图使用内置的撤销历史。
   */
  onUndo?: () => void;
  onRedo?: () => void;
  /** 工作流校验结果（按任务引用名显示在卡片上）；不传时按当前定义自动计算 */
  validationResults?: ValidationResults;
}

/** 内置撤销历史的最大条数 */
const LOCAL_HISTORY_LIMIT = 100;

interface PickerState {
  index: number;
  label?: string;
  /** 在分支 / 泳道 / 循环体内插入时的回调；为空表示插入顶层第 index 位 */
  callback?: (action: ActionDefinition) => void;
}

const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

const CONTROL_LABEL: Record<string, { text: string; color: string }> = {
  decision: { text: '控制流分支', color: 'color-mix(in srgb, var(--cm-ai) 75%, var(--text-primary))' },
  fork: { text: '并发泳道组', color: 'var(--color-accent-text)' },
  loop: { text: '循环迭代体', color: 'var(--color-accent-text)' },
};

export const StepFlowEditor: React.FC<StepFlowEditorProps> = ({
  workflowDef,
  onChange,
  registry = defaultActionRegistry,
  readOnly = false,
  workflowExecution,
  libraryCatalog,
  currentWorkflowLevel,
  onAskAi,
  onStepAdded,
  onSandboxRun,
  onSave,
  onUndo,
  onRedo,
  validationResults,
}) => {
  const model: BusinessWorkflowModel = useMemo(() => {
    return decompileWorkflowDefToStepModel(workflowDef, registry);
  }, [workflowDef, registry]);

  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  // 动作选择器：关闭时整体清空（含嵌套插入回调），下一次插入不会落到上一次的位置
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ ref: string; nonce: number } | null>(null);
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  // Simulation & Story state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResults, setSimResults] = useState<Record<string, { status: string; output: any }> | null>(null);
  const [lastSimInstance, setLastSimInstance] = useState<WorkflowInstance | null>(workflowExecution || null);
  const [activeTab, setActiveTab] = useState<'steps' | 'story'>(workflowExecution ? 'story' : 'steps');

  useEffect(() => {
    if (workflowExecution) {
      setLastSimInstance(workflowExecution);
      setActiveTab('story');
    }
  }, [workflowExecution]);

  const steps = model.steps;

  // ── 校验：业务字段校验 + 工作流校验器（按任务引用名归类） ──
  const issues = useMemo(() => {
    const map = validateBusinessSteps(steps, registry);
    return mergeWorkflowValidation(map, validationResults ?? (workflowDef ? validateWorkflow(workflowDef) : null));
  }, [steps, registry, validationResults, workflowDef]);

  const runStatus = useMemo(() => {
    if (!simResults) return undefined;
    const out: Record<string, string> = {};
    for (const [ref, r] of Object.entries(simResults)) out[ref] = r.status;
    return out;
  }, [simResults]);

  // ── 撤销 / 重做 / 保存 ──
  const historyRef = useRef<{ past: WorkflowDef[]; future: WorkflowDef[] }>({ past: [], future: [] });

  const emit = (def: WorkflowDef) => {
    if (workflowDef) {
      const h = historyRef.current;
      h.past.push(workflowDef);
      if (h.past.length > LOCAL_HISTORY_LIMIT) h.past.shift();
      h.future = [];
    }
    onChange(def);
  };

  const undo = useCallback(() => {
    if (onUndo) return onUndo();
    const h = historyRef.current;
    const prev = h.past.pop();
    if (!prev) return;
    if (workflowDef) h.future.push(workflowDef);
    onChange(prev);
  }, [onUndo, onChange, workflowDef]);

  const redo = useCallback(() => {
    if (onRedo) return onRedo();
    const h = historyRef.current;
    const next = h.future.pop();
    if (!next) return;
    if (workflowDef) h.past.push(workflowDef);
    onChange(next);
  }, [onRedo, onChange, workflowDef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        if (!onSave || !workflowDef) return;
        e.preventDefault();
        onSave(workflowDef);
        return;
      }
      // 输入框内保留浏览器自带的文字撤销；弹窗打开时不处理
      if (readOnly || isTypingTarget(e.target) || picker || confirmState) return;
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave, workflowDef, readOnly, undo, redo, picker, confirmState]);

  const updateModelAndEmit = (newSteps: BusinessStep[]) => {
    emit(compileStepModelToWorkflowDef({ ...model, steps: newSteps }, registry));
  };

  const handleUpdateStep = (index: number, updated: BusinessStep) => {
    const next = [...steps];
    next[index] = updated;
    updateModelAndEmit(next);
  };

  const handleDeleteStep = async (index: number) => {
    if (readOnly) return;
    const target = steps[index];
    if (!target) return;
    if (!(await confirm(confirmDeleteMessage(target, registry), '删除'))) return;
    if (activeStepId === target.id) setActiveStepId(null);
    updateModelAndEmit(steps.filter((_, idx) => idx !== index));
  };

  const handleMoveStep = (fromIndex: number, toIndex: number) => {
    if (readOnly || toIndex < 0 || toIndex >= steps.length) return;
    const next = [...steps];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    updateModelAndEmit(next);
  };

  const openNestedPicker = (cb: (action: ActionDefinition) => void, info?: InsertPickerInfo) => {
    setPicker({ index: 0, label: info?.label, callback: cb });
  };

  const handleAddAction = (action: ActionDefinition) => {
    if (!picker) return;
    onStepAdded?.({ source: action.kind === 'workflow' ? 'library' : 'builtin' });
    const { callback, index } = picker;
    setPicker(null);
    if (callback) {
      callback(action);
      return;
    }
    const newStep: BusinessStep = createStepFromAction(action);
    const next = [...steps];
    next.splice(index, 0, newStep);
    setActiveStepId(newStep.id);
    updateModelAndEmit(next);
  };

  // 定位步骤（来自运行故事线）：顶层直接展开；嵌套步骤通知内部卡片切换分支并展开
  const locateStep = (ref: string) => {
    setActiveTab('steps');
    const top = steps.find((s) => s.taskReferenceName === ref);
    if (top) {
      if (!top.controlType) setActiveStepId(top.id);
    } else if (!steps.some((s) => containsStepRef([s], ref))) {
      return;
    }
    setFocusRequest((prev) => ({ ref, nonce: (prev?.nonce ?? 0) + 1 }));
    requestAnimationFrame(() =>
      document.getElementById(stepDomId(ref))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    );
  };

  // Run dry-run sandbox using action mockOutputs
  const handleDryRunSandbox = async () => {
    if (!workflowDef) return;
    setIsSimulating(true);

    try {
      const taskMocks: Record<string, any> = {};
      // 递归收集所有层级（含分支 / 泳道 / 循环体内的嵌套步骤）的 Mock 输出
      const collectMocks = (list: BusinessStep[]) => {
        for (const step of list) {
          const action = registry.getAction(step.actionId);
          if (action && action.mockOutput) {
            taskMocks[step.taskReferenceName] = action.mockOutput(step.values);
          }
          for (const b of step.branches || []) collectMocks(b.steps);
          for (const l of step.forkLanes || []) collectMocks(l.steps);
          collectMocks(step.loopSteps || []);
        }
      };
      collectMocks(steps);

      const instance = await executeLocalSandboxDryRunAsync(workflowDef, { taskMocks });
      setLastSimInstance(instance);
      setActiveTab('story');

      const results: Record<string, { status: string; output: any }> = {};
      for (const task of instance.tasks) {
        results[task.referenceTaskName] = {
          status: task.status,
          output: task.outputData,
        };
      }

      setSimResults(results);
      onSandboxRun?.(String(instance.status));
    } catch (err) {
      console.error('[StepFlowEditor] Dry run error:', err);
      onSandboxRun?.('error');
    } finally {
      setIsSimulating(false);
    }
  };

  const ctxValue: BusinessEditorContextValue = {
    workflowInputParams: model.inputParameters,
    issues,
    runStatus,
    confirm,
    libraryCatalog,
    allSteps: steps,
    focusRequest,
  };

  const errorCount = Object.values(issues)
    .flat()
    .filter((i) => i.level === 'error').length;

  const insertBetween = (idx: number) =>
    !readOnly && <InsertStepButton onClick={() => setPicker({ index: idx })} label="插入业务动作" />;

  return (
    <BusinessEditorContext.Provider value={ctxValue}>
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--bg-primary)',
        overflowY: 'auto',
        fontFamily: 'inherit',
      }}
    >
      {/* Top Banner Toolbar */}
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}><CmIcon name="clipboard" size={16} /></span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
              {model.name || '云平台业务流程'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>共 {steps.length} 个业务执行步骤 · 普通用户零代码模式</span>
              {errorCount > 0 && <IssueBadge issues={Object.values(issues).flat()} />}
            </div>
          </div>
        </div>

        {/* 步骤配置 vs 故事线 视图切换 */}
        {lastSimInstance && (
          <div
            role="group"
            aria-label="视图"
            style={{
              display: 'inline-flex',
              background: 'var(--bg-highlight)',
              borderRadius: 6,
              padding: 2,
              border: '1px solid var(--border-secondary)',
            }}
          >
            <button
              type="button"
              aria-pressed={activeTab === 'steps'}
              onClick={() => setActiveTab('steps')}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: 'none',
                background: activeTab === 'steps' ? 'var(--color-accent)' : 'transparent',
                color: activeTab === 'steps' ? 'var(--color-on-accent)' : 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <CmIcon name="clipboard" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />步骤配置
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'story'}
              onClick={() => setActiveTab('story')}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: 'none',
                background: activeTab === 'story' ? 'var(--color-accent)' : 'transparent',
                color: activeTab === 'story' ? 'var(--color-on-accent)' : 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <CmIcon name="book" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />运行故事线 ({lastSimInstance.tasks.length} 步)
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {simResults && (
            <button
              type="button"
              onClick={() => setSimResults(null)}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-muted)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              清除试跑结果
            </button>
          )}

          <button
            type="button"
            onClick={() => { void handleDryRunSandbox(); }}
            disabled={isSimulating || steps.length === 0}
            title={errorCount > 0 ? `还有 ${errorCount} 项待修正，试跑结果可能与真实运行不同` : undefined}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: 'color-mix(in srgb, var(--color-success) 20%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-success) 45%, transparent)',
              color: 'var(--color-success)',
              fontSize: 12,
              fontWeight: 600,
              cursor: isSimulating || steps.length === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <span>{isSimulating ? '模拟中...' : '浏览器本地试跑 (零风险)'}</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      {activeTab === 'story' && lastSimInstance ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <RunStoryTimeline instance={lastSimInstance} registry={registry} onInspectStep={locateStep} />
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            maxWidth: 820,
            width: '100%',
            margin: '0 auto',
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            boxSizing: 'border-box',
          }}
        >
        {/* Empty State */}
        {steps.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: 'var(--bg-secondary)',
              borderRadius: 12,
              border: '1px dashed var(--border-secondary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <span style={{ display: 'inline-flex', color: 'var(--color-accent)' }}><CmIcon name="zap" size={36} /></span>
            <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>
              尚未添加任何业务动作
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 420, margin: 0 }}>
              无需编写代码或配置复杂的 JSON，点击下方按钮选择第一个云主机业务动作，即可开始自动化编排。
            </p>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setPicker({ index: 0 })}
              style={{
                marginTop: 8,
                padding: '8px 18px',
                borderRadius: 8,
                background: 'var(--color-accent)',
                color: 'var(--color-on-accent)',
                border: 'none',
                fontWeight: 600,
                fontSize: 13,
                cursor: readOnly ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>+</span>
              <span>添加第一个业务动作</span>
            </button>
          </div>
        )}

        {/* Top Insert Button if has steps */}
        {steps.length > 0 && !readOnly && (
          <InsertStepButton onClick={() => setPicker({ index: 0 })} label="在最前插入步骤" />
        )}

        {/* Steps List */}
        {steps.map((step, idx) => {
          const action = registry.getAction(step.actionId);
          const isExpanded = activeStepId === step.id;
          const upstream = steps.slice(0, idx);
          const stepIssues = collectIssues(step, issues);

          // 1–3. 控制流卡片（分支 / 并行 / 循环）
          if (step.controlType) {
            const label = CONTROL_LABEL[step.controlType] ?? CONTROL_LABEL.decision;
            const cardProps = {
              step,
              upstreamSteps: upstream,
              registry,
              disabled: readOnly,
              onChange: (updated: BusinessStep) => handleUpdateStep(idx, updated),
              onOpenInsertModal: openNestedPicker,
            };
            return (
              <React.Fragment key={step.id}>
                <div id={stepDomId(step.taskReferenceName)} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', gap: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: label.color }}>
                        #{idx + 1} {label.text}
                      </span>
                      <IssueBadge issues={stepIssues} />
                      <RunBadge status={runStatus?.[step.taskReferenceName]} />
                    </span>
                    {!readOnly && (
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <MoveDeleteButtons
                          index={idx}
                          count={steps.length}
                          onMove={(to) => handleMoveStep(idx, to)}
                          onDelete={() => handleDeleteStep(idx)}
                        />
                      </span>
                    )}
                  </div>

                  {step.controlType === 'fork' ? (
                    <ForkJoinCard {...cardProps} />
                  ) : step.controlType === 'loop' ? (
                    <LoopDoWhileCard {...cardProps} />
                  ) : (
                    <DecisionBranchCard {...cardProps} />
                  )}
                </div>
                {insertBetween(idx + 1)}
              </React.Fragment>
            );
          }

          // 4. 普通串行业务卡片
          const bodyId = `${stepDomId(step.taskReferenceName)}-body`;
          const defaultTitle = action?.name || step.taskReferenceName;
          const title = step.name || defaultTitle;
          const renamed = !!action && title !== action.name;
          return (
            <React.Fragment key={step.id}>
              <div
                id={stepDomId(step.taskReferenceName)}
                style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: 10,
                  border: isExpanded
                    ? '1px solid var(--color-accent)'
                    : '1px solid var(--border-primary)',
                  boxShadow: isExpanded
                    ? '0 8px 24px color-mix(in srgb, var(--color-accent) 15%, transparent)'
                    : 'var(--cm-shadow-card)',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                }}
              >
                <StepCardHeader
                  bodyId={bodyId}
                  indexLabel={`#${idx + 1}`}
                  icon={action?.icon}
                  title={title}
                  subtitle={renamed ? action?.name : action?.description || step.description || step.taskReferenceName}
                  defaultTitle={defaultTitle}
                  expanded={isExpanded}
                  onToggle={() => setActiveStepId(isExpanded ? null : step.id)}
                  disabled={readOnly}
                  onRename={step.isProFallback ? undefined : (name) => handleUpdateStep(idx, { ...step, name })}
                  badges={
                    <>
                      {action?.riskLevel === 'sensitive' && <SensitiveTag />}
                      <LibraryVersionBadge
                        step={step}
                        action={action}
                        disabled={readOnly}
                        catalog={libraryCatalog}
                        getReferencedOutputs={() =>
                          collectReferencedOutputKeys(
                            step.taskReferenceName,
                            steps.filter((s) => s.id !== step.id)
                          )
                        }
                        onUpgrade={(v, diff) =>
                          handleUpdateStep(idx, {
                            ...step,
                            libraryRef: { name: step.libraryRef!.name, version: v },
                            // 差异里提示「值将丢失」的已删除入参，随升级一并清理；新增入参补默认值
                            ...(diff ? { values: applyUpgradeToValues(step.values, diff) } : {}),
                          })
                        }
                      />
                      <IssueBadge issues={stepIssues} />
                      <RunBadge status={runStatus?.[step.taskReferenceName]} />
                    </>
                  }
                  actions={
                    <>
                      {onAskAi && (
                        <IconButton label="让 AI 介绍这个步骤的作用与配置建议" onClick={() => onAskAi(step)}>
                          <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
                        </IconButton>
                      )}
                      {!readOnly && (
                        <MoveDeleteButtons
                          index={idx}
                          count={steps.length}
                          onMove={(to) => handleMoveStep(idx, to)}
                          onDelete={() => handleDeleteStep(idx)}
                        />
                      )}
                    </>
                  }
                />

                {/* Collapsible Form Body */}
                {isExpanded && (
                  <div
                    id={bodyId}
                    style={{
                      padding: '14px 16px',
                      borderTop: '1px solid var(--border-primary)',
                      background: 'var(--bg-primary)',
                    }}
                  >
                    <ActionForm
                      step={step}
                      upstreamSteps={upstream}
                      workflowInputParams={model.inputParameters}
                      registry={registry}
                      disabled={readOnly}
                      onChange={(updated) => handleUpdateStep(idx, updated)}
                    />
                  </div>
                )}
              </div>
              {insertBetween(idx + 1)}
            </React.Fragment>
          );
        })}
      </div>
      )}

      {/* Action Picker Modal */}
      {picker && (
        <ActionPickerModal
          registry={registry}
          stepNumber={picker.index + 1}
          positionLabel={picker.label}
          onClose={() => setPicker(null)}
          onSelect={handleAddAction}
          currentWorkflowLevel={currentWorkflowLevel}
          libraryCatalog={libraryCatalog}
        />
      )}

      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
    </BusinessEditorContext.Provider>
  );
};
