/**
 * AgentTimeline — visible work-in-progress log for the current agent turn (M2.2)
 *
 * Replaces the single toolStatus line with a growing list of completed steps
 * ("✓ 已搜索工作流库", "⚠ 发现 2 处校验问题，正在自动修正…") plus the current
 * in-flight step as a spinner row. Self-heal retries log their own entry instead
 * of silently redoing the request, so users see the AI catch and fix its own
 * mistakes rather than experiencing an unexplained pause.
 */

import React from 'react';
import type { TimelineEntry } from '../../store/aiStore';

interface AgentTimelineProps {
    entries: TimelineEntry[];
    /** Current in-flight step label, or '' when nothing is actively running */
    activeLabel: string;
}

const AgentTimeline: React.FC<AgentTimelineProps> = ({ entries, activeLabel }) => {
    if (entries.length === 0 && !activeLabel) return null;

    return (
        <div className="ai-agent-timeline" role="status" aria-live="polite">
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
