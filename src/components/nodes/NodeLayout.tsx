import React, { memo } from 'react';
import { ExecutionStatus } from '../../types/workflow';
import ExecutionStatusBadge from './ExecutionStatusBadge';

const CJK_RE = /[一-龥]/;

interface NodeLayoutProps {
    icon: React.ElementType; // Lucide Icon Component
    header: string;          // Small uppercase label (e.g. HTTP)
    title: string;           // Main title (Reference Name)
    subTitle?: string;       // Optional secondary name (e.g. task.name when different from ref)
    meta?: string;           // Subtitle/Description
    duration?: string;       // Runtime execution duration (e.g. "120ms" / "1.45s")
    color: string;           // Accent color
    status?: ExecutionStatus;
    isRunning?: boolean;
    children?: React.ReactNode;
    width?: string | number; // 允许自定义宽度
    border?: boolean;        // 兼容旧属性
}

const NodeLayout = ({
    icon: Icon,
    header,
    title,
    subTitle,
    meta,
    duration,
    color,
    status,
    isRunning,
    children,
    width = '240px',
}: NodeLayoutProps) => {
    const statusAccent = isRunning && status
        ? status === 'COMPLETED' ? 'var(--status-completed)'
        : status === 'FAILED' || status === 'FAILED_WITH_TERMINAL_ERROR' ? 'var(--status-failed)'
        : status === 'IN_PROGRESS' || status === 'SCHEDULED' ? 'var(--status-in-progress)'
        : status === 'TIMED_OUT' || status === 'COMPLETED_WITH_ERRORS' ? 'var(--status-timed-out)'
        : color
        : color;

    const resolvedWidth = width === '240px' || width === 240 ? '237px' : width;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'row',
            width: resolvedWidth,
            height: children ? undefined : '81px',
            minHeight: '81px',
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '10px',
        }}>
            {/* Left Accent Bar + Icon Column */}
            <div style={{
                width: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                borderLeft: `3px solid ${statusAccent}`,
                borderRight: '1px solid var(--border-primary)',
                color: statusAccent,
                flexShrink: 0,
            }}>
                <Icon size={18} strokeWidth={1.75} />
            </div>

            {/* Right Column: Content */}
            <div style={{
                flex: 1,
                padding: '6px 12px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                overflow: 'hidden',
                minWidth: 0,
            }}>
                {/* Header Row: Task Type + Duration Pill */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    marginBottom: '2px',
                    paddingRight: isRunning && status ? '20px' : 0,
                }}>
                    <div style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        lineHeight: 1.2,
                        opacity: 0.85,
                        color: color,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        ...(CJK_RE.test(header) && {
                            letterSpacing: '0.2px',
                            fontSize: '11px',
                        }),
                    }}>
                        {header}
                    </div>

                    {isRunning && duration && (
                        <span style={{
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono, monospace)',
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-tertiary)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            flexShrink: 0,
                            lineHeight: 1.2,
                        }}>
                            {duration}
                        </span>
                    )}
                </div>

                {/* Title (Reference Name) */}
                <div style={{
                    fontSize: '13.5px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.25,
                    marginBottom: (subTitle || meta) ? '1px' : 0,
                }} title={title}>
                    {title}
                </div>

                {/* Secondary Name when task.name differs from taskReferenceName */}
                {subTitle && subTitle !== title && subTitle !== meta && (
                    <div style={{
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        lineHeight: 1.25,
                    }} title={subTitle}>
                        {subTitle}
                    </div>
                )}

                {/* Meta (Description / Expression) */}
                {meta && (
                    <div style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        lineHeight: 1.25,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }} title={meta}>
                        {meta}
                    </div>
                )}

                {children && <div style={{ marginTop: '6px' }}>
                    {children}
                </div>}
            </div>

            {/* Execution Status Badge (Absolute Top-Right) */}
            {isRunning && status && (
                <div style={{ position: 'absolute', top: '7px', right: '7px' }}>
                    <ExecutionStatusBadge status={status} />
                </div>
            )}
        </div>
    );
};

export default memo(NodeLayout);
