import { useTheme } from '../hooks/useTheme';
import { ThemeColor } from '../types/workflow';

/**
 * 主题控制组件 - 允许切换明暗模式和品牌色
 */
export const ThemeControls = () => {
    const { mode, color, toggleMode, setColor } = useTheme();

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
            {/* Mode Toggle */}
            <button
                onClick={toggleMode}
                title={mode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
                className="settings-btn"
                style={{ width: '28px', height: '28px', fontSize: '14px', background: 'transparent', border: 'none' }}
            >
                {mode === 'dark' ? '🌙' : '☀️'}
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
                    colorHex="#E75213"
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
            title={`切换到 ${targetColor === 'blue' ? '科技蓝' : '熔核橙'}`}
            style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: colorHex,
                border: isActive ? '2px solid var(--text-primary)' : '2px solid transparent',
                cursor: 'pointer',
                padding: 0,
                boxShadow: isActive ? '0 0 0 2px rgba(255,255,255,0.2)' : 'none',
                opacity: isActive ? 1 : 0.6,
                transition: 'all 0.2s',
                outline: 'none'
            }}
        />
    );
};
