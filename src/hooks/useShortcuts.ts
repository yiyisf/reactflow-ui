import { useHotkeys } from 'react-hotkeys-hook';
import { useStore } from 'zustand';
import useWorkflowStore from '../store/workflowStore';

/**
 * useShortcuts Hook
 * 管理流程图编辑器的全局键盘快捷键
 */
export const useShortcuts = () => {
    const { mode, removeNode, selectedTask, pasteTask } = useWorkflowStore();

    // 使用 zundo 提供的 temporal store
    const { undo, redo } = useStore((useWorkflowStore as any).temporal, (state) => state);

    // 辅助函数：判断当前是否正在输入
    const isTyping = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        return (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable
        );
    };

    // 绑定撤销: mod+z
    useHotkeys('mod+z', (e) => {
        if (mode !== 'edit') return;
        if (isTyping(e as any)) return; // 文字输入时使用系统原始撤销

        e.preventDefault();
        undo();
        console.log('撤销操作');
    }, [mode, undo]);

    // 绑定重做: mod+shift+z, mod+y
    useHotkeys(['mod+shift+z', 'mod+y'], (e) => {
        if (mode !== 'edit') return;
        if (isTyping(e as any)) return;

        e.preventDefault();
        redo();
        console.log('重做操作');
    }, [mode, redo]);

    // 绑定删除键: delete, backspace
    useHotkeys('delete, backspace', (e) => {
        if (mode !== 'edit' || !selectedTask) return;
        if (isTyping(e as any)) return;

        e.preventDefault();
        if (window.confirm('确定要删除此任务吗？')) {
            removeNode(selectedTask.taskReferenceName);
        }
    }, [mode, selectedTask, removeNode]);

    // 绑定复制键: mod+c
    useHotkeys('mod+c', (e) => {
        if (mode !== 'edit' || !selectedTask) return;
        if (isTyping(e as any)) return;

        if (selectedTask.type === 'JOIN') {
            console.warn("JOIN 任务不能独立复制");
            return;
        }

        e.preventDefault();
        try {
            localStorage.setItem('conductor-clipboard', JSON.stringify(selectedTask));
            console.log('任务已复制');
        } catch (err) {
            console.error('复制失败:', err);
        }
    }, [mode, selectedTask]);

    // 绑定粘贴键: mod+v
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

    return {
        // 可以返回一些状态供 UI 使用，例如能否撤销/重做
    };
};
