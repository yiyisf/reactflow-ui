import { useState, useCallback } from 'react';

interface ConfirmState {
    message: string;
    resolve: (value: boolean) => void;
}

/**
 * 提供 Promise-based confirm 对话框替代 window.confirm
 */
export const useConfirm = () => {
    const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

    const confirm = useCallback((message: string): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            setConfirmState({ message, resolve });
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
