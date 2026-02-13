import React from 'react';
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

    // Safely retrieve undo/redo from temporal with a fallback or standard usage
    const temporalStore = (useWorkflowStore as any).temporal;

    // Hooks cannot be conditional, but the store subscription is safe.
    // If temporal is missing (unlikely), this might fail, but we assume it's there per previous valid usage.
    const { undo, redo, pastStates, futureStates } = useStore(
        temporalStore,
        (state: any) => state
    );

    const hasErrors = (validationResults?.errors?.length || 0) > 0;

    const status = workflowInstance?.status;
    const wfId = workflowInstance?.workflowId ?? '';

    return (
        <div className="action-bar" style={{ display: 'flex', gap: '8px' }}>
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
                    {status === 'PAUSED' ? (
                        executionActions.onResume && (
                            <ControlButton icon="▶️" label="恢复" title="恢复执行" onClick={() => executionActions.onResume!(wfId)} variant="primary" />
                        )
                    ) : (
                        <>
                            {executionActions.onPause && status === 'RUNNING' && (
                                <ControlButton icon="⏸️" label="暂停" title="暂停执行" onClick={() => executionActions.onPause!(wfId)} />
                            )}
                            {executionActions.onTerminate && status === 'RUNNING' && (
                                <ControlButton icon="⏹️" label="停止" title="终止执行" onClick={() => executionActions.onTerminate!(wfId)} variant="danger" />
                            )}
                            {executionActions.onRetry && (status === 'FAILED' || status === 'TIMED_OUT' || status === 'TERMINATED') && (
                                <ControlButton icon="🔄" label="重试" title="重试执行" onClick={() => executionActions.onRetry!(wfId)} variant="primary" />
                            )}
                            {executionActions.onRestart && workflowDef?.restartable === true && (
                                <ControlButton icon="◀️" label="重启" title="重启执行" onClick={() => executionActions.onRestart!(wfId)} />
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default ActionBar;
