import React, { memo } from 'react';
import { ExecutionStatus } from '../../types/workflow';
import ExecutionStatusBadge from './ExecutionStatusBadge';

interface NodeLayoutProps {
    icon: React.ElementType; // Lucide Icon Component
    header: string;          // Small uppercase label (e.g. HTTP)
    title: string;           // Main title (Reference Name)
    meta?: string;           // Subtitle/Description
    color: string;           // Accent color
    status?: ExecutionStatus;
    isRunning?: boolean;
    children?: React.ReactNode;
    width?: string | number; // 允许自定义宽度
    border?: boolean;        // 允许控制是否显示边框
}

const NodeLayout = ({
    icon: Icon,
    header,
    title,
    meta,
    color,
    status,
    isRunning,
    children,
    width = '240px',
    border = true
}: NodeLayoutProps) => {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'row',
            width: width,
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
            border: border ? '4px solid var(--border-primary)' : 'none',
            borderRadius: '8px'
        }}>
            {/* Left Column: Icon */}
            <div style={{
                width: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(205, 74, 74, 0.03)',
                borderRight: '1px solid var(--color-accent)',
                color: color
            }}>
                <Icon size={20} strokeWidth={1.5} />
            </div>

            {/* Right Column: Content */}
            <div style={{
                flex: 1,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                overflow: 'hidden'
            }}>
                {/* Header (Task Type / Label) */}
                <div style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    opacity: 0.7,
                    marginBottom: '4px',
                    color: color
                }}>
                    {header}
                </div>

                {/* Title (Reference Name) */}
                <div style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginBottom: '2px'
                }} title={title}>
                    {title}
                </div>

                {/* Meta (Description / Expression) */}
                {meta && (
                    <div style={
                        {
                            fontSize: '11px',
                            color: 'var(--text-secondary)',
                            fontStyle: 'italic',
                            lineHeight: '1.4',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }
                    } title={meta}>
                        {meta}
                    </div>
                )}

                {children && <div style={{ marginTop: '8px' }}>
                    {children}
                </div>}
            </div>

            {/* Execution Status Badge (Absolute) */}
            {isRunning && status && (
                <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                    <ExecutionStatusBadge status={status} />
                </div>
            )}
        </div>
    );
};

export default memo(NodeLayout);
