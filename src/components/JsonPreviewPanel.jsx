import { memo } from 'react';
import useWorkflowStore from '../store/workflowStore';

/**
 * 全局 JSON 预览面板 - 实时展示当前工作流定义
 */
const JsonPreviewPanel = ({ isOpen, onClose, theme = 'dark' }) => {
    const { workflowDef } = useWorkflowStore();

    if (!isOpen) return null;

    const bgColor = theme === 'light' ? '#fff' : '#1e293b';
    const textColor = theme === 'light' ? '#334155' : '#e2e8f0';
    const borderColor = theme === 'light' ? '#e2e8f0' : '#334155';
    const codeBg = theme === 'light' ? '#f8fafc' : '#0f172a';

    return (
        <div style={{
            position: 'fixed',
            left: 0,
            top: 0,
            width: '450px',
            height: '100vh',
            background: bgColor,
            borderRight: `1px solid ${borderColor}`,
            boxShadow: '10px 0 30px rgba(0,0,0,0.1)',
            zIndex: 1500,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInFromLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
            <style>{`
                @keyframes slideInFromLeft {
                  from { transform: translateX(-100%); }
                  to { transform: translateX(0); }
                }
            `}</style>

            <div style={{
                padding: '24px',
                borderBottom: `1px solid ${borderColor}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(0,0,0,0.03)'
            }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px' }}>📦</span> 实时 JSON 预览
                    </h3>
                </div>
                <button
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', color: textColor, fontSize: '20px', cursor: 'pointer' }}
                >✕</button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '16px', background: codeBg }}>
                <pre style={{
                    margin: 0,
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    lineHeight: '1.6',
                    color: theme === 'light' ? '#2563eb' : '#60a5fa'
                }}>
                    {JSON.stringify(workflowDef, null, 2)}
                </pre>
            </div>

            <div style={{
                padding: '16px 24px',
                borderTop: `1px solid ${borderColor}`,
                background: 'rgba(0,0,0,0.03)',
                fontSize: '11px',
                color: theme === 'light' ? '#64748b' : '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <span style={{ color: '#10b981' }}>●</span> 自动同步已开启 (Read-Only)
            </div>
        </div>
    );
};

export default memo(JsonPreviewPanel);
