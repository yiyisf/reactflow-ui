/**
 * BusinessCanvas — renders a WorkflowDef as business-friendly step cards
 * for non-technical users (business view mode).
 */
import React from 'react';
import type { WorkflowDef, TaskDef } from '../../types/conductor';
import { getTaskTypeMeta, toBusinessName } from '../../utils/taskTypeMeta';

interface BusinessCanvasProps {
    workflowDef: WorkflowDef | null;
    /** Task statuses from execution (ref → status) */
    executionStatus?: Record<string, string>;
    /** Called when user clicks a step to ask AI about it */
    onStepClick?: (taskRef: string, taskType: string) => void;
}

const STATUS_META: Record<string, { icon: string; color: string; label: string }> = {
    COMPLETED:  { icon: '✅', color: '#10b981', label: '已完成' },
    FAILED:     { icon: '❌', color: '#ef4444', label: '失败' },
    IN_PROGRESS:{ icon: '⏳', color: '#3b82f6', label: '进行中' },
    SCHEDULED:  { icon: '🕐', color: '#6366f1', label: '排队中' },
    SKIPPED:    { icon: '⏩', color: '#94a3b8', label: '已跳过' },
    TIMED_OUT:  { icon: '⏱️', color: '#f59e0b', label: '超时' },
};

// Render a single task step card
function StepCard({ task, index, status, onClick }: {
    task: TaskDef;
    index: number;
    status?: string;
    onClick?: () => void;
}) {
    const meta = getTaskTypeMeta(task.type);
    const statusMeta = status ? STATUS_META[status] : null;

    // For SWITCH, show branches
    const isBranch = task.type === 'SWITCH';
    const isFork = task.type === 'FORK_JOIN' || task.type === 'FORK_JOIN_DYNAMIC';
    const isHuman = task.type === 'HUMAN';

    const cardClass = [
        'biz-step-card',
        isBranch ? 'branch' : '',
        isFork ? 'fork' : '',
        isHuman ? 'human' : '',
        status ? `status-${status.toLowerCase()}` : '',
        onClick ? 'clickable' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={cardClass} onClick={onClick} style={{ '--step-color': meta.color } as React.CSSProperties}>
            {/* Step number + type badge */}
            <div className="biz-step-header">
                <div className="biz-step-number" style={{ background: meta.color }}>
                    {statusMeta ? statusMeta.icon : String(index + 1)}
                </div>
                <div className="biz-step-meta">
                    <span className="biz-step-type-badge" style={{ color: meta.color, background: meta.color + '18' }}>
                        {meta.icon} {meta.label}
                    </span>
                    {isHuman && <span className="biz-step-human-badge">👤 需要人工</span>}
                </div>
                {statusMeta && (
                    <span className="biz-step-status" style={{ color: statusMeta.color }}>
                        {statusMeta.label}
                    </span>
                )}
            </div>

            {/* Step name */}
            <div className="biz-step-name">
                {task.name || toBusinessName(task.taskReferenceName)}
            </div>

            {/* Who does this */}
            <div className="biz-step-who">
                <span className="biz-step-who-icon">
                    {isHuman ? '👤' : '🤖'}
                </span>
                {meta.who}
                {task.type === 'SUB_WORKFLOW' && task.subWorkflowParam?.name && (
                    <span className="biz-step-sub-name"> — {task.subWorkflowParam.name}</span>
                )}
            </div>

            {/* Branch info for SWITCH */}
            {isBranch && task.decisionCases && (
                <div className="biz-step-branches">
                    <div className="biz-step-branches-label">分支条件</div>
                    <div className="biz-step-branch-list">
                        {Object.keys(task.decisionCases).map(branch => (
                            <span key={branch} className="biz-step-branch-tag">{branch}</span>
                        ))}
                        <span className="biz-step-branch-tag default">默认</span>
                    </div>
                </div>
            )}

            {/* Fork parallel info */}
            {isFork && task.forkTasks && (
                <div className="biz-step-parallel">
                    <span className="biz-step-parallel-label">
                        并行 {task.forkTasks.length} 条路径
                    </span>
                </div>
            )}

            {/* Timeout hint */}
            {task.timeoutSeconds && task.timeoutSeconds > 0 && (
                <div className="biz-step-timeout">
                    ⏱ 超时 {task.timeoutSeconds >= 60
                        ? Math.round(task.timeoutSeconds / 60) + ' 分钟'
                        : task.timeoutSeconds + ' 秒'}
                </div>
            )}
        </div>
    );
}

const BusinessCanvas: React.FC<BusinessCanvasProps> = ({ workflowDef, executionStatus = {}, onStepClick }) => {
    if (!workflowDef) {
        return (
            <div className="biz-canvas-empty">
                <div className="biz-canvas-empty-icon">📋</div>
                <div className="biz-canvas-empty-text">暂无工作流</div>
                <div className="biz-canvas-empty-hint">在左侧对话框描述您的业务需求，AI 将为您设计流程</div>
            </div>
        );
    }

    const tasks = workflowDef.tasks ?? [];

    return (
        <div className="biz-canvas">
            {/* Workflow header */}
            <div className="biz-canvas-header">
                <div className="biz-canvas-title">{workflowDef.name || '未命名流程'}</div>
                {workflowDef.description && (
                    <div className="biz-canvas-desc">{workflowDef.description}</div>
                )}
                <div className="biz-canvas-meta">
                    <span className="biz-canvas-step-count">{tasks.length} 个步骤</span>
                    {workflowDef.version && (
                        <span className="biz-canvas-version">版本 {workflowDef.version}</span>
                    )}
                </div>
            </div>

            {/* Steps flow */}
            <div className="biz-canvas-flow">
                {/* Start node */}
                <div className="biz-flow-start">
                    <span>开始</span>
                </div>
                <div className="biz-flow-connector" />

                {/* Step cards */}
                {tasks.map((task, i) => (
                    <React.Fragment key={task.taskReferenceName}>
                        <StepCard
                            task={task}
                            index={i}
                            status={executionStatus[task.taskReferenceName]}
                            onClick={onStepClick ? () => onStepClick(task.taskReferenceName, task.type) : undefined}
                        />
                        {i < tasks.length - 1 && <div className="biz-flow-connector" />}
                    </React.Fragment>
                ))}

                <div className="biz-flow-connector" />
                {/* End node */}
                <div className="biz-flow-end">
                    <span>结束</span>
                </div>
            </div>
        </div>
    );
};

export default BusinessCanvas;
