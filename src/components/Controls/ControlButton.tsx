import React from 'react';

interface ControlButtonProps {
    onClick: () => void;
    icon?: React.ReactNode;
    label?: string;
    title?: string;
    disabled?: boolean;
    active?: boolean;
    variant?: 'default' | 'primary' | 'danger' | 'secondary';
    style?: React.CSSProperties;
}

const ControlButton: React.FC<ControlButtonProps> = ({
    onClick,
    icon,
    label,
    title,
    disabled = false,
    active = false,
    variant = 'default',
    style
}) => {
    let bg = 'var(--bg-tertiary)';
    let color = 'var(--text-primary)';
    let border = '1px solid var(--border-primary)';

    if (variant === 'primary') {
        bg = 'var(--color-accent)';
        color = '#fff';
        border = 'none';
    } else if (variant === 'danger') {
        bg = disabled ? 'rgba(239, 68, 68, 0.1)' : 'var(--status-failed)';
        color = disabled ? 'var(--text-secondary)' : '#fff';
        border = 'none';
    } else if (active) {
        bg = 'var(--bg-secondary)';
        color = 'var(--color-accent)';
        border = '1px solid var(--color-accent)';
    }

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: label ? '6px' : '0',
                background: bg,
                color: color,
                border: border,
                borderRadius: '6px',
                padding: label ? '6px 12px' : '8px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                fontSize: '13px',
                fontWeight: 500,
                transition: 'all 0.2s',
                minWidth: label ? 'auto' : '32px',
                height: '32px',
                boxShadow: variant === 'default' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                ...style
            }}
        >
            {icon && <span style={{ fontSize: '14px', display: 'flex' }}>{icon}</span>}
            {label && <span>{label}</span>}
        </button>
    );
};

export default ControlButton;
