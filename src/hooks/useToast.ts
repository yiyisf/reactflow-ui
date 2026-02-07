import { useState, useCallback } from 'react';
import { ToastMessage } from '../components/Toast';

/**
 * Toast 通知管理 Hook
 */
export const useToast = () => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const showToast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, text, type }]);
    }, []);

    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return { toasts, showToast, dismissToast };
};
