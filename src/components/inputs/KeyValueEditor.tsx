import { useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { WorkflowDef } from '../../types/conductor';
import { getAvailableReferences, ReferenceOption } from '../../utils/referenceContext';
import ReferencePicker from './ReferencePicker';
import './KeyValueEditor.css';

interface KVRow {
    id: string;
    key: string;
    value: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
}

export interface KeyValueEditorRef {
    /** 向最近一次获得焦点的 value 输入框末尾追加片段（无焦点时新增一行） */
    insertAtFocused: (snippet: string) => void;
}

interface KeyValueEditorProps {
    value: Record<string, any>;
    onChange: (v: Record<string, any>) => void;
    disabled?: boolean;
    /** 当前任务的 taskReferenceName（用于引用上下文计算） */
    taskRef?: string;
    /** 完整工作流定义（用于引用上下文计算） */
    workflowDef?: WorkflowDef;
    placeholder?: string;
}

let _rowIdCounter = 0;
const genId = () => `kv-${++_rowIdCounter}-${Date.now()}`;

function parseToRows(obj: Record<string, any>): KVRow[] {
    return Object.entries(obj).map(([key, val]) => {
        let type: KVRow['type'] = 'string';
        let strVal = '';
        if (typeof val === 'number') { type = 'number'; strVal = String(val); }
        else if (typeof val === 'boolean') { type = 'boolean'; strVal = String(val); }
        else if (Array.isArray(val)) { type = 'array'; strVal = JSON.stringify(val, null, 2); }
        else if (val !== null && typeof val === 'object') { type = 'object'; strVal = JSON.stringify(val, null, 2); }
        else { type = 'string'; strVal = val == null ? '' : String(val); }
        return { id: genId(), key, value: strVal, type };
    });
}

function rowsToObject(rows: KVRow[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (const row of rows) {
        if (!row.key.trim()) continue;
        try {
            if (row.type === 'number') result[row.key] = row.value === '' ? undefined : Number(row.value);
            else if (row.type === 'boolean') result[row.key] = row.value === 'true';
            else if (row.type === 'object' || row.type === 'array') result[row.key] = JSON.parse(row.value || (row.type === 'array' ? '[]' : '{}'));
            else result[row.key] = row.value;
        } catch {
            result[row.key] = row.value;
        }
    }
    return result;
}

/** 根据内容行数计算 textarea rows（最少 2，最多 10） */
function calcTextareaRows(text: string): number {
    const lines = text.split('\n').length;
    return Math.max(2, Math.min(lines + 1, 10));
}

const KeyValueEditor = forwardRef<KeyValueEditorRef, KeyValueEditorProps>(function KeyValueEditor({
    value,
    onChange,
    disabled = false,
    taskRef,
    workflowDef,
    placeholder,
}, ref) {
    const [rows, setRows] = useState<KVRow[]>(() => parseToRows(value));
    const [advancedMode, setAdvancedMode] = useState(false);
    const [jsonText, setJsonText] = useState(() => JSON.stringify(value, null, 2));
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerAnchor, setPickerAnchor] = useState<DOMRect | undefined>();
    const [activeRowId, setActiveRowId] = useState<string | null>(null);

    // P5.1.2 片段插入：追踪最后获得焦点的行
    const lastFocusedRowId = useRef<string | null>(null);

    const references: ReferenceOption[] = (taskRef && workflowDef)
        ? getAvailableReferences(workflowDef, taskRef)
        : [];

    const commitRows = useCallback((nextRows: KVRow[]) => {
        setRows(nextRows);
        const obj = rowsToObject(nextRows);
        setJsonText(JSON.stringify(obj, null, 2));
        onChange(obj);
    }, [onChange]);

    useImperativeHandle(ref, () => ({
        insertAtFocused: (snippet: string) => {
            const rowId = lastFocusedRowId.current;
            setRows(prev => {
                let nextRows: KVRow[];
                if (!rowId) {
                    nextRows = [...prev, { id: genId(), key: '', value: snippet, type: 'string' }];
                } else {
                    nextRows = prev.map(r =>
                        r.id === rowId ? { ...r, value: r.value ? `${r.value}${snippet}` : snippet } : r
                    );
                }
                const obj = rowsToObject(nextRows);
                setJsonText(JSON.stringify(obj, null, 2));
                onChange(obj);
                return nextRows;
            });
        }
    }), [onChange]);

    const updateRow = (id: string, patch: Partial<KVRow>) => {
        commitRows(rows.map(r => r.id === id ? { ...r, ...patch } : r));
    };

    const addRow = () => {
        commitRows([...rows, { id: genId(), key: '', value: '', type: 'string' }]);
    };

    const removeRow = (id: string) => {
        commitRows(rows.filter(r => r.id !== id));
    };

    const handleJsonChange = (text: string) => {
        setJsonText(text);
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                setJsonError(null);
                setRows(parseToRows(parsed));
                onChange(parsed);
            } else {
                setJsonError('顶层必须是 JSON 对象');
            }
        } catch (e: any) {
            setJsonError(e.message ?? 'JSON 格式错误');
        }
    };

    const openPicker = (rowId: string, e: React.MouseEvent) => {
        setActiveRowId(rowId);
        setPickerAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
        setPickerOpen(true);
    };

    const onPickerSelect = (expr: string) => {
        if (!activeRowId) return;
        const row = rows.find(r => r.id === activeRowId);
        if (!row) return;
        updateRow(activeRowId, { value: row.value ? `${row.value}${expr}` : expr, type: 'string' });
    };

    const switchToAdvanced = () => {
        setJsonText(JSON.stringify(rowsToObject(rows), null, 2));
        setAdvancedMode(true);
    };

    const switchToRows = () => {
        if (jsonError) return;
        try {
            setRows(parseToRows(JSON.parse(jsonText)));
        } catch { /* keep current rows */ }
        setAdvancedMode(false);
        setJsonError(null);
    };

    // ── 高级 JSON 模式 ──
    if (advancedMode) {
        const entryCount = Object.keys(rowsToObject(rows)).length;
        return (
            <div className="kv-editor">
                <div className="kv-advanced">
                    <div className="kv-mode-bar">
                        <span className="kv-mode-label">
                            高级 JSON 模式
                            {entryCount > 0 && (
                                <span className="kv-mode-count">{entryCount} 项</span>
                            )}
                        </span>
                        <button className="kv-mode-btn" onClick={switchToRows} disabled={!!jsonError}>
                            ← 结构化模式
                        </button>
                    </div>
                    <textarea
                        className={`kv-json-textarea${jsonError ? ' kv-json-error' : ''}`}
                        value={jsonText}
                        onChange={e => handleJsonChange(e.target.value)}
                        disabled={disabled}
                        rows={Math.max(6, calcTextareaRows(jsonText))}
                        spellCheck={false}
                        placeholder={placeholder || '{\n  "key": "value"\n}'}
                    />
                    {jsonError && (
                        <div className="kv-error-msg">
                            <span>⚠️</span>
                            <span>{jsonError}</span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── 结构化模式（卡片列表）──
    return (
        <div className="kv-editor">
            <div className="kv-list">
                {rows.length === 0 && !disabled && (
                    <div className="kv-empty">{placeholder || '点击"+ 添加字段"开始配置参数'}</div>
                )}
                {rows.map(row => (
                    <div key={row.id} className="kv-param">
                        {/* 第一行：key + type + 操作 */}
                        <div className="kv-param-header">
                            <input
                                className="kv-key-input"
                                value={row.key}
                                placeholder="参数名"
                                disabled={disabled}
                                onChange={e => updateRow(row.id, { key: e.target.value })}
                            />
                            <select
                                className="kv-type-select"
                                value={row.type}
                                disabled={disabled}
                                onChange={e => updateRow(row.id, { type: e.target.value as KVRow['type'] })}
                            >
                                <option value="string">string</option>
                                <option value="number">number</option>
                                <option value="boolean">bool</option>
                                <option value="object">object</option>
                                <option value="array">array</option>
                            </select>
                            {!disabled && references.length > 0 && (
                                <button
                                    className="kv-ref-btn"
                                    title="插入 ${...} 引用"
                                    onMouseDown={e => { e.preventDefault(); lastFocusedRowId.current = row.id; openPicker(row.id, e); }}
                                >
                                    🔗
                                </button>
                            )}
                            {!disabled && (
                                <button className="kv-del-btn" onClick={() => removeRow(row.id)} title="删除">✕</button>
                            )}
                        </div>

                        {/* 第二行：value（全宽） */}
                        <div className="kv-param-value">
                            {row.type === 'boolean' ? (
                                <select
                                    className="kv-bool-select"
                                    value={row.value}
                                    disabled={disabled}
                                    onChange={e => updateRow(row.id, { value: e.target.value })}
                                    onFocus={() => { lastFocusedRowId.current = row.id; }}
                                >
                                    <option value="true">true</option>
                                    <option value="false">false</option>
                                </select>
                            ) : row.type === 'object' || row.type === 'array' ? (
                                <textarea
                                    className="kv-value-textarea"
                                    value={row.value}
                                    placeholder={row.type === 'array' ? '[]' : '{}'}
                                    disabled={disabled}
                                    rows={calcTextareaRows(row.value)}
                                    spellCheck={false}
                                    onFocus={() => { lastFocusedRowId.current = row.id; }}
                                    onChange={e => updateRow(row.id, { value: e.target.value })}
                                />
                            ) : (
                                <input
                                    className="kv-value-input"
                                    value={row.value}
                                    placeholder={row.type === 'number' ? '0' : '值或 ${...} 引用'}
                                    disabled={disabled}
                                    onFocus={() => { lastFocusedRowId.current = row.id; }}
                                    onChange={e => updateRow(row.id, { value: e.target.value })}
                                />
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {!disabled && (
                <div className="kv-footer">
                    <button className="kv-add-btn" onClick={addRow}>+ 添加字段</button>
                    <button className="kv-mode-btn" onClick={switchToAdvanced}>⚙ JSON 模式</button>
                </div>
            )}

            <ReferencePicker
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onSelect={onPickerSelect}
                references={references}
                anchorRect={pickerAnchor}
            />
        </div>
    );
});

export default KeyValueEditor;
