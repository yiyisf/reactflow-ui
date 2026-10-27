import { useHotkeys } from 'react-hotkeys-hook';
import { useStore } from 'zustand';
import useWorkflowStore from '../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import { getLayoutedElements } from '../layout/autoLayout';
import { describeTaskRemoval } from '../utils/taskEditing';

interface ShortcutCallbacks {
    confirm?: (message: string, confirmLabel?: string) => Promise<boolean>;
    showToast?: (text: string, type?: 'success' | 'error' | 'info') => void;
    onSave?: (def: any) => void;
}

/**
 * useShortcuts Hook
 * 管理流程图编辑器的全局键盘快捷键
 */
export const useShortcuts = (callbacks?: ShortcutCallbacks) => {
    const { mode, removeNode, selectedTask, pasteTask } = useWorkflowStore(useShallow((s) => ({
            mode: s.mode,
            removeNode: s.removeNode,
            selectedTask: s.selectedTask,
            pasteTask: s.pasteTask,
        })));

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

    // 绑定删除键: delete, backspace（画布的 ReactFlow 内置删除已关闭，这是唯一的键盘删除入口，E10）
    // 画布只有一个"当前选中任务"（selectedTask），删除即删它；FORK / JOIN / 容器任务的连带删除在确认文案中写明（E13）
    useHotkeys('delete, backspace', (e) => {
        if (mode !== 'edit' || !selectedTask) return;
        if (isTyping(e as any)) return;

        e.preventDefault();
        const ref = selectedTask.taskReferenceName;
        const { message } = describeTaskRemoval(useWorkflowStore.getState().workflowDef, ref);
        confirmFn(message, '删除').then(ok => {
            if (ok) removeNode(ref);
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

    // 绑定保存: mod+s（输入框里也生效，并且总是给出反馈）
    useHotkeys('mod+s', (e) => {
        e.preventDefault();
        const def = useWorkflowStore.getState().workflowDef;
        if (!def) {
            toastFn?.('没有可保存的工作流：请先打开或新建一个工作流', 'info');
            return;
        }
        if (!callbacks?.onSave) {
            toastFn?.('当前页面没有接入保存（未提供 onSave）：修改只保留在画布中，请导出 JSON 保存', 'info');
            return;
        }
        try {
            callbacks.onSave(def);
            toastFn?.('已交给宿主保存', 'success');
        } catch (err: any) {
            toastFn?.(`保存失败：${err?.message || '宿主保存回调出错'}，请稍后重试`, 'error');
        }
    }, { enableOnFormTags: true, enableOnContentEditable: true }, [callbacks?.onSave, toastFn]);

    return {};
};
