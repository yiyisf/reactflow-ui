import React, { useState, useRef, useEffect } from 'react';
import useWorkflowStore from '../../store/workflowStore';
import ControlButton from './ControlButton';
import { useStore } from 'zustand';
import { ExecutionActions } from '../../types/workflow';

interface ActionBarProps {
    onShowHealthCheck: () => void;
    showHealthCheck: boolean;
    onShowSettings?: () => void;
    executionActions?: ExecutionActions;
}

const ActionBar: React.FC<ActionBarProps> = ({ onShowHealthCheck, showHealthCheck, onShowSettings, executionActions }) => {
    const { mode, validationResults, workflowInstance, workflowDef } = useWorkflowStore();

    const temporalStore = (useWorkflowStore as any).temporal;
    const { undo, redo, pastStates, futureStates } = useStore(
        temporalStore,
        (state: any) => state
    );

    const [showRestartMenu, setShowRestartMenu] = useState(false);
    const restartMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showRestartMenu) return;
        const handler = (e: MouseEvent) => {
            if (restartMenuRef.current && !restartMenuRef.current.contains(e.target as Node)) {
                setShowRestartMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showRestartMenu]);

    const hasErrors = (validationResults?.errors?.length || 0) > 0;

    const status = workflowInstance?.status;
    const wfId = workflowInstance?.workflowId ?? '';

    const isRunning = status === 'RUNNING';
    const isPaused = status === 'PAUSED';
    const isTerminal = status === 'FAILED' || status === 'TIMED_OUT' || status === 'TERMINATED';
    const isCompleted = status === 'COMPLETED';
    const canRestart = workflowDef?.restartable === true && (isTerminal || isCompleted);

    return (
        <div className="action-bar" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {mode === 'edit' && (
                <>
                    <ControlButton
                        icon="↺"
                        title="撤销 (Cmd+Z)"
                        onClick={() => undo()}
                        disabled={pastStates.length === 0}
                    />
                    <ControlButton
                        icon="↻"
                        title="重做 (Cmd+Shift+Z)"
                        onClick={() => redo()}
                        disabled={futureStates.length === 0}
                    />
                    <div style={{ width: '1px', height: '20px', background: 'var(--border-primary)', margin: '0 4px', alignSelf: 'center' }} />
                    <ControlButton
                        icon="🩺"
                        label={hasErrors ? `错误 (${validationResults.errors.length})` : '诊断'}
                        title="流程健康检查"
                        onClick={onShowHealthCheck}
                        active={showHealthCheck}
                        variant={hasErrors ? 'danger' : 'secondary'}
                    />
                    <ControlButton
                        icon="⚙️"
                        label="配置"
                        title="工作流全局配置"
                        onClick={() => onShowSettings?.()}
                    />
                </>
            )}

            {mode === 'run' && workflowInstance && executionActions && (
                <>
                    {/* 继续（PAUSED → RUNNING） */}
                    {isPaused && executionActions.onResume && (
                        <ControlButton
                            icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3l9 5-9 5z" /></svg>}
                            label="继续"
                            title="继续执行工作流"
                            onClick={() => executionActions.onResume!(wfId)}
                            variant="primary"
                        />
                    )}

                    {/* 暂停（RUNNING → PAUSED） */}
                    {isRunning && executionActions.onPause && (
                        <ControlButton
                            icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10" rx="1" /><rect x="9" y="3" width="3" height="10" rx="1" /></svg>}
                            label="暂停"
                            title="暂停工作流执行"
                            onClick={() => executionActions.onPause!(wfId)}
                        />
                    )}

                    {/* 终止（RUNNING/PAUSED → TERMINATED） */}
                    {(isRunning || isPaused) && executionActions.onTerminate && (
                        <ControlButton
                            icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1" /></svg>}
                            label="终止"
                            title="终止工作流执行"
                            onClick={() => executionActions.onTerminate!(wfId)}
                            variant="danger"
                        />
                    )}

                    {/* 重试（FAILED/TIMED_OUT/TERMINATED） */}
                    {isTerminal && executionActions.onRetry && (
                        <ControlButton
                            icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 2v4h-4" /><path d="M13 6A7 7 0 1 1 9.5 2.5" /></svg>}
                            label="重试"
                            title="重试失败的工作流"
                            onClick={() => executionActions.onRetry!(wfId)}
                            variant="primary"
                        />
                    )}

                    {/* 重新运行（支持版本选择，restartable 工作流） */}
                    {canRestart && executionActions.onRestart && (
                        <div ref={restartMenuRef} style={{ position: 'relative', display: 'flex' }}>
                            {/* 主按钮：使用最新版本重启 */}
                            <button
                                onClick={() => executionActions.onRestart!(wfId, { useLatestDef: true })}
                                title="使用当前最新定义版本重新运行"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: 'var(--bg-tertiary)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border-primary)',
                                    borderRight: 'none',
                                    borderRadius: '6px 0 0 6px',
                                    padding: '6px 10px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    height: '32px',
                                }}
                            >
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 14v-4h4" /><path d="M3 10A7 7 0 1 1 6.5 13.5" /></svg>
                                重启
                            </button>
                            {/* 下拉触发器：展开版本选项 */}
                            <button
                                onClick={() => setShowRestartMenu(v => !v)}
                                title="展开重启版本选项"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: showRestartMenu ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: '0 6px 6px 0',
                                    padding: '6px 6px',
                                    cursor: 'pointer',
                                    height: '32px',
                                    width: '22px',
                                    fontSize: '10px',
                                }}
                            >
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                                    <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                                </svg>
                            </button>

                            {/* 下拉菜单 */}
                            {showRestartMenu && (
                                <div style={{
                                    position: 'absolute',
                                    top: '36px',
                                    right: 0,
                                    background: 'var(--glass-surface)',
                                    backdropFilter: 'blur(12px)',
                                    border: '1px solid var(--glass-border)',
                                    borderRadius: '10px',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                                    zIndex: 2000,
                                    minWidth: '180px',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{ padding: '6px 12px 4px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                        选择版本
                                    </div>
                                    <button
                                        onClick={() => { executionActions.onRestart!(wfId, { useLatestDef: true }); setShowRestartMenu(false); }}
                                        style={menuItemStyle}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 1" /></svg>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '13px' }}>当前版本</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>使用最新工作流定义</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => { executionActions.onRestart!(wfId, { useLatestDef: false }); setShowRestartMenu(false); }}
                                        style={menuItemStyle}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="2" width="10" height="12" rx="1" /><path d="M6 6h4M6 9h3" /></svg>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '13px' }}>执行版本</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>使用本次运行时的定义</div>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

const menuItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '8px 12px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    color: 'var(--text-primary)',
    transition: 'background 0.15s',
};

export default ActionBar;
