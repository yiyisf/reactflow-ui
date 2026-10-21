import useWorkflowStore from '../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';

export const useTheme = () => {
    // 按需订阅：只在主题相关字段变化时重渲染
    const { theme: storeTheme, themeColor: storeThemeColor, setTheme: storeSetTheme, setThemeColor: storeSetThemeColor } =
        useWorkflowStore(useShallow((s) => ({
            theme: s?.theme,
            themeColor: s?.themeColor,
            setTheme: s?.setTheme,
            setThemeColor: s?.setThemeColor,
        })));
    // 防御性编码：防止 Store 初始化未完成或历史数据异常导致 theme 未定义
    const theme = storeTheme || 'dark';
    const themeColor = storeThemeColor || 'blue';
    const setTheme = storeSetTheme || (() => { });
    const setThemeColor = storeSetThemeColor || (() => { });

    const toggleMode = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    return {
        mode: theme,
        color: themeColor,
        setMode: setTheme,
        setColor: setThemeColor,
        toggleMode,
    };
};
