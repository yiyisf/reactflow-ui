import React, { useState, useMemo, useEffect } from 'react';
import type { WorkflowDef, WorkflowInstance } from '../../types/conductor';
import type { BusinessWorkflowModel, BusinessStep } from '../../stepmodel/types';
import { compileStepModelToWorkflowDef } from '../../stepmodel/compile';
import { decompileWorkflowDefToStepModel } from '../../stepmodel/decompile';
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
import { executeLocalSandboxDryRun } from '../../utils/localSandboxEngine';
import type { LibraryCatalog } from '../../library/catalog';
import type { WorkflowLevel } from '../../types/workflowLibrary';

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
}

export const StepFlowEditor: React.FC<StepFlowEditorProps> = ({
  workflowDef,
  onChange,
  registry = defaultActionRegistry,
  readOnly = false,
  workflowExecution,
  libraryCatalog,
  currentWorkflowLevel,
}) => {
  // Synchronize internal BusinessWorkflowModel from WorkflowDef
  const model: BusinessWorkflowModel = useMemo(() => {
    return decompileWorkflowDefToStepModel(workflowDef, registry);
  }, [workflowDef, registry]);

  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [insertModalIndex, setInsertModalIndex] = useState<number | null>(null);
  const [insertCallback, setInsertCallback] = useState<((action: ActionDefinition) => void) | null>(null);

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

  const updateModelAndEmit = (newSteps: BusinessStep[]) => {
    const nextModel: BusinessWorkflowModel = {
      ...model,
      steps: newSteps,
    };
    const compiledDef = compileStepModelToWorkflowDef(nextModel, registry);
    onChange(compiledDef);
  };

  const handleUpdateStep = (index: number, updated: BusinessStep) => {
    const next = [...steps];
    next[index] = updated;
    updateModelAndEmit(next);
  };

  const handleDeleteStep = (index: number) => {
    if (readOnly) return;
    const next = steps.filter((_, idx) => idx !== index);
    if (activeStepId === steps[index]?.id) {
      setActiveStepId(null);
    }
    updateModelAndEmit(next);
  };

  const handleMoveStep = (fromIndex: number, toIndex: number) => {
    if (readOnly || toIndex < 0 || toIndex >= steps.length) return;
    const next = [...steps];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    updateModelAndEmit(next);
  };

  const handleOpenInsertModalForCallback = (cb: (action: ActionDefinition) => void) => {
    setInsertCallback(() => cb);
    setInsertModalIndex(0);
  };

  const handleAddAction = (action: ActionDefinition, atIndex: number) => {
    if (insertCallback) {
      insertCallback(action);
      setInsertCallback(null);
      setInsertModalIndex(null);
      return;
    }

    const newStep: BusinessStep = createStepFromAction(action);

    const next = [...steps];
    next.splice(atIndex, 0, newStep);
    setInsertModalIndex(null);
    setActiveStepId(newStep.id);
    updateModelAndEmit(next);
  };

  // Run dry-run sandbox using action mockOutputs
  const handleDryRunSandbox = () => {
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

      const instance = executeLocalSandboxDryRun(workflowDef, { taskMocks });
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
    } catch (err) {
      console.error('[StepFlowEditor] Dry run error:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--bg-primary, #0f172a)',
        overflowY: 'auto',
        fontFamily: 'inherit',
      }}
    >
      {/* Top Banner Toolbar */}
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-secondary, #1e293b)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📋</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary, #f8fafc)' }}>
              {model.name || '云平台业务流程'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)' }}>
              共 {steps.length} 个业务执行步骤 · 普通用户零代码模式
            </div>
          </div>
        </div>

        {/* 步骤配置 vs 故事线 视图切换 */}
        {lastSimInstance && (
          <div
            style={{
              display: 'inline-flex',
              background: 'rgba(255, 255, 255, 0.06)',
              borderRadius: 6,
              padding: 2,
              border: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.15))',
            }}
          >
            <button
              onClick={() => setActiveTab('steps')}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: 'none',
                background: activeTab === 'steps' ? 'var(--color-accent, #3b82f6)' : 'transparent',
                color: activeTab === 'steps' ? '#fff' : 'var(--text-secondary, #b0bec5)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📋 步骤配置
            </button>
            <button
              onClick={() => setActiveTab('story')}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: 'none',
                background: activeTab === 'story' ? 'var(--color-accent, #3b82f6)' : 'transparent',
                color: activeTab === 'story' ? '#fff' : 'var(--text-secondary, #b0bec5)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📖 运行故事线 ({lastSimInstance.tasks.length}步)
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {simResults && (
            <button
              onClick={() => setSimResults(null)}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid var(--border-secondary, rgba(255,255,255,0.2))',
                color: 'var(--text-muted, #94a3b8)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              清除试跑结果
            </button>
          )}

          <button
            onClick={handleDryRunSandbox}
            disabled={isSimulating || steps.length === 0}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: 'color-mix(in srgb, var(--color-success, #10b981) 20%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-success, #10b981) 45%, transparent)',
              color: 'var(--color-success, #10b981)',
              fontSize: 12,
              fontWeight: 600,
              cursor: isSimulating || steps.length === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <span>{isSimulating ? '⏳ 模拟中...' : '▶ 浏览器本地试跑 (零风险)'}</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      {activeTab === 'story' && lastSimInstance ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <RunStoryTimeline
            instance={lastSimInstance}
            registry={registry}
            onInspectStep={(ref) => {
              setActiveTab('steps');
              const found = steps.find((s) => s.taskReferenceName === ref);
              if (found) {
                setActiveStepId(found.id);
              }
            }}
          />
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
          }}
        >
        {/* Empty State */}
        {steps.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: 'var(--bg-secondary, #1e293b)',
              borderRadius: 12,
              border: '1px dashed var(--border-secondary, rgba(255,255,255,0.2))',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <span style={{ fontSize: 42 }}>⚡</span>
            <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary, #f8fafc)' }}>
              尚未添加任何业务动作
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #b0bec5)', maxWidth: 420, margin: 0 }}>
              无需编写代码或配置复杂的 JSON，点击下方按钮选择第一个云主机业务动作，即可开始自动化编排。
            </p>
            <button
              disabled={readOnly}
              onClick={() => setInsertModalIndex(0)}
              style={{
                marginTop: 8,
                padding: '8px 18px',
                borderRadius: 8,
                background: 'var(--color-accent, #3b82f6)',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
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
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => setInsertModalIndex(0)}
              style={{
                padding: '4px 12px',
                borderRadius: 20,
                background: 'rgba(255,255,255,0.04)',
                border: '1px dashed var(--border-secondary, rgba(255,255,255,0.2))',
                color: 'var(--text-muted, #94a3b8)',
                fontSize: 11,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>+</span>
              <span>在最前插入步骤</span>
            </button>
          </div>
        )}

        {/* Steps List */}
        {steps.map((step, idx) => {
          const action = registry.getAction(step.actionId);
          const isExpanded = activeStepId === step.id;
          const upstream = steps.slice(0, idx);
          const simResult = simResults?.[step.taskReferenceName];

          // 1. 分支路由卡片流 (DECISION / SWITCH)
          if (step.controlType === 'decision') {
            return (
              <React.Fragment key={step.id}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'color-mix(in srgb, #8b5cf6 75%, var(--text-primary))' }}>
                      #{idx + 1} 控制流分支
                    </span>
                    {!readOnly && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          disabled={idx === 0}
                          onClick={() => handleMoveStep(idx, idx - 1)}
                          title="上移"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: idx === 0 ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary)',
                            cursor: idx === 0 ? 'default' : 'pointer',
                            fontSize: 13,
                            padding: '2px 4px',
                          }}
                        >
                          ↑
                        </button>
                        <button
                          disabled={idx === steps.length - 1}
                          onClick={() => handleMoveStep(idx, idx + 1)}
                          title="下移"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: idx === steps.length - 1 ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary)',
                            cursor: idx === steps.length - 1 ? 'default' : 'pointer',
                            fontSize: 13,
                            padding: '2px 4px',
                          }}
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => handleDeleteStep(idx)}
                          title="删除步骤"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: 13,
                            padding: '2px 4px',
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>

                  <DecisionBranchCard
                    step={step}
                    upstreamSteps={upstream}
                    registry={registry}
                    disabled={readOnly}
                    onChange={(updated) => handleUpdateStep(idx, updated)}
                    onOpenInsertModal={handleOpenInsertModalForCallback}
                  />
                </div>

                {/* In-between Add Step Button */}
                {!readOnly && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0' }}>
                    <button
                      onClick={() => setInsertModalIndex(idx + 1)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 16,
                        background: 'var(--bg-tertiary)',
                        border: '1px dashed var(--border-secondary)',
                        color: 'var(--text-muted)',
                        fontSize: 11,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-accent, #3b82f6)';
                        e.currentTarget.style.color = 'var(--color-accent, #3b82f6)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-secondary)';
                        e.currentTarget.style.color = 'var(--text-muted)';
                      }}
                    >
                      <span>+</span>
                      <span>插入业务动作</span>
                    </button>
                  </div>
                )}
              </React.Fragment>
            );
          }

          // 2. 并行任务组卡片流 (FORK_JOIN)
          if (step.controlType === 'fork') {
            return (
              <React.Fragment key={step.id}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent, #3b82f6)' }}>
                      #{idx + 1} 并发泳道组
                    </span>
                    {!readOnly && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          disabled={idx === 0}
                          onClick={() => handleMoveStep(idx, idx - 1)}
                          title="上移"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: idx === 0 ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary)',
                            cursor: idx === 0 ? 'default' : 'pointer',
                            fontSize: 13,
                            padding: '2px 4px',
                          }}
                        >
                          ↑
                        </button>
                        <button
                          disabled={idx === steps.length - 1}
                          onClick={() => handleMoveStep(idx, idx + 1)}
                          title="下移"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: idx === steps.length - 1 ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary)',
                            cursor: idx === steps.length - 1 ? 'default' : 'pointer',
                            fontSize: 13,
                            padding: '2px 4px',
                          }}
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => handleDeleteStep(idx)}
                          title="删除步骤"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: 13,
                            padding: '2px 4px',
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>

                  <ForkJoinCard
                    step={step}
                    upstreamSteps={upstream}
                    registry={registry}
                    disabled={readOnly}
                    onChange={(updated) => handleUpdateStep(idx, updated)}
                    onOpenInsertModal={handleOpenInsertModalForCallback}
                  />
                </div>

                {/* In-between Add Step Button */}
                {!readOnly && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0' }}>
                    <button
                      onClick={() => setInsertModalIndex(idx + 1)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 16,
                        background: 'var(--bg-tertiary)',
                        border: '1px dashed var(--border-secondary)',
                        color: 'var(--text-muted)',
                        fontSize: 11,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-accent, #3b82f6)';
                        e.currentTarget.style.color = 'var(--color-accent, #3b82f6)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-secondary)';
                        e.currentTarget.style.color = 'var(--text-muted)';
                      }}
                    >
                      <span>+</span>
                      <span>插入业务动作</span>
                    </button>
                  </div>
                )}
              </React.Fragment>
            );
          }

          // 3. 循环迭代卡片流 (DO_WHILE)
          if (step.controlType === 'loop') {
            return (
              <React.Fragment key={step.id}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent, #3b82f6)' }}>
                      #{idx + 1} 循环迭代体
                    </span>
                    {!readOnly && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          disabled={idx === 0}
                          onClick={() => handleMoveStep(idx, idx - 1)}
                          title="上移"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: idx === 0 ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary)',
                            cursor: idx === 0 ? 'default' : 'pointer',
                            fontSize: 13,
                            padding: '2px 4px',
                          }}
                        >
                          ↑
                        </button>
                        <button
                          disabled={idx === steps.length - 1}
                          onClick={() => handleMoveStep(idx, idx + 1)}
                          title="下移"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: idx === steps.length - 1 ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary)',
                            cursor: idx === steps.length - 1 ? 'default' : 'pointer',
                            fontSize: 13,
                            padding: '2px 4px',
                          }}
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => handleDeleteStep(idx)}
                          title="删除步骤"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: 13,
                            padding: '2px 4px',
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>

                  <LoopDoWhileCard
                    step={step}
                    upstreamSteps={upstream}
                    registry={registry}
                    disabled={readOnly}
                    onChange={(updated) => handleUpdateStep(idx, updated)}
                    onOpenInsertModal={handleOpenInsertModalForCallback}
                  />
                </div>

                {/* In-between Add Step Button */}
                {!readOnly && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0' }}>
                    <button
                      onClick={() => setInsertModalIndex(idx + 1)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 16,
                        background: 'var(--bg-tertiary)',
                        border: '1px dashed var(--border-secondary)',
                        color: 'var(--text-muted)',
                        fontSize: 11,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-accent, #3b82f6)';
                        e.currentTarget.style.color = 'var(--color-accent, #3b82f6)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-secondary)';
                        e.currentTarget.style.color = 'var(--text-muted)';
                      }}
                    >
                      <span>+</span>
                      <span>插入业务动作</span>
                    </button>
                  </div>
                )}
              </React.Fragment>
            );
          }

          // 4. 普通串行业务卡片
          return (
            <React.Fragment key={step.id}>
              <div
                style={{
                  background: 'var(--bg-secondary, #1e293b)',
                  borderRadius: 10,
                  border: isExpanded
                    ? '1px solid var(--color-accent, #3b82f6)'
                    : '1px solid var(--border-primary, rgba(255,255,255,0.12))',
                  boxShadow: isExpanded
                    ? '0 8px 24px rgba(59, 130, 246, 0.15)'
                    : '0 4px 12px rgba(0,0,0,0.15)',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Step Card Header */}
                <div
                  onClick={() => setActiveStepId(isExpanded ? null : step.id)}
                  style={{
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: isExpanded ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: 'var(--bg-primary, #0f172a)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--color-accent, #3b82f6)',
                        border: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
                      }}
                    >
                      #{idx + 1}
                    </div>

                    <span style={{ fontSize: 20 }}>{action?.icon || '⚙️'}</span>

                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary, #f8fafc)' }}>
                          {step.name || action?.name || step.taskReferenceName}
                        </span>
                        {action?.riskLevel === 'sensitive' && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '1px 5px',
                              borderRadius: 4,
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#f87171',
                              fontWeight: 600,
                            }}
                          >
                            ⚠️ 敏感
                          </span>
                        )}
                        <LibraryVersionBadge
                          step={step}
                          action={action}
                          disabled={readOnly}
                          onUpgrade={(v) =>
                            handleUpdateStep(idx, {
                              ...step,
                              libraryRef: { name: step.libraryRef!.name, version: v },
                            })
                          }
                        />
                        {simResult && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: 'rgba(16, 185, 129, 0.2)',
                              color: '#34d399',
                              fontWeight: 600,
                            }}
                          >
                            ✓ 试跑成功
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-muted, #94a3b8)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {action?.description || step.description || step.taskReferenceName}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    {!readOnly && (
                      <>
                        <button
                          disabled={idx === 0}
                          onClick={() => handleMoveStep(idx, idx - 1)}
                          title="上移"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: idx === 0 ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary, #b0bec5)',
                            cursor: idx === 0 ? 'default' : 'pointer',
                            fontSize: 14,
                            padding: '4px',
                          }}
                        >
                          ↑
                        </button>
                        <button
                          disabled={idx === steps.length - 1}
                          onClick={() => handleMoveStep(idx, idx + 1)}
                          title="下移"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: idx === steps.length - 1 ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary, #b0bec5)',
                            cursor: idx === steps.length - 1 ? 'default' : 'pointer',
                            fontSize: 14,
                            padding: '4px',
                          }}
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => handleDeleteStep(idx)}
                          title="删除步骤"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: 14,
                            padding: '4px',
                          }}
                        >
                          🗑️
                        </button>
                      </>
                    )}

                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted, #94a3b8)',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    >
                      ▼
                    </span>
                  </div>
                </div>

                {/* Collapsible Form Body */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '14px 16px',
                      borderTop: '1px solid var(--border-primary)',
                      background: 'var(--bg-primary)',
                    }}
                  >
                    <ActionForm
                      step={step}
                      upstreamSteps={upstream}
                      registry={registry}
                      disabled={readOnly}
                      onChange={(updated) => handleUpdateStep(idx, updated)}
                    />
                  </div>
                )}
              </div>

              {/* In-between Add Step Button */}
              {!readOnly && (
                <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0' }}>
                  <button
                    onClick={() => setInsertModalIndex(idx + 1)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 16,
                      background: 'var(--bg-tertiary)',
                      border: '1px dashed var(--border-secondary)',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-accent, #3b82f6)';
                      e.currentTarget.style.color = 'var(--color-accent, #3b82f6)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-secondary)';
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }}
                  >
                    <span>+</span>
                    <span>插入业务动作</span>
                  </button>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      )}

      {/* Action Picker Modal */}
      {insertModalIndex !== null && (
        <ActionPickerModal
          registry={registry}
          stepNumber={insertModalIndex + 1}
          onClose={() => setInsertModalIndex(null)}
          onSelect={(action) => handleAddAction(action, insertModalIndex)}
          currentWorkflowLevel={currentWorkflowLevel}
          libraryCatalog={libraryCatalog}
        />
      )}
    </div>
  );
};
