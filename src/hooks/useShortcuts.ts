import { useHotkeys } from 'react-hotkeys-hook';
import useWorkflowStore from '../store/workflowStore';

/**
 * useShortcuts Hook
 * 管理流程图编辑器的全局键盘快捷键
 */
export const useShortcuts = () => {
    const { mode, removeNode, selectedTask, pasteTask } = useWorkflowStore();

    // 辅助函数：判断当前是否正在输入
    const isTyping = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    };

    // 绑定删除键: delete, backspace
    useHotkeys('delete, backspace', (e) => {
        if (mode !== 'edit' || !selectedTask) return;
        if (isTyping(e as any)) return;

        e.preventDefault();
        if (window.confirm('确定要删除此任务吗？')) {
            removeNode(selectedTask.taskReferenceName);
        }
    }, [mode, selectedTask, removeNode]);

    // 绑定复制键: mod+c (Command+C / Ctrl+C)
    useHotkeys('mod+c', (e) => {
        if (mode !== 'edit' || !selectedTask) return;
        if (isTyping(e as any)) return;

        // 禁止独立复制 JOIN 节点
        if (selectedTask.type === 'JOIN') {
            console.warn("JOIN 任务不能独立复制，它会随 FORK 任务同步生成。");
            return;
        }

        e.preventDefault();
        try {
            localStorage.setItem('conductor-clipboard', JSON.stringify(selectedTask));
            console.log('任务已复制到剪贴板:', selectedTask.taskReferenceName);
        } catch (err) {
            console.error('复制失败:', err);
        }
    }, [mode, selectedTask]);

    // 绑定粘贴键: mod+v (Command+V / Ctrl+V)
    useHotkeys('mod+v', (e) => {
        if (mode !== 'edit') return;
        if (isTyping(e as any)) return;

        e.preventDefault();
        try {
            const data = localStorage.getItem('conductor-clipboard');
            if (data) {
                const task = JSON.parse(data);
                pasteTask(task);
                console.log('任务已粘贴');
            }
        } catch (err) {
            console.error('粘贴失败:', err);
        }
    }, [mode, pasteTask]);

    return null;
};
