import { useHotkeys } from 'react-hotkeys-hook';
import useWorkflowStore from '../store/workflowStore';

/**
 * useShortcuts Hook
 * 管理流程图编辑器的全局键盘快捷键
 */
export const useShortcuts = () => {
    const { mode, removeNode, selectedTask } = useWorkflowStore();

    // 绑定删除键: delete, backspace
    useHotkeys('delete, backspace', (e) => {
        // 仅在编辑模式且有选中任务时生效
        if (mode !== 'edit' || !selectedTask) return;

        // 避免在输入框内输入时触发删除
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        e.preventDefault();

        // 保持与 NodeWrapper 一致的选择性确认，防止误删
        if (window.confirm('确定要删除此任务吗？')) {
            removeNode(selectedTask.taskReferenceName);
        }
    }, [mode, selectedTask, removeNode]);

    return null;
};
