import { useTheme } from '../hooks/useTheme';
import { ThemeColor } from '../types/workflow';
import { Moon, Sun } from 'lucide-react';

/**
 * 主题控制组件 - 允许切换明暗模式和品牌色
 */
export const ThemeControls = () => {
    const { mode, color, toggleMode, setColor } = useTheme();

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
            {/* Mode Toggle */}
            <button
                onClick={toggleMode}
                title={mode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
                aria-label={mode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
                className="settings-btn"
                style={{ width: '28px', height: '28px', padding: 0, fontSize: '14px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
                {mode === 'dark' ? <Moon size={15} strokeWidth={1.75} aria-hidden="true" /> : <Sun size={15} strokeWidth={1.75} aria-hidden="true" />}
            </button>

            <div style={{ width: '1px', height: '16px', background: 'var(--border-primary)' }}></div>

            {/* Brand Color Selector */}
            <div style={{ display: 'flex', gap: '4px' }}>
                <BrandButton
                    targetColor="blue"
                    currentColor={color}
                    onClick={() => setColor('blue')}
                    colorHex="#3b82f6"
                />
                <BrandButton
                    targetColor="orange"
                    currentColor={color}
                    onClick={() => setColor('orange')}
                    colorHex="var(--cm-brand-500)"
                />
            </div>
        </div>
    );
};

const BrandButton = ({ targetColor, currentColor, onClick, colorHex }: { targetColor: ThemeColor, currentColor: ThemeColor, onClick: () => void, colorHex: string }) => {
    const isActive = currentColor === targetColor;
    return (
        <button
            onClick={onClick}
            title={`切换到 ${targetColor === 'blue' ? '科技蓝（已弃用）' : 'CMASTER 橙'}`}
            style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: colorHex,
                border: isActive ? '2px solid var(--text-primary)' : '2px solid transparent',
                cursor: 'pointer',
                padding: 0,
                boxShadow: isActive ? '0 0 0 2px var(--border-primary)' : 'none',
                opacity: isActive ? 1 : 0.6,
                transition: 'all 0.2s',
                outline: 'none'
            }}
        />
    );
};
