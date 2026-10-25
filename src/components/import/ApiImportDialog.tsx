import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import useWorkflowStore from '../../store/workflowStore';
import type { ActionDefinition } from '../../actions/types';
import { parseApiText } from '../../import/detect';
import { buildHttpAction } from '../../import/buildAction';
import { CURL_SAMPLE } from '../../import/curl';
import { applyToVisible, initialSelection, visibleSlice } from '../../import/selection';
import type { ImportFormat, ImportedOperation, ParseResult } from '../../import/types';
import { TriangleAlert, X } from 'lucide-react';

/** 单次最多渲染的接口行数（大型 OpenAPI 可能有上千个）；超出请用搜索缩小范围 */
const RENDER_LIMIT = 200;
/** 上传文件大小上限 */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface ApiImportInsertInfo {
    format: ImportFormat;
    /** 本次插入的步骤数 */
    count: number;
    /** 解析时产生的提示（敏感头替换、不支持的部分等） */
    warnings: string[];
}

export interface ApiImportDialogProps {
    open: boolean;
    onClose: () => void;
    /**
     * 确认插入：actions 为所选接口生成的 HTTP 业务动作（按文档顺序）。
     * 调用方负责把动作注册到动作库并把步骤追加到流程（可用 `appendImportedActions`）；
     * 对话框在回调返回后自动关闭。B2 向导的「从接口导入」可直接复用本组件。
     */
    onInsert: (actions: ActionDefinition[], info: ApiImportInsertInfo) => void;
    /** 已存在的动作 id，用于避免重复导入时 id 冲突 */
    existingActionIds?: Iterable<string>;
}

const FORMAT_LABEL: Record<ImportFormat, string> = {
    openapi3: 'OpenAPI 3',
    swagger2: 'Swagger 2',
    postman21: 'Postman Collection',
    curl: 'curl 命令',
};

const PLACEHOLDER = `粘贴 OpenAPI 3 / Swagger 2 / Postman Collection v2.1（JSON）或 curl 命令，也可点击右侧「选择文件」。

示例 curl：
${CURL_SAMPLE}

注意：仅支持 JSON，YAML 请先转为 JSON 后再导入。`;

function methodColor(method: string): string {
    switch (method) {
        case 'GET': return 'var(--color-info)';
        case 'POST': return 'var(--color-success)';
        case 'PUT':
        case 'PATCH': return 'var(--color-warning)';
        case 'DELETE': return 'var(--color-error)';
        default: return 'var(--text-secondary)';
    }
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * 接口导入对话框：粘贴或上传 -> 识别格式 -> 勾选接口 -> 插入为步骤。
 * 外层仅在打开时挂载内容，因此每次打开都是干净状态。
 */
export const ApiImportDialog: React.FC<ApiImportDialogProps> = (props) => {
    if (!props.open || typeof document === 'undefined') return null;
    return <ApiImportDialogBody {...props} />;
};

const ApiImportDialogBody: React.FC<ApiImportDialogProps> = ({ onClose, onInsert, existingActionIds }) => {
    const { theme, themeColor } = useWorkflowStore(useShallow((s) => ({ theme: s.theme, themeColor: s.themeColor })));
    const [text, setText] = useState('');
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showAllWarnings, setShowAllWarnings] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const result = useMemo<ParseResult | null>(() => (text.trim() ? parseApiText(text) : null), [text]);
    const operations: ImportedOperation[] = useMemo(() => (result && result.ok ? result.operations : []), [result]);

    // R16: 解析出新的接口列表时，全部能显示才默认全选；超出显示上限时默认不选，避免插入看不到的接口
    useEffect(() => {
        setSelected(initialSelection(operations, RENDER_LIMIT));
        setSearch('');
        setShowAllWarnings(false);
    }, [operations]);

    // 打开时聚焦输入框，关闭时把焦点还给触发按钮
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        textareaRef.current?.focus();
        return () => {
            if (previous && typeof previous.focus === 'function') previous.focus();
        };
    }, []);

    const keyword = search.trim().toLowerCase();
    const filtered = useMemo(
        () =>
            operations.filter(
                (o) =>
                    !keyword ||
                    `${o.method} ${o.path} ${o.summary || ''} ${o.operationId || ''} ${o.tags.join(' ')}`.toLowerCase().includes(keyword),
            ),
        [operations, keyword],
    );
    const { visible, hiddenCount } = visibleSlice(filtered, RENDER_LIMIT);
    const selectedCount = operations.filter((o) => selected.has(o.id)).length;

    const toggle = (id: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    // 全选 / 全不选只作用于当前显示的行
    const setAllVisible = (on: boolean) => setSelected((prev) => applyToVisible(prev, visible, on));

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        setFileError(null);
        if (file.size > MAX_FILE_BYTES) {
            setFileError(`文件超过 ${MAX_FILE_BYTES / 1024 / 1024} MB，请精简后再导入`);
            return;
        }
        try {
            const content = await file.text();
            setFileName(file.name);
            setText(content);
        } catch {
            setFileError('读取文件失败，请重试或直接粘贴内容');
        }
    };

    const handleInsert = () => {
        if (!result || !result.ok || selectedCount === 0) return;
        const taken = new Set<string>(existingActionIds || []);
        const actions: ActionDefinition[] = [];
        for (const op of operations) {
            if (!selected.has(op.id)) continue;
            const action = buildHttpAction(op, { existingIds: taken });
            taken.add(action.id);
            actions.push(action);
        }
        onInsert(actions, { format: result.format, count: actions.length, warnings: result.warnings });
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
            return;
        }
        if (e.key === 'Tab' && dialogRef.current) {
            const items = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE)) as HTMLElement[];
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };

    const warnings = result && result.ok ? result.warnings : [];
    const shownWarnings = showAllWarnings ? warnings : warnings.slice(0, 5);

    const buttonBase: React.CSSProperties = {
        height: 28,
        padding: '0 12px',
        borderRadius: 6,
        fontSize: 12,
        fontFamily: 'inherit',
        cursor: 'pointer',
        border: '1px solid var(--border-secondary)',
        background: 'transparent',
        color: 'var(--text-secondary)',
    };

    return createPortal(
        // 弹窗渲染在 document.body 下，需显式带上主题属性，否则主题变量失效
        <div
            data-mode={theme}
            data-brand={themeColor}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'var(--cm-overlay)',
                backdropFilter: 'blur(2px)',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                fontFamily: 'inherit',
                colorScheme: theme === 'light' ? 'light' : 'dark',
            }}
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="api-import-title"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleKeyDown}
                style={{
                    width: 820,
                    maxWidth: 'calc(100vw - 48px)',
                    height: 'min(700px, 90vh)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 12,
                    boxShadow: 'var(--cm-shadow-float)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* 标题 */}
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div id="api-import-title" style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>
                        导入接口
                        <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>
                            把已有接口变成可复用的 HTTP 步骤
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="关闭"
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 4, lineHeight: 1 }}
                    >
                        <X size={14} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                </div>

                {/* 输入区 */}
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea
                        ref={textareaRef}
                        aria-label="接口文档或 curl 命令"
                        value={text}
                        onChange={(e) => {
                            setText(e.target.value);
                            setFileName(null);
                        }}
                        placeholder={PLACEHOLDER}
                        spellCheck={false}
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            height: operations.length > 0 ? 72 : 150,
                            resize: 'vertical',
                            padding: '8px 10px',
                            borderRadius: 6,
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-secondary)',
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            lineHeight: 1.5,
                            outline: 'none',
                        }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 28 }}>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json,.txt,.curl,.sh,application/json,text/plain"
                            aria-label="选择接口文档文件"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                void handleFile(e.target.files?.[0]);
                                e.target.value = '';
                            }}
                        />
                        <button type="button" style={buttonBase} onClick={() => fileInputRef.current?.click()}>
                            选择文件
                        </button>
                        {fileName && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fileName}</span>}
                        <div style={{ flex: 1 }} />
                        {result && result.ok && (
                            <span
                                style={{
                                    fontSize: 11,
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    background: 'var(--color-accent-bg)',
                                    color: 'var(--color-accent-text)',
                                    border: '1px solid var(--color-accent)',
                                }}
                            >
                                已识别：{FORMAT_LABEL[result.format as ImportFormat]} · {operations.length} 个接口
                            </span>
                        )}
                    </div>
                    {fileError && (
                        <div role="alert" style={{ fontSize: 12, color: 'var(--color-error)' }}>
                            {fileError}
                        </div>
                    )}
                    {result && !result.ok && (
                        <div
                            role="alert"
                            style={{
                                fontSize: 12,
                                lineHeight: 1.5,
                                padding: '6px 10px',
                                borderRadius: 6,
                                color: result.format === 'yaml' ? 'var(--color-warning)' : 'var(--color-error)',
                                background: `color-mix(in srgb, ${result.format === 'yaml' ? 'var(--color-warning)' : 'var(--color-error)'} 12%, transparent)`,
                            }}
                        >
                            {result.error}
                        </div>
                    )}
                    {warnings.length > 0 && (
                        <div
                            role="status"
                            style={{
                                fontSize: 12,
                                lineHeight: 1.5,
                                padding: '6px 10px',
                                borderRadius: 6,
                                color: 'var(--text-primary)',
                                background: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)',
                                maxHeight: showAllWarnings ? 120 : undefined,
                                overflowY: showAllWarnings ? 'auto' : undefined,
                            }}
                        >
                            <div style={{ fontWeight: 600, color: 'var(--color-warning)' }}>提示（{warnings.length}）</div>
                            <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                                {shownWarnings.map((w) => (
                                    <li key={w}>{w}</li>
                                ))}
                            </ul>
                            {warnings.length > 5 && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllWarnings((v) => !v)}
                                    style={{ background: 'none', border: 'none', padding: 0, marginTop: 2, color: 'var(--color-accent-text)', cursor: 'pointer', fontSize: 12 }}
                                >
                                    {showAllWarnings ? '收起' : `展开全部 ${warnings.length} 条`}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* 接口列表 */}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    {operations.length > 0 ? (
                        <>
                            <div style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border-primary)' }}>
                                <input
                                    type="search"
                                    aria-label="搜索接口"
                                    placeholder="搜索方法、路径、摘要、标签…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    style={{
                                        flex: 1,
                                        padding: '5px 10px',
                                        borderRadius: 6,
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-secondary)',
                                        color: 'var(--text-primary)',
                                        fontSize: 12,
                                        outline: 'none',
                                    }}
                                />
                                <button type="button" style={buttonBase} onClick={() => setAllVisible(true)}>
                                    {hiddenCount > 0 ? `全选显示的 ${visible.length} 项` : `全选${keyword ? '结果' : ''}`}
                                </button>
                                <button type="button" style={buttonBase} onClick={() => setAllVisible(false)}>
                                    全不选
                                </button>
                            </div>
                            <ul style={{ flex: 1, overflowY: 'auto', listStyle: 'none', margin: 0, padding: '6px 12px' }} aria-label="接口列表">
                                {visible.map((op) => {
                                    const checked = selected.has(op.id);
                                    return (
                                        <li key={op.id}>
                                            <label
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                    padding: '7px 8px',
                                                    borderRadius: 6,
                                                    cursor: 'pointer',
                                                    background: checked ? 'var(--color-accent-bg)' : 'transparent',
                                                }}
                                            >
                                                <input type="checkbox" checked={checked} onChange={() => toggle(op.id)} style={{ accentColor: 'var(--color-accent)' }} />
                                                <span
                                                    style={{
                                                        flexShrink: 0,
                                                        minWidth: 52,
                                                        textAlign: 'center',
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        padding: '1px 6px',
                                                        borderRadius: 4,
                                                        color: methodColor(op.method),
                                                        background: `color-mix(in srgb, ${methodColor(op.method)} 15%, transparent)`,
                                                    }}
                                                >
                                                    {op.method}
                                                </span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, flexShrink: 0, maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={op.path}>
                                                    {op.path}
                                                </span>
                                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={op.summary || ''}>
                                                    {op.summary || ''}
                                                </span>
                                                {op.warnings.length > 0 && (
                                                    <span title={op.warnings.join('\n')} aria-label={`${op.warnings.length} 条提示`} style={{ color: 'var(--color-warning)', fontSize: 12, flexShrink: 0 }}>
                                                        <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
                                                    </span>
                                                )}
                                            </label>
                                        </li>
                                    );
                                })}
                                {filtered.length === 0 && (
                                    <li style={{ textAlign: 'center', padding: '28px 0', fontSize: 12, color: 'var(--text-muted)' }}>没有符合条件的接口</li>
                                )}
                                {hiddenCount > 0 && (
                                    <li style={{ textAlign: 'center', padding: '8px 0', fontSize: 12, color: 'var(--text-muted)' }}>
                                        另有 {hiddenCount} 个未显示，请用搜索缩小范围
                                    </li>
                                )}
                            </ul>
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontSize: 12, lineHeight: 1.7, color: 'var(--text-muted)' }}>
                            {result ? '' : '粘贴内容后会在这里列出可导入的接口'}
                        </div>
                    )}
                </div>

                {/* 底部操作 */}
                <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
                        认证信息不会写入流程定义；导入结果仅保存在当前流程与本次会话的动作库中
                    </span>
                    <button type="button" style={buttonBase} onClick={onClose}>
                        取消
                    </button>
                    <button
                        type="button"
                        disabled={selectedCount === 0}
                        onClick={handleInsert}
                        style={{
                            ...buttonBase,
                            border: '1px solid var(--color-accent)',
                            background: 'var(--color-accent)',
                            color: 'var(--text-inverse)',
                            fontWeight: 600,
                            opacity: selectedCount === 0 ? 0.5 : 1,
                            cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
                        }}
                    >
                        插入 {selectedCount} 个步骤
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};
