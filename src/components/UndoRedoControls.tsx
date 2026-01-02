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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                </svg>
            </button>
            <button
                className={`toolbar-btn ${!canRedo ? 'disabled' : ''}`}
                onClick={() => canRedo && redo()}
                disabled={!canRedo}
                title="重做 (Cmd+Shift+Z)"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 7v6h-6" />
                    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
                </svg>
            </button>
        </div>
    );
};

export default UndoRedoControls;
