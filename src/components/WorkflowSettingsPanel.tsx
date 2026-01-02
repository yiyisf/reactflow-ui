import { useState, useEffect } from 'react';
import useWorkflowStore from '../store/workflowStore';
import { WorkflowDef } from '../types/conductor';

interface WorkflowSettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    theme?: 'dark' | 'light';
}

/**
 * 工作流设置面板 - 编辑名称、版本、描述和全局参数
 */
const WorkflowSettingsPanel = ({ isOpen, onClose, theme = 'dark' }: WorkflowSettingsPanelProps) => {
    const { workflowDef, updateWorkflowProperties } = useWorkflowStore();
    const [localDef, setLocalDef] = useState<WorkflowDef | (WorkflowDef & Record<string, any>) | null>(workflowDef);

    useEffect(() => {
        if (workflowDef) {
            setLocalDef(workflowDef);
        }
    }, [workflowDef, isOpen]);

    if (!isOpen || !localDef) return null;

    const bgColor = 'var(--glass-surface)';
    const textColor = 'var(--text-primary)';
    const borderColor = 'var(--glass-border)';
    const inputBg = 'var(--bg-tertiary)';
    const secondaryTextColor = 'var(--text-secondary)';

    const handleChange = (field: string, value: any) => {
        if (!localDef) return;
        const updated = { ...localDef, [field]: value };
        setLocalDef(updated);
        updateWorkflowProperties({ [field]: value });
    };

    const handleJsonChange = (field: string, value: string) => {
        if (!localDef) return;
        try {
            const parsed = JSON.parse(value);
            const updated = { ...localDef, [field]: parsed };
            setLocalDef(updated);
            updateWorkflowProperties({ [field]: parsed });
        } catch (e) {
            // Keep local state as string if invalid JSON, but don't sync to store
            setLocalDef(prev => ({ ...prev!, [`_${field}_str`]: value }));
        }
    };

    const renderInput = (label: string, field: string, type: 'text' | 'number' = 'text') => (
        <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: secondaryTextColor, marginBottom: '8px', fontWeight: 'bold' }}>
                {label.toUpperCase()}
            </label>
            <input
                type={type}
                value={(localDef as any)?.[field] || ''}
                onChange={(e) => handleChange(field, type === 'number' ? parseInt(e.target.value) : e.target.value)}
                style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: `1px solid ${borderColor}`,
                    background: inputBg,
                    color: textColor,
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                }}
            />
        </div>
    );

    const renderTextArea = (label: string, field: string, isJson = false) => {
        const value = (localDef as any)?.[`_${field}_str`] !== undefined
            ? (localDef as any)[`_${field}_str`]
            : (typeof (localDef as any)?.[field] === 'object' ? JSON.stringify((localDef as any)[field], null, 2) : (localDef as any)?.[field]);

        return (
            <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: secondaryTextColor, marginBottom: '8px', fontWeight: 'bold' }}>
                    {label.toUpperCase()} {isJson && '(JSON)'}
                </label>
                <textarea
                    value={value || ''}
                    onChange={(e) => isJson ? handleJsonChange(field, e.target.value) : handleChange(field, e.target.value)}
                    rows={field === 'description' ? 3 : 8}
                    style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: `1px solid ${borderColor}`,
                        background: inputBg,
                        color: textColor,
                        fontSize: '13px',
                        fontFamily: isJson ? 'monospace' : 'inherit',
                        outline: 'none',
                        resize: 'vertical',
                        boxSizing: 'border-box'
                    }}
                />
            </div>
        );
    };

    return (
        <div style={{
            position: 'fixed',
            left: 0,
            top: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 2000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backdropFilter: 'blur(4px)',
            animation: 'fadeIn 0.2s ease'
        }}>
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            `}</style>

            <div style={{
                width: '600px',
                maxHeight: '85vh',
                background: bgColor,
                borderRadius: '20px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                border: `1px solid ${borderColor}`,
                backdropFilter: 'blur(20px)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '24px 32px',
                    borderBottom: `1px solid ${borderColor}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--bg-highlight)'
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '20px', color: textColor }}>工作流全局配置</h2>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: secondaryTextColor }}>定义名称、版本及全局输入输出参数</p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: textColor, fontSize: '24px', cursor: 'pointer', opacity: 0.6 }}
                    >✕</button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '20px' }}>
                        {renderInput('工作流名称', 'name')}
                        {renderInput('版本号', 'version', 'number')}
                    </div>

                    {renderTextArea('描述信息', 'description')}

                    <div style={{ borderTop: `1px solid ${borderColor}`, marginTop: '12px', paddingTop: '24px' }}>
                        {renderTextArea('输入参数定义 (Input Definitions)', 'inputParameters', true)}
                        {renderTextArea('输出参数映射 (Output Mapping)', 'outputParameters', true)}
                    </div>

                    <div style={{ marginTop: '12px', padding: '16px', background: 'var(--color-accent-bg)', borderRadius: '12px', border: '1px solid var(--color-accent-bg)' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 'bold', marginBottom: '8px' }}>💡 提示</div>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '11px', color: secondaryTextColor, lineHeight: '1.6' }}>
                            <li>工作流名称建议使用英文和下划线，例如：<code>order_fulfillment_flow</code></li>
                            <li>修改名称或版本不会影响已部署的工作流实例。</li>
                            <li>所有更改将实时保存。</li>
                        </ul>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '20px 32px', borderTop: `1px solid ${borderColor}`, background: 'rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '12px 32px',
                            background: 'var(--color-accent)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '10px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px var(--color-accent-bg)'
                        }}
                    >
                        完成并关闭
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WorkflowSettingsPanel;
