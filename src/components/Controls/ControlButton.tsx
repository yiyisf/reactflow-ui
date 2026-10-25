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
        color = 'var(--color-on-accent)';
        border = 'none';
    } else if (variant === 'danger') {
        bg = disabled ? 'var(--cm-failed-tint)' : 'var(--status-failed)';
        color = disabled ? 'var(--text-secondary)' : 'var(--color-on-danger)';
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
            aria-label={title || label}
            aria-pressed={active}
            aria-disabled={disabled}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: label ? '6px' : '0',
                background: bg,
                color: color,
                border: border,
                borderRadius: '7px',
                padding: label ? '4px 10px' : '6px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.45 : 1,
                fontSize: '12px',
                fontWeight: 500,
                transition: 'all 0.18s',
                minWidth: label ? 'auto' : '30px',
                height: '30px',
                whiteSpace: 'nowrap',
                boxShadow: variant === 'default' ? 'var(--cm-shadow-card)' : 'none',
                ...style
            }}
        >
            {icon && <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center' }}>{icon}</span>}
            {label && <span>{label}</span>}
        </button>
    );
};

export default ControlButton;
