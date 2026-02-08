import { useHotkeys } from 'react-hotkeys-hook';
import { useStore } from 'zustand';
import useWorkflowStore from '../store/workflowStore';
import { getLayoutedElements } from '../layout/autoLayout';

interface ShortcutCallbacks {
    confirm?: (message: string) => Promise<boolean>;
    showToast?: (text: string, type?: 'success' | 'error' | 'info') => void;
    onSave?: (def: any) => void;
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

    // undo/redo 后重新 relayout，确保蛇形布局 Handle 方向一致
    const relayoutAfterUndoRedo = () => {
        requestAnimationFrame(() => {
            const s = useWorkflowStore.getState();
            const { nodes: ln, edges: le } = getLayoutedElements(s.nodes, s.edges, { direction: s.layoutDirection, mode: s.mode });
            useWorkflowStore.setState({ nodes: ln, edges: le });
        });
    };

    // 绑定撤销: mod+z
    useHotkeys('mod+z', (e) => {
        if (mode !== 'edit') return;
        if (isTyping(e as any)) return;

        e.preventDefault();
        undo();
        relayoutAfterUndoRedo();
    }, [mode, undo]);

    // 绑定重做: mod+shift+z, mod+y
    useHotkeys(['mod+shift+z', 'mod+y'], (e) => {
        if (mode !== 'edit') return;
        if (isTyping(e as any)) return;

        e.preventDefault();
        redo();
        relayoutAfterUndoRedo();
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

    // 绑定保存: mod+s
    useHotkeys('mod+s', (e) => {
        e.preventDefault();
        const def = useWorkflowStore.getState().workflowDef;
        if (def && callbacks?.onSave) {
            callbacks.onSave(def);
        }
    }, [callbacks?.onSave]);

    return {};
};
