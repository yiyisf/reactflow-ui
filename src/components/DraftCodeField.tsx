import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { CircleAlert, Maximize2 } from 'lucide-react';

export interface DraftCodeFieldProps {
    label: string;
    /** 已提交的值（来自定义） */
    value: string;
    /** 失焦或全屏保存时调用；返回 null 表示已提交，返回字符串表示错误原因（草稿保留，显示错误） */
    onCommit: (draft: string) => string | null;
    editable: boolean;
    rows?: number;
    placeholder?: string;
    style?: CSSProperties;
    dataField?: string;
    secondaryTextColor?: string;
    onOpenFullscreen?: (current: string, apply: (text: string) => void) => void;
    onTextareaFocus?: (el: HTMLTextAreaElement) => void;
    /** 输入 `${` 等触发补全时调用；apply 用于把补全后的文本写回草稿并提交 */
    onTyping?: (el: HTMLTextAreaElement, next: string, apply: (text: string) => void) => void;
    /** 让外部（如快捷片段）可以把文本写入草稿 */
    registerApply?: (apply: ((text: string) => void) | null) => void;
}

/**
 * 带本地草稿的代码 / JSON 输入框（E18）：
 * 输入过程中不解析，失焦时才提交；提交失败时保留草稿并在下方说明原因，用户可以逐字输入不完整的 JSON。
 */
const DraftCodeField = ({
    label,
    value,
    onCommit,
    editable,
    rows = 5,
    placeholder,
    style,
    dataField,
    secondaryTextColor = 'var(--text-secondary)',
    onOpenFullscreen,
    onTextareaFocus,
    onTyping,
    registerApply,
}: DraftCodeFieldProps) => {
    const [draft, setDraft] = useState(value);
    const [editing, setEditing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 外部值变化（撤销、AI 填充等）且用户没在编辑、也没有待修正的错误时，同步草稿
    useEffect(() => {
        if (!editing && !error) setDraft(value);
    }, [value, editing, error]);

    const commit = (text: string) => {
        if (text === value) {
            setError(null);
            return;
        }
        setError(onCommit(text));
    };

    const apply = (text: string) => {
        setDraft(text);
        commit(text);
    };

    useEffect(() => {
        if (!registerApply) return;
        registerApply(apply);
        return () => registerApply(null);
    });

    return (
        <div style={{ marginBottom: '8px' }}>
            {(label || (editable && onOpenFullscreen)) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label style={{ fontSize: '10px', color: secondaryTextColor }}>{label}</label>
                    {editable && onOpenFullscreen && (
                        <button
                            type="button"
                            onClick={() => onOpenFullscreen(draft, apply)}
                            title="全屏编辑"
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: '2px 4px', color: 'var(--text-secondary)', opacity: 0.7, lineHeight: 1,
                            }}
                        >
                            <Maximize2 size={14} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                    )}
                </div>
            )}
            <textarea
                value={draft}
                placeholder={placeholder}
                disabled={!editable}
                rows={rows}
                data-field={dataField}
                aria-invalid={error ? true : undefined}
                onChange={(e) => {
                    const next = e.target.value;
                    setDraft(next);
                    onTyping?.(e.target, next, apply);
                }}
                onFocus={(e) => {
                    setEditing(true);
                    onTextareaFocus?.(e.currentTarget);
                }}
                onBlur={(e) => {
                    setEditing(false);
                    commit(e.target.value);
                }}
                style={{
                    width: '100%', padding: '12px', borderRadius: '8px',
                    border: `1px solid ${error ? 'var(--cm-status-failed)' : 'var(--glass-border)'}`,
                    background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                    fontSize: '12px', fontFamily: 'var(--font-mono, monospace)', lineHeight: '1.5',
                    resize: 'vertical',
                    ...style,
                    ...(error ? { borderColor: 'var(--cm-status-failed)' } : {}),
                }}
            />
            {error && (
                <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginTop: '4px', fontSize: '11px', color: 'var(--cm-status-failed)', lineHeight: 1.5 }}>
                    <CircleAlert size={14} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
};

export default DraftCodeField;

