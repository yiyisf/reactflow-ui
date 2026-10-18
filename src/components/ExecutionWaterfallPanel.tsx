import React, { useMemo } from 'react';
import useWorkflowStore from '../store/workflowStore';
import type { TaskInstance } from '../types/conductor';

export const ExecutionWaterfallPanel: React.FC = () => {
  const {
    mode,
    showWaterfallPanel,
    setShowWaterfallPanel,
    workflowInstance,
    executionData,
    taskMap,
    selectedTask,
    setSelectedTask,
    setSelectedTaskInstance,
    timeTravelTimestamp,
    setTimeTravelTimestamp,
  } = useWorkflowStore();

  const timelineInfo = useMemo(() => {
    const rawTasks: TaskInstance[] = workflowInstance?.tasks?.length
      ? (workflowInstance.tasks as TaskInstance[])
      : executionData
      ? Object.values(executionData).flatMap((d) => d.attempts)
      : [];

    if (rawTasks.length === 0) return null;

    const validTasks = rawTasks.filter((t) => t.startTime || t.scheduledTime);
    if (validTasks.length === 0) return null;

    const minTime = Math.min(
      ...validTasks.map((t) => t.scheduledTime || t.startTime || Date.now())
    );
    const maxTime = Math.max(
      ...validTasks.map((t) => t.endTime || t.startTime || t.scheduledTime || minTime + 100)
    );
    const totalSpanMs = Math.max(maxTime - minTime, 50);

    // Compute execution duration for each task to identify Critical Path bottleneck (top 25% slowest non-container tasks)
    const nonContainerDurations = validTasks
      .filter((t) => !['FORK_JOIN', 'JOIN', 'DO_WHILE', 'SWITCH', 'DECISION'].includes(t.taskType))
      .map((t) => Math.max((t.endTime || maxTime) - (t.startTime || t.scheduledTime || minTime), 0))
      .sort((a, b) => b - a);

    const bottleneckThresholdMs =
      nonContainerDurations.length > 0
        ? Math.max(nonContainerDurations[Math.floor(nonContainerDurations.length * 0.25)] || 80, 50)
        : 100;

    const rows = validTasks.map((t, index) => {
      const sched = t.scheduledTime || t.startTime || minTime;
      const start = t.startTime || sched;
      const end = t.endTime || maxTime;
      const queueMs = Math.max(start - sched, 0);
      const execMs = Math.max(end - start, 1);
      const isCritical =
        !['FORK_JOIN', 'JOIN', 'DO_WHILE', 'SWITCH', 'DECISION'].includes(t.taskType) &&
        execMs >= bottleneckThresholdMs;

      const queueLeftPct = ((sched - minTime) / totalSpanMs) * 100;
      const queueWidthPct = (queueMs / totalSpanMs) * 100;
      const execLeftPct = ((start - minTime) / totalSpanMs) * 100;
      const execWidthPct = Math.max((execMs / totalSpanMs) * 100, 1.2);

      return {
        key: t.taskId || `${t.referenceTaskName}-${index}`,
        task: t,
        sched,
        start,
        end,
        queueMs,
        execMs,
        isCritical,
        queueLeftPct,
        queueWidthPct,
        execLeftPct,
        execWidthPct,
      };
    });

    return {
      minTime,
      maxTime,
      totalSpanMs,
      rows,
    };
  }, [workflowInstance, executionData]);

  if (mode !== 'run' || !showWaterfallPanel || !timelineInfo) return null;

  const { minTime, totalSpanMs, rows } = timelineInfo;
  const currentScrubMs = timeTravelTimestamp !== null ? timeTravelTimestamp - minTime : totalSpanMs;
  const scrubPct = Math.min(Math.max((currentScrubMs / totalSpanMs) * 100, 0), 100);

  const statusColor = (status?: string) => {
    switch (status) {
      case 'COMPLETED':
        return '#10b981';
      case 'FAILED':
      case 'FAILED_WITH_TERMINAL_ERROR':
      case 'TIMED_OUT':
        return '#ef4444';
      case 'IN_PROGRESS':
        return '#38bdf8';
      default:
        return '#94a3b8';
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        right: selectedTask ? 466 : 16,
        bottom: 16,
        height: 255,
        zIndex: 1100,
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'right 0.25s ease',
      }}
    >
      {/* Top Bar: Title + Time-Travel Scrubber + Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '8px 14px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
          background: 'rgba(2, 6, 23, 0.55)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>
            📊 并发执行瀑布流 & 时间旅行调试器
          </span>
          <span
            style={{
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 999,
              background: 'rgba(56, 189, 248, 0.14)',
              color: '#38bdf8',
              fontFamily: 'monospace',
              fontWeight: 600,
            }}
          >
            总跨度 {totalSpanMs}ms · {rows.length} 个任务步
          </span>
          <span
            style={{
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 999,
              background: 'rgba(249, 115, 22, 0.15)',
              color: '#fb923c',
              fontWeight: 600,
            }}
          >
            🔥 关键路径耗时瓶颈高亮
          </span>
        </div>

        {/* Time-Travel Scrubber */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 420 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>
            ⏪ 时间旅行指针:
          </span>
          <input
            type="range"
            min={0}
            max={totalSpanMs}
            value={currentScrubMs}
            onChange={(e) => {
              const offset = Number(e.target.value);
              if (offset >= totalSpanMs) {
                setTimeTravelTimestamp(null);
              } else {
                setTimeTravelTimestamp(minTime + offset);
              }
            }}
            style={{ flex: 1, cursor: 'pointer', accentColor: '#38bdf8' }}
          />
          <span
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: timeTravelTimestamp !== null ? '#fbbf24' : '#34d399',
              fontWeight: 700,
              minWidth: 74,
              textAlign: 'right',
            }}
          >
            {timeTravelTimestamp !== null ? `+${currentScrubMs}ms` : '最新态 (Live)'}
          </span>
          {timeTravelTimestamp !== null && (
            <button
              type="button"
              onClick={() => setTimeTravelTimestamp(null)}
              style={{
                fontSize: 10,
                padding: '2px 7px',
                borderRadius: 4,
                border: '1px solid rgba(251, 191, 36, 0.4)',
                background: 'rgba(251, 191, 36, 0.12)',
                color: '#fbbf24',
                cursor: 'pointer',
              }}
            >
              重置
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowWaterfallPanel(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 15,
            padding: '2px 6px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Gantt Rows */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative', padding: '6px 0' }}>
        {rows.map((row) => {
          const baseRef = row.task.referenceTaskName.replace(/__\d+$/, '');
          const isSelected = selectedTask?.taskReferenceName === baseRef;
          const isFutureInTimeTravel =
            timeTravelTimestamp !== null && row.start > timeTravelTimestamp;
          const isRunningInTimeTravel =
            timeTravelTimestamp !== null &&
            row.start <= timeTravelTimestamp &&
            row.end > timeTravelTimestamp;

          return (
            <div
              key={row.key}
              onClick={() => {
                const defTask = taskMap[baseRef] || (row.task.workflowTask as any);
                if (defTask) {
                  setSelectedTask(defTask);
                  setSelectedTaskInstance(row.task);
                }
              }}
              style={{
                display: 'grid',
                gridTemplateColumns: '210px 1fr 90px',
                alignItems: 'center',
                gap: 8,
                padding: '4px 14px',
                cursor: 'pointer',
                background: isSelected
                  ? 'rgba(56, 189, 248, 0.14)'
                  : 'transparent',
                opacity: isFutureInTimeTravel ? 0.35 : 1,
                borderLeft: isSelected ? '3px solid #38bdf8' : '3px solid transparent',
              }}
            >
              {/* Task Name + Iteration / Critical Path Badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: isRunningInTimeTravel
                      ? '#38bdf8'
                      : statusColor(row.task.status),
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: '#e2e8f0',
                    fontWeight: isSelected ? 700 : 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={row.task.referenceTaskName}
                >
                  {row.task.referenceTaskName}
                </span>
                {row.isCritical && (
                  <span
                    title="关键路径耗时瓶颈节点"
                    style={{
                      fontSize: 9,
                      padding: '1px 4px',
                      borderRadius: 4,
                      background: 'rgba(249, 115, 22, 0.2)',
                      color: '#fb923c',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    🔥瓶颈
                  </span>
                )}
              </div>

              {/* Timeline Track */}
              <div
                style={{
                  position: 'relative',
                  height: 14,
                  background: 'rgba(15, 23, 42, 0.65)',
                  borderRadius: 4,
                  overflow: 'hidden',
                  border: '1px solid rgba(148, 163, 184, 0.1)',
                }}
              >
                {/* Queue Wait Segment */}
                {row.queueWidthPct > 0.3 && (
                  <div
                    title={`排队等待: ${row.queueMs}ms`}
                    style={{
                      position: 'absolute',
                      left: `${row.queueLeftPct}%`,
                      width: `${row.queueWidthPct}%`,
                      top: 3,
                      bottom: 3,
                      background: 'rgba(148, 163, 184, 0.35)',
                      borderRadius: '2px 0 0 2px',
                    }}
                  />
                )}
                {/* Execution Segment */}
                <div
                  title={`执行耗时: ${row.execMs}ms (排队 ${row.queueMs}ms)`}
                  style={{
                    position: 'absolute',
                    left: `${row.execLeftPct}%`,
                    width: `${row.execWidthPct}%`,
                    top: 2,
                    bottom: 2,
                    borderRadius: 3,
                    background: row.isCritical
                      ? 'linear-gradient(90deg, #f97316, #ef4444)'
                      : statusColor(row.task.status),
                    boxShadow: isRunningInTimeTravel
                      ? '0 0 8px rgba(56, 189, 248, 0.8)'
                      : undefined,
                  }}
                />
                {/* Time-Travel Vertical Cursor Line */}
                {timeTravelTimestamp !== null && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${scrubPct}%`,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      background: '#fbbf24',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </div>

              {/* Duration Text */}
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'monospace',
                  color: row.isCritical ? '#fb923c' : '#94a3b8',
                  textAlign: 'right',
                  fontWeight: row.isCritical ? 700 : 400,
                }}
              >
                {row.execMs}ms
                {row.queueMs > 0 ? (
                  <span style={{ opacity: 0.6, fontSize: 9 }}> (+{row.queueMs}q)</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ExecutionWaterfallPanel;
