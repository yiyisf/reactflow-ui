import { memo, useState, useEffect, useRef } from 'react';
import useWorkflowStore from '../store/workflowStore';
import { TaskDef } from '../types/conductor';
import { AIServiceConfig, generateTaskParameters } from '../services/aiService';
import { parseWorkflowInputParams } from '../types/conductor';
import FullscreenEditor from './FullscreenEditor';
import KeyValueEditor, { KeyValueEditorRef } from './inputs/KeyValueEditor';

interface TaskDetailPanelProps {
    task: TaskDef | null;
    isOpen?: boolean;
    onClose: () => void;
    theme?: 'dark' | 'light';
    aiConfig?: Partial<AIServiceConfig>;
}

const QUICK_SNIPPETS = [
    { label: '工作流输入', value: '${workflow.input.fieldName}', desc: '引用工作流启动时传入的参数' },
    { label: '上游任务输出', value: '${taskRef.output.result}', desc: '引用上游任务的输出字段' },
    { label: '工作流变量', value: '${workflow.variables.varName}', desc: '引用 SET_VARIABLE 设置的变量' },
    { label: '工作流 ID', value: '${workflow.workflowId}', desc: '当前工作流实例 ID' },
    { label: '关联 ID', value: '${workflow.correlationId}', desc: '工作流关联 ID' },
    { label: '工作流状态', value: '${workflow.status}', desc: '当前工作流状态' },
];

const TaskDetailPanel = ({ task, isOpen = true, onClose, aiConfig }: TaskDetailPanelProps) => {
    const { mode, updateTask, checkTaskRefUniqueness, validationResults, workflowDef } = useWorkflowStore();
    const kvEditorRef = useRef<KeyValueEditorRef>(null);
    const [localTask, setLocalTask] = useState<TaskDef | null>(task);
    // syncedRef: the taskReferenceName at the time localTask was last synced from `task`.
    // Used to identify the "same task" even while the user is editing the ref name field.
    const [syncedRef, setSyncedRef] = useState<string | null>(task?.taskReferenceName ?? null);
    // pendingRefName: draft value while the user is typing in the ref name input.
    // null means the input is not being edited; we commit to store only on blur.
    const [pendingRefName, setPendingRefName] = useState<string | null>(null);
    const [showSnippets, setShowSnippets] = useState(false);
    const [activeTextareaRef, setActiveTextareaRef] = useState<HTMLTextAreaElement | null>(null);
    const [waitMode, setWaitMode] = useState<'duration' | 'until'>(() =>
        task?.type === 'WAIT' && task.inputParameters?.until ? 'until' : 'duration'
    );
    const [doWhileMode, setDoWhileMode] = useState<'condition' | 'items'>(() =>
        task?.type === 'DO_WHILE' && task.inputParameters?.items ? 'items' : 'condition'
    );
    const [dynamicForkMode, setDynamicForkMode] = useState<'classic' | 'task' | 'workflow'>(() => {
        if (!task || task.type !== 'FORK_JOIN_DYNAMIC') return 'classic';
        if ((task as any).forkTaskWorkflow) return 'workflow';
        if ((task as any).forkTaskType) return 'task';
        return 'classic';
    });


    // 全屏编辑器状态
    type FullscreenState = { title: string; value: string; language: string; onSave: (v: string) => void } | null;
    const [fullscreenEditor, setFullscreenEditor] = useState<FullscreenState>(null);

    // P4.1: AI 参数填充状态
    const [aiFillLoading, setAiFillLoading] = useState(false);
    const [aiFillDiff, setAiFillDiff] = useState<{ generated: Record<string, any>; original: Record<string, any> } | null>(null);

    /** 打开全屏编辑器的辅助函数 */
    const openFullscreen = (title: string, value: string, language: string, onSave: (v: string) => void) => {
        setFullscreenEditor({ title, value, language, onSave });
    };


    /** P4.1: 调用 AI 生成完整 inputParameters 块 */
    const handleAiFillParams = async () => {
        const apiKey = aiConfig?.apiKey || localStorage.getItem('AI_API_KEY') || '';
        if (!apiKey) {
            alert('请先在设置中配置 AI API Key');
            return;
        }
        if (!effectiveTask) return;

        setAiFillLoading(true);
        try {
            const { workflowDef, taskMap } = useWorkflowStore.getState();
            const inputParamNames = parseWorkflowInputParams(workflowDef?.inputParameters).map(p => p.name);
            const upstreamTasks = Object.values(taskMap)
                .filter(t => t.taskReferenceName !== effectiveTask.taskReferenceName)
                .map(t => ({ ref: t.taskReferenceName, type: t.type, name: t.name }))
                .slice(0, 10); // Limit context size

            const config: Partial<AIServiceConfig> = { apiKey };
            if (aiConfig?.baseUrl) config.baseUrl = aiConfig.baseUrl;
            if (aiConfig?.model) config.model = aiConfig.model;

            const generated = await generateTaskParameters(
                effectiveTask.type,
                effectiveTask.taskReferenceName,
                inputParamNames,
                upstreamTasks,
                effectiveTask.inputParameters ?? {},
                config
            );
            setAiFillDiff({
                generated,
                original: effectiveTask.inputParameters ?? {},
            });
        } catch (err: any) {
            alert(`AI 生成失败：${err?.message || '未知错误'}`);
        } finally {
            setAiFillLoading(false);
        }
    };


    useEffect(() => {
        if (task) {
            setLocalTask(task);
            setSyncedRef(task.taskReferenceName); // 记录本次同步时的引用名，用于判断 localTask 是否对应当前 task
            setPendingRefName(null); // 清除草稿，切换到新任务时不保留旧的输入
            // 同步 WAIT 模式
            if (task.type === 'WAIT') {
                setWaitMode(task.inputParameters?.until ? 'until' : 'duration');
            }
            // 同步 DO_WHILE 模式
            if (task.type === 'DO_WHILE') {
                setDoWhileMode(task.inputParameters?.items ? 'items' : 'condition');
            }
            // 同步 FORK_JOIN_DYNAMIC 模式
            if (task.type === 'FORK_JOIN_DYNAMIC') {
                if ((task as any).forkTaskWorkflow) setDynamicForkMode('workflow');
                else if ((task as any).forkTaskType) setDynamicForkMode('task');
                else setDynamicForkMode('classic');
            }
        }
    }, [task]);

    if (!task && !localTask) return null;

    const effectiveTask = task || localTask;
    // syncedRef 记录了 localTask 最近一次从 task 同步时的 taskReferenceName，
    // 用于判断 localTask 是否仍然对应当前 task（即使用户正在编辑引用名也不会误判）
    const displayTask = (localTask && task && syncedRef === task.taskReferenceName) ? localTask : effectiveTask!;
    const panelClass = (isOpen && task) ? 'panel-enter-active' : 'panel-exit';
    const isEditMode = mode === 'edit';

    const textColor = 'var(--text-primary)';
    const borderColor = 'var(--glass-border)';
    const inputBg = 'var(--bg-tertiary)';
    const secondaryTextColor = 'var(--text-secondary)';

    const handleChange = (field: string, value: any) => {
        const updatedTask = { ...displayTask, [field]: value } as TaskDef;
        setLocalTask(updatedTask);
        updateTask(displayTask.taskReferenceName, { [field]: value });
    };

    const handleNestedChange = (parentField: string, field: string, value: any) => {
        const parentValue = (displayTask as any)[parentField] || {};
        const updatedParent = { ...parentValue, [field]: value };
        const updatedTask = { ...displayTask, [parentField]: updatedParent } as TaskDef;
        setLocalTask(updatedTask);
        updateTask(displayTask.taskReferenceName, { [parentField]: updatedParent });
    };

    const handleHttpChange = (field: string, value: any) => {
        const currentInputs = displayTask.inputParameters || {};
        const currentHttp = currentInputs.http_request || displayTask.httpRequest || {};
        const updatedHttp = { ...currentHttp, [field]: value };
        const updatedInputs = { ...currentInputs, http_request: updatedHttp };
        const updates: any = { inputParameters: updatedInputs };
        if (displayTask.httpRequest) updates.httpRequest = updatedHttp;
        const updatedTask = { ...displayTask, ...updates } as TaskDef;
        setLocalTask(updatedTask);
        updateTask(displayTask.taskReferenceName, updates);
    };

    const handleInputParamChange = (key: string, value: any) => {
        const updatedInputs = { ...displayTask.inputParameters, [key]: value };
        const updates = { inputParameters: updatedInputs };
        const updatedTask = { ...displayTask, ...updates } as TaskDef;
        setLocalTask(updatedTask);
        updateTask(displayTask.taskReferenceName, updates);
    };

    const insertSnippet = (snippet: string) => {
        // Bug1 fix: 优先插入到 KeyValueEditor 的最近聚焦行；textarea 为兜底
        if (kvEditorRef.current) {
            kvEditorRef.current.insertAtFocused(snippet);
            setShowSnippets(false);
            return;
        }
        if (!activeTextareaRef) return;
        const start = activeTextareaRef.selectionStart ?? 0;
        const end = activeTextareaRef.selectionEnd ?? 0;
        const current = activeTextareaRef.value;
        const newValue = current.substring(0, start) + snippet + current.substring(end);
        const fieldName = activeTextareaRef.getAttribute('data-field');
        if (fieldName) handleChange(fieldName, newValue);
        setShowSnippets(false);
    };

    /** P5.4.3: 在对应字段旁显示 ❌/⚠️ 校验反馈（field 为 validationRules 中配置的 field 路径） */
    const renderFieldValidation = (fieldPath: string) => {
        const items = [
            ...validationResults.errors.filter(e => e.ref === displayTask.taskReferenceName && e.field === fieldPath),
            ...validationResults.warnings.filter(w => w.ref === displayTask.taskReferenceName && w.field === fieldPath),
        ];
        if (items.length === 0) return null;
        return (
            <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {items.map((item, i) => (
                    <div key={i} style={{ fontSize: '11px', display: 'flex', alignItems: 'flex-start', gap: '4px', color: item.level === 'warning' ? '#f59e0b' : '#ef4444' }}>
                        <span style={{ flexShrink: 0 }}>{item.level === 'warning' ? '⚠️' : '❌'}</span>
                        <span>{item.message}</span>
                    </div>
                ))}
            </div>
        );
    };

    const renderSpecialSection = (title: string, icon: string, color: string, children: React.ReactNode) => (
        <div style={{
            marginBottom: '24px', padding: '16px', borderRadius: '12px',
            background: `${color}10`, border: `1px solid ${color}30`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
        }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '16px', color: color, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{icon}</span> {title}
            </div>
            {children}
        </div>
    );

    const renderInput = (label: string, field: string, type: 'text' | 'number' = 'text', placeholder?: string) => {
        const isRefName = field === 'taskReferenceName';
        // 引用名字段：优先使用 pendingRefName（用户正在输入的草稿），其余字段直接用 displayTask 的值
        const currentVal = isRefName && pendingRefName !== null
            ? pendingRefName
            : ((displayTask as any)[field] ?? '');
        // 重复检测：用当前展示的值（草稿 or 已保存）与其他任务对比，排除自身
        const isDuplicate = isRefName && !checkTaskRefUniqueness(currentVal, displayTask.taskReferenceName);
        return (
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: secondaryTextColor, marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                    {label}
                    {isRefName && isDuplicate && <span style={{ color: '#ef4444', marginLeft: '8px', textTransform: 'none' }}>⚠️ 已存在相同引用名</span>}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                        type={type}
                        value={currentVal}
                        placeholder={placeholder}
                        onChange={(e) => {
                            if (isRefName) {
                                setPendingRefName(e.target.value);
                            } else {
                                handleChange(field, type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value);
                            }
                        }}
                        onFocus={isRefName ? () => {
                            if (pendingRefName === null) {
                                setPendingRefName((displayTask as any).taskReferenceName ?? '');
                            }
                        } : undefined}
                        onBlur={isRefName ? (e) => {
                            const newRef = e.target.value.trim();
                            setPendingRefName(null);
                            if (newRef && newRef !== displayTask.taskReferenceName) {
                                handleChange('taskReferenceName', newRef);
                            }
                        } : undefined}
                        onKeyDown={isRefName ? (e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            e.stopPropagation();
                        } : undefined}
                        disabled={!isEditMode}
                        style={{
                            width: '100%', padding: '8px 12px',
                            borderRadius: '6px', border: `1px solid ${isDuplicate ? '#ef4444' : borderColor}`,
                            background: inputBg, color: textColor, fontSize: '13px', outline: 'none',
                            opacity: isEditMode ? 1 : 0.8, fontFamily: isRefName ? 'monospace' : 'inherit'
                        }}
                    />
                </div>
            </div>
        );
    };

    /**
     * 带"全屏编辑"按钮的代码/表达式文本域。
     * 编辑模式下右上角出现 ⛶ 按钮，点击打开全屏编辑器；只读模式退化为普通 textarea。
     */
    const renderCodeArea = (
        label: string,
        value: string,
        onChange: (v: string) => void,
        options: {
            rows?: number;
            language?: string;
            style?: React.CSSProperties;
            placeholder?: string;
            'data-field'?: string;
        } = {}
    ) => {
        const { rows = 5, language = 'text', style: extraStyle, placeholder: ph, 'data-field': dataField } = options;
        const baseStyle: React.CSSProperties = {
            width: '100%', padding: '12px', borderRadius: '8px',
            border: `1px solid ${borderColor}`, background: inputBg, color: textColor,
            fontSize: '12px', fontFamily: 'monospace', lineHeight: '1.5',
            resize: 'vertical',
            ...extraStyle,
        };
        return (
            <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label style={{ fontSize: '10px', color: secondaryTextColor }}>{label}</label>
                    {isEditMode && (
                        <button
                            onClick={() => openFullscreen(label, value, language, (v) => { onChange(v); setFullscreenEditor(null); })}
                            title="全屏编辑"
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: '14px', padding: '2px 4px',
                                color: 'var(--text-secondary)', opacity: 0.7,
                                lineHeight: 1,
                            }}
                        >
                            ⛶
                        </button>
                    )}
                </div>
                <textarea
                    value={value}
                    placeholder={ph}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={!isEditMode}
                    rows={rows}
                    data-field={dataField}
                    onFocus={(e) => setActiveTextareaRef(e.currentTarget)}
                    style={baseStyle}
                />
            </div>
        );
    };

    const renderSmallInput = (label: string, value: any, onChange: (v: any) => void, type: 'text' | 'number' = 'text', placeholder?: string) => (
        <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>{label}</label>
            <input type={type} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)}
                disabled={!isEditMode}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: '12px', outline: 'none' }}
            />
        </div>
    );

    const renderSelect = (label: string, options: string[], value: string, onChange: (v: string) => void) => (
        <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>{label}</label>
            <select value={value} onChange={(e) => onChange(e.target.value)} disabled={!isEditMode}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: '12px', outline: 'none', cursor: 'pointer' }}>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        </div>
    );

    const renderToggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: secondaryTextColor }}>{label}</span>
            <button onClick={() => onChange(!value)} disabled={!isEditMode}
                style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: value ? 'var(--color-accent)' : borderColor, position: 'relative', transition: 'background 0.2s' }}>
                <span style={{ position: 'absolute', top: '2px', left: value ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </button>
        </div>
    );

    const renderModeSwitch = (modes: { key: string; label: string }[], current: string, onChange: (v: string) => void) => (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {modes.map(m => (
                <button key={m.key} onClick={() => onChange(m.key)} disabled={!isEditMode}
                    style={{ flex: 1, padding: '6px', borderRadius: '6px', border: `1px solid ${borderColor}`, cursor: 'pointer', fontSize: '11px', fontWeight: current === m.key ? 'bold' : 'normal', background: current === m.key ? 'var(--color-accent)' : inputBg, color: current === m.key ? '#fff' : textColor }}>
                    {m.label}
                </button>
            ))}
        </div>
    );

    const httpRequest = displayTask.inputParameters?.http_request || displayTask.httpRequest || {};

    return (
        <>
        <div className={`detail-panel-container ${panelClass}`} style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '450px', zIndex: 1200,
            display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)',
            borderLeft: `1px solid ${borderColor}`, boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.2)', overflowY: 'hidden',
        }}>
            {/* Header */}
            <div style={{ padding: '24px', borderBottom: `1px solid ${borderColor}`, background: 'var(--bg-secondary)', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ background: 'var(--color-accent)', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px' }}>
                        {displayTask.type || 'TASK'}
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: textColor, cursor: 'pointer', fontSize: '20px' }}>✕</button>
                </div>
                {isEditMode ? (
                    <input value={displayTask.name || ''} onChange={(e) => handleChange('name', e.target.value)} placeholder="任务名称"
                        style={{ display: 'block', width: '100%', fontSize: '22px', fontWeight: 'bold', background: 'transparent', border: 'none', color: textColor, outline: 'none', borderBottom: '2px dashed var(--color-accent)' }} />
                ) : (
                    <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{displayTask.name}</div>
                )}
                <div style={{ fontSize: '12px', color: secondaryTextColor, marginTop: '8px', fontFamily: 'monospace', opacity: 0.8 }}>
                    REF: {displayTask.taskReferenceName}
                </div>
            </div>

            {/* Scrollable Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--bg-primary)' }}>

                {/* ── HTTP ── */}
                {displayTask.type === 'HTTP' && renderSpecialSection('HTTP 请求配置', '🌐', 'var(--color-accent)', (
                    <>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                            <select value={httpRequest.method || 'GET'} onChange={(e) => handleHttpChange('method', e.target.value)} disabled={!isEditMode}
                                style={{ width: '90px', padding: '10px', borderRadius: '8px', background: inputBg, color: textColor, border: `1px solid ${borderColor}`, cursor: 'pointer' }}>
                                {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <input placeholder="URI (支持 ${workflow.input.uri})" value={httpRequest.uri || ''}
                                onChange={(e) => handleHttpChange('uri', e.target.value)} disabled={!isEditMode}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', background: inputBg, color: textColor, border: `1px solid ${borderColor}` }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>CONTENT-TYPE</label>
                                <input placeholder="application/json" value={httpRequest.contentType || ''}
                                    onChange={(e) => handleHttpChange('contentType', e.target.value)} disabled={!isEditMode}
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: inputBg, color: textColor, border: `1px solid ${borderColor}`, fontSize: '12px' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>ACCEPT</label>
                                <input placeholder="application/json" value={httpRequest.accept || ''}
                                    onChange={(e) => handleHttpChange('accept', e.target.value)} disabled={!isEditMode}
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: inputBg, color: textColor, border: `1px solid ${borderColor}`, fontSize: '12px' }} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>连接超时 (ms)</label>
                                <input type="number" placeholder="3000" value={httpRequest.connectionTimeOut ?? ''}
                                    onChange={(e) => handleHttpChange('connectionTimeOut', e.target.value === '' ? undefined : Number(e.target.value))} disabled={!isEditMode}
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: inputBg, color: textColor, border: `1px solid ${borderColor}`, fontSize: '12px' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>读取超时 (ms)</label>
                                <input type="number" placeholder="3000" value={httpRequest.readTimeOut ?? ''}
                                    onChange={(e) => handleHttpChange('readTimeOut', e.target.value === '' ? undefined : Number(e.target.value))} disabled={!isEditMode}
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: inputBg, color: textColor, border: `1px solid ${borderColor}`, fontSize: '12px' }} />
                            </div>
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>HEADERS (JSON)</label>
                            <textarea value={typeof httpRequest.headers === 'object' ? JSON.stringify(httpRequest.headers, null, 2) : '{}'}
                                onChange={(e) => { try { handleHttpChange('headers', JSON.parse(e.target.value)); } catch { } }}
                                disabled={!isEditMode} rows={3}
                                style={{ width: '100%', padding: '8px', borderRadius: '8px', background: inputBg, color: textColor, border: `1px solid ${borderColor}`, fontSize: '11px', fontFamily: 'monospace' }} />
                        </div>
                        <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>BODY (RAW/JSON)</label>
                        <textarea
                            value={typeof httpRequest.body === 'object' ? JSON.stringify(httpRequest.body, null, 2) : (httpRequest.body || '')}
                            onChange={(e) => { let v = e.target.value; try { v = JSON.parse(e.target.value); } catch { } handleHttpChange('body', v); }}
                            disabled={!isEditMode} rows={4}
                            style={{ width: '100%', padding: '8px', borderRadius: '8px', background: inputBg, color: textColor, border: `1px solid ${borderColor}`, fontSize: '11px', fontFamily: 'monospace' }} />
                    </>
                ))}

                {/* ── INLINE / LAMBDA ── */}
                {(displayTask.type === 'INLINE' || displayTask.type === 'LAMBDA') && renderSpecialSection('内联脚本配置 (Inline)', '📜', 'var(--color-accent)', (
                    <>
                        {renderSelect('脚本引擎', ['graaljs', 'javascript', 'value-param', 'python'],
                            (displayTask as any).evaluatorType || 'graaljs',
                            (v) => handleChange('evaluatorType', v)
                        )}
                        {renderCodeArea(
                            `EXPRESSION ${(displayTask as any).evaluatorType === 'value-param' ? '(值引用)' : '(脚本)'}`,
                            displayTask.inputParameters?.expression || displayTask.inputParameters?.scriptExpression || '',
                            (v) => {
                                const key = displayTask.inputParameters?.scriptExpression !== undefined ? 'scriptExpression' : 'expression';
                                handleInputParamChange(key, v);
                            },
                            { rows: 10, language: (displayTask as any).evaluatorType || 'javascript', style: { background: '#000', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' } }
                        )}
                        {renderFieldValidation('inputParameters.expression')}
                        {renderFieldValidation('inputParameters.scriptExpression')}
                        <div style={{ marginTop: '8px', fontSize: '10px', color: secondaryTextColor, fontStyle: 'italic' }}>
                            提示: 使用 $.input.key 访问输入参数，返回值作为任务输出。
                        </div>
                    </>
                ))}

                {/* ── JSON_JQ_TRANSFORM ── */}
                {displayTask.type === 'JSON_JQ_TRANSFORM' && renderSpecialSection('JQ 数据转换', '🔍', 'var(--color-accent)', (
                    <>
                        {renderCodeArea('JQ QUERY EXPRESSION', displayTask.inputParameters?.queryExpression || '',
                            (v) => handleInputParamChange('queryExpression', v),
                            { rows: 6, language: 'jq', style: { color: 'var(--color-accent)' } })}
                        {renderFieldValidation('inputParameters.queryExpression')}
                        <div style={{ marginTop: '8px', fontSize: '10px', color: secondaryTextColor }}>
                            输出字段: result（首个结果）、resultList（完整列表）
                        </div>
                    </>
                ))}

                {/* ── SUB_WORKFLOW ── */}
                {displayTask.type === 'SUB_WORKFLOW' && renderSpecialSection('子工作流配置', '🏗️', 'var(--color-accent)', (
                    <>
                        {renderSmallInput('WORKFLOW NAME *', displayTask.subWorkflowParam?.name || '', (v) => handleNestedChange('subWorkflowParam', 'name', v), 'text', 'e.g. my_workflow')}
                        {renderSmallInput('VERSION', displayTask.subWorkflowParam?.version ?? '', (v) => handleNestedChange('subWorkflowParam', 'version', v ? parseInt(v) : undefined), 'number', '1')}
                        {renderCodeArea('INPUT PARAMETERS MAPPING (JSON)',
                            typeof displayTask.inputParameters === 'object' && displayTask.inputParameters !== null ? JSON.stringify(displayTask.inputParameters, null, 2) : '{}',
                            (v) => { try { handleChange('inputParameters', JSON.parse(v)); } catch { } },
                            { rows: 5, language: 'json' })}
                        <div style={{ fontSize: '10px', color: secondaryTextColor, marginTop: '4px' }}>
                            传递给子工作流的参数，支持 {'${workflow.input.xxx}'} 表达式
                        </div>
                    </>
                ))}

                {/* ── START_WORKFLOW ── */}
                {displayTask.type === 'START_WORKFLOW' && renderSpecialSection('启动工作流配置', '▶️', 'var(--color-accent)', (
                    <>
                        <div style={{ fontSize: '11px', color: secondaryTextColor, marginBottom: '12px', padding: '8px', borderRadius: '6px', background: 'rgba(255,165,0,0.1)', border: '1px solid rgba(255,165,0,0.3)' }}>
                            ⚡ 注意：此任务启动目标工作流后立即继续，<b>不等待</b>目标工作流完成。
                        </div>
                        {renderSmallInput('WORKFLOW NAME *', displayTask.inputParameters?.startWorkflow?.name || '', (v) => {
                            const sw = { ...(displayTask.inputParameters?.startWorkflow || {}), name: v };
                            handleInputParamChange('startWorkflow', sw);
                        }, 'text', 'e.g. target_workflow')}
                        {renderSmallInput('VERSION', displayTask.inputParameters?.startWorkflow?.version ?? '', (v) => {
                            const sw = { ...(displayTask.inputParameters?.startWorkflow || {}), version: v ? parseInt(v) : undefined };
                            handleInputParamChange('startWorkflow', sw);
                        }, 'number', '1')}
                        {renderSmallInput('CORRELATION ID', displayTask.inputParameters?.startWorkflow?.correlationId || '', (v) => {
                            const sw = { ...(displayTask.inputParameters?.startWorkflow || {}), correlationId: v };
                            handleInputParamChange('startWorkflow', sw);
                        }, 'text', '${workflow.correlationId}')}
                        {renderCodeArea('WORKFLOW INPUT (JSON)',
                            typeof displayTask.inputParameters?.startWorkflow?.input === 'object' ? JSON.stringify(displayTask.inputParameters.startWorkflow.input, null, 2) : '{}',
                            (v) => { try { const sw = { ...(displayTask.inputParameters?.startWorkflow || {}), input: JSON.parse(v) }; handleInputParamChange('startWorkflow', sw); } catch { } },
                            { rows: 4, language: 'json' })}
                    </>
                ))}

                {/* ── TERMINATE ── */}
                {displayTask.type === 'TERMINATE' && renderSpecialSection('终止状态配置', '⏹️', 'var(--color-accent)', (
                    <>
                        <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>TERMINATION STATUS</label>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            {['COMPLETED', 'FAILED'].map(s => (
                                <button key={s} onClick={() => handleInputParamChange('terminationStatus', s)} disabled={!isEditMode}
                                    style={{ flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer', background: (displayTask.inputParameters?.terminationStatus || 'COMPLETED') === s ? 'var(--color-accent)' : inputBg, color: (displayTask.inputParameters?.terminationStatus || 'COMPLETED') === s ? '#fff' : textColor, border: `1px solid ${borderColor}`, fontWeight: 'bold', fontSize: '11px' }}>
                                    {s}
                                </button>
                            ))}
                        </div>
                        {renderSmallInput('TERMINATION REASON', displayTask.inputParameters?.terminationReason || '', (v) => handleInputParamChange('terminationReason', v), 'text', '终止原因...')}
                        {renderCodeArea('WORKFLOW OUTPUT (JSON)',
                            typeof displayTask.inputParameters?.workflowOutput === 'object' ? JSON.stringify(displayTask.inputParameters.workflowOutput, null, 2) : '{}',
                            (v) => { try { handleInputParamChange('workflowOutput', JSON.parse(v)); } catch { } },
                            { rows: 3, language: 'json' })}
                    </>
                ))}

                {/* ── EVENT ── */}
                {displayTask.type === 'EVENT' && renderSpecialSection('事件发送配置', '✉️', 'var(--color-accent)', (
                    <>
                        {renderSmallInput('EVENT SINK *', displayTask.sink || '', (v) => handleChange('sink', v), 'text', 'e.g. sqs:queue_name 或 conductor')}
                        <div style={{ fontSize: '10px', color: secondaryTextColor, marginTop: '4px', marginBottom: '8px' }}>
                            支持前缀: conductor | sqs | kafka | amqp | nats
                        </div>
                        {renderToggle('异步完成 (asyncComplete)', !!(displayTask as any).asyncComplete, (v) => handleChange('asyncComplete', v))}
                    </>
                ))}

                {/* ── WAIT ── */}
                {displayTask.type === 'WAIT' && renderSpecialSection('等待状态配置', '⏳', 'var(--color-accent)', (
                    <>
                        {renderModeSwitch([{ key: 'duration', label: '等待时长' }, { key: 'until', label: '等待到指定时间' }], waitMode, (v) => setWaitMode(v as any))}
                        {waitMode === 'duration'
                            ? renderSmallInput('DURATION', displayTask.inputParameters?.duration || '', (v) => handleInputParamChange('duration', v), 'text', 'e.g. 30s, 10m, 2 hours')
                            : renderSmallInput('UNTIL (时间点)', displayTask.inputParameters?.until || '', (v) => handleInputParamChange('until', v), 'text', 'e.g. 2025-06-15 09:00 GMT+00:00')}
                        <div style={{ fontSize: '11px', color: secondaryTextColor, lineHeight: '1.6', marginTop: '8px' }}>
                            此任务会使工作流进入 <b>IN_PROGRESS</b> 状态，直到时间满足或外部 API 触发完成。
                        </div>
                    </>
                ))}

                {/* ── DECISION / SWITCH ── */}
                {(displayTask.type === 'DECISION' || displayTask.type === 'SWITCH') && renderSpecialSection('条件分支配置', '⚖️', 'var(--color-accent)', (
                    <>
                        {renderSelect('评估模式 (evaluatorType)',
                            ['value-param', 'javascript'],
                            (displayTask as any).evaluatorType || 'value-param',
                            (v) => handleChange('evaluatorType', v)
                        )}
                        {((displayTask as any).evaluatorType || 'value-param') === 'value-param'
                            ? renderSmallInput('CASE VALUE PARAM (参数名)', displayTask.caseValueParam || '', (v) => handleChange('caseValueParam', v), 'text', 'e.g. status')
                            : <>
                                {renderCodeArea('CASE EXPRESSION (JS)', displayTask.caseExpression || '',
                                    (v) => handleChange('caseExpression', v),
                                    { rows: 4, language: 'javascript', style: { color: 'var(--color-accent)' } })}
                                {renderFieldValidation('caseExpression')}
                            </>
                        }
                        <div style={{ fontSize: '10px', color: secondaryTextColor, marginTop: '8px' }}>
                            分支可在图中通过右键节点→"添加分支"进行管理
                        </div>
                    </>
                ))}

                {/* ── DO_WHILE ── */}
                {displayTask.type === 'DO_WHILE' && renderSpecialSection('循环逻辑配置', '🔄', 'var(--color-accent)', (
                    <>
                        {renderModeSwitch([{ key: 'condition', label: '条件循环' }, { key: 'items', label: '列表迭代' }], doWhileMode, (v) => setDoWhileMode(v as any))}
                        {doWhileMode === 'condition' ? (
                            <>
                                {renderCodeArea('LOOP CONDITION (JS) *', displayTask.loopCondition || '',
                                    (v) => handleChange('loopCondition', v),
                                    { rows: 4, language: 'javascript', style: { color: 'var(--color-accent)' } })}
                                {renderFieldValidation('loopCondition')}
                                <div style={{ fontSize: '10px', color: secondaryTextColor, marginTop: '4px' }}>
                                    条件为 true 时继续循环，false 时退出
                                </div>
                            </>
                        ) : (
                            <>
                                <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>ITEMS (列表表达式)</label>
                                <input value={displayTask.inputParameters?.items || ''} onChange={(e) => handleInputParamChange('items', e.target.value)} disabled={!isEditMode}
                                    placeholder="${workflow.input.myList}" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: '12px', outline: 'none' }} />
                                <div style={{ fontSize: '10px', color: secondaryTextColor, marginTop: '4px' }}>
                                    引用一个数组，对每个元素执行一次循环体
                                </div>
                            </>
                        )}
                        <div style={{ marginTop: '12px' }}>
                            {renderSmallInput('KEEP LAST N 次迭代', (displayTask as any).keepLastN ?? '', (v) => handleChange('keepLastN', v ? parseInt(v) : undefined), 'number', '0 = 保留全部')}
                        </div>
                    </>
                ))}

                {/* ── FORK_JOIN_DYNAMIC ── */}
                {displayTask.type === 'FORK_JOIN_DYNAMIC' && renderSpecialSection('动态并行配置', '⚡', 'var(--color-accent)', (
                    <>
                        {renderModeSwitch([
                            { key: 'classic', label: '经典模式' },
                            { key: 'task', label: '任务简化' },
                            { key: 'workflow', label: '工作流简化' }
                        ], dynamicForkMode, (v) => setDynamicForkMode(v as any))}
                        {dynamicForkMode === 'classic' && (
                            <>
                                {renderSmallInput('DYNAMIC_FORK_TASKS_PARAM', displayTask.dynamicForkTasksParam || '', (v) => handleChange('dynamicForkTasksParam', v), 'text', 'e.g. dynamic_tasks')}
                                {renderSmallInput('DYNAMIC_FORK_TASKS_INPUT_PARAM', displayTask.dynamicForkTasksInputParamName || '', (v) => handleChange('dynamicForkTasksInputParamName', v), 'text', 'e.g. input')}
                                <div style={{ fontSize: '10px', color: secondaryTextColor }}>
                                    经典模式：通过 inputParameters 传入 dynamicTasks 数组和 dynamicTasksInput 映射
                                </div>
                            </>
                        )}
                        {dynamicForkMode === 'task' && (
                            <>
                                {renderSmallInput('FORK TASK TYPE *', (displayTask as any).forkTaskType || '', (v) => handleChange('forkTaskType', v), 'text', 'e.g. HTTP')}
                                {renderSmallInput('FORK TASK NAME (仅 SIMPLE 任务)', (displayTask as any).forkTaskName || '', (v) => handleChange('forkTaskName', v), 'text', 'e.g. my_task')}
                                {renderSmallInput('FORK TASK INPUTS PARAM', (displayTask as any).forkTaskInputs || '', (v) => handleChange('forkTaskInputs', v), 'text', 'e.g. inputs')}
                                <div style={{ fontSize: '10px', color: secondaryTextColor }}>
                                    所有分支执行相同任务类型，每个元素作为一个分支输入
                                </div>
                            </>
                        )}
                        {dynamicForkMode === 'workflow' && (
                            <>
                                {renderSmallInput('FORK WORKFLOW NAME *', (displayTask as any).forkTaskWorkflow || '', (v) => handleChange('forkTaskWorkflow', v), 'text', 'e.g. sub_workflow')}
                                {renderSmallInput('WORKFLOW VERSION', (displayTask as any).forkTaskWorkflowVersion || '', (v) => handleChange('forkTaskWorkflowVersion', v), 'text', '1')}
                                {renderSmallInput('FORK TASK INPUTS PARAM', (displayTask as any).forkTaskInputs || '', (v) => handleChange('forkTaskInputs', v), 'text', 'e.g. inputs')}
                                <div style={{ fontSize: '10px', color: secondaryTextColor }}>
                                    所有分支执行相同子工作流，每个元素作为一个子工作流输入
                                </div>
                            </>
                        )}
                    </>
                ))}

                {/* ── DYNAMIC ── */}
                {displayTask.type === 'DYNAMIC' && renderSpecialSection('动态任务配置', '🎯', 'var(--color-accent)', (
                    <>
                        {renderSmallInput('DYNAMIC TASK NAME PARAM *', (displayTask as any).dynamicTaskNameParam || '', (v) => handleChange('dynamicTaskNameParam', v), 'text', 'e.g. taskToExecute')}
                        <div style={{ fontSize: '10px', color: secondaryTextColor, marginTop: '4px' }}>
                            运行时从 inputParameters 的指定键中读取实际任务类型名（如 "HTTP"、"SIMPLE"）
                        </div>
                    </>
                ))}

                {/* ── HUMAN ── */}
                {displayTask.type === 'HUMAN' && renderSpecialSection('人工审批配置', '👤', 'var(--color-accent)', (
                    <>
                        {renderSmallInput('表单模板名 (userFormTemplate)', (displayTask as any).humanTaskDef?.userFormTemplate || '', (v) => handleNestedChange('humanTaskDef', 'userFormTemplate', v), 'text', 'e.g. approval_form')}
                        {renderSelect('分配策略 (assignmentCompletionStrategy)',
                            ['LEAVE_OPEN', 'TERMINATE'],
                            (displayTask as any).humanTaskDef?.assignmentCompletionStrategy || 'LEAVE_OPEN',
                            (v) => handleNestedChange('humanTaskDef', 'assignmentCompletionStrategy', v)
                        )}
                        {renderSmallInput('显示名称 (displayName)', (displayTask as any).humanTaskDef?.displayName || '', (v) => handleNestedChange('humanTaskDef', 'displayName', v), 'text', '审批任务')}
                    </>
                ))}

                {/* ── KAFKA_PUBLISH ── */}
                {displayTask.type === 'KAFKA_PUBLISH' && renderSpecialSection('Kafka 推送配置', '📨', 'var(--color-accent)', (
                    <>
                        {renderSmallInput('BOOTSTRAP SERVERS *', displayTask.inputParameters?.bootStrapServers || '', (v) => handleInputParamChange('bootStrapServers', v), 'text', 'localhost:9092')}
                        {renderSmallInput('TOPIC *', displayTask.inputParameters?.topic || '', (v) => handleInputParamChange('topic', v), 'text', 'my_topic')}
                        {renderSmallInput('KEY (消息分区键)', displayTask.inputParameters?.key || '', (v) => handleInputParamChange('key', v), 'text', '')}
                        {renderCodeArea('VALUE (消息内容)',
                            typeof displayTask.inputParameters?.value === 'object' ? JSON.stringify(displayTask.inputParameters.value, null, 2) : (displayTask.inputParameters?.value || ''),
                            (v) => { let val: any = v; try { val = JSON.parse(v); } catch { } handleInputParamChange('value', val); },
                            { rows: 4, language: 'json' })}
                        {renderCodeArea('HEADERS (JSON)',
                            typeof displayTask.inputParameters?.headers === 'object' ? JSON.stringify(displayTask.inputParameters.headers, null, 2) : '{}',
                            (v) => { try { handleInputParamChange('headers', JSON.parse(v)); } catch { } },
                            { rows: 3, language: 'json' })}
                    </>
                ))}

                {/* ── SET_VARIABLE ── */}
                {displayTask.type === 'SET_VARIABLE' && renderSpecialSection('变量配置', '📦', 'var(--color-accent)', (
                    <>
                        <div style={{ fontSize: '11px', color: secondaryTextColor, marginBottom: '12px' }}>
                            在 inputParameters 中定义要设置的变量名和值，后续任务通过 {'${workflow.variables.varName}'} 访问。
                        </div>
                        {renderCodeArea('VARIABLES (JSON)',
                            typeof displayTask.inputParameters === 'object' && displayTask.inputParameters !== null ? JSON.stringify(displayTask.inputParameters, null, 2) : '{}',
                            (v) => { try { handleChange('inputParameters', JSON.parse(v)); } catch { } },
                            { rows: 6, language: 'json' })}
                    </>
                ))}

                {/* ── 通用配置区 ── */}
                <div style={{ marginTop: '32px', borderTop: `1px solid ${borderColor}`, paddingTop: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '16px', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '1px' }}>通用参数与属性</div>

                    {renderInput('任务唯一引用名 (Reference Name)', 'taskReferenceName')}
                    {renderInput('任务描述', 'description')}

                    {/* inputParameters with snippet panel + AI fill + KeyValueEditor */}
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '6px' }}>
                            <label style={{ fontSize: '11px', color: secondaryTextColor, fontWeight: '600', textTransform: 'uppercase', flex: 1 }}>
                                输入参数 (inputParameters)
                            </label>
                            {isEditMode && (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        onClick={handleAiFillParams}
                                        disabled={aiFillLoading}
                                        title="AI 根据上下文自动生成 inputParameters"
                                        style={{
                                            fontSize: '11px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                            border: 'none', borderRadius: '4px', padding: '2px 8px',
                                            cursor: aiFillLoading ? 'not-allowed' : 'pointer',
                                            color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px',
                                            opacity: aiFillLoading ? 0.7 : 1,
                                        }}>
                                        {aiFillLoading ? '⏳' : '✨'} AI 填充
                                    </button>
                                    <button onClick={() => setShowSnippets(!showSnippets)} title="快捷表达式"
                                        style={{ fontSize: '11px', background: showSnippets ? 'var(--color-accent)' : 'none', border: `1px solid ${borderColor}`, borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', color: showSnippets ? '#fff' : secondaryTextColor }}>
                                        {'{}'} 片段
                                    </button>
                                </div>
                            )}
                        </div>
                        {showSnippets && (
                            <div style={{ marginBottom: '8px', padding: '8px', borderRadius: '6px', border: `1px solid ${borderColor}`, background: 'var(--bg-secondary)', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {QUICK_SNIPPETS.map(s => (
                                    <button key={s.value} onClick={() => insertSnippet(s.value)} title={s.desc}
                                        style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '4px', border: `1px solid ${borderColor}`, background: inputBg, color: textColor, cursor: 'pointer', fontFamily: 'monospace' }}>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        {/* AI 填充 Diff 预览 */}
                        {aiFillDiff && (
                            <div style={{ marginBottom: '8px', borderRadius: '8px', border: '1px solid #6366f130', background: '#6366f108', overflow: 'hidden' }}>
                                <div style={{ padding: '8px 12px', background: '#6366f118', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1' }}>✨ AI 建议的 inputParameters</span>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            onClick={() => {
                                                handleChange('inputParameters', aiFillDiff.generated);
                                                setAiFillDiff(null);
                                            }}
                                            style={{ fontSize: '11px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                                            应用
                                        </button>
                                        <button
                                            onClick={() => setAiFillDiff(null)}
                                            style={{ fontSize: '11px', background: 'none', color: secondaryTextColor, border: `1px solid ${borderColor}`, borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            取消
                                        </button>
                                    </div>
                                </div>
                                <pre style={{ margin: 0, padding: '10px 12px', fontSize: '12px', fontFamily: 'var(--font-mono)', overflowX: 'auto', color: textColor, maxHeight: '180px', overflowY: 'auto' }}>
                                    {JSON.stringify(aiFillDiff.generated, null, 2)}
                                </pre>
                            </div>
                        )}
                        {/* P5.1.2: KeyValueEditor 替代原始 JSON textarea */}
                        <KeyValueEditor
                            ref={kvEditorRef}
                            value={typeof displayTask.inputParameters === 'object' && displayTask.inputParameters !== null ? displayTask.inputParameters : {}}
                            onChange={(v) => handleChange('inputParameters', v)}
                            disabled={!isEditMode}
                            taskRef={displayTask.taskReferenceName}
                            workflowDef={workflowDef ?? undefined}
                        />
                        {/* P5.4.3: 字段级校验反馈 */}
                        {(() => {
                            const taskWarnings = [
                                ...(validationResults.errors.filter(e => e.ref === displayTask.taskReferenceName && e.field)),
                                ...(validationResults.warnings.filter(w => w.ref === displayTask.taskReferenceName && w.field)),
                            ];
                            if (taskWarnings.length === 0) return null;
                            return (
                                <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    {taskWarnings.map((item, i) => (
                                        <div key={i} style={{
                                            fontSize: '11px', display: 'flex', alignItems: 'flex-start', gap: '4px',
                                            color: item.level === 'error' || !item.level && validationResults.errors.includes(item) ? '#ef4444' : '#f59e0b',
                                        }}>
                                            <span style={{ flexShrink: 0, marginTop: '1px' }}>
                                                {(item.level === 'error' || validationResults.errors.includes(item)) ? '❌' : '⚠️'}
                                            </span>
                                            <span>{item.message}</span>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {renderInput('重试次数', 'retryCount', 'number')}
                        {renderInput('超时限制 (秒)', 'timeoutSeconds', 'number')}
                    </div>

                    {/* 高级配置折叠区 */}
                    <details style={{ marginTop: '16px' }}>
                        <summary style={{ fontSize: '11px', cursor: 'pointer', color: secondaryTextColor, userSelect: 'none', fontWeight: '600' }}>
                            ▸ 执行控制（高级）
                        </summary>
                        <div style={{ marginTop: '12px' }}>
                            {renderSelect('重试策略 (retryLogic)',
                                ['FIXED', 'EXPONENTIAL_BACKOFF', 'LINEAR_BACKOFF'],
                                (displayTask as any).retryLogic || 'FIXED',
                                (v) => handleChange('retryLogic', v)
                            )}
                            {renderSmallInput('重试延迟 (秒)', (displayTask as any).retryDelaySeconds ?? '', (v) => handleChange('retryDelaySeconds', v ? parseInt(v) : undefined), 'number', '0')}
                            {renderSelect('超时策略 (timeoutPolicy)',
                                ['TIME_OUT_WF', 'ALERT_ONLY', 'RETRY', 'FAIL_WORKFLOW'],
                                (displayTask as any).timeoutPolicy || 'TIME_OUT_WF',
                                (v) => handleChange('timeoutPolicy', v)
                            )}
                            {renderSmallInput('启动延迟 (秒)', displayTask.startDelay ?? '', (v) => handleChange('startDelay', v ? parseInt(v) : undefined), 'number', '0')}
                            {renderToggle('可选任务 (optional) — 失败不影响工作流', !!displayTask.optional, (v) => handleChange('optional', v))}
                            {renderToggle('异步完成 (asyncComplete)', !!displayTask.asyncComplete, (v) => handleChange('asyncComplete', v))}
                        </div>
                    </details>
                </div>

                {/* 只读完整定义 */}
                <div style={{ marginTop: '48px', opacity: 0.6 }}>
                    <details>
                        <summary style={{ fontSize: '11px', cursor: 'pointer', marginBottom: '8px' }}>查看完整 JSON (只读)</summary>
                        <pre style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px', fontSize: '10px', overflow: 'auto', border: `1px solid ${borderColor}`, color: secondaryTextColor }}>
                            {JSON.stringify(displayTask, null, 2)}
                        </pre>
                    </details>
                </div>
            </div>

            {/* Footer */}
            {isEditMode && (
                <div style={{ padding: '24px', borderTop: `1px solid ${borderColor}`, background: 'var(--bg-secondary)', display: 'flex', gap: '12px', flexShrink: 0 }}>
                    <div style={{ flex: 1, fontSize: '11px', color: secondaryTextColor, display: 'flex', alignItems: 'center' }}>✅ 所有修改已实时同步</div>
                    <button onClick={onClose}
                        style={{ padding: '10px 24px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px var(--color-accent-bg)' }}>
                        完成退出
                    </button>
                </div>
            )}

        </div>

        {/* 全屏代码编辑器（Portal，挂载到 document.body） */}
        {fullscreenEditor && (
            <FullscreenEditor
                title={fullscreenEditor.title}
                value={fullscreenEditor.value}
                language={fullscreenEditor.language}
                onSave={fullscreenEditor.onSave}
                onClose={() => setFullscreenEditor(null)}
            />
        )}
        </>
    );
};

export default memo(TaskDetailPanel);
