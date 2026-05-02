import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import useWorkflowStore from '../store/workflowStore';

interface ConfirmDialogProps {
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmDialog = ({ message, onConfirm, onCancel }: ConfirmDialogProps) => {
    const cancelRef = useRef<HTMLButtonElement>(null);
    const { theme, themeColor } = useWorkflowStore();

    useEffect(() => {
        // preventScroll 避免 focus 触发浏览器滚动导致 ReactFlow 视图偏移
        cancelRef.current?.focus({ preventScroll: true });

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

    // Portal 渲染到 document.body，脱离 ReactFlow CSS transform 上下文，
    // 避免 position:fixed 相对祖先定位导致 canvas 变灰。
    // 在 Portal 根节点上保留 data-mode / data-brand，使 CSS 主题变量正常继承。
    return createPortal(
        <div
            data-mode={theme}
            data-brand={themeColor}
            onClick={onCancel}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000,
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="确认操作"
                onClick={e => e.stopPropagation()}
                style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '8px',
                    padding: '24px 28px',
                    maxWidth: '380px',
                    width: '90%',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
                }}
            >
                <div style={{
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    marginBottom: '24px',
                    lineHeight: '1.6',
                }}>
                    {message}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                        ref={cancelRef}
                        onClick={onCancel}
                        style={{
                            padding: '7px 18px',
                            backgroundColor: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                        }}
                    >
                        取消
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '7px 18px',
                            backgroundColor: 'var(--color-accent)',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                        }}
                    >
                        确定
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ConfirmDialog;
