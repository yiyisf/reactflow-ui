import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import useWorkflowStore from '../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import { getAllTasksFlat } from '../services/wlsp/workflowLsp';
import {
    buildDefaultWorkflowMockInput,
    generateDefaultTaskOutputPreview,
    TaskMockOverride,
} from '../utils/localSandboxEngine';

/** DO_WHILE 循环安全上限默认值（与 executeLocalSandboxDryRunAsync 的默认一致） */
const LOOP_SAFETY_DEFAULT = 20;
import type { TaskDef } from '../types/conductor';
import { ClipboardList, Compass, Eraser, FlaskConical, RefreshCw, RotateCcw, Shuffle, TriangleAlert, X, Zap } from 'lucide-react';

interface SandboxConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface TaskDraftMock {
    enabled: boolean;
    status: 'COMPLETED' | 'FAILED' | 'TIMED_OUT' | 'COMPLETED_WITH_ERRORS';
    durationMs: string;
    forceCase: string;
    reasonForIncompletion: string;
    outputJsonText: string;
}

const DEFAULT_DRAFT: TaskDraftMock = {
    enabled: false,
    status: 'COMPLETED',
    durationMs: '',
    forceCase: '',
    reasonForIncompletion: '',
    outputJsonText: '',
};

export const SandboxConfigModal: React.FC<SandboxConfigModalProps> = ({ isOpen, onClose }) => {
    const { workflowDef, theme, themeColor, runLocalSandboxDryRun } = useWorkflowStore(useShallow((s) => ({
            workflowDef: s.workflowDef,
            theme: s.theme,
            themeColor: s.themeColor,
            runLocalSandboxDryRun: s.runLocalSandboxDryRun,
        })));

    const [activeTab, setActiveTab] = useState<'input' | 'tasks' | 'engine'>('input');
    const [inputJsonText, setInputJsonText] = useState('');
    const [inputJsonError, setInputJsonError] = useState<string | null>(null);
    const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraftMock>>({});
    const [selectedTaskRef, setSelectedTaskRef] = useState<string>('');
    const [taskJsonError, setTaskJsonError] = useState<string | null>(null);
    const [maxLoopIterations, setMaxLoopIterations] = useState<number>(LOOP_SAFETY_DEFAULT);

    const allTasks = useMemo<TaskDef[]>(() => {
        if (!workflowDef?.tasks) return [];
        return getAllTasksFlat(workflowDef.tasks);
    }, [workflowDef]);

    const storageKey = useMemo(
        () => `sandbox_mock_cfg_${workflowDef?.name || 'default'}`,
        [workflowDef?.name]
    );

    // Initialize or restore saved mock configuration when modal opens
    useEffect(() => {
        if (!isOpen || !workflowDef) return;
        const defaultInput = buildDefaultWorkflowMockInput(workflowDef);
        let restored = false;

        try {
            const rawSaved = sessionStorage.getItem(storageKey);
            if (rawSaved) {
                const parsed = JSON.parse(rawSaved);
                if (parsed.inputJsonText) {
                    setInputJsonText(parsed.inputJsonText);
                } else {
                    setInputJsonText(JSON.stringify(defaultInput, null, 2));
                }
                if (parsed.taskDrafts && typeof parsed.taskDrafts === 'object') {
                    setTaskDrafts(parsed.taskDrafts);
                }
                // 1.3.1 起这是循环安全上限（旧版本存的 maxLoopIterations 是固定轮次，不再沿用）
                if (typeof parsed.loopSafetyLimit === 'number') {
                    setMaxLoopIterations(parsed.loopSafetyLimit);
                } else {
                    setMaxLoopIterations(LOOP_SAFETY_DEFAULT);
                }
                restored = true;
            }
        } catch {
            // ignore storage parse failure
        }

        if (!restored) {
            setInputJsonText(JSON.stringify(defaultInput, null, 2));
            setTaskDrafts({});
            setMaxLoopIterations(LOOP_SAFETY_DEFAULT);
        }

        setInputJsonError(null);
        setTaskJsonError(null);
        if (allTasks.length > 0 && !selectedTaskRef) {
            setSelectedTaskRef(allTasks[0].taskReferenceName);
        }
    }, [isOpen, workflowDef, storageKey]);

    useEffect(() => {
        if (allTasks.length > 0 && !allTasks.some((t) => t.taskReferenceName === selectedTaskRef)) {
            setSelectedTaskRef(allTasks[0].taskReferenceName);
        }
    }, [allTasks, selectedTaskRef]);

    // Extract SWITCH routing hints tied to workflow.input.*
    const switchInputHints = useMemo(() => {
        const hints: Array<{
            switchRef: string;
            switchName: string;
            inputField: string | null;
            cases: string[];
        }> = [];
        for (const t of allTasks) {
            if (t.type === 'SWITCH' || t.type === 'DECISION') {
                const cases = Object.keys(t.decisionCases || {});
                if (cases.length === 0) continue;
                const paramKey = t.caseValueParam || 'case_value';
                const rawExpr = String(t.inputParameters?.[paramKey] ?? t.expression ?? '');
                const match = rawExpr.match(/\$\{\s*workflow\.input\.([a-zA-Z0-9_]+)\s*\}/);
                hints.push({
                    switchRef: t.taskReferenceName,
                    switchName: t.name || t.taskReferenceName,
                    inputField: match ? match[1] : null,
                    cases,
                });
            }
        }
        return hints;
    }, [allTasks]);

    if (!isOpen || !workflowDef || typeof document === 'undefined') return null;

    const currentTask = allTasks.find((t) => t.taskReferenceName === selectedTaskRef) || allTasks[0] || null;
    const currentDraft: TaskDraftMock =
        (currentTask && taskDrafts[currentTask.taskReferenceName]) || DEFAULT_DRAFT;

    const updateCurrentDraft = (patch: Partial<TaskDraftMock>) => {
        if (!currentTask) return;
        const ref = currentTask.taskReferenceName;
        const prev = taskDrafts[ref] || {
            ...DEFAULT_DRAFT,
            outputJsonText: JSON.stringify(generateDefaultTaskOutputPreview(currentTask), null, 2),
        };
        const next: TaskDraftMock = {
            ...prev,
            ...patch,
            enabled: patch.enabled !== undefined ? patch.enabled : true,
        };
        setTaskDrafts((old) => ({ ...old, [ref]: next }));
        setTaskJsonError(null);
    };

    const enabledMockCount = Object.values(taskDrafts).filter((d) => d.enabled).length;

    const handleApplySwitchInputHint = (field: string, caseVal: string) => {
        try {
            const obj = JSON.parse(inputJsonText || '{}');
            obj[field] = caseVal;
            setInputJsonText(JSON.stringify(obj, null, 2));
            setInputJsonError(null);
        } catch {
            setInputJsonError('请先修复当前 JSON 语法错误后再点击快捷赋值');
        }
    };

    const handleRunWithMocks = () => {
        let parsedInput: Record<string, any> = {};
        try {
            parsedInput = inputJsonText.trim() ? JSON.parse(inputJsonText) : {};
            if (typeof parsedInput !== 'object' || Array.isArray(parsedInput) || parsedInput === null) {
                setInputJsonError('workflow.input 必须是一个 JSON 对象 {...}');
                setActiveTab('input');
                return;
            }
        } catch (err: any) {
            setInputJsonError(`JSON 语法错误: ${err?.message || '格式不合法'}`);
            setActiveTab('input');
            return;
        }

        const compiledTaskMocks: Record<string, TaskMockOverride> = {};
        for (const [ref, draft] of Object.entries(taskDrafts)) {
            if (!draft.enabled) continue;
            let parsedOutput: Record<string, any> | undefined;
            if (draft.outputJsonText.trim()) {
                try {
                    parsedOutput = JSON.parse(draft.outputJsonText);
                } catch (err: any) {
                    setSelectedTaskRef(ref);
                    setActiveTab('tasks');
                    setTaskJsonError(`节点 [${ref}] 的自定义输出 JSON 语法有误: ${err?.message || ''}`);
                    return;
                }
            }

            const durationNum =
                draft.durationMs.trim() !== '' && !Number.isNaN(Number(draft.durationMs))
                    ? Number(draft.durationMs)
                    : undefined;

            compiledTaskMocks[ref] = {
                __isMockOverride: true,
                status: draft.status,
                durationMs: durationNum,
                forceCase: draft.forceCase || undefined,
                reasonForIncompletion: draft.reasonForIncompletion.trim() || undefined,
                outputData: parsedOutput,
            };
        }

        // Persist in sessionStorage so reopening the modal preserves user's custom mocks
        try {
            sessionStorage.setItem(
                storageKey,
                JSON.stringify({
                    inputJsonText,
                    taskDrafts,
                    loopSafetyLimit: maxLoopIterations,
                })
            );
        } catch {
            // ignore quota errors
        }

        void runLocalSandboxDryRun(parsedInput, compiledTaskMocks, maxLoopIterations);
        onClose();
    };

    // The dialog root carries data-mode, so these resolve to the active theme.
    const bgModal = 'var(--cm-surface-1)';
    const bgSurface = 'var(--cm-surface-3)';
    const bgCode = 'var(--cm-surface-0)';
    const textPrimary = 'var(--text-primary)';
    const textSecondary = 'var(--text-muted)';
    const borderCol = 'var(--border-primary)';

    return createPortal(
        <div
            data-mode={theme}
            data-brand={themeColor}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9500,
                background: 'var(--cm-overlay)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: 'min(920px, 96vw)',
                    height: 'min(660px, 90vh)',
                    background: bgModal,
                    color: textPrimary,
                    borderRadius: 14,
                    border: `1px solid ${borderCol}`,
                    boxShadow: 'var(--cm-shadow-float)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '16px 20px',
                        borderBottom: `1px solid ${borderCol}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: bgSurface,
                    }}
                >
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700 }}>
                            <span><FlaskConical size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />本地沙箱试运行 · 人工模拟数据控制台</span>
                            <span
                                style={{
                                    fontSize: 11,
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    background: 'color-mix(in srgb, var(--cm-status-success) 14%, transparent)',
                                    color: 'var(--cm-status-success)',
                                    fontWeight: 600,
                                }}
                            >
                                0ms 确定性求值
                            </span>
                        </div>
                        <div style={{ fontSize: 12, color: textSecondary, marginTop: 4 }}>
                            自定义工作流启动入参 (<code>workflow.input</code>)、指定任意节点的 Mock 输出、模拟节点异常中断或强制切换 <code>SWITCH</code> 分支走向
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: textSecondary,
                            fontSize: 18,
                            cursor: 'pointer',
                            padding: '4px 8px',
                        }}
                    >
                        <X size={14} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                </div>

                {/* Navigation Tabs */}
                <div
                    style={{
                        display: 'flex',
                        gap: 8,
                        padding: '10px 20px',
                        borderBottom: `1px solid ${borderCol}`,
                        background: bgModal,
                    }}
                >
                    {[
                        { id: 'input', label: '1. 工作流启动入参 (workflow.input)' },
                        {
                            id: 'tasks',
                            label: `2. 节点级人工 Mock & 故障注入 ${enabledMockCount > 0 ? `(${enabledMockCount} 个已启用)` : ''}`,
                        },
                        { id: 'engine', label: `3. 循环上限 (${maxLoopIterations} 轮)` },
                    ].map((tab) => {
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id as any)}
                                style={{
                                    padding: '7px 14px',
                                    borderRadius: 8,
                                    border: active ? '1px solid var(--color-accent)' : `1px solid ${borderCol}`,
                                    background: active ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
                                    color: active ? 'var(--color-accent)' : textSecondary,
                                    fontSize: 12,
                                    fontWeight: active ? 700 : 500,
                                    cursor: 'pointer',
                                }}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Body */}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
                    {activeTab === 'input' && (
                        <div
                            style={{
                                flex: 1,
                                padding: 20,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12,
                                overflowY: 'auto',
                            }}
                        >
                            {/* Quick Switch Branch Helper Bar */}
                            {switchInputHints.length > 0 && (
                                <div
                                    style={{
                                        padding: '10px 14px',
                                        borderRadius: 10,
                                        background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                                        border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 8,
                                    }}
                                >
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cm-data)' }}>
                                        <Compass size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />条件分支 (SWITCH) 快速路由切换器
                                    </div>
                                    {switchInputHints.map((hint) => (
                                        <div
                                            key={hint.switchRef}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                flexWrap: 'wrap',
                                                gap: 6,
                                                fontSize: 12,
                                            }}
                                        >
                                            <span style={{ color: textSecondary }}>
                                                节点 <b>{hint.switchName}</b> (<code>{hint.switchRef}</code>)
                                                {hint.inputField
                                                    ? ` 绑定入参字段 "${hint.inputField}" — 点击一键切换分支:`
                                                    : ' 可选分支 (可在 Tab 2 强制指定):'}
                                            </span>
                                            {hint.cases.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => {
                                                        if (hint.inputField) {
                                                            handleApplySwitchInputHint(hint.inputField, c);
                                                        } else {
                                                            setSelectedTaskRef(hint.switchRef);
                                                            setActiveTab('tasks');
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '2px 9px',
                                                        borderRadius: 999,
                                                        border: '1px solid color-mix(in srgb, var(--cm-data) 45%, transparent)',
                                                        background: 'color-mix(in srgb, var(--cm-data) 14%, transparent)',
                                                        color: 'var(--cm-data)',
                                                        fontSize: 11,
                                                        fontFamily: 'monospace',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {hint.inputField ? `${hint.inputField} = "${c}"` : `走分支: ${c}`}
                                                </button>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: textSecondary }}>
                                    编辑 <code>workflow.input</code> JSON（所有节点的 <code>{'${workflow.input.*}'}</code> 将实时读取此处的值）：
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const fresh = buildDefaultWorkflowMockInput(workflowDef);
                                        setInputJsonText(JSON.stringify(fresh, null, 2));
                                        setInputJsonError(null);
                                    }}
                                    style={{
                                        fontSize: 11,
                                        padding: '4px 10px',
                                        borderRadius: 6,
                                        border: `1px solid ${borderCol}`,
                                        background: bgSurface,
                                        color: textSecondary,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />重置为默认推导值
                                </button>
                            </div>

                            {inputJsonError && (
                                <div
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        background: 'color-mix(in srgb, var(--cm-status-failed) 14%, transparent)',
                                        border: '1px solid color-mix(in srgb, var(--cm-status-failed) 40%, transparent)',
                                        color: 'var(--cm-status-failed)',
                                        fontSize: 12,
                                    }}
                                >
                                    <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />{inputJsonError}
                                </div>
                            )}

                            <textarea
                                value={inputJsonText}
                                onChange={(e) => {
                                    setInputJsonText(e.target.value);
                                    setInputJsonError(null);
                                }}
                                spellCheck={false}
                                style={{
                                    flex: 1,
                                    minHeight: 240,
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    padding: 14,
                                    borderRadius: 10,
                                    border: `1px solid ${inputJsonError ? 'var(--cm-status-failed)' : borderCol}`,
                                    background: bgCode,
                                    color: textPrimary,
                                    fontFamily: 'monospace',
                                    fontSize: 13,
                                    lineHeight: 1.55,
                                    resize: 'none',
                                    outline: 'none',
                                }}
                            />
                        </div>
                    )}

                    {activeTab === 'tasks' && (
                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 0 }}>
                            {/* Left Task List */}
                            <div
                                style={{
                                    borderRight: `1px solid ${borderCol}`,
                                    overflowY: 'auto',
                                    padding: '10px 8px',
                                    background: bgSurface,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 4,
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: textSecondary,
                                        padding: '4px 8px 8px',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    选择要定制 Mock 的节点 ({allTasks.length})
                                </div>
                                {allTasks.map((t) => {
                                    const ref = t.taskReferenceName;
                                    const isSelected = currentTask?.taskReferenceName === ref;
                                    const draft = taskDrafts[ref];
                                    const isEnabled = Boolean(draft?.enabled);
                                    return (
                                        <div
                                            key={ref}
                                            onClick={() => {
                                                setSelectedTaskRef(ref);
                                                setTaskJsonError(null);
                                            }}
                                            style={{
                                                padding: '8px 10px',
                                                borderRadius: 8,
                                                cursor: 'pointer',
                                                background: isSelected
                                                    ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)'
                                                    : 'transparent',
                                                border: isSelected
                                                    ? '1px solid color-mix(in srgb, var(--color-accent) 45%, transparent)'
                                                    : '1px solid transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 6,
                                            }}
                                        >
                                            <div style={{ minWidth: 0 }}>
                                                <div
                                                    style={{
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {t.name || ref}
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: 10,
                                                        color: textSecondary,
                                                        fontFamily: 'monospace',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {ref} · {t.type}
                                                </div>
                                            </div>
                                            {isEnabled && (
                                                <span
                                                    style={{
                                                        fontSize: 10,
                                                        padding: '2px 6px',
                                                        borderRadius: 999,
                                                        background:
                                                            draft.status === 'FAILED' || draft.status === 'TIMED_OUT'
                                                                ? 'color-mix(in srgb, var(--cm-status-failed) 20%, transparent)'
                                                                : 'color-mix(in srgb, var(--cm-status-success) 20%, transparent)',
                                                        color:
                                                            draft.status === 'FAILED' || draft.status === 'TIMED_OUT'
                                                                ? 'var(--cm-status-failed)'
                                                                : 'var(--cm-status-success)',
                                                        fontWeight: 700,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {draft.status === 'COMPLETED' ? '已定制' : draft.status}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Right Task Mock Editor */}
                            {currentTask ? (
                                <div
                                    style={{
                                        padding: 18,
                                        overflowY: 'auto',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 14,
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            paddingBottom: 10,
                                            borderBottom: `1px solid ${borderCol}`,
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 700 }}>
                                                {currentTask.name || currentTask.taskReferenceName}{' '}
                                                <code
                                                    style={{
                                                        fontSize: 12,
                                                        color: 'var(--cm-data)',
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    ({currentTask.taskReferenceName})
                                                </code>
                                            </div>
                                            <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>
                                                节点类型: <b>{currentTask.type}</b>
                                            </div>
                                        </div>

                                        <label
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                fontSize: 12,
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                padding: '6px 12px',
                                                borderRadius: 8,
                                                background: currentDraft.enabled
                                                    ? 'color-mix(in srgb, var(--cm-status-success) 14%, transparent)'
                                                    : bgSurface,
                                                border: `1px solid ${
                                                    currentDraft.enabled ? 'var(--cm-status-success)' : borderCol
                                                }`,
                                                color: currentDraft.enabled ? 'var(--cm-status-success)' : textSecondary,
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={currentDraft.enabled}
                                                onChange={(e) =>
                                                    updateCurrentDraft({ enabled: e.target.checked })
                                                }
                                            />
                                            启用该节点人工 Mock
                                        </label>
                                    </div>

                                    {/* Row 1: Simulated Status & Duration */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 12 }}>
                                        <div>
                                            <label
                                                style={{
                                                    display: 'block',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    color: textSecondary,
                                                    marginBottom: 6,
                                                }}
                                            >
                                                模拟执行状态 (可注入异常以测试断路与错误诊断)
                                            </label>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {(
                                                    [
                                                        { id: 'COMPLETED', label: '正常成功' },
                                                        { id: 'FAILED', label: '失败中断 (FAILED)' },
                                                        { id: 'TIMED_OUT', label: '超时中断 (TIMED_OUT)' },
                                                        { id: 'COMPLETED_WITH_ERRORS', label: '带错完成' },
                                                    ] as const
                                                ).map((st) => {
                                                    const active = currentDraft.status === st.id;
                                                    return (
                                                        <button
                                                            key={st.id}
                                                            type="button"
                                                            onClick={() => updateCurrentDraft({ status: st.id })}
                                                            style={{
                                                                padding: '5px 10px',
                                                                borderRadius: 6,
                                                                fontSize: 11,
                                                                fontWeight: active ? 700 : 500,
                                                                cursor: 'pointer',
                                                                border: active
                                                                    ? '1px solid var(--cm-data)'
                                                                    : `1px solid ${borderCol}`,
                                                                background: active
                                                                    ? 'color-mix(in srgb, var(--cm-data) 16%, transparent)'
                                                                    : bgSurface,
                                                                color: active ? 'var(--cm-data)' : textPrimary,
                                                            }}
                                                        >
                                                            {st.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div>
                                            <label
                                                style={{
                                                    display: 'block',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    color: textSecondary,
                                                    marginBottom: 6,
                                                }}
                                            >
                                                模拟耗时 (ms，可制造并发瓶颈)
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                placeholder="默认自动耗时 (如 120)"
                                                value={currentDraft.durationMs}
                                                onChange={(e) =>
                                                    updateCurrentDraft({ durationMs: e.target.value })
                                                }
                                                style={{
                                                    width: '100%',
                                                    boxSizing: 'border-box',
                                                    padding: '6px 10px',
                                                    borderRadius: 6,
                                                    border: `1px solid ${borderCol}`,
                                                    background: bgCode,
                                                    color: textPrimary,
                                                    fontSize: 12,
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Optional Failure Reason */}
                                    {(currentDraft.status === 'FAILED' || currentDraft.status === 'TIMED_OUT') && (
                                        <div>
                                            <label
                                                style={{
                                                    display: 'block',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    color: 'var(--cm-status-failed)',
                                                    marginBottom: 6,
                                                }}
                                            >
                                                模拟异常原因 (reasonForIncompletion)
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="例如: Connection refused to upstream payment gateway (502)"
                                                value={currentDraft.reasonForIncompletion}
                                                onChange={(e) =>
                                                    updateCurrentDraft({
                                                        reasonForIncompletion: e.target.value,
                                                    })
                                                }
                                                style={{
                                                    width: '100%',
                                                    boxSizing: 'border-box',
                                                    padding: '7px 10px',
                                                    borderRadius: 6,
                                                    border: '1px solid color-mix(in srgb, var(--cm-status-failed) 45%, transparent)',
                                                    background: bgCode,
                                                    color: textPrimary,
                                                    fontSize: 12,
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* SWITCH / DECISION Force Branch Selector */}
                                    {(currentTask.type === 'SWITCH' || currentTask.type === 'DECISION') && (
                                        <div
                                            style={{
                                                padding: '10px 12px',
                                                borderRadius: 8,
                                                background: 'color-mix(in srgb, var(--cm-status-warning) 10%, transparent)',
                                                border: '1px solid color-mix(in srgb, var(--cm-status-warning) 35%, transparent)',
                                            }}
                                        >
                                            <label
                                                style={{
                                                    display: 'block',
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    color: 'var(--cm-status-warning)',
                                                    marginBottom: 6,
                                                }}
                                            >
                                                <Shuffle size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />强制指定 SWITCH 路由分支 (无视入参表达式直接走指定分支)
                                            </label>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => updateCurrentDraft({ forceCase: '' })}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: 6,
                                                        fontSize: 11,
                                                        cursor: 'pointer',
                                                        border: !currentDraft.forceCase
                                                            ? '1px solid var(--cm-status-warning)'
                                                            : `1px solid ${borderCol}`,
                                                        background: !currentDraft.forceCase
                                                            ? 'color-mix(in srgb, var(--cm-status-warning) 20%, transparent)'
                                                            : bgSurface,
                                                        color: !currentDraft.forceCase ? 'var(--cm-status-warning)' : textSecondary,
                                                        fontWeight: !currentDraft.forceCase ? 700 : 500,
                                                    }}
                                                >
                                                    <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />根据入参自动求值
                                                </button>
                                                {Object.keys(currentTask.decisionCases || {}).map((caseKey) => {
                                                    const active = currentDraft.forceCase === caseKey;
                                                    return (
                                                        <button
                                                            key={caseKey}
                                                            type="button"
                                                            onClick={() =>
                                                                updateCurrentDraft({ forceCase: caseKey })
                                                            }
                                                            style={{
                                                                padding: '4px 10px',
                                                                borderRadius: 6,
                                                                fontSize: 11,
                                                                fontFamily: 'monospace',
                                                                cursor: 'pointer',
                                                                border: active
                                                                    ? '1px solid var(--cm-status-warning)'
                                                                    : `1px solid ${borderCol}`,
                                                                background: active
                                                                    ? 'color-mix(in srgb, var(--cm-status-warning) 22%, transparent)'
                                                                    : bgSurface,
                                                                color: active ? 'var(--cm-status-warning)' : textPrimary,
                                                                fontWeight: active ? 700 : 500,
                                                            }}
                                                        >
                                                            分支: {caseKey}
                                                        </button>
                                                    );
                                                })}
                                                {currentTask.defaultCase && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            updateCurrentDraft({ forceCase: '__default__' })
                                                        }
                                                        style={{
                                                            padding: '4px 10px',
                                                            borderRadius: 6,
                                                            fontSize: 11,
                                                            fontFamily: 'monospace',
                                                            cursor: 'pointer',
                                                            border:
                                                                currentDraft.forceCase === '__default__'
                                                                    ? '1px solid var(--cm-status-warning)'
                                                                    : `1px solid ${borderCol}`,
                                                            background:
                                                                currentDraft.forceCase === '__default__'
                                                                    ? 'color-mix(in srgb, var(--cm-status-warning) 22%, transparent)'
                                                                    : bgSurface,
                                                            color:
                                                                currentDraft.forceCase === '__default__'
                                                                    ? 'var(--cm-status-warning)'
                                                                    : textPrimary,
                                                        }}
                                                    >
                                                        默认分支 (defaultCase)
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Custom Task Output JSON */}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                            }}
                                        >
                                            <label style={{ fontSize: 11, fontWeight: 600, color: textSecondary }}>
                                                自定义节点输出数据 (<code>{`\${${currentTask.taskReferenceName}.output.*}`}</code> 将读取此 JSON)：
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const sample = generateDefaultTaskOutputPreview(currentTask);
                                                    updateCurrentDraft({
                                                        outputJsonText: JSON.stringify(sample, null, 2),
                                                    });
                                                }}
                                                style={{
                                                    fontSize: 11,
                                                    padding: '3px 9px',
                                                    borderRadius: 6,
                                                    border: `1px solid ${borderCol}`,
                                                    background: bgSurface,
                                                    color: 'var(--cm-data)',
                                                    cursor: 'pointer',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                <ClipboardList size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />填入默认合成输出模板
                                            </button>
                                        </div>

                                        {taskJsonError && (
                                            <div
                                                style={{
                                                    padding: '6px 10px',
                                                    borderRadius: 6,
                                                    background: 'color-mix(in srgb, var(--cm-status-failed) 14%, transparent)',
                                                    border: '1px solid color-mix(in srgb, var(--cm-status-failed) 40%, transparent)',
                                                    color: 'var(--cm-status-failed)',
                                                    fontSize: 11,
                                                }}
                                            >
                                                <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />{taskJsonError}
                                            </div>
                                        )}

                                        <textarea
                                            value={currentDraft.outputJsonText}
                                            placeholder={`留空则自动按 ${currentTask.type} 类型合成输出，或点击右上角「填入默认合成输出模板」进行修改...`}
                                            onChange={(e) =>
                                                updateCurrentDraft({ outputJsonText: e.target.value })
                                            }
                                            spellCheck={false}
                                            style={{
                                                flex: 1,
                                                minHeight: 160,
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                padding: 12,
                                                borderRadius: 8,
                                                border: `1px solid ${taskJsonError ? 'var(--cm-status-failed)' : borderCol}`,
                                                background: bgCode,
                                                color: textPrimary,
                                                fontFamily: 'monospace',
                                                fontSize: 12,
                                                lineHeight: 1.5,
                                                resize: 'vertical',
                                                outline: 'none',
                                            }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div style={{ padding: 32, color: textSecondary }}>当前工作流暂无任务节点</div>
                            )}
                        </div>
                    )}

                    {activeTab === 'engine' && (
                        <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
                            <div
                                style={{
                                    padding: 16,
                                    borderRadius: 10,
                                    border: `1px solid ${borderCol}`,
                                    background: bgSurface,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 10,
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                                            <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />DO_WHILE 循环安全上限
                                        </div>
                                        <div style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>
                                            循环何时结束由 <code>loopCondition</code> 决定；到达上限时条件仍为真，沙箱停止循环并标记为部分完成，防止死循环（可在画布循环容器头部切换查看每一轮的子任务状态）
                                        </div>
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 16,
                                            fontWeight: 800,
                                            color: 'var(--cm-data)',
                                            fontFamily: 'monospace',
                                        }}
                                    >
                                        {maxLoopIterations} 轮
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={1}
                                    max={50}
                                    value={maxLoopIterations}
                                    onChange={(e) => setMaxLoopIterations(Number(e.target.value))}
                                    style={{ width: '100%', accentColor: 'var(--cm-data)', cursor: 'pointer' }}
                                />
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        fontSize: 11,
                                        color: textSecondary,
                                    }}
                                >
                                    <span>1 轮</span>
                                    <span>20 轮（默认）</span>
                                    <span>50 轮</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '12px 20px',
                        borderTop: `1px solid ${borderCol}`,
                        background: bgSurface,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <button
                        type="button"
                        onClick={() => {
                            setTaskDrafts({});
                            const fresh = buildDefaultWorkflowMockInput(workflowDef);
                            setInputJsonText(JSON.stringify(fresh, null, 2));
                            setMaxLoopIterations(LOOP_SAFETY_DEFAULT);
                            sessionStorage.removeItem(storageKey);
                        }}
                        style={{
                            padding: '7px 12px',
                            borderRadius: 8,
                            border: `1px solid ${borderCol}`,
                            background: 'transparent',
                            color: textSecondary,
                            fontSize: 12,
                            cursor: 'pointer',
                        }}
                    >
                        <Eraser size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />清空全部人工 Mock 配置
                    </button>

                    <div style={{ display: 'flex', gap: 10 }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: `1px solid ${borderCol}`,
                                background: 'transparent',
                                color: textPrimary,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={handleRunWithMocks}
                            style={{
                                padding: '8px 20px',
                                borderRadius: 8,
                                border: 'none',
                                background: 'linear-gradient(135deg, var(--color-accent), var(--cm-data))',
                                color: 'var(--text-primary)',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: '0 4px 14px color-mix(in srgb, var(--color-accent) 35%, transparent)',
                            }}
                        >
                            <Zap size={14} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />应用模拟数据并启动沙箱试运行
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default SandboxConfigModal;
