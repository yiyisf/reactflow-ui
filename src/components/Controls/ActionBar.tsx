import React, { useState, useRef, useEffect } from 'react';
import useWorkflowStore from '../../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import ControlButton from './ControlButton';
import SandboxConfigModal from '../SandboxConfigModal';
import { useStore } from 'zustand';
import { ExecutionActions } from '../../types/workflow';

interface ActionBarProps {
    onShowHealthCheck: () => void;
    showHealthCheck: boolean;
    onShowSettings?: () => void;
    executionActions?: ExecutionActions;
}

const Divider: React.FC = () => (
    <div
        style={{
            width: '1px',
            height: '18px',
            background: 'var(--border-primary)',
            margin: '0 2px',
            alignSelf: 'center',
            flexShrink: 0,
        }}
    />
);

const ActionBar: React.FC<ActionBarProps> = ({ onShowHealthCheck, showHealthCheck, onShowSettings, executionActions }) => {
    const { mode, setMode, validationResults, workflowInstance, workflowDef, showDataLineage, setShowDataLineage, showWaterfallPanel, setShowWaterfallPanel, runLocalSandboxDryRun, inlineCopilotTaskRef, setInlineCopilotTaskRef, selectedTask } = useWorkflowStore(useShallow((s) => ({
            mode: s.mode,
            setMode: s.setMode,
            validationResults: s.validationResults,
            workflowInstance: s.workflowInstance,
            workflowDef: s.workflowDef,
            showDataLineage: s.showDataLineage,
            setShowDataLineage: s.setShowDataLineage,
            showWaterfallPanel: s.showWaterfallPanel,
            setShowWaterfallPanel: s.setShowWaterfallPanel,
            runLocalSandboxDryRun: s.runLocalSandboxDryRun,
            inlineCopilotTaskRef: s.inlineCopilotTaskRef,
            setInlineCopilotTaskRef: s.setInlineCopilotTaskRef,
            selectedTask: s.selectedTask,
        })));

    const temporalStore = (useWorkflowStore as any).temporal;
    const { undo, redo, pastStates, futureStates } = useStore(
        temporalStore,
        (state: any) => state
    );

    const [showRestartMenu, setShowRestartMenu] = useState(false);
    const [showSandboxModal, setShowSandboxModal] = useState(false);
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

    // 操作权限：allowOperations 未设置或为 true 时允许，false 时禁用所有操作
    const allowOperations = executionActions?.allowOperations !== false;

    return (
        <div
            className="action-bar"
            style={{
                display: 'flex',
                gap: '6px',
                alignItems: 'center',
                flexWrap: 'wrap',
                padding: '5px 8px',
                borderRadius: '10px',
                background: 'var(--bg-secondary)',
                backdropFilter: 'blur(14px)',
                border: '1px solid var(--border-primary)',
                boxShadow: '0 6px 24px rgba(0, 0, 0, 0.18)',
            }}
        >
            {/* Group 2: 智能洞察与 AI 原位助手 */}
            {workflowDef && (
                <>
                    <ControlButton
                        icon="🔗"
                        label="数据血缘"
                        title="W-LSP 数据流血缘图谱 (Data Flow Graph)"
                        onClick={() => setShowDataLineage(!showDataLineage)}
                        active={showDataLineage}
                    />
                    {mode === 'edit' && (
                        <ControlButton
                            icon="⌘K"
                            label="AI微调"
                            title="画布内联 AI 指令栏 (Cmd+K)"
                            onClick={() =>
                                setInlineCopilotTaskRef(
                                    inlineCopilotTaskRef
                                        ? null
                                        : selectedTask?.taskReferenceName || '__canvas_root__'
                                )
                            }
                            active={Boolean(inlineCopilotTaskRef)}
                        />
                    )}
                </>
            )}

            {/* Group 3: 编辑历史、健康诊断与全局配置 */}
            {mode === 'edit' && (
                <>
                    <Divider />
                    <div style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
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
                    </div>
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

            {/* Group 4: 沙箱试运行（支持一键极速运行 + 人工 Mock 数据配置台）与运行态瀑布流调试 */}
            {workflowDef && mode !== 'run' && (
                <>
                    <Divider />
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <ControlButton
                            icon="⚡"
                            label="沙箱试运行"
                            title="一键启动浏览器本地确定性沙箱试运行 (0ms Dry-Run)"
                            onClick={() => runLocalSandboxDryRun()}
                            variant="primary"
                            style={{
                                borderRadius: '7px 0 0 7px',
                                borderRight: '1px solid rgba(255, 255, 255, 0.25)',
                            }}
                        />
                        <ControlButton
                            icon="🧪"
                            title="人工模拟数据配置台 (自定义 workflow.input / 节点 Mock 输出 / 故障注入 / 分支路由)"
                            onClick={() => setShowSandboxModal(true)}
                            variant="primary"
                            style={{
                                borderRadius: '0 7px 7px 0',
                                padding: '4px 7px',
                                minWidth: '26px',
                            }}
                        />
                    </div>
                </>
            )}

            {mode === 'run' && (
                <>
                    <Divider />
                    <ControlButton
                        icon="🧪"
                        label="模拟数据重跑"
                        title="打开沙箱人工模拟数据配置台，调整入参、分支或注入节点故障后重跑"
                        onClick={() => setShowSandboxModal(true)}
                    />
                    <ControlButton
                        icon="📊"
                        label="瀑布流回放"
                        title="并发甘特瀑布流与时间旅行调试器 (Time-Travel)"
                        onClick={() => setShowWaterfallPanel(!showWaterfallPanel)}
                        active={showWaterfallPanel}
                    />
                    <ControlButton
                        icon="✏️"
                        label="返回编辑"
                        title="退出试跑/运行态视图，返回工作流编排画布"
                        onClick={() => setMode('edit')}
                    />
                </>
            )}

            <SandboxConfigModal
                isOpen={showSandboxModal}
                onClose={() => setShowSandboxModal(false)}
            />

            {mode === 'run' && workflowInstance && executionActions && (
                <>
                    {/* 继续（PAUSED → RUNNING） */}
                    {isPaused && executionActions.onResume && (
                        <ControlButton
                            icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3l9 5-9 5z" /></svg>}
                            label="继续"
                            title={!allowOperations ? "操作权限受限" : "继续执行工作流"}
                            onClick={() => allowOperations && executionActions.onResume!(wfId)}
                            disabled={!allowOperations}
                            variant="primary"
                        />
                    )}

                    {/* 暂停（RUNNING → PAUSED） */}
                    {isRunning && executionActions.onPause && (
                        <ControlButton
                            icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10" rx="1" /><rect x="9" y="3" width="3" height="10" rx="1" /></svg>}
                            label="暂停"
                            title={!allowOperations ? "操作权限受限" : "暂停工作流执行"}
                            onClick={() => allowOperations && executionActions.onPause!(wfId)}
                            disabled={!allowOperations}
                        />
                    )}

                    {/* 终止（RUNNING/PAUSED → TERMINATED） */}
                    {(isRunning || isPaused) && executionActions.onTerminate && (
                        <ControlButton
                            icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1" /></svg>}
                            label="终止"
                            title={!allowOperations ? "操作权限受限" : "终止工作流执行"}
                            onClick={() => allowOperations && executionActions.onTerminate!(wfId)}
                            disabled={!allowOperations}
                            variant="danger"
                        />
                    )}

                    {/* 重试（FAILED/TIMED_OUT/TERMINATED） */}
                    {isTerminal && executionActions.onRetry && (
                        <ControlButton
                            icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 2v4h-4" /><path d="M13 6A7 7 0 1 1 9.5 2.5" /></svg>}
                            label="重试"
                            title={!allowOperations ? "操作权限受限" : "重试失败的工作流"}
                            onClick={() => allowOperations && executionActions.onRetry!(wfId)}
                            disabled={!allowOperations}
                            variant="primary"
                        />
                    )}

                    {/* 重新运行（支持版本选择，restartable 工作流） */}
                    {canRestart && executionActions.onRestart && (
                        <div ref={restartMenuRef} style={{ position: 'relative', display: 'flex' }}>
                            {/* 主按钮：使用最新版本重启 */}
                            <button
                                disabled={!allowOperations}
                                onClick={() => allowOperations && executionActions.onRestart!(wfId, { useLatestDef: true })}
                                title={!allowOperations ? "操作权限受限" : "使用当前最新定义版本重新运行"}
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
                                    cursor: !allowOperations ? 'not-allowed' : 'pointer',
                                    opacity: !allowOperations ? 0.5 : 1,
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
                                disabled={!allowOperations}
                                onClick={() => allowOperations && setShowRestartMenu(v => !v)}
                                title={!allowOperations ? "操作权限受限" : "展开重启版本选项"}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: !allowOperations ? 'var(--bg-tertiary)' : (showRestartMenu ? 'var(--bg-secondary)' : 'var(--bg-tertiary)'),
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: '0 6px 6px 0',
                                    padding: '6px 6px',
                                    cursor: !allowOperations ? 'not-allowed' : 'pointer',
                                    opacity: !allowOperations ? 0.5 : 1,
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
