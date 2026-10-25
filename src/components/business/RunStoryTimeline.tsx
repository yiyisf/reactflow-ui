import React, { useState } from 'react';
import type { WorkflowInstance, TaskInstance } from '../../types/conductor';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import { FriendlyErrorCard } from './FriendlyErrorCard';
import { CmIcon } from '../icons/CmIcon';
import { getStatusMeta } from '../../utils/statusMeta';
import { generateStorySentence, runHeadline } from '../../utils/runStory';
import { translateTechnicalError, type FriendlyErrorDiagnosis } from '../../utils/friendlyErrorTranslator';

export interface RunStoryTimelineProps {
  instance: WorkflowInstance;
  registry?: ActionRegistry;
  onInspectStep?: (taskRef: string) => void;
  /**
   * Handles the fix button of a failed step's diagnosis card (reauth / retry / change_spec / contact_admin).
   * `inspect_upstream` is handled here through `onInspectStep` (it jumps to the previous step). Without a handler the
   * button is not shown.
   */
  onErrorAction?: (actionKey: FriendlyErrorDiagnosis['actionKey'], taskRef: string) => void;
}

export const RunStoryTimeline: React.FC<RunStoryTimelineProps> = ({
  instance,
  registry = defaultActionRegistry,
  onInspectStep,
  onErrorAction,
}) => {
  const [expandedDetailsMap, setExpandedDetailsMap] = useState<Record<string, boolean>>({});

  const toggleDetails = (ref: string) => {
    setExpandedDetailsMap((prev) => ({
      ...prev,
      [ref]: !prev[ref],
    }));
  };

  const tasks = instance.tasks || [];
  // B11: the banner follows the real workflow status (running / terminated / paused are not "all done").
  const headline = runHeadline(instance);
  const wfMeta = getStatusMeta(instance.status);
  const toneColor = wfMeta.color;

  /** Error-card button handler for a step, or undefined when nothing can handle it (B13: no dead buttons). */
  const errorActionFor = (task: TaskInstance, idx: number, actionKey: FriendlyErrorDiagnosis['actionKey']) => {
    if (!actionKey) return undefined;
    if (actionKey === 'inspect_upstream') {
      const upstream = tasks.slice(0, idx).reverse().find((t) => t.referenceTaskName);
      if (!onInspectStep || !upstream) return undefined;
      return () => onInspectStep(upstream.referenceTaskName);
    }
    if (!onErrorAction) return undefined;
    return () => onErrorAction(actionKey, task.referenceTaskName);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '16px 20px',
        background: 'var(--bg-primary)',
        height: '100%',
        overflowY: 'auto',
        fontFamily: 'inherit',
      }}
    >
      {/* 顶部总体状态横幅 */}
      <div
        style={{
          padding: '12px 18px',
          borderRadius: 10,
          background: `color-mix(in srgb, ${toneColor} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${toneColor} 30%, transparent)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {React.createElement(wfMeta.icon, { size: 22, strokeWidth: 1.75, 'aria-hidden': true, style: { color: toneColor } })}
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                color: toneColor,
              }}
            >
              {headline.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              执行 ID: <span style={{ fontFamily: 'var(--cm-font-mono)' }}>{instance.workflowId}</span> · 共 {tasks.length} 个步骤
              {headline.durationSec !== undefined && ` · 总耗时约 ${headline.durationSec} 秒`}
            </div>
          </div>
        </div>

        <span
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 4,
            fontWeight: 600,
            background: `color-mix(in srgb, ${toneColor} 15%, transparent)`,
            color: toneColor,
          }}
          title={instance.status}
        >
          {wfMeta.label}
        </span>
      </div>

      {/* 故事线纵向时间轴卡片列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tasks.map((task, idx) => {
          const actionId = task.workflowTask?.inputParameters?._actionId;
          const action = actionId ? registry.getAction(actionId) : undefined;
          const taskIcon =
            action?.icon ||
            (task.taskType === 'DECISION' || task.taskType === 'SWITCH'
              ? 'shuffle'
              : task.taskType === 'FORK_JOIN' || task.taskType === 'FORK_JOIN_DYNAMIC'
              ? 'zap'
              : task.taskType === 'JOIN'
              ? 'merge'
              : task.taskType === 'DO_WHILE'
              ? 'repeat'
              : task.taskType === 'WAIT'
              ? 'hourglass'
              : task.taskType === 'HUMAN'
              ? 'user'
              : 'settings');
          const stepMeta = getStatusMeta(task.status);
          const isTaskFailed = stepMeta.isFailure;
          const isExpanded = Boolean(expandedDetailsMap[task.referenceTaskName]);
          const stepName = action?.name || task.taskDefName || task.referenceTaskName;

          // B12: sentence from the real output; B11: the badge uses the real status.
          const storySentence = generateStorySentence(task, { actionId, actionName: action?.name, allTasks: tasks });
          const rawError = task.reasonForIncompletion || (isTaskFailed ? `步骤状态为 ${task.status}，没有返回失败原因` : undefined);
          const diagnosisKey = isTaskFailed ? translateTechnicalError(rawError, undefined, stepName).actionKey : undefined;
          const onCardAction = errorActionFor(task, idx, diagnosisKey);
          const timeStr = task.startTime ? new Date(task.startTime).toLocaleTimeString() : '--:--:--';
          const taskDuration =
            task.endTime && task.startTime ? `${((task.endTime - task.startTime) / 1000).toFixed(2)}s` : '';

          return (
            <div
              key={task.taskId || task.referenceTaskName || idx}
              style={{
                borderRadius: 10,
                background: 'var(--bg-secondary)',
                border: isTaskFailed
                  ? '1px solid var(--status-failed)'
                  : '1px solid var(--border-primary)',
                boxShadow: isTaskFailed ? '0 4px 16px color-mix(in srgb, var(--cm-status-failed) 12%, transparent)' : 'none',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {/* 头部摘要行 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {stepMeta.status === 'COMPLETED'
                    ? <CmIcon name={taskIcon} size={18} />
                    : React.createElement(stepMeta.icon, { size: 18, strokeWidth: 1.75, 'aria-hidden': true, style: { color: stepMeta.color } })}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                        步骤 #{idx + 1}: {stepName}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: `color-mix(in srgb, ${stepMeta.color} 15%, transparent)`,
                          color: stepMeta.color,
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                        title={task.status}
                      >
                        {React.createElement(stepMeta.icon, { size: 10, strokeWidth: 1.75, 'aria-hidden': true })}
                        {stepMeta.label}
                      </span>
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {timeStr} {taskDuration && `· 耗时 ${taskDuration}`}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {onInspectStep && (
                    <button
                      onClick={() => onInspectStep(task.referenceTaskName)}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'transparent',
                        border: '1px solid var(--border-secondary)',
                        color: 'var(--text-secondary)',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      定位步骤
                    </button>
                  )}

                  <button
                    onClick={() => toggleDetails(task.referenceTaskName)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {isExpanded ? '收起数据 ▴' : '查看数据 ▾'}
                  </button>
                </div>
              </div>

              {/* 自然语言业务故事句子 */}
              <div
                style={{
                  fontSize: 12,
                  color: isTaskFailed ? 'var(--status-failed)' : 'var(--text-secondary)',
                  lineHeight: 1.5,
                  padding: '4px 0',
                }}
              >
                {storySentence}
              </div>

              {/* 若任务失败，自动内嵌生活化诊断卡片 */}
              {isTaskFailed && (
                <div style={{ marginTop: 4 }}>
                  <FriendlyErrorCard
                    rawError={rawError}
                    taskName={stepName}
                    onActionClick={onCardAction}
                  />
                </div>
              )}

              {/* 折叠的关键业务数据胶囊 */}
              {isExpanded && task.outputData && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  {Object.entries(task.outputData).map(([k, v]) => {
                    if (typeof v === 'object' && v !== null) return null;
                    return (
                      <span
                        key={k}
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: 'var(--color-accent-bg, color-mix(in srgb, var(--color-accent) 12%, transparent))',
                          border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontFamily: 'monospace',
                        }}
                      >
                        <span style={{ color: 'var(--text-muted)' }}>{k}:</span>
                        <span style={{ color: 'var(--color-accent-text)', fontWeight: 600 }}>{String(v)}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
