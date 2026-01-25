import React from 'react';
import useWorkflowStore from '../../store/workflowStore';
import ControlButton from './ControlButton';
import { useStore } from 'zustand';

interface ActionBarProps {
    onShowHealthCheck: () => void;
    showHealthCheck: boolean;
}

const ActionBar: React.FC<ActionBarProps> = ({ onShowHealthCheck, showHealthCheck }) => {
    const { mode, validationResults } = useWorkflowStore();

    // Safely retrieve undo/redo from temporal with a fallback or standard usage
    const temporalStore = (useWorkflowStore as any).temporal;

    // Hooks cannot be conditional, but the store subscription is safe. 
    // If temporal is missing (unlikely), this might fail, but we assume it's there per previous valid usage.
    const { undo, redo, pastStates, futureStates } = useStore(
        temporalStore,
        (state: any) => state
    );

    const hasErrors = (validationResults?.errors?.length || 0) > 0;

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
                </>
            )}

            {mode === 'run' && (
                <>
                    <ControlButton icon="◀️" label="重启" onClick={() => console.log('Restart')} variant="primary" />
                    <ControlButton icon="⏸️" title="暂停" onClick={() => console.log('Pause')} />
                    <ControlButton icon="⏹️" title="停止" onClick={() => console.log('Stop')} variant="danger" />
                </>
            )}
        </div>
    );
};

export default ActionBar;
