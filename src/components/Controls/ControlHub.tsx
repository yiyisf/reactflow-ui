import React from 'react';
import { useReactFlow } from 'reactflow';
import ControlButton from './ControlButton';

const ControlHub: React.FC = () => {
    const { zoomIn, zoomOut, fitView } = useReactFlow();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
            {/* 导航按钮组 - 垂直排列或保持水平但位置在左下 */}
            <div style={{
                display: 'flex',
                background: 'var(--bg-tertiary)',
                padding: '4px',
                borderRadius: '8px',
                border: '1px solid var(--border-primary)',
                gap: '4px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
            }}>
                <ControlButton
                    icon="➕"
                    title="放大"
                    onClick={() => zoomIn()}
                />
                <ControlButton
                    icon="➖"
                    title="缩小"
                    onClick={() => zoomOut()}
                />
                <ControlButton
                    icon="⤢"
                    title="适应屏幕"
                    onClick={() => fitView({ duration: 600 })}
                />
            </div>
        </div>
    );
};

export default ControlHub;
