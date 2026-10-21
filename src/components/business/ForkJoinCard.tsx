import React, { useState } from 'react';
import type { BusinessStep, ForkLane } from '../../stepmodel/types';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import type { ActionDefinition } from '../../actions/types';
import { ActionForm } from './ActionForm';
import { NestedControlStep } from './NestedControlStep';
import { createStepFromAction } from '../../stepmodel/factory';

export interface ForkJoinCardProps {
  step: BusinessStep;
  upstreamSteps: BusinessStep[];
  registry?: ActionRegistry;
  disabled?: boolean;
  onChange: (updated: BusinessStep) => void;
  onOpenInsertModal: (callback: (action: ActionDefinition) => void) => void;
  /** 嵌套深度：顶层卡片为 0，其内部子控制流依次 +1 */
  depth?: number;
}

export const ForkJoinCard: React.FC<ForkJoinCardProps> = ({
  step,
  upstreamSteps,
  registry = defaultActionRegistry,
  disabled = false,
  onChange,
  onOpenInsertModal,
  depth = 0,
}) => {
  const lanes: ForkLane[] = step.forkLanes || [];
  const [activeLaneId, setActiveLaneId] = useState<string>(lanes[0]?.laneId || 'lane_0');
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);

  // 更新泳道内步骤
  const handleUpdateLaneSteps = (laneId: string, newSteps: BusinessStep[]) => {
    const nextLanes = lanes.map((l) => {
      if (l.laneId === laneId) {
        return { ...l, steps: newSteps };
      }
      return l;
    });
    onChange({
      ...step,
      forkLanes: nextLanes,
    });
  };

  // 新增并行泳道
  const handleAddLane = () => {
    const nextIdx = lanes.length;
    const newLane: ForkLane = {
      laneId: `lane_${nextIdx}_${Date.now().toString(36).slice(-4)}`,
      laneLabel: `并发泳道 #${nextIdx + 1}`,
      steps: [],
    };
    const nextLanes = [...lanes, newLane];
    onChange({
      ...step,
      forkLanes: nextLanes,
    });
    setActiveLaneId(newLane.laneId);
  };

  // 删除并行泳道
  const handleDeleteLane = (laneId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (lanes.length <= 1) {
      alert('至少需要保留一条并行泳道');
      return;
    }
    if (!confirm('确定要删除此条并行泳道及其内部步骤吗？')) return;
    const nextLanes = lanes.filter((l) => l.laneId !== laneId);
    onChange({
      ...step,
      forkLanes: nextLanes,
    });
    if (activeLaneId === laneId) {
      setActiveLaneId(nextLanes[0]?.laneId || '');
    }
  };

  // 在指定泳道追加新步骤
  const handleAddStepToLane = (laneId: string) => {
    const targetLane = lanes.find((l) => l.laneId === laneId);
    if (!targetLane) return;

    onOpenInsertModal((action) => {
      const newChildStep: BusinessStep = createStepFromAction(action);
      handleUpdateLaneSteps(laneId, [...targetLane.steps, newChildStep]);
    });
  };

  const totalStepsInLanes = lanes.reduce((acc, l) => acc + (l.steps?.length || 0), 0);

  return (
    <div
      style={{
        borderRadius: 12,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-secondary)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
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
              background: 'rgba(59, 130, 246, 0.15)',
              color: 'var(--color-accent, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            ⚡
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                {step.name || '并行并发任务组'}
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'var(--color-accent-bg, rgba(59, 130, 246, 0.12))',
                  color: 'var(--color-accent-text, #1e40af)',
                  fontWeight: 600,
                  border: '1px solid color-mix(in srgb, var(--color-accent, #3b82f6) 30%, transparent)',
                }}
              >
                ⚡ 并行并发 (Fork / Join)
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              同时并发执行 {lanes.length} 条独立业务泳道 · 涵盖 {totalStepsInLanes} 个并发步骤
            </div>
          </div>
        </div>

        {!disabled && (
          <button
            onClick={handleAddLane}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              background: 'var(--bg-secondary)',
              border: '1px dashed var(--border-secondary)',
              color: 'var(--text-primary)',
              fontSize: 11,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>+</span>
            <span>新增并发泳道</span>
          </button>
        )}
      </div>

      {/* 泳道并排多列展示网格 */}
      <div
        style={{
          padding: '14px 16px',
          background: 'var(--bg-primary)',
          display: 'grid',
          gridTemplateColumns: lanes.length > 1 ? `repeat(${Math.min(lanes.length, 3)}, minmax(240px, 1fr))` : '1fr',
          gap: 12,
          overflowX: 'auto',
        }}
      >
        {lanes.map((lane, lIdx) => (
          <div
            key={lane.laneId}
            style={{
              borderRadius: 8,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* 泳道头部 */}
            <div
              style={{
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                borderBottom: '1px solid var(--border-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13 }}>🏊</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {lane.laneLabel || `泳道 #${lIdx + 1}`}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '0 5px',
                    borderRadius: 8,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {lane.steps.length} 步
                </span>
              </div>

              {!disabled && lanes.length > 1 && (
                <button
                  onClick={(e) => handleDeleteLane(lane.laneId, e)}
                  title="删除此泳道"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: '2px 4px',
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* 泳道内部步骤列表 */}
            <div
              style={{
                padding: 10,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                minHeight: 80,
              }}
            >
              {lane.steps.length === 0 ? (
                <div
                  style={{
                    padding: '16px 8px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    border: '1px dashed var(--border-secondary)',
                    borderRadius: 6,
                  }}
                >
                  此泳道暂无步骤
                </div>
              ) : (
                lane.steps.map((childStep, cIdx) => {
                  if (childStep.controlType) {
                    return (
                      <NestedControlStep
                        key={childStep.id}
                        step={childStep}
                        index={cIdx}
                        depth={depth + 1}
                        upstreamSteps={[...upstreamSteps, ...lane.steps.slice(0, cIdx)]}
                        registry={registry}
                        disabled={disabled}
                        onChange={(updatedChild) => {
                          const nextSteps = [...lane.steps];
                          nextSteps[cIdx] = updatedChild;
                          handleUpdateLaneSteps(lane.laneId, nextSteps);
                        }}
                        onDelete={() => {
                          const nextSteps = lane.steps.filter((_, idx) => idx !== cIdx);
                          handleUpdateLaneSteps(lane.laneId, nextSteps);
                        }}
                        onOpenInsertModal={onOpenInsertModal}
                      />
                    );
                  }

                  const childAction = registry.getAction(childStep.actionId);
                  const isExpanded = expandedChildId === childStep.id;

                  return (
                    <div
                      key={childStep.id}
                      style={{
                        borderRadius: 6,
                        background: 'var(--bg-primary)',
                        border: isExpanded
                          ? '1px solid var(--color-accent, #3b82f6)'
                          : '1px solid var(--border-primary)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        onClick={() => setExpandedChildId(isExpanded ? null : childStep.id)}
                        style={{
                          padding: '6px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                          <span style={{ fontSize: 14 }}>{childAction?.icon || '⚙️'}</span>
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
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                          {!disabled && (
                            <button
                              onClick={() => {
                                const nextSteps = lane.steps.filter((_, idx) => idx !== cIdx);
                                handleUpdateLaneSteps(lane.laneId, nextSteps);
                              }}
                              title="删除此步骤"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                fontSize: 11,
                                padding: '1px 3px',
                              }}
                            >
                              🗑️
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
                            onClick={() => setExpandedChildId(isExpanded ? null : childStep.id)}
                          >
                            ▼
                          </span>
                        </div>
                      </div>

                      {/* 展开的表单配置 */}
                      {isExpanded && (
                        <div
                          style={{
                            padding: '10px 10px',
                            borderTop: '1px solid var(--border-primary)',
                            background: 'var(--bg-secondary)',
                          }}
                        >
                          <ActionForm
                            step={childStep}
                            upstreamSteps={[...upstreamSteps, ...lane.steps.slice(0, cIdx)]}
                            registry={registry}
                            disabled={disabled}
                            onChange={(updatedChild) => {
                              const nextSteps = [...lane.steps];
                              nextSteps[cIdx] = updatedChild;
                              handleUpdateLaneSteps(lane.laneId, nextSteps);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* 泳道底部追加按钮 */}
              {!disabled && (
                <button
                  onClick={() => handleAddStepToLane(lane.laneId)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    background: 'transparent',
                    border: '1px dashed var(--border-secondary)',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    cursor: 'pointer',
                    marginTop: 2,
                  }}
                >
                  + 追加并发步骤
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 底部汇聚同步条 (Join) */}
      <div
        style={{
          padding: '8px 16px',
          background: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border-primary)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🔗</span>
          <span>
            <strong>汇聚同步点 (Join)</strong>：所有 {lanes.length} 条并行泳道内步骤全部执行完毕后，在同步节点汇聚并继续向下执行。
          </span>
        </div>
        {step.pairedJoinTaskRef && (
          <code
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              background: 'var(--bg-secondary)',
              padding: '1px 6px',
              borderRadius: 4,
            }}
          >
            {step.pairedJoinTaskRef}
          </code>
        )}
      </div>
    </div>
  );
};
