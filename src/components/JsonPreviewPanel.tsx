import { memo, useState, useEffect, useMemo } from 'react';
import useWorkflowStore from '../store/workflowStore';

interface JsonPreviewPanelProps {
    isOpen: boolean;
    onClose: () => void;
    theme?: 'dark' | 'light';
}

/**
 * 双向实时 JSON 代码同步面板 (Two-Way Live Split-View Code Editor)
 * - 画布选中节点时，自动高亮并定位对应任务的 JSON 片段
 * - 点击面板中的任务标签，画布自动居中并选中该节点
 * - 支持直接修改 JSON 代码并实时热更新至画布拓扑
 */
const JsonPreviewPanel = ({ isOpen, onClose, theme = 'dark' }: JsonPreviewPanelProps) => {
    const {
        workflowDef,
        setWorkflow,
        selectedTask,
        setSelectedTask,
        taskMap,
        mode,
    } = useWorkflowStore();

    const [draftJson, setDraftJson] = useState('');
    const [parseError, setParseError] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [scopeMode, setScopeMode] = useState<'full' | 'selected'>('full');
    const [syncSuccess, setSyncSuccess] = useState(false);

    const targetData = useMemo(() => {
        if (scopeMode === 'selected' && selectedTask) {
            return selectedTask;
        }
        return workflowDef;
    }, [scopeMode, selectedTask, workflowDef]);

    useEffect(() => {
        if (targetData) {
            setDraftJson(JSON.stringify(targetData, null, 2));
            setParseError(null);
            setIsDirty(false);
        }
    }, [targetData, isOpen]);

    if (!isOpen) return null;

    const bgColor = 'var(--glass-surface)';
    const textColor = 'var(--text-primary)';
    const borderColor = 'var(--glass-border)';
    const codeBg = 'var(--bg-tertiary)';
    const taskRefs = Object.keys(taskMap || {});

    const handleApplyChanges = () => {
        try {
            const parsed = JSON.parse(draftJson);
            if (scopeMode === 'selected' && selectedTask) {
                useWorkflowStore.getState().updateTask(selectedTask.taskReferenceName, parsed);
            } else {
                if (!parsed || !Array.isArray(parsed.tasks)) {
                    setParseError('JSON 必须包含有效的 tasks 数组');
                    return;
                }
                setWorkflow(parsed);
            }
            setParseError(null);
            setIsDirty(false);
            setSyncSuccess(true);
            setTimeout(() => setSyncSuccess(false), 1600);
        } catch (err: any) {
            setParseError(err?.message || 'JSON 语法错误');
        }
    };

    return (
        <div style={{
            position: 'fixed',
            left: 0,
            top: 0,
            width: '480px',
            height: '100vh',
            background: bgColor,
            borderRight: `1px solid ${borderColor}`,
            boxShadow: '10px 0 30px rgba(0,0,0,0.2)',
            zIndex: 1500,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInFromLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
            <style>{`
                @keyframes slideInFromLeft {
                  from { transform: translateX(-100%); }
                  to { transform: translateX(0); }
                }
            `}</style>

            {/* Header */}
            <div style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${borderColor}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(0,0,0,0.06)'
            }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: textColor }}>
                        <span>🔄</span> 双向实时 JSON 代码视图
                    </h3>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                        画布点击节点双向联动 · 支持代码热更新
                    </div>
                </div>
                <button
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', color: textColor, fontSize: '18px', cursor: 'pointer' }}
                >✕</button>
            </div>

            {/* Scope Switcher + Bidirectional Node Jump Bar */}
            <div style={{
                padding: '10px 16px',
                borderBottom: `1px solid ${borderColor}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                background: 'rgba(15, 23, 42, 0.3)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                            type="button"
                            onClick={() => setScopeMode('full')}
                            style={{
                                fontSize: '11px',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: `1px solid ${scopeMode === 'full' ? '#38bdf8' : borderColor}`,
                                background: scopeMode === 'full' ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
                                color: scopeMode === 'full' ? '#38bdf8' : textColor,
                                cursor: 'pointer',
                                fontWeight: 600,
                            }}
                        >
                            完整工作流 ({taskRefs.length})
                        </button>
                        <button
                            type="button"
                            disabled={!selectedTask}
                            onClick={() => setScopeMode('selected')}
                            style={{
                                fontSize: '11px',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: `1px solid ${scopeMode === 'selected' ? '#38bdf8' : borderColor}`,
                                background: scopeMode === 'selected' ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
                                color: scopeMode === 'selected' ? '#38bdf8' : textColor,
                                cursor: selectedTask ? 'pointer' : 'not-allowed',
                                opacity: selectedTask ? 1 : 0.45,
                                fontWeight: 600,
                            }}
                        >
                            🎯 当前选中节点 {selectedTask ? `(${selectedTask.taskReferenceName})` : ''}
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(draftJson)}
                        style={{
                            fontSize: '11px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: `1px solid ${borderColor}`,
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                        }}
                    >
                        📋 复制
                    </button>
                </div>

                {/* Node Pills for 1-click canvas focus */}
                {taskRefs.length > 0 && (
                    <div style={{ display: 'flex', gap: '5px', overflowX: 'auto', paddingBottom: '2px' }}>
                        {taskRefs.map((ref) => {
                            const isSel = selectedTask?.taskReferenceName === ref;
                            return (
                                <button
                                    key={ref}
                                    type="button"
                                    onClick={() => {
                                        const t = taskMap[ref];
                                        if (t) {
                                            setSelectedTask(t);
                                            setScopeMode('selected');
                                        }
                                    }}
                                    style={{
                                        fontSize: '10px',
                                        fontFamily: 'monospace',
                                        padding: '2px 8px',
                                        borderRadius: '999px',
                                        border: isSel ? '1px solid #38bdf8' : `1px solid ${borderColor}`,
                                        background: isSel ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.45)',
                                        color: isSel ? '#38bdf8' : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {ref}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Live Code Editor */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: codeBg, position: 'relative' }}>
                <textarea
                    value={draftJson}
                    onChange={(e) => {
                        setDraftJson(e.target.value);
                        setIsDirty(true);
                        try {
                            JSON.parse(e.target.value);
                            setParseError(null);
                        } catch (err: any) {
                            setParseError(err?.message || 'JSON 语法错误');
                        }
                    }}
                    onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                            e.preventDefault();
                            handleApplyChanges();
                        }
                    }}
                    readOnly={mode === 'run'}
                    spellCheck={false}
                    style={{
                        flex: 1,
                        width: '100%',
                        padding: '16px',
                        margin: 0,
                        border: 'none',
                        outline: 'none',
                        resize: 'none',
                        background: 'transparent',
                        fontSize: '12px',
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        lineHeight: '1.6',
                        color: theme === 'light' ? '#1e293b' : '#e2e8f0',
                    }}
                />
            </div>

            {/* Footer Status & Apply Button */}
            <div style={{
                padding: '12px 18px',
                borderTop: `1px solid ${borderColor}`,
                background: 'rgba(0,0,0,0.06)',
                fontSize: '11px',
                color: parseError ? '#ef4444' : syncSuccess ? '#10b981' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: parseError ? '#ef4444' : '#10b981' }}>●</span>
                    {parseError
                        ? `语法错误: ${parseError}`
                        : syncSuccess
                        ? '✓ 已同步更新至画布拓扑'
                        : isDirty
                        ? '有未应用的 JSON 修改 (按 Cmd+S 或点击右侧按钮同步)'
                        : '双向实时同步就绪'}
                </div>
                {mode !== 'run' && isDirty && !parseError && (
                    <button
                        type="button"
                        onClick={handleApplyChanges}
                        style={{
                            padding: '5px 12px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#38bdf8',
                            color: '#0f172a',
                            fontWeight: 700,
                            fontSize: '11px',
                            cursor: 'pointer',
                            flexShrink: 0,
                        }}
                    >
                        应用到画布
                    </button>
                )}
            </div>
        </div>
    );
};

export default memo(JsonPreviewPanel);
