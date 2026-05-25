import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useWorkflowStore from '../store/workflowStore';

interface PromptDialogProps {
    title: string;
    /** 输入框上方的说明文字（可选） */
    label?: string;
    defaultValue?: string;
    placeholder?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
}

/**
 * 页面内输入弹框，替代 window.prompt。
 * 使用 createPortal 渲染到 document.body，继承 CSS 主题变量。
 */
const PromptDialog = ({
    title,
    label,
    defaultValue = '',
    placeholder = '',
    confirmText = '确定',
    cancelText = '取消',
    onConfirm,
    onCancel,
}: PromptDialogProps) => {
    const { theme, themeColor } = useWorkflowStore();
    const [value, setValue] = useState(defaultValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // 自动聚焦并全选，方便直接输入新值
        if (inputRef.current) {
            inputRef.current.focus({ preventScroll: true });
            inputRef.current.select();
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCancel();
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [onCancel]);

    const handleConfirm = () => {
        const trimmed = value.trim();
        if (trimmed) onConfirm(trimmed);
    };

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
                aria-label={title}
                onClick={e => e.stopPropagation()}
                style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '10px',
                    padding: '24px 28px',
                    maxWidth: '400px',
                    width: '90%',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.22)',
                }}
            >
                {/* 标题 */}
                <div style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '16px',
                }}>
                    {title}
                </div>

                {/* 说明标签 */}
                {label && (
                    <div style={{
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        marginBottom: '8px',
                    }}>
                        {label}
                    </div>
                )}

                {/* 输入框 */}
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    placeholder={placeholder}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
                        e.stopPropagation(); // 防止 ReactFlow 快捷键被触发
                    }}
                    style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-primary)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box',
                        marginBottom: '20px',
                        transition: 'border-color 0.15s',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-primary)'; }}
                />

                {/* 操作按钮 */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
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
                        {cancelText}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!value.trim()}
                        style={{
                            padding: '7px 18px',
                            backgroundColor: value.trim() ? 'var(--color-accent)' : 'var(--bg-tertiary)',
                            border: 'none',
                            borderRadius: '6px',
                            color: value.trim() ? '#ffffff' : 'var(--text-secondary)',
                            cursor: value.trim() ? 'pointer' : 'not-allowed',
                            fontSize: '13px',
                            fontWeight: 600,
                            transition: 'background-color 0.15s, color 0.15s',
                        }}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default PromptDialog;
