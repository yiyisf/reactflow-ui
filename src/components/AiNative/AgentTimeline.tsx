/**
 * AgentTimeline — visible work-in-progress log for the current agent turn (M2.2 + PI Durable 4-Phase Stepper)
 *
 * Replaces the single toolStatus line with:
 * 1. A 4-Phase Synthesis Progress Bar ("① 蓝图定义 → ② 拓扑编排 → ③ 参数与数据流 → ④ 整体校验") when progressive synthesis is active
 * 2. A growing list of completed steps ("✓ 已搜索工作流库", "✓ 阶段 2/4：已编排 5 个任务拓扑骨架")
 * 3. The current in-flight step as a spinner row
 */

import React from 'react';
import type { TimelineEntry } from '../../store/aiStore';
import type { SynthesisPhase } from '../../services/ai/workflowSynthesizer';
import { collectAllTasksInOrder } from '../../services/ai/workflowSynthesizer';
import type { WorkflowDef } from '../../types/conductor';

interface AgentTimelineProps {
    entries: TimelineEntry[];
    /** Current in-flight step label, or '' when nothing is actively running */
    activeLabel: string;
    /** Optional current 4-phase synthesis stage */
    synthesisPhase?: SynthesisPhase;
    /** Optional in-progress working draft */
    workingDraft?: WorkflowDef | null;
}

const SYNTHESIS_PHASES: Array<{ key: SynthesisPhase; label: string; stepNum: number }> = [
    { key: 'blueprint', label: '蓝图定义', stepNum: 1 },
    { key: 'topology', label: '拓扑编排', stepNum: 2 },
    { key: 'configure', label: '任务配置', stepNum: 3 },
    { key: 'verify', label: '整体校验', stepNum: 4 },
];

function getPhaseIndex(phase?: SynthesisPhase): number {
    if (!phase || phase === 'idle') return -1;
    if (phase === 'completed') return 4;
    return SYNTHESIS_PHASES.findIndex(p => p.key === phase);
}

const AgentTimeline: React.FC<AgentTimelineProps> = ({
    entries,
    activeLabel,
    synthesisPhase = 'idle',
    workingDraft,
}) => {
    const phaseIdx = getPhaseIndex(synthesisPhase);
    const showPhaseStepper = phaseIdx >= 0;

    if (entries.length === 0 && !activeLabel && !showPhaseStepper) return null;

    const draftTaskCount = workingDraft ? collectAllTasksInOrder(workingDraft.tasks ?? []).length : 0;

    return (
        <div className="ai-agent-timeline" role="status" aria-live="polite">
            {showPhaseStepper && (
                <div className="ai-synthesis-stepper" aria-label="四阶段渐进式生成进度">
                    <div className="ai-synthesis-stepper-header">
                        <span className="ai-synthesis-stepper-badge">PI Durable 渐进式构建</span>
                        {workingDraft?.name && (
                            <span className="ai-synthesis-draft-pill">
                                {workingDraft.name}
                                {draftTaskCount > 0 ? ` · ${draftTaskCount} 节点` : ''}
                            </span>
                        )}
                    </div>
                    <div className="ai-synthesis-steps">
                        {SYNTHESIS_PHASES.map((p, idx) => {
                            const status =
                                idx < phaseIdx ? 'done' : idx === phaseIdx ? 'active' : 'pending';
                            return (
                                <React.Fragment key={p.key}>
                                    <div className={`ai-synthesis-step ${status}`}>
                                        <span className="ai-synthesis-step-dot">
                                            {status === 'done' ? '✓' : p.stepNum}
                                        </span>
                                        <span className="ai-synthesis-step-text">{p.label}</span>
                                    </div>
                                    {idx < SYNTHESIS_PHASES.length - 1 && (
                                        <span
                                            className={`ai-synthesis-step-line ${idx < phaseIdx ? 'done' : ''}`}
                                        />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>
            )}
            {entries.map(entry => (
                <div key={entry.id} className={`ai-agent-timeline-item ${entry.icon}`}>
                    <span className="ai-agent-timeline-icon">{entry.icon === 'warning' ? '⚠' : '✓'}</span>
                    <span className="ai-agent-timeline-label">{entry.label}</span>
                </div>
            ))}
            {activeLabel && (
                <div className="ai-agent-timeline-item active">
                    <span className="ai-agent-timeline-spinner" />
                    <span className="ai-agent-timeline-label">{activeLabel}</span>
                </div>
            )}
        </div>
    );
};

export default AgentTimeline;
