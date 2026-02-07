import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmDialog = ({ message, onConfirm, onCancel }: ConfirmDialogProps) => {
    const cancelRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        cancelRef.current?.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="确认操作"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000,
                backdropFilter: 'blur(4px)',
                animation: 'fadeIn 0.15s ease-out'
            }}
            onClick={onCancel}
        >
            <div
                style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-secondary)',
                    borderRadius: '12px',
                    padding: '24px',
                    maxWidth: '400px',
                    width: '90%',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
                    animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    marginBottom: '20px',
                    lineHeight: '1.5'
                }}>
                    {message}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                        ref={cancelRef}
                        onClick={onCancel}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            fontSize: '13px'
                        }}
                    >
                        取消
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#ef4444',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600
                        }}
                    >
                        确定
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
