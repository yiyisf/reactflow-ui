import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useWorkflowStore from '../store/workflowStore';

interface FullscreenEditorProps {
    /** 标题，显示在顶部工具栏 */
    title: string;
    /** 当前值 */
    value: string;
    /** 语言提示标签（用于展示，不做真正语法高亮） */
    language?: string;
    /** 占位文本 */
    placeholder?: string;
    /** 保存回调（点击"应用"或 Ctrl+S 时触发） */
    onSave: (value: string) => void;
    /** 关闭（不保存）回调 */
    onClose: () => void;
}

/**
 * 全屏代码/表达式编辑器
 *
 * - 使用 createPortal 挂载到 document.body，脱离 ReactFlow transform 上下文
 * - Ctrl+S 保存并关闭，Escape 取消，顶部工具栏有"应用"与"取消"按钮
 * - 继承当前主题 CSS 变量
 */
const FullscreenEditor = ({
    title,
    value,
    language = 'text',
    placeholder = '',
    onSave,
    onClose,
}: FullscreenEditorProps) => {
    const { theme, themeColor } = useWorkflowStore();
    const [draft, setDraft] = useState(value);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        textareaRef.current?.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                e.stopPropagation();
                onSave(draft);
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft, onSave, onClose]);

    const LANG_COLORS: Record<string, string> = {
        javascript: '#f7df1e',
        js: '#f7df1e',
        json: '#89b4fa',
        jq: '#a6e3a1',
        groovy: '#4ec994',
        python: '#3572A5',
        text: 'var(--text-secondary)',
    };
    const langColor = LANG_COLORS[language.toLowerCase()] ?? 'var(--text-secondary)';

    return createPortal(
        <div
            data-mode={theme}
            data-brand={themeColor}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 3000,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-primary)',
            }}
            onClick={e => e.stopPropagation()}
        >
            {/* ── 顶部工具栏 ── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 20px',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--glass-border)',
                flexShrink: 0,
            }}>
                {/* 语言徽章 */}
                <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: langColor,
                    background: `${langColor}18`,
                    border: `1px solid ${langColor}44`,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    flexShrink: 0,
                }}>
                    {language}
                </span>

                {/* 标题 */}
                <span style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {title}
                </span>

                {/* 快捷键提示 */}
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flexShrink: 0 }}>
                    Ctrl+S 保存 · Esc 取消
                </span>

                {/* 取消按钮 */}
                <button
                    onClick={onClose}
                    style={{
                        padding: '6px 14px',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                        flexShrink: 0,
                    }}
                >
                    取消
                </button>

                {/* 应用按钮 */}
                <button
                    onClick={() => onSave(draft)}
                    style={{
                        padding: '6px 16px',
                        background: 'var(--color-accent)',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                        flexShrink: 0,
                    }}
                >
                    应用
                </button>
            </div>

            {/* ── 编辑区域 ── */}
            <textarea
                ref={textareaRef}
                value={draft}
                placeholder={placeholder}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => e.stopPropagation()} // 防止 ReactFlow 快捷键
                spellCheck={false}
                style={{
                    flex: 1,
                    width: '100%',
                    padding: '20px 24px',
                    background: 'var(--bg-primary)',
                    color: language === 'javascript' || language === 'js' || language === 'groovy'
                        ? 'var(--color-accent)'
                        : 'var(--text-primary)',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'var(--font-mono, "Fira Code", "Cascadia Code", Consolas, monospace)',
                    fontSize: '14px',
                    lineHeight: '1.7',
                    boxSizing: 'border-box',
                    caretColor: 'var(--color-accent)',
                }}
            />

            {/* ── 状态栏 ── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '5px 20px',
                background: 'var(--bg-secondary)',
                borderTop: '1px solid var(--glass-border)',
                flexShrink: 0,
                fontSize: '11px',
                color: 'var(--text-secondary)',
            }}>
                <span>{draft.split('\n').length} 行</span>
                <span>{draft.length} 字符</span>
                {draft !== value && (
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>● 未保存</span>
                )}
            </div>
        </div>,
        document.body
    );
};

export default FullscreenEditor;
