import useWorkflowStore from '../store/workflowStore';

export const useTheme = () => {
    const { theme, themeColor, setTheme, setThemeColor } = useWorkflowStore();

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
