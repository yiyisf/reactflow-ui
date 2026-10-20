import React, { useState } from 'react';
import type { WorkflowInstance, TaskInstance } from '../../types/conductor';
import { ActionRegistry, defaultActionRegistry } from '../../actions/registry';
import { FriendlyErrorCard } from './FriendlyErrorCard';

export interface RunStoryTimelineProps {
  instance: WorkflowInstance;
  registry?: ActionRegistry;
  onInspectStep?: (taskRef: string) => void;
}

/**
 * 根据任务输出数据与动作定义生成通俗易懂的中文故事线描述
 */
function generateStorySentence(task: TaskInstance, registry: ActionRegistry): string {
  const out = task.outputData || {};
  const actionId = task.workflowTask?.inputParameters?._actionId;
  const action = actionId ? registry.getAction(actionId) : undefined;

  if (task.status === 'FAILED' || task.status === 'FAILED_WITH_TERMINAL_ERROR') {
    return `执行中断于此步骤，已触发异常诊断自愈建议。`;
  }

  if (actionId === 'ecs.create_instance') {
    const ip = out.privateIp ? ` · 分配内网 IP: ${out.privateIp}` : '';
    const id = out.instanceId ? ` · 实例 ID: ${out.instanceId}` : '';
    return `成功在可用区初始化并启动云主机${id}${ip}。`;
  }

  if (actionId === 'ecs.query_instance') {
    return `已查询获取主机实时状态 (${out.status || 'RUNNING'})，公网 IP: ${out.publicIp || '未绑定'}。`;
  }

  if (actionId === 'ecs.run_command') {
    return `远程运维脚本已成功在主机内执行完毕，命令批次: ${out.commandId || 'cmd-ok'}。`;
  }

  if (actionId === 'ecs.create_snapshot') {
    return `系统盘安全增量快照已成功归档，快照 ID: ${out.snapshotId || 's-done'}。`;
  }

  if (actionId === 'ecs.stop_instance') {
    return `云主机已安全关闭电源，当前状态: STOPPED。`;
  }

  if (actionId === 'ecs.start_instance') {
    return `云主机已开机并启动系统服务，当前状态: RUNNING。`;
  }

  if (actionId === 'ecs.modify_spec') {
    return `云主机硬件规格已在线变更生效 (${out.oldSpec || ''} → ${out.newSpec || ''})。`;
  }

  if (actionId === 'ecs.get_monitor_metrics') {
    return `采集到实时负载：CPU 利用率 ${out.cpuUsagePercent ?? 20}%，系统运行平稳。`;
  }

  if (actionId === 'notify.send_message') {
    return `运维协同卡片已成功推送至指定协同通知群，状态: DELIVERED。`;
  }

  if (actionId === 'control.wait' || task.taskType === 'WAIT') {
    return `系统安全缓冲等待完成，底层服务就绪。`;
  }

  if (actionId === 'human.approval' || task.taskType === 'HUMAN') {
    return `责任人 (${out.reviewer || 'devops_lead'}) 已完成审核批准。`;
  }

  return `${action?.name || task.taskDefName || task.referenceTaskName} 执行完毕。`;
}

export const RunStoryTimeline: React.FC<RunStoryTimelineProps> = ({
  instance,
  registry = defaultActionRegistry,
  onInspectStep,
}) => {
  const [expandedDetailsMap, setExpandedDetailsMap] = useState<Record<string, boolean>>({});

  const toggleDetails = (ref: string) => {
    setExpandedDetailsMap((prev) => ({
      ...prev,
      [ref]: !prev[ref],
    }));
  };

  const tasks = instance.tasks || [];
  const isFailed = instance.status === 'FAILED' || instance.status === 'TIMED_OUT';
  const totalDurationMs =
    instance.endTime && instance.startTime ? instance.endTime - instance.startTime : 0;
  const durationSec = (totalDurationMs / 1000).toFixed(1);

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
          background: isFailed ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
          border: `1px solid ${isFailed ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>{isFailed ? '❌' : '🎉'}</span>
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                color: isFailed ? 'var(--status-failed, #ef4444)' : 'var(--status-completed, #10b981)',
              }}
            >
              {isFailed ? '工作流执行中断' : '工作流全部步骤顺利执行完毕'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              执行 ID: {instance.workflowId} · 共执行 {tasks.length} 个步骤 · 总耗时约 {durationSec} 秒
            </div>
          </div>
        </div>

        <span
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 4,
            fontWeight: 600,
            background: isFailed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            color: isFailed ? 'var(--status-failed, #ef4444)' : 'var(--status-completed, #10b981)',
          }}
        >
          {instance.status}
        </span>
      </div>

      {/* 故事线纵向时间轴卡片列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tasks.map((task, idx) => {
          const actionId = task.workflowTask?.inputParameters?._actionId;
          const action = actionId ? registry.getAction(actionId) : undefined;
          const taskIcon = action?.icon || (task.taskType === 'WAIT' ? '⏳' : task.taskType === 'HUMAN' ? '👤' : '⚙️');
          const isTaskFailed = task.status === 'FAILED' || task.status === 'FAILED_WITH_TERMINAL_ERROR';
          const isExpanded = Boolean(expandedDetailsMap[task.referenceTaskName]);

          const storySentence = generateStorySentence(task, registry);
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
                  ? '1px solid var(--status-failed, #ef4444)'
                  : '1px solid var(--border-primary)',
                boxShadow: isTaskFailed ? '0 4px 16px rgba(239, 68, 68, 0.12)' : 'none',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {/* 头部摘要行 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{isTaskFailed ? '❌' : taskIcon}</span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                        步骤 #{idx + 1}: {action?.name || task.taskDefName || task.referenceTaskName}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: isTaskFailed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: isTaskFailed ? 'var(--status-failed, #ef4444)' : 'var(--status-completed, #10b981)',
                          fontWeight: 600,
                        }}
                      >
                        {isTaskFailed ? '执行失败' : '执行完成'}
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
                  color: isTaskFailed ? 'var(--status-failed, #ef4444)' : 'var(--text-secondary)',
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
                    rawError={task.reasonForIncompletion || '底层任务状态异常终止'}
                    taskName={action?.name || task.referenceTaskName}
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
                          background: 'var(--color-accent-bg, rgba(59, 130, 246, 0.12))',
                          border: '1px solid color-mix(in srgb, var(--color-accent, #3b82f6) 30%, transparent)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontFamily: 'monospace',
                        }}
                      >
                        <span style={{ color: 'var(--text-muted)' }}>{k}:</span>
                        <span style={{ color: 'var(--color-accent-text, #1e40af)', fontWeight: 600 }}>{String(v)}</span>
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
