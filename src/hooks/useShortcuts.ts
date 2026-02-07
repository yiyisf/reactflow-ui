import { useHotkeys } from 'react-hotkeys-hook';
import { useStore } from 'zustand';
import useWorkflowStore from '../store/workflowStore';

interface ShortcutCallbacks {
    confirm?: (message: string) => Promise<boolean>;
    showToast?: (text: string, type?: 'success' | 'error' | 'info') => void;
}

/**
 * useShortcuts Hook
 * 管理流程图编辑器的全局键盘快捷键
 */
export const useShortcuts = (callbacks?: ShortcutCallbacks) => {
    const { mode, removeNode, selectedTask, pasteTask } = useWorkflowStore();

    // 使用 zundo 提供的 temporal store
    const temporalStore = (useWorkflowStore as any).temporal;
    const { undo, redo } = useStore(temporalStore, (state: any) => state);

    const confirmFn = callbacks?.confirm || ((msg: string) => Promise.resolve(window.confirm(msg)));
    const toastFn = callbacks?.showToast;

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
        if (isTyping(e as any)) return;

        e.preventDefault();
        undo();
    }, [mode, undo]);

    // 绑定重做: mod+shift+z, mod+y
    useHotkeys(['mod+shift+z', 'mod+y'], (e) => {
        if (mode !== 'edit') return;
        if (isTyping(e as any)) return;

        e.preventDefault();
        redo();
    }, [mode, redo]);

    // 绑定删除键: delete, backspace
    useHotkeys('delete, backspace', (e) => {
        if (mode !== 'edit' || !selectedTask) return;
        if (isTyping(e as any)) return;

        e.preventDefault();
        confirmFn('确定要删除此任务吗？').then(ok => {
            if (ok) removeNode(selectedTask.taskReferenceName);
        });
    }, [mode, selectedTask, removeNode, confirmFn]);

    // 绑定复制键: mod+c
    useHotkeys('mod+c', (e) => {
        if (mode !== 'edit' || !selectedTask) return;
        if (isTyping(e as any)) return;

        if (selectedTask.type === 'JOIN') {
            toastFn?.('JOIN 任务不能独立复制', 'error');
            return;
        }

        e.preventDefault();
        try {
            localStorage.setItem('conductor-clipboard', JSON.stringify(selectedTask));
            toastFn?.('任务已复制', 'success');
        } catch {
            toastFn?.('复制失败', 'error');
        }
    }, [mode, selectedTask, toastFn]);

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
                toastFn?.('任务已粘贴', 'success');
            }
        } catch {
            toastFn?.('粘贴失败', 'error');
        }
    }, [mode, pasteTask, toastFn]);

    return {};
};
