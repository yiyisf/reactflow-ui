import { useState, useCallback } from 'react';

interface ConfirmState {
    message: string;
    /** 确认按钮文案（动词开头，如"删除"）；缺省为"确定" */
    confirmLabel?: string;
    resolve: (value: boolean) => void;
}

/**
 * 提供 Promise-based confirm 对话框替代 window.confirm
 */
export const useConfirm = () => {
    const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

    const confirm = useCallback((message: string, confirmLabel?: string): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            setConfirmState({ message, confirmLabel, resolve });
        });
    }, []);

    const handleConfirm = useCallback(() => {
        confirmState?.resolve(true);
        setConfirmState(null);
    }, [confirmState]);

    const handleCancel = useCallback(() => {
        confirmState?.resolve(false);
        setConfirmState(null);
    }, [confirmState]);

    return {
        confirm,
        confirmState,
        handleConfirm,
        handleCancel
    };
};
