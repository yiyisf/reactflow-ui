import useWorkflowStore from '../store/workflowStore';

export const useTheme = () => {
    const workflowStore = useWorkflowStore();
    // 防御性编码：防止 Store 初始化未完成或历史数据异常导致 theme 未定义
    const theme = workflowStore?.theme || 'dark';
    const themeColor = workflowStore?.themeColor || 'blue';
    const setTheme = workflowStore?.setTheme || (() => { });
    const setThemeColor = workflowStore?.setThemeColor || (() => { });

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
