import { useState, useEffect } from 'react';
import useWorkflowStore from '../store/workflowStore';

/**
 * 工作流设置面板 - 编辑名称、版本、描述和全局参数
 */
const WorkflowSettingsPanel = ({ isOpen, onClose, theme = 'dark' }) => {
    const { workflowDef, updateWorkflowProperties } = useWorkflowStore();
    const [localDef, setLocalDef] = useState(workflowDef);

    useEffect(() => {
        if (workflowDef) {
            setLocalDef(workflowDef);
        }
    }, [workflowDef, isOpen]);

    if (!isOpen || !localDef) return null;

    const bgColor = theme === 'light'
        ? 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
        : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
    const textColor = theme === 'light' ? '#0f172a' : '#fff';
    const borderColor = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)';
    const inputBg = theme === 'light' ? '#fff' : 'rgba(0,0,0,0.3)';
    const secondaryTextColor = theme === 'light' ? '#64748b' : '#94a3b8';

    const handleChange = (field, value) => {
        const updated = { ...localDef, [field]: value };
        setLocalDef(updated);
        updateWorkflowProperties({ [field]: value });
    };

    const handleJsonChange = (field, value) => {
        try {
            const parsed = JSON.parse(value);
            const updated = { ...localDef, [field]: parsed };
            setLocalDef(updated);
            updateWorkflowProperties({ [field]: parsed });
        } catch (e) {
            // Keep local state as string if invalid JSON, but don't sync to store
            setLocalDef(prev => ({ ...prev, [`_${field}_str`]: value }));
        }
    };

    const renderInput = (label, field, type = 'text') => (
        <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: secondaryTextColor, marginBottom: '8px', fontWeight: 'bold' }}>
                {label.toUpperCase()}
            </label>
            <input
                type={type}
                value={localDef[field] || ''}
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

    const renderTextArea = (label, field, isJson = false) => {
        const value = localDef[`_${field}_str`] !== undefined
            ? localDef[`_${field}_str`]
            : (typeof localDef[field] === 'object' ? JSON.stringify(localDef[field], null, 2) : localDef[field]);

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
                border: `1px solid ${borderColor}`
            }}>
                {/* Header */}
                <div style={{
                    padding: '24px 32px',
                    borderBottom: `1px solid ${borderColor}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(0,0,0,0.05)'
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

                    <div style={{ marginTop: '12px', padding: '16px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <div style={{ fontSize: '12px', color: '#3b82f6', fontWeight: 'bold', marginBottom: '8px' }}>💡 提示</div>
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
                            background: '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '10px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
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
