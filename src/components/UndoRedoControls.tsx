import { useStore } from 'zustand';
import useWorkflowStore from '../store/workflowStore';

/**
 * UndoRedoControls 组件
 * 提供可视化的撤销和重做按钮
 */
const UndoRedoControls = () => {
    // 订阅 temporal 状态以获取 undo/redo 动作及历史长度
    const { undo, redo, pastStates, futureStates } = useStore(
        (useWorkflowStore as any).temporal,
        (state: any) => state
    );

    const canUndo = pastStates.length > 0;
    const canRedo = futureStates.length > 0;

    return (
        <div className="undo-redo-toolbar">
            <button
                className={`toolbar-btn ${!canUndo ? 'disabled' : ''}`}
                onClick={() => canUndo && undo()}
                disabled={!canUndo}
                title="撤销 (Cmd+Z)"
            >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 14L4 9l5-5" />
                    <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
                </svg>
            </button>
            <button
                className={`toolbar-btn ${!canRedo ? 'disabled' : ''}`}
                onClick={() => canRedo && redo()}
                disabled={!canRedo}
                title="重做 (Cmd+Shift+Z)"
            >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 14l5-5-5-5" />
                    <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
                </svg>
            </button>
        </div>
    );
};

export default UndoRedoControls;
