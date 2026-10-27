import { memo, useState, useEffect, useMemo, useRef } from 'react';
import useWorkflowStore from '../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import { TaskDef } from '../types/conductor';
import { AIServiceConfig, AI_NOT_CONFIGURED_MESSAGE, callAICopilot, generateTaskParameters, isAiConfigured } from '../services/aiService';
import { generateParameterHintPrompt } from '../services/promptTemplates';
import { parseWorkflowInputParams } from '../types/conductor';
import ParameterSuggester, { Suggestion } from './AICopilot/ParameterSuggester';
import FullscreenEditor from './FullscreenEditor';
import { getCompletionItems, getUpstreamAncestors } from '../services/wlsp/workflowLsp';
import DraftCodeField from './DraftCodeField';
import {
    parseJsonDraft,
    patchTaskDefinitionField,
    readTaskDefinitionField,
    validateTaskRefName,
    type TaskDefinitionField,
} from '../utils/taskEditing';
import { CircleCheck, Globe, Hourglass, Link, Mail, Maximize2, Package, Play, Repeat, Scale, ScrollText, Search, Send, Sparkles, Square, Target, TriangleAlert, User, Workflow, X, Zap, type LucideIcon } from 'lucide-react';

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

/** FORK_JOIN_DYNAMIC 简化模式字段：Conductor ForkJoinDynamicTaskMapper 从 inputParameters 读取，兼容旧版顶层值 */
const dynamicForkField = (task: TaskDef | null | undefined, key: string): any =>
    task?.inputParameters?.[key] ?? (task as any)?.[key];

function detectDynamicForkMode(task: TaskDef | null | undefined): 'classic' | 'task' | 'workflow' {
    if (!task || task.type !== 'FORK_JOIN_DYNAMIC') return 'classic';
    if (dynamicForkField(task, 'forkTaskWorkflow')) return 'workflow';
    if (dynamicForkField(task, 'forkTaskType') || dynamicForkField(task, 'forkTaskName')) return 'task';
    return 'classic';
}

const TaskDetailPanel = ({ task, isOpen = true, onClose, aiConfig }: TaskDetailPanelProps) => {
    const { mode, updateTask, workflowDef, executionData, workflowInstance, lastRefactorNotice, clearRefactorNotice } = useWorkflowStore(useShallow((s) => ({
            mode: s.mode,
            updateTask: s.updateTask,
            workflowDef: s.workflowDef,
            executionData: s.executionData,
            workflowInstance: s.workflowInstance,
            lastRefactorNotice: s.lastRefactorNotice,
            clearRefactorNotice: s.clearRefactorNotice,
        })));
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
    const [dynamicForkMode, setDynamicForkMode] = useState<'classic' | 'task' | 'workflow'>(() => detectDynamicForkMode(task));

    const [suggesterOpen, setSuggesterOpen] = useState(false);
    const [suggesterAnchor, setSuggesterAnchor] = useState<DOMRect | undefined>();
    const [currentSuggestions, setCurrentSuggestions] = useState<Suggestion[]>([]);
    const [onSelectSuggestion, setOnSelectSuggestion] = useState<(val: string) => void>(() => () => { });

    // W-LSP 零延迟确定性变量补全列表（基于 DAG 拓扑祖先与多源 Schema 推断）
    const activeTaskRef = task?.taskReferenceName || localTask?.taskReferenceName || '';
    const wlspItems = useMemo(() => {
        if (!workflowDef || !activeTaskRef) return [];
        return getCompletionItems(
            workflowDef as any,
            activeTaskRef,
            executionData,
            workflowInstance?.input
        );
    }, [workflowDef, activeTaskRef, executionData, workflowInstance?.input]);

    // 草稿式 JSON 输入框的写入函数（快捷片段插入时使用），按 data-field 索引
    const draftAppliers = useRef<Record<string, (text: string) => void>>({});
    // 引用名草稿的校验错误（E7）
    const [refNameError, setRefNameError] = useState<string | null>(null);

    // 全屏编辑器状态
    type FullscreenState = { title: string; value: string; language: string; onSave: (v: string) => void } | null;
    const [fullscreenEditor, setFullscreenEditor] = useState<FullscreenState>(null);

    // P4.1: AI 参数填充状态
    const [aiFillLoading, setAiFillLoading] = useState(false);
    const [aiFillDiff, setAiFillDiff] = useState<{ generated: Record<string, any>; original: Record<string, any> } | null>(null);
    /** In-panel AI notice (replaces alert()): not configured / failed */
    const [aiNotice, setAiNotice] = useState<string | null>(null);

    /** 打开全屏编辑器的辅助函数 */
    const openFullscreen = (title: string, value: string, language: string, onSave: (v: string) => void) => {
        setFullscreenEditor({ title, value, language, onSave });
    };

    // Shown when AI is unavailable — labelled as examples so they are never mistaken for AI output.
    const exampleSuggestions = (why: string): Suggestion[] => [
        { label: '示例 · 引用工作流输入', value: '${workflow.input.data}', description: `${why}，以下为通用示例：引用工作流启动时传入的数据` },
        { label: '示例 · 引用前序任务输出', value: '${previous_task.output.result}', description: '通用示例：引用上一个节点的输出（请替换为实际任务引用名）' },
        { label: '示例 · 工作流变量', value: '${workflow.variables.api_key}', description: '通用示例：引用 SET_VARIABLE 设置的变量' },
    ];

    /** P4.1: 调用 AI 生成完整 inputParameters 块 */
    const handleAiFillParams = async () => {
        if (!isAiConfigured(aiConfig)) {
            setAiNotice(AI_NOT_CONFIGURED_MESSAGE);
            return;
        }
        if (!effectiveTask) return;

        setAiNotice(null);
        setAiFillLoading(true);
        try {
            const { workflowDef } = useWorkflowStore.getState();
            const inputParamNames = parseWorkflowInputParams(workflowDef?.inputParameters, workflowDef).map(p => p.name);
            // Only real upstream ancestors (DAG order) — downstream tasks' outputs don't exist yet.
            const upstreamTasks = getUpstreamAncestors(workflowDef, effectiveTask.taskReferenceName)
                .map(t => ({ ref: t.taskReferenceName, type: t.type, name: t.name }))
                .slice(0, 10); // Limit context size

            const config: Partial<AIServiceConfig> = { ...aiConfig };

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
            setAiNotice(`AI 填充失败：${err?.message || 'AI 服务返回了无法识别的错误，请重试'}`);
        } finally {
            setAiFillLoading(false);
        }
    };

    const handleAiHintClick = async (e: React.MouseEvent, onSelect: (val: string) => void) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setSuggesterAnchor(rect);
        setOnSelectSuggestion(() => onSelect);
        setSuggesterOpen(true);

        // W-LSP items are already available in 0ms via wlspItems prop; only fall back to LLM if wlspItems is empty
        if (wlspItems.length > 0) {
            return;
        }

        setCurrentSuggestions([]);
        if (!isAiConfigured(aiConfig)) {
            setCurrentSuggestions(exampleSuggestions('未配置 AI 服务'));
            return;
        }

        try {
            const config: Partial<AIServiceConfig> = { ...aiConfig };

            const { workflowDef } = useWorkflowStore.getState();
            const prompt = generateParameterHintPrompt(effectiveTask!, workflowDef);
            const response = await callAICopilot(
                [{ role: 'system', content: 'You are a Conductor workflow expert. Return only valid JSON.' }, { role: 'user', content: prompt }],
                config
            );

            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]) as Suggestion[];
                setCurrentSuggestions(parsed);
            } else {
                setCurrentSuggestions(exampleSuggestions('AI 没有返回可用的建议'));
            }
        } catch {
            setCurrentSuggestions(exampleSuggestions('AI 建议获取失败'));
        }
    };

    useEffect(() => {
        if (task) {
            setLocalTask(task);
            setSyncedRef(task.taskReferenceName); // 记录本次同步时的引用名，用于判断 localTask 是否对应当前 task
            setPendingRefName(null); // 清除草稿，切换到新任务时不保留旧的输入
            setRefNameError(null);
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
                setDynamicForkMode(detectDynamicForkMode(task));
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

    /** 一次提交多个字段（可传 undefined 删除字段） */
    const applyPatch = (patch: Record<string, any>) => {
        const updatedTask = { ...displayTask, ...patch } as TaskDef;
        setLocalTask(updatedTask);
        updateTask(displayTask.taskReferenceName, patch);
    };

    /** inputParameters 下的对象字段（如 kafka_request）的子键更新 */
    const handleInputObjectChange = (objectKey: string, field: string, value: any) => {
        const currentInputs = displayTask.inputParameters || {};
        const currentObj = (currentInputs[objectKey] && typeof currentInputs[objectKey] === 'object') ? currentInputs[objectKey] : {};
        handleInputParamChange(objectKey, { ...currentObj, [field]: value });
    };

    /** 写入 inputParameters 的同时删掉旧版写在顶层的同名字段（E2 / E20） */
    const handleInputParamMigrating = (key: string, value: any) => {
        const updatedInputs = { ...(displayTask.inputParameters || {}), [key]: value };
        if (value === undefined || value === '') delete updatedInputs[key];
        const patch: Record<string, any> = { inputParameters: updatedInputs };
        if ((displayTask as any)[key] !== undefined) patch[key] = undefined;
        applyPatch(patch);
    };

    /** E19：超时 / 重试策略写入 taskDefinition */
    const handleTaskDefChange = (field: TaskDefinitionField, value: any) => {
        applyPatch(patchTaskDefinitionField(displayTask, field, value, workflowDef?.ownerEmail));
    };

    /** E17：WAIT 切换模式时删除另一个字段，Conductor 不允许 duration 与 until 同时存在 */
    const handleWaitModeChange = (next: 'duration' | 'until') => {
        setWaitMode(next);
        const inputs = { ...(displayTask.inputParameters || {}) };
        const other = next === 'duration' ? 'until' : 'duration';
        if (inputs[other] === undefined) return;
        delete inputs[other];
        applyPatch({ inputParameters: inputs });
    };

    /** JSON 草稿提交：解析成功才写入，失败返回原因 */
    const commitJson = (onValue: (v: any) => void, opts: { allowEmpty?: boolean; requireObject?: boolean } = { allowEmpty: true, requireObject: true }) =>
        (text: string): string | null => {
            const res = parseJsonDraft(text, opts);
            if (!res.ok) return res.error;
            onValue(res.value);
            return null;
        };

    /** 允许原始文本的字段（HTTP body、Kafka value）：能解析为 JSON 就存对象，否则存字符串 */
    const commitJsonOrText = (onValue: (v: any) => void) => (text: string): string | null => {
        const trimmed = text.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            const res = parseJsonDraft(trimmed, { allowEmpty: true });
            if (!res.ok) return res.error;
            onValue(res.value);
            return null;
        }
        onValue(text);
        return null;
    };

    const stringifyForDraft = (v: any, empty = '{}') =>
        v === undefined || v === null ? empty : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);

    /** 草稿式 JSON 输入框（E18）：逐字输入，失焦时解析并提示错误 */
    const renderJsonArea = (
        label: string,
        fieldKey: string,
        value: string,
        onCommit: (text: string) => string | null,
        options: { rows?: number; language?: string; style?: React.CSSProperties; placeholder?: string; dataField?: string } = {}
    ) => (
        <DraftCodeField
            key={`${displayTask.taskReferenceName}:${fieldKey}`}
            label={label}
            value={value}
            onCommit={onCommit}
            editable={isEditMode}
            rows={options.rows ?? 5}
            placeholder={options.placeholder}
            style={options.style}
            dataField={options.dataField}
            secondaryTextColor={secondaryTextColor}
            onOpenFullscreen={(current, apply) =>
                openFullscreen(label || fieldKey, current, options.language || 'json', (v) => { apply(v); setFullscreenEditor(null); })}
            onTextareaFocus={(el) => setActiveTextareaRef(el)}
            registerApply={options.dataField ? (fn) => {
                if (fn) draftAppliers.current[options.dataField!] = fn;
                else delete draftAppliers.current[options.dataField!];
            } : undefined}
            onTyping={(el, nextVal, apply) => {
                const pos = el.selectionStart ?? 0;
                if (pos >= 2 && nextVal.slice(pos - 2, pos) === '${') {
                    setSuggesterAnchor(el.getBoundingClientRect());
                    setOnSelectSuggestion(() => (selectedExpr: string) => {
                        apply(nextVal.slice(0, pos - 2) + selectedExpr + nextVal.slice(pos));
                    });
                    setSuggesterOpen(true);
                }
            }}
        />
    );

    const insertSnippet = (snippet: string) => {
        if (!activeTextareaRef) return;
        const start = activeTextareaRef.selectionStart ?? 0;
        const end = activeTextareaRef.selectionEnd ?? 0;
        const current = activeTextareaRef.value;
        const newValue = current.substring(0, start) + snippet + current.substring(end);
        const fieldName = activeTextareaRef.getAttribute('data-field');
        const applyDraft = fieldName ? draftAppliers.current[fieldName] : undefined;
        if (applyDraft) applyDraft(newValue);
        else if (fieldName) handleChange(fieldName, newValue);
        setShowSnippets(false);
    };

    const renderSpecialSection = (title: string, Icon: LucideIcon, color: string, children: React.ReactNode) => (
        <div style={{
            marginBottom: '24px', padding: '16px', borderRadius: '12px',
            background: `color-mix(in srgb, ${color} 6%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 19%, transparent)`,
            boxShadow: 'var(--cm-shadow-card)'
        }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '16px', color: color, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon size={14} strokeWidth={1.75} aria-hidden="true" /> {title}
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
        // E7：用当前展示的值（草稿 or 已保存）校验重复 / 非法字符 / 保留字，排除自身
        const refError = isRefName && pendingRefName !== null
            ? validateTaskRefName(workflowDef, String(currentVal), displayTask.taskReferenceName)
            : (isRefName ? refNameError : null);
        const isDuplicate = !!refError;
        return (
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: secondaryTextColor, marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                    {label}
                    {isRefName && refError && <span role="alert" style={{ color: 'var(--cm-status-failed)', marginLeft: '8px', textTransform: 'none', display: 'inline-block', fontWeight: 'normal' }}><TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />{refError}</span>}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                        type={type}
                        value={currentVal}
                        placeholder={placeholder}
                        onChange={(e) => {
                            const nextVal = e.target.value;
                            if (isRefName) {
                                // 引用名字段：仅更新本地草稿，不触发 store 更新（避免每次按键重新解析）
                                setPendingRefName(nextVal);
                            } else {
                                handleChange(field, type === 'number' ? (nextVal === '' ? undefined : Number(nextVal)) : nextVal);
                                const pos = e.target.selectionStart ?? 0;
                                if (type === 'text' && pos >= 2 && nextVal.slice(pos - 2, pos) === '${') {
                                    const rect = e.target.getBoundingClientRect();
                                    setSuggesterAnchor(rect);
                                    setOnSelectSuggestion(() => (selectedExpr: string) => {
                                        const before = nextVal.slice(0, pos - 2);
                                        const after = nextVal.slice(pos);
                                        handleChange(field, before + selectedExpr + after);
                                    });
                                    setSuggesterOpen(true);
                                }
                            }
                        }}
                        onFocus={isRefName ? () => {
                            // 聚焦时初始化草稿为当前已保存值
                            if (pendingRefName === null) {
                                setPendingRefName((displayTask as any).taskReferenceName ?? '');
                            }
                        } : undefined}
                        onBlur={isRefName ? (e) => {
                            // 失焦时提交：校验不通过则保留草稿并显示原因，不写入 store（E7）
                            const newRef = e.target.value.trim();
                            if (newRef === displayTask.taskReferenceName) {
                                setPendingRefName(null);
                                setRefNameError(null);
                                return;
                            }
                            const err = validateTaskRefName(workflowDef, newRef, displayTask.taskReferenceName);
                            if (err) {
                                setRefNameError(err);
                                return;
                            }
                            setPendingRefName(null); // 清除草稿
                            setRefNameError(null);
                            handleChange('taskReferenceName', newRef);
                        } : undefined}
                        onKeyDown={isRefName ? (e) => {
                            if (e.key === 'Enter') e.currentTarget.blur(); // Enter 触发提交
                            e.stopPropagation(); // 防止 ReactFlow 快捷键被触发
                        } : undefined}
                        disabled={!isEditMode}
                        style={{
                            width: '100%', padding: `8px ${isEditMode && !isRefName ? '32px' : '12px'} 8px 12px`,
                            borderRadius: '6px', border: `1px solid ${isDuplicate ? 'var(--cm-status-failed)' : borderColor}`,
                            background: inputBg, color: textColor, fontSize: '13px', outline: 'none',
                            opacity: isEditMode ? 1 : 0.8, fontFamily: isRefName ? 'monospace' : 'inherit'
                        }}
                    />
                    {isEditMode && !isRefName && (
                        <button className="ai-hint-trigger" onClick={(e) => handleAiHintClick(e, (val) => handleChange(field, val))} title="AI 智能提示"
                            style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px', opacity: 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={14} strokeWidth={1.75} aria-hidden="true" /></button>
                    )}
                </div>
            </div>
        );
    };

    /**
     * 带"全屏编辑"按钮的代码/表达式文本域。
     * 编辑模式下右上角出现全屏按钮，点击打开全屏编辑器；只读模式退化为普通 textarea。
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
                            <Maximize2 size={14} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                    )}
                </div>
                <textarea
                    value={value}
                    placeholder={ph}
                    onChange={(e) => {
                        const nextVal = e.target.value;
                        onChange(nextVal);
                        // W-LSP auto-trigger when user types "${"
                        const pos = e.target.selectionStart ?? 0;
                        if (pos >= 2 && nextVal.slice(pos - 2, pos) === '${') {
                            const rect = e.target.getBoundingClientRect();
                            setSuggesterAnchor(rect);
                            setOnSelectSuggestion(() => (selectedExpr: string) => {
                                const before = nextVal.slice(0, pos - 2);
                                const after = nextVal.slice(pos);
                                onChange(before + selectedExpr + after);
                            });
                            setSuggesterOpen(true);
                        }
                    }}
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
            <input
                type={type}
                value={value ?? ''}
                placeholder={placeholder}
                onChange={(e) => {
                    const nextVal = e.target.value;
                    onChange(type === 'number' ? (nextVal === '' ? undefined : Number(nextVal)) : nextVal);
                    const pos = e.target.selectionStart ?? 0;
                    if (type === 'text' && pos >= 2 && nextVal.slice(pos - 2, pos) === '${') {
                        const rect = e.target.getBoundingClientRect();
                        setSuggesterAnchor(rect);
                        setOnSelectSuggestion(() => (selectedExpr: string) => {
                            const before = nextVal.slice(0, pos - 2);
                            const after = nextVal.slice(pos);
                            onChange(before + selectedExpr + after);
                        });
                        setSuggesterOpen(true);
                    }
                }}
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
                <span style={{ position: 'absolute', top: '2px', left: value ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'var(--cm-surface-1)', transition: 'left 0.2s' }} />
            </button>
        </div>
    );

    const renderModeSwitch = (modes: { key: string; label: string }[], current: string, onChange: (v: string) => void) => (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {modes.map(m => (
                <button key={m.key} onClick={() => onChange(m.key)} disabled={!isEditMode}
                    style={{ flex: 1, padding: '6px', borderRadius: '6px', border: `1px solid ${borderColor}`, cursor: 'pointer', fontSize: '11px', fontWeight: current === m.key ? 'bold' : 'normal', background: current === m.key ? 'var(--color-accent)' : inputBg, color: current === m.key ? 'var(--color-on-accent)' : textColor }}>
                    {m.label}
                </button>
            ))}
        </div>
    );

    const httpRequest = displayTask.inputParameters?.http_request || displayTask.httpRequest || {};
    // E2：INLINE 的 evaluatorType 在 inputParameters，兼容旧版写在顶层
    const inlineEvaluator: string = displayTask.inputParameters?.evaluatorType || (displayTask as any).evaluatorType || 'graaljs';
    // E4：KAFKA_PUBLISH 字段在 inputParameters.kafka_request，兼容旧版直接放在 inputParameters
    const kafkaRequest: Record<string, any> = displayTask.inputParameters?.kafka_request || {};
    const kafkaField = (k: string) => kafkaRequest[k] ?? displayTask.inputParameters?.[k];
    // E1：SWITCH 读写 evaluatorType + expression
    const switchEvaluator: string = (displayTask as any).evaluatorType || 'value-param';
    // 兼容旧数据 / 业务模式只写了 DECISION 字段（caseValueParam / caseExpression）的 SWITCH
    const switchExpression: string = displayTask.expression
        ?? (switchEvaluator === 'value-param' ? displayTask.caseValueParam : displayTask.caseExpression)
        ?? '';
    /** SWITCH 写 expression；旧字段 caseValueParam 若存在则同步（业务模式仍读它），caseExpression 删除 */
    const switchExpressionPatch = (v: string): Record<string, any> => ({
        expression: v,
        ...(displayTask.caseValueParam !== undefined && switchEvaluator === 'value-param' ? { caseValueParam: v } : {}),
        ...(displayTask.caseExpression !== undefined ? { caseExpression: undefined } : {}),
    });

    return (
        <>
        <div className={`detail-panel-container ${panelClass}`} style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '450px', zIndex: 1200,
            display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)',
            borderLeft: `1px solid ${borderColor}`, boxShadow: 'var(--cm-shadow-float)', overflowY: 'hidden',
        }}>
            {/* Header */}
            <div style={{ padding: '24px', borderBottom: `1px solid ${borderColor}`, background: 'var(--bg-secondary)', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px' }}>
                        {displayTask.type || 'TASK'}
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: textColor, cursor: 'pointer', fontSize: '20px' }}><X size={14} strokeWidth={1.75} aria-hidden="true" /></button>
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
                {displayTask.type === 'HTTP' && renderSpecialSection('HTTP 请求配置', Globe, 'var(--color-accent)', (
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
                        {renderJsonArea('HEADERS (JSON)', 'http_headers',
                            stringifyForDraft(httpRequest.headers),
                            commitJson((v) => handleHttpChange('headers', v)),
                            { rows: 3 })}
                        {renderJsonArea('BODY (RAW/JSON)', 'http_body',
                            stringifyForDraft(httpRequest.body, ''),
                            commitJsonOrText((v) => handleHttpChange('body', v === '' ? undefined : v)),
                            { rows: 4 })}
                    </>
                ))}

                {/* ── INLINE / LAMBDA ── */}
                {(displayTask.type === 'INLINE' || displayTask.type === 'LAMBDA') && renderSpecialSection('内联脚本配置 (Inline)', ScrollText, 'var(--color-accent)', (
                    <>
                        {displayTask.type === 'INLINE' && renderSelect('脚本引擎 (inputParameters.evaluatorType)', ['graaljs', 'javascript', 'value-param', 'python'],
                            inlineEvaluator,
                            (v) => handleInputParamMigrating('evaluatorType', v)
                        )}
                        {renderCodeArea(
                            `EXPRESSION ${inlineEvaluator === 'value-param' ? '(值引用)' : '(脚本)'}`,
                            displayTask.inputParameters?.expression || displayTask.inputParameters?.scriptExpression || '',
                            (v) => {
                                const key = displayTask.inputParameters?.scriptExpression !== undefined ? 'scriptExpression' : 'expression';
                                handleInputParamChange(key, v);
                            },
                            { rows: 10, language: inlineEvaluator === 'value-param' ? 'text' : 'javascript', style: { background: 'var(--cm-overlay)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' } }
                        )}
                        <div style={{ marginTop: '8px', fontSize: '10px', color: secondaryTextColor, fontStyle: 'italic' }}>
                            提示: 使用 $.input.key 访问输入参数，返回值作为任务输出。
                        </div>
                    </>
                ))}

                {/* ── JSON_JQ_TRANSFORM ── */}
                {displayTask.type === 'JSON_JQ_TRANSFORM' && renderSpecialSection('JQ 数据转换', Search, 'var(--color-accent)', (
                    <>
                        {renderCodeArea('JQ QUERY EXPRESSION', displayTask.inputParameters?.queryExpression || '',
                            (v) => handleInputParamChange('queryExpression', v),
                            { rows: 6, language: 'jq', style: { color: 'var(--color-accent)' } })}
                        <div style={{ marginTop: '8px', fontSize: '10px', color: secondaryTextColor }}>
                            输出字段: result（首个结果）、resultList（完整列表）
                        </div>
                    </>
                ))}

                {/* ── SUB_WORKFLOW ── */}
                {displayTask.type === 'SUB_WORKFLOW' && renderSpecialSection('子工作流配置', Workflow, 'var(--color-accent)', (
                    <>
                        {renderSmallInput('WORKFLOW NAME *', displayTask.subWorkflowParam?.name || '', (v) => handleNestedChange('subWorkflowParam', 'name', v), 'text', 'e.g. my_workflow')}
                        {renderSmallInput('VERSION', displayTask.subWorkflowParam?.version ?? '', (v) => handleNestedChange('subWorkflowParam', 'version', v ? parseInt(v) : undefined), 'number', '1')}
                        {renderJsonArea('INPUT PARAMETERS MAPPING (JSON)', 'sub_inputs',
                            stringifyForDraft(displayTask.inputParameters),
                            commitJson((v) => handleChange('inputParameters', v)),
                            { rows: 5 })}
                        <div style={{ fontSize: '10px', color: secondaryTextColor, marginTop: '4px' }}>
                            传递给子工作流的参数，支持 {'${workflow.input.xxx}'} 表达式
                        </div>
                    </>
                ))}

                {/* ── START_WORKFLOW ── */}
                {displayTask.type === 'START_WORKFLOW' && renderSpecialSection('启动工作流配置', Play, 'var(--color-accent)', (
                    <>
                        <div style={{ fontSize: '11px', color: secondaryTextColor, marginBottom: '12px', padding: '8px', borderRadius: '6px', background: 'var(--cm-warning-tint)', border: '1px solid color-mix(in srgb, var(--cm-status-warning) 35%, transparent)' }}>
                            <Zap size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />注意：此任务启动目标工作流后立即继续，<b>不等待</b>目标工作流完成。
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
                        {renderJsonArea('WORKFLOW INPUT (JSON)', 'start_input',
                            stringifyForDraft(displayTask.inputParameters?.startWorkflow?.input),
                            commitJson((v) => handleInputParamChange('startWorkflow', { ...(displayTask.inputParameters?.startWorkflow || {}), input: v })),
                            { rows: 4 })}
                    </>
                ))}

                {/* ── TERMINATE ── */}
                {displayTask.type === 'TERMINATE' && renderSpecialSection('终止状态配置', Square, 'var(--color-accent)', (
                    <>
                        <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>TERMINATION STATUS</label>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            {['COMPLETED', 'FAILED', 'TERMINATED'].map(s => (
                                <button key={s} onClick={() => handleInputParamChange('terminationStatus', s)} disabled={!isEditMode}
                                    style={{ flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer', background: (displayTask.inputParameters?.terminationStatus || 'COMPLETED') === s ? 'var(--color-accent)' : inputBg, color: (displayTask.inputParameters?.terminationStatus || 'COMPLETED') === s ? 'var(--color-on-accent)' : textColor, border: `1px solid ${borderColor}`, fontWeight: 'bold', fontSize: '11px' }}>
                                    {s}
                                </button>
                            ))}
                        </div>
                        {renderSmallInput('TERMINATION REASON', displayTask.inputParameters?.terminationReason || '', (v) => handleInputParamChange('terminationReason', v), 'text', '终止原因...')}
                        {renderJsonArea('WORKFLOW OUTPUT (JSON)', 'terminate_output',
                            stringifyForDraft(displayTask.inputParameters?.workflowOutput),
                            commitJson((v) => handleInputParamChange('workflowOutput', v)),
                            { rows: 3 })}
                    </>
                ))}

                {/* ── EVENT ── */}
                {displayTask.type === 'EVENT' && renderSpecialSection('事件发送配置', Mail, 'var(--color-accent)', (
                    <>
                        {renderSmallInput('EVENT SINK *', displayTask.sink || '', (v) => handleChange('sink', v), 'text', 'e.g. sqs:queue_name 或 conductor')}
                        <div style={{ fontSize: '10px', color: secondaryTextColor, marginTop: '4px', marginBottom: '8px' }}>
                            支持前缀: conductor | sqs | kafka | amqp | nats
                        </div>
                        {renderToggle('异步完成 (asyncComplete)', !!(displayTask as any).asyncComplete, (v) => handleChange('asyncComplete', v))}
                    </>
                ))}

                {/* ── WAIT ── */}
                {displayTask.type === 'WAIT' && renderSpecialSection('等待状态配置', Hourglass, 'var(--color-accent)', (
                    <>
                        {renderModeSwitch([{ key: 'duration', label: '等待时长' }, { key: 'until', label: '等待到指定时间' }], waitMode, (v) => handleWaitModeChange(v as 'duration' | 'until'))}
                        {waitMode === 'duration'
                            ? renderSmallInput('DURATION', displayTask.inputParameters?.duration || '', (v) => handleInputParamChange('duration', v), 'text', 'e.g. 30s, 10m, 2 hours')
                            : renderSmallInput('UNTIL (时间点)', displayTask.inputParameters?.until || '', (v) => handleInputParamChange('until', v), 'text', 'e.g. 2025-06-15 09:00 GMT+00:00')}
                        <div style={{ fontSize: '11px', color: secondaryTextColor, lineHeight: '1.6', marginTop: '8px' }}>
                            此任务会使工作流进入 <b>IN_PROGRESS</b> 状态，直到时间满足或外部 API 触发完成。
                        </div>
                    </>
                ))}

                {/* ── DECISION / SWITCH ── */}
                {displayTask.type === 'SWITCH' && renderSpecialSection('条件分支配置', Scale, 'var(--color-accent)', (
                    <>
                        {renderSelect('评估模式 (evaluatorType)',
                            ['value-param', 'javascript', 'graaljs'],
                            switchEvaluator,
                            (v) => handleChange('evaluatorType', v)
                        )}
                        {switchEvaluator === 'value-param'
                            ? <>
                                {renderSmallInput('EXPRESSION (inputParameters 中的参数名) *', switchExpression, (v) => applyPatch(switchExpressionPatch(v)), 'text', 'e.g. switchCaseValue')}
                                <div style={{ fontSize: '10px', color: secondaryTextColor, marginTop: '-4px', marginBottom: '8px' }}>
                                    运行时取 inputParameters 中该参数的值，与分支名匹配
                                </div>
                            </>
                            : renderCodeArea('EXPRESSION (脚本) *', switchExpression,
                                (v) => applyPatch(switchExpressionPatch(v)),
                                { rows: 4, language: 'javascript', style: { color: 'var(--color-accent)' } })
                        }
                        <div style={{ fontSize: '10px', color: secondaryTextColor, marginTop: '8px' }}>
                            分支可在图中通过右键节点→"添加分支"进行管理
                        </div>
                    </>
                ))}

                {/* ── DECISION（旧版，仍使用 caseValueParam / caseExpression） ── */}
                {displayTask.type === 'DECISION' && renderSpecialSection('条件分支配置（DECISION）', Scale, 'var(--color-accent)', (
                    <>
                        {renderSmallInput('CASE VALUE PARAM (参数名)', displayTask.caseValueParam || '', (v) => handleChange('caseValueParam', v), 'text', 'e.g. status')}
                        {renderCodeArea('CASE EXPRESSION (JS，可选)', displayTask.caseExpression || '',
                            (v) => handleChange('caseExpression', v),
                            { rows: 4, language: 'javascript', style: { color: 'var(--color-accent)' } })}
                        <div style={{ fontSize: '10px', color: secondaryTextColor, marginTop: '8px' }}>
                            分支可在图中通过右键节点→"添加分支"进行管理
                        </div>
                    </>
                ))}

                {/* ── DO_WHILE ── */}
                {displayTask.type === 'DO_WHILE' && renderSpecialSection('循环逻辑配置', Repeat, 'var(--color-accent)', (
                    <>
                        {renderModeSwitch([{ key: 'condition', label: '条件循环' }, { key: 'items', label: '列表迭代' }], doWhileMode, (v) => setDoWhileMode(v as any))}
                        {doWhileMode === 'condition' ? (
                            <>
                                {renderCodeArea('LOOP CONDITION (JS) *', displayTask.loopCondition || '',
                                    (v) => handleChange('loopCondition', v),
                                    { rows: 4, language: 'javascript', style: { color: 'var(--color-accent)' } })}
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
                {displayTask.type === 'FORK_JOIN_DYNAMIC' && renderSpecialSection('动态并行配置', Zap, 'var(--color-accent)', (
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
                                {renderSmallInput('FORK TASK TYPE *', dynamicForkField(displayTask, 'forkTaskType') || '', (v) => handleInputParamMigrating('forkTaskType', v), 'text', 'e.g. HTTP')}
                                {renderSmallInput('FORK TASK NAME (仅 SIMPLE 任务)', dynamicForkField(displayTask, 'forkTaskName') || '', (v) => handleInputParamMigrating('forkTaskName', v), 'text', 'e.g. my_task')}
                                {renderSmallInput('FORK TASK INPUTS', typeof dynamicForkField(displayTask, 'forkTaskInputs') === 'string' ? dynamicForkField(displayTask, 'forkTaskInputs') : '', (v) => handleInputParamMigrating('forkTaskInputs', v), 'text', '${workflow.input.items}')}
                                <div style={{ fontSize: '10px', color: secondaryTextColor }}>
                                    所有分支执行相同任务类型，每个元素作为一个分支输入；以上字段写入 inputParameters
                                </div>
                            </>
                        )}
                        {dynamicForkMode === 'workflow' && (
                            <>
                                {renderSmallInput('FORK WORKFLOW NAME *', dynamicForkField(displayTask, 'forkTaskWorkflow') || '', (v) => handleInputParamMigrating('forkTaskWorkflow', v), 'text', 'e.g. sub_workflow')}
                                {renderSmallInput('WORKFLOW VERSION', dynamicForkField(displayTask, 'forkTaskWorkflowVersion') ?? '', (v) => handleInputParamMigrating('forkTaskWorkflowVersion', v), 'text', '1')}
                                {renderSmallInput('FORK TASK INPUTS', typeof dynamicForkField(displayTask, 'forkTaskInputs') === 'string' ? dynamicForkField(displayTask, 'forkTaskInputs') : '', (v) => handleInputParamMigrating('forkTaskInputs', v), 'text', '${workflow.input.items}')}
                                <div style={{ fontSize: '10px', color: secondaryTextColor }}>
                                    所有分支执行相同子工作流，每个元素作为一个子工作流输入；以上字段写入 inputParameters
                                </div>
                            </>
                        )}
                    </>
                ))}

                {/* ── DYNAMIC ── */}
                {displayTask.type === 'DYNAMIC' && renderSpecialSection('动态任务配置', Target, 'var(--color-accent)', (
                    <>
                        {renderSmallInput('DYNAMIC TASK NAME PARAM *', (displayTask as any).dynamicTaskNameParam || '', (v) => handleChange('dynamicTaskNameParam', v), 'text', 'e.g. taskToExecute')}
                        <div style={{ fontSize: '10px', color: secondaryTextColor, marginTop: '4px' }}>
                            运行时从 inputParameters 的指定键中读取实际任务类型名（如 "HTTP"、"SIMPLE"）
                        </div>
                    </>
                ))}

                {/* ── HUMAN ── */}
                {displayTask.type === 'HUMAN' && renderSpecialSection('人工审批配置', User, 'var(--color-accent)', (
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
                {displayTask.type === 'KAFKA_PUBLISH' && renderSpecialSection('Kafka 推送配置', Send, 'var(--color-accent)', (
                    <>
                        {renderSmallInput('BOOTSTRAP SERVERS *', kafkaField('bootStrapServers') || '', (v) => handleInputObjectChange('kafka_request', 'bootStrapServers', v), 'text', 'localhost:9092')}
                        {renderSmallInput('TOPIC *', kafkaField('topic') || '', (v) => handleInputObjectChange('kafka_request', 'topic', v), 'text', 'my_topic')}
                        {renderSmallInput('KEY (消息分区键)', kafkaField('key') || '', (v) => handleInputObjectChange('kafka_request', 'key', v), 'text', '')}
                        {renderJsonArea('VALUE (消息内容)', 'kafka_value',
                            stringifyForDraft(kafkaField('value'), ''),
                            commitJsonOrText((v) => handleInputObjectChange('kafka_request', 'value', v)),
                            { rows: 4 })}
                        {renderJsonArea('HEADERS (JSON)', 'kafka_headers',
                            stringifyForDraft(kafkaField('headers')),
                            commitJson((v) => handleInputObjectChange('kafka_request', 'headers', v)),
                            { rows: 3 })}
                        <div style={{ fontSize: '10px', color: secondaryTextColor, marginTop: '4px' }}>
                            以上字段写入 inputParameters.kafka_request
                        </div>
                    </>
                ))}

                {/* ── SET_VARIABLE ── */}
                {displayTask.type === 'SET_VARIABLE' && renderSpecialSection('变量配置', Package, 'var(--color-accent)', (
                    <>
                        <div style={{ fontSize: '11px', color: secondaryTextColor, marginBottom: '12px' }}>
                            在 inputParameters 中定义要设置的变量名和值，后续任务通过 {'${workflow.variables.varName}'} 访问。
                        </div>
                        {renderJsonArea('VARIABLES (JSON)', 'set_variables',
                            stringifyForDraft(displayTask.inputParameters),
                            commitJson((v) => handleChange('inputParameters', v)),
                            { rows: 6 })}
                    </>
                ))}

                {/* ── 通用配置区 ── */}
                <div style={{ marginTop: '32px', borderTop: `1px solid ${borderColor}`, paddingTop: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '16px', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '1px' }}>通用参数与属性</div>

                    {renderInput('任务唯一引用名 (Reference Name)', 'taskReferenceName')}
                    {lastRefactorNotice && lastRefactorNotice.newRef === displayTask.taskReferenceName && (
                        <div style={{
                            marginBottom: '16px', padding: '10px 12px', borderRadius: '8px',
                            background: 'color-mix(in srgb, var(--cm-status-success) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--cm-status-success) 35%, transparent)',
                            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px'
                        }}>
                            <div style={{ fontSize: '11px', color: 'var(--cm-status-success)', lineHeight: 1.5 }}>
                                <b><Link size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />W-LSP 全图级联重构已生效</b><br />
                                引用名 <code>{lastRefactorNotice.oldRef}</code> → <code>{lastRefactorNotice.newRef}</code>，已自动同步 <b>{lastRefactorNotice.replacedCount}</b> 处下游表达式（涉及节点：{lastRefactorNotice.affectedTasks.join(', ')}）
                            </div>
                            <button
                                onClick={clearRefactorNotice}
                                style={{ background: 'none', border: 'none', color: 'var(--cm-status-success)', cursor: 'pointer', fontSize: '12px', padding: '2px' }}
                            >
                                <X size={14} strokeWidth={1.75} aria-hidden="true" />
                            </button>
                        </div>
                    )}
                    {renderInput('任务描述', 'description')}

                    {/* inputParameters with snippet panel + AI fill */}
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '6px' }}>
                            <label style={{ fontSize: '11px', color: secondaryTextColor, fontWeight: '600', textTransform: 'uppercase', flex: 1 }}>
                                输入参数 (inputParameters) <span style={{ opacity: 0.5, fontWeight: 'normal' }}>(JSON / 输入 ${'{'} 自动补全)</span>
                            </label>
                            {isEditMode && (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        onClick={(e) => {
                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                            setSuggesterAnchor(rect);
                                            setOnSelectSuggestion(() => (val: string) => {
                                                if (activeTextareaRef) {
                                                    insertSnippet(val);
                                                } else {
                                                    const cur = typeof displayTask.inputParameters === 'object' && displayTask.inputParameters !== null
                                                        ? { ...displayTask.inputParameters }
                                                        : {};
                                                    cur[`param_${Object.keys(cur).length + 1}`] = val;
                                                    handleChange('inputParameters', cur);
                                                }
                                            });
                                            setSuggesterOpen(true);
                                        }}
                                        title="打开 W-LSP 上游变量与 Schema 零延迟补全器"
                                        style={{
                                            fontSize: '11px', background: 'color-mix(in srgb, var(--cm-data) 14%, transparent)',
                                            border: '1px solid color-mix(in srgb, var(--cm-data) 35%, transparent)', borderRadius: '4px', padding: '2px 8px',
                                            cursor: 'pointer', color: 'var(--cm-data)', fontWeight: 600,
                                            display: 'flex', alignItems: 'center', gap: '4px'
                                        }}
                                    >
                                        <Zap size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />变量补全
                                    </button>
                                    <button
                                        onClick={handleAiFillParams}
                                        disabled={aiFillLoading}
                                        title="AI 根据上下文自动生成 inputParameters"
                                        style={{
                                            fontSize: '11px', background: 'var(--cm-ai)',
                                            border: 'none', borderRadius: '4px', padding: '2px 8px',
                                            cursor: aiFillLoading ? 'not-allowed' : 'pointer',
                                            color: 'var(--cm-surface-0)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px',
                                            opacity: aiFillLoading ? 0.7 : 1,
                                        }}>
                                        {aiFillLoading ? <Hourglass size={12} strokeWidth={1.75} aria-hidden="true" /> : <Sparkles size={12} strokeWidth={1.75} aria-hidden="true" />} AI 填充
                                    </button>
                                    <button onClick={() => setShowSnippets(!showSnippets)} title="快捷表达式"
                                        style={{ fontSize: '11px', background: showSnippets ? 'var(--color-accent)' : 'none', border: `1px solid ${borderColor}`, borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', color: showSnippets ? 'var(--color-on-accent)' : secondaryTextColor }}>
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
                        {aiNotice && (
                            <div role="alert" style={{ marginBottom: '8px', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: '6px', color: 'var(--text-secondary)', border: '1px solid color-mix(in srgb, var(--cm-status-warning) 35%, transparent)', background: 'color-mix(in srgb, var(--cm-status-warning) 8%, transparent)' }}>
                                <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1, color: 'var(--cm-status-warning)' }} />
                                <span style={{ flex: 1 }}>{aiNotice}</span>
                                <button onClick={() => setAiNotice(null)} aria-label="关闭提示" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                                    <X size={12} strokeWidth={1.75} aria-hidden="true" />
                                </button>
                            </div>
                        )}
                        {/* AI 填充 Diff 预览 */}
                        {aiFillDiff && (
                            <div style={{ marginBottom: '8px', borderRadius: '8px', border: '1px solid color-mix(in srgb, var(--cm-ai) 19%, transparent)', background: 'color-mix(in srgb, var(--cm-ai) 3%, transparent)', overflow: 'hidden' }}>
                                <div style={{ padding: '8px 12px', background: 'color-mix(in srgb, var(--cm-ai) 9%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--cm-ai)' }}><Sparkles size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />AI 建议的 inputParameters</span>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            onClick={() => {
                                                handleChange('inputParameters', aiFillDiff.generated);
                                                setAiFillDiff(null);
                                            }}
                                            style={{ fontSize: '11px', background: 'var(--cm-ai)', color: 'var(--cm-surface-0)', border: 'none', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
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
                        {renderJsonArea('', 'inputParameters',
                            stringifyForDraft(displayTask.inputParameters),
                            commitJson((v) => handleChange('inputParameters', v)),
                            { rows: 5, dataField: 'inputParameters', style: { outline: 'none' } })}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {renderInput('重试次数', 'retryCount', 'number')}
                        {renderSmallInput('超时限制 (秒，taskDefinition)', readTaskDefinitionField(displayTask, 'timeoutSeconds') ?? '', (v) => handleTaskDefChange('timeoutSeconds', v), 'number', '0 表示不限制')}
                    </div>

                    {/* 高级配置折叠区 */}
                    <details style={{ marginTop: '16px' }}>
                        <summary style={{ fontSize: '11px', cursor: 'pointer', color: secondaryTextColor, userSelect: 'none', fontWeight: '600' }}>
                            ▸ 执行控制（高级）
                        </summary>
                        <div style={{ marginTop: '12px' }}>
                            <div style={{ fontSize: '11px', color: secondaryTextColor, marginBottom: '12px', padding: '8px', borderRadius: '6px', background: 'var(--cm-warning-tint)', border: '1px solid color-mix(in srgb, var(--cm-status-warning) 35%, transparent)', lineHeight: 1.6 }}>
                                <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
                                超时、重试策略、重试延迟写入任务内嵌定义 <code>taskDefinition</code>。设置后 Conductor 会用这份内嵌定义代替同名的已注册任务定义；如需沿用注册中心的配置，请在任务定义中修改。
                            </div>
                            {renderSelect('重试策略 (taskDefinition.retryLogic)',
                                ['FIXED', 'EXPONENTIAL_BACKOFF', 'LINEAR_BACKOFF'],
                                readTaskDefinitionField(displayTask, 'retryLogic') || 'FIXED',
                                (v) => handleTaskDefChange('retryLogic', v)
                            )}
                            {renderSmallInput('重试延迟 (秒，taskDefinition)', readTaskDefinitionField(displayTask, 'retryDelaySeconds') ?? '', (v) => handleTaskDefChange('retryDelaySeconds', v), 'number', '0')}
                            {renderSelect('超时策略 (taskDefinition.timeoutPolicy)',
                                ['TIME_OUT_WF', 'ALERT_ONLY', 'RETRY'],
                                readTaskDefinitionField(displayTask, 'timeoutPolicy') || 'TIME_OUT_WF',
                                (v) => handleTaskDefChange('timeoutPolicy', v)
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
                        <pre style={{ background: 'var(--cm-surface-0)', padding: '16px', borderRadius: '8px', fontSize: '10px', overflow: 'auto', border: `1px solid ${borderColor}`, color: secondaryTextColor }}>
                            {JSON.stringify(displayTask, null, 2)}
                        </pre>
                    </details>
                </div>
            </div>

            {/* Footer */}
            {isEditMode && (
                <div style={{ padding: '24px', borderTop: `1px solid ${borderColor}`, background: 'var(--bg-secondary)', display: 'flex', gap: '12px', flexShrink: 0 }}>
                    <div style={{ flex: 1, fontSize: '11px', color: secondaryTextColor, display: 'flex', alignItems: 'center' }}><CircleCheck size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />所有修改已实时同步</div>
                    <button onClick={onClose}
                        style={{ padding: '10px 24px', background: 'var(--color-accent)', color: 'var(--color-on-accent)', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px var(--color-accent-bg)' }}>
                        完成退出
                    </button>
                </div>
            )}

            <ParameterSuggester
                isOpen={suggesterOpen}
                onClose={() => setSuggesterOpen(false)}
                onSelect={onSelectSuggestion}
                suggestions={currentSuggestions}
                wlspItems={wlspItems}
                anchorRect={suggesterAnchor}
            />
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
