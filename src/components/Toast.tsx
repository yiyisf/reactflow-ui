import { useEffect } from 'react';
import { CircleCheck, CircleX, Info } from 'lucide-react';

export interface ToastMessage {
    id: string;
    text: string;
    type?: 'success' | 'error' | 'info';
}

interface ToastProps {
    messages: ToastMessage[];
    onDismiss: (id: string) => void;
}

// 规则 5：状态 = 颜色 + 图标 + 文字。表面色底 + 正文色文字，深浅两套主题都清晰；info 不用橙色（规则 3）
const TOAST_TONES = {
    success: { color: 'var(--cm-status-success)', Icon: CircleCheck },
    error: { color: 'var(--cm-status-failed)', Icon: CircleX },
    info: { color: 'var(--cm-text-secondary)', Icon: Info },
};

const Toast = ({ messages, onDismiss }: ToastProps) => {
    if (messages.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 3000,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            pointerEvents: 'none'
        }}>
            {messages.map(msg => (
                <ToastItem key={msg.id} message={msg} onDismiss={onDismiss} />
            ))}
        </div>
    );
};

const ToastItem = ({ message, onDismiss }: { message: ToastMessage; onDismiss: (id: string) => void }) => {
    const { color, Icon } = TOAST_TONES[message.type || 'info'];

    useEffect(() => {
        const timer = setTimeout(() => onDismiss(message.id), 2500);
        return () => clearTimeout(timer);
    }, [message.id, onDismiss]);

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                backgroundColor: 'var(--cm-surface-2)',
                color: 'var(--text-primary)',
                border: `1px solid color-mix(in srgb, ${color} 55%, transparent)`,
                padding: '10px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                boxShadow: 'var(--cm-shadow-float)',
                animation: 'toastSlideUp 0.3s ease-out',
                pointerEvents: 'auto',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
            }}
            onClick={() => onDismiss(message.id)}
        >
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" style={{ color, flexShrink: 0 }} />
            {message.text}
        </div>
    );
};

export default Toast;
