import { useEffect } from 'react';

export interface ToastMessage {
    id: string;
    text: string;
    type?: 'success' | 'error' | 'info';
}

interface ToastProps {
    messages: ToastMessage[];
    onDismiss: (id: string) => void;
}

const TOAST_COLORS = {
    success: { bg: 'var(--cm-status-success)', text: 'var(--text-primary)' },
    error: { bg: 'var(--cm-status-failed)', text: 'var(--text-primary)' },
    info: { bg: 'var(--color-accent)', text: 'var(--text-primary)' }
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
    const colors = TOAST_COLORS[message.type || 'info'];

    useEffect(() => {
        const timer = setTimeout(() => onDismiss(message.id), 2500);
        return () => clearTimeout(timer);
    }, [message.id, onDismiss]);

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                backgroundColor: colors.bg,
                color: colors.text,
                padding: '10px 20px',
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
            {message.text}
        </div>
    );
};

export default Toast;
