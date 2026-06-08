import React, { useState, useEffect, useCallback } from 'react';
import useWorkflowStore from '../store/workflowStore';
import { WorkflowDef, WorkflowInputParam, parseWorkflowInputParams } from '../types/conductor';

interface WorkflowSettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    theme?: 'dark' | 'light';
}

type TabId = 'basic' | 'timeout' | 'params' | 'advanced';

const TABS: { id: TabId; label: string }[] = [
    { id: 'basic', label: '基本信息' },
    { id: 'timeout', label: '超时与容错' },
    { id: 'params', label: '参数配置' },
    { id: 'advanced', label: '高级设置' },
];

/**
 * 工作流设置面板 - Tab 分组形式，编辑工作流级全部配置字段
 */
const WorkflowSettingsPanel = ({ isOpen, onClose }: WorkflowSettingsPanelProps) => {
    const { workflowDef, updateWorkflowProperties, mode } = useWorkflowStore();
    const [localDef, setLocalDef] = useState<(WorkflowDef & Record<string, any>) | null>(workflowDef as any);
    const [activeTab, setActiveTab] = useState<TabId>('basic');

    const isReadOnly = mode !== 'edit';

    useEffect(() => {
        if (workflowDef) {
            setLocalDef(workflowDef as any);
        }
    }, [workflowDef, isOpen]);

    // Escape 键关闭
    const handleEscape = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return;
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, handleEscape]);

    if (!isOpen || !localDef) return null;

    const textColor = 'var(--text-primary)';
    const borderColor = 'var(--glass-border)';
    const inputBg = 'var(--bg-tertiary)';
    const secondaryTextColor = 'var(--text-secondary)';

    const handleChange = (field: string, value: any) => {
        if (!localDef || isReadOnly) return;
        const updated = { ...localDef, [field]: value };
        setLocalDef(updated);
        updateWorkflowProperties({ [field]: value });
    };

    const handleNestedChange = (parent: string, field: string, value: any) => {
        if (!localDef || isReadOnly) return;
        const current = (localDef as any)[parent] || {};
        const updated = { ...current, [field]: value };
        setLocalDef(prev => ({ ...prev!, [parent]: updated }));
        updateWorkflowProperties({ [parent]: updated });
    };

    const handleJsonChange = (field: string, value: string) => {
        if (!localDef || isReadOnly) return;
        try {
            const parsed = JSON.parse(value);
            const updated = { ...localDef, [field]: parsed };
            setLocalDef(updated);
            updateWorkflowProperties({ [field]: parsed });
        } catch {
            setLocalDef(prev => ({ ...prev!, [`_${field}_str`]: value }));
        }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '10px 14px',
        borderRadius: '8px',
        border: `1px solid ${borderColor}`,
        background: inputBg,
        color: textColor,
        fontSize: '14px',
        outline: 'none',
        boxSizing: 'border-box',
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '11px',
        color: secondaryTextColor,
        marginBottom: '8px',
        fontWeight: 600,
    };

    const renderInput = (label: string, field: string, type: 'text' | 'number' = 'text', opts?: { readOnly?: boolean; placeholder?: string }) => (
        <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>{label.toUpperCase()}</label>
            <input
                className="wsp-input"
                type={type}
                value={(localDef as any)?.[field] ?? ''}
                onChange={(e) => handleChange(field, type === 'number' ? (e.target.value === '' ? 0 : parseInt(e.target.value)) : e.target.value)}
                disabled={isReadOnly || opts?.readOnly}
                placeholder={opts?.placeholder}
                style={{ ...inputStyle, opacity: (isReadOnly || opts?.readOnly) ? 0.6 : 1 }}
            />
        </div>
    );

    const renderTextArea = (label: string, field: string, isJson = false, rows = 6) => {
        const value = (localDef as any)?.[`_${field}_str`] !== undefined
            ? (localDef as any)[`_${field}_str`]
            : (typeof (localDef as any)?.[field] === 'object' ? JSON.stringify((localDef as any)[field], null, 2) : (localDef as any)?.[field]);

        return (
            <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>{label.toUpperCase()} {isJson && '(JSON)'}</label>
                <textarea
                    className="wsp-input"
                    value={value || ''}
                    onChange={(e) => isJson ? handleJsonChange(field, e.target.value) : handleChange(field, e.target.value)}
                    rows={rows}
                    disabled={isReadOnly}
                    style={{
                        ...inputStyle,
                        fontSize: '13px',
                        fontFamily: isJson ? 'var(--font-mono)' : 'inherit',
                        resize: 'vertical',
                        opacity: isReadOnly ? 0.6 : 1,
                    }}
                />
            </div>
        );
    };

    const renderSelect = (label: string, field: string, options: { value: string; label: string }[]) => (
        <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>{label.toUpperCase()}</label>
            <select
                className="wsp-input"
                value={(localDef as any)?.[field] ?? options[0]?.value}
                onChange={(e) => handleChange(field, e.target.value)}
                disabled={isReadOnly}
                style={{ ...inputStyle, opacity: isReadOnly ? 0.6 : 1, cursor: isReadOnly ? 'not-allowed' : 'pointer' }}
            >
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    );

    const renderToggle = (label: string, field: string) => {
        const checked = !!(localDef as any)?.[field];
        return (
            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: '13px', color: textColor }}>{label}</label>
                <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    onClick={() => !isReadOnly && handleChange(field, !checked)}
                    disabled={isReadOnly}
                    style={{
                        width: '44px',
                        height: '24px',
                        borderRadius: '12px',
                        border: 'none',
                        background: checked ? 'var(--color-accent)' : 'var(--border-primary)',
                        position: 'relative',
                        cursor: isReadOnly ? 'not-allowed' : 'pointer',
                        transition: 'background 0.2s',
                        opacity: isReadOnly ? 0.6 : 1,
                        flexShrink: 0,
                    }}
                >
                    <span style={{
                        position: 'absolute',
                        top: '2px',
                        left: checked ? '22px' : '2px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: 'var(--text-inverse)',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                </button>
            </div>
        );
    };

    const renderBasicTab = () => (
        <>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '20px' }}>
                {renderInput('工作流名称', 'name')}
                {renderInput('版本号', 'version', 'number')}
            </div>
            {renderTextArea('描述信息', 'description', false, 3)}
            {renderInput('负责人邮箱', 'ownerEmail', 'text', { placeholder: 'owner@example.com' })}
            {renderInput('Schema 版本', 'schemaVersion', 'number', { readOnly: true })}
        </>
    );

    const renderTimeoutTab = () => (
        <>
            {renderSelect('超时策略', 'timeoutPolicy', [
                { value: 'ALERT_ONLY', label: 'ALERT_ONLY — 仅告警' },
                { value: 'TIME_OUT_WF', label: 'TIME_OUT_WF — 超时终止' },
            ])}
            <div>
                {renderInput('超时秒数', 'timeoutSeconds', 'number', { placeholder: '0 表示不超时' })}
                {(localDef as any)?.timeoutPolicy === 'ALERT_ONLY' && (
                    <p style={{ fontSize: '11px', color: secondaryTextColor, marginTop: '-12px', marginBottom: '20px' }}>
                        当前策略为 ALERT_ONLY，超时仅触发告警，不会终止工作流。
                    </p>
                )}
            </div>
            {renderInput('失败补偿工作流', 'failureWorkflow', 'text', { placeholder: '输入补偿工作流名称' })}
            {renderToggle('允许重启 (restartable)', 'restartable')}
        </>
    );

    const renderParamsTab = () => {
        const inputParams: WorkflowInputParam[] = parseWorkflowInputParams((localDef as any)?.inputParameters);

        const updateInputParams = (params: WorkflowInputParam[]) => {
            if (isReadOnly) return;
            handleChange('inputParameters', params);
        };

        const addParam = () => {
            const newParams = [...inputParams, { name: `param_${inputParams.length + 1}`, type: 'string' as const, required: false }];
            updateInputParams(newParams);
        };

        const removeParam = (idx: number) => {
            const newParams = inputParams.filter((_, i) => i !== idx);
            updateInputParams(newParams);
        };

        const updateParam = (idx: number, field: keyof WorkflowInputParam, value: any) => {
            const newParams = inputParams.map((p, i) => i === idx ? { ...p, [field]: value } : p);
            updateInputParams(newParams);
        };

        const paramFieldStyle: React.CSSProperties = {
            padding: '6px 10px', borderRadius: '6px', border: `1px solid ${borderColor}`,
            background: inputBg, color: textColor, fontSize: '12px', outline: 'none', fontFamily: 'inherit',
        };

        return (
            <>
                {/* 结构化入参编辑器 */}
                <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <label style={labelStyle}>入参声明 (INPUT PARAMETERS)</label>
                        {!isReadOnly && (
                            <button onClick={addParam} style={{
                                background: 'var(--color-accent)', color: 'var(--text-inverse)',
                                border: 'none', borderRadius: '6px', padding: '5px 12px',
                                fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                            }}>+ 添加参数</button>
                        )}
                    </div>
                    {inputParams.length === 0 ? (
                        <p style={{ fontSize: '12px', color: secondaryTextColor, margin: 0, padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: `1px solid ${borderColor}` }}>
                            暂无入参声明。点击"+ 添加参数"来定义工作流的输入参数，这些参数将在执行验证时作为表单字段展示。
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {inputParams.map((param, idx) => (
                                <div key={idx} style={{ background: 'var(--bg-secondary)', border: `1px solid ${borderColor}`, borderRadius: '10px', padding: '12px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto auto', gap: '8px', alignItems: 'center' }}>
                                        <input
                                            style={paramFieldStyle}
                                            placeholder="参数名"
                                            value={param.name}
                                            onChange={e => updateParam(idx, 'name', e.target.value)}
                                            disabled={isReadOnly}
                                        />
                                        <select
                                            style={{ ...paramFieldStyle, cursor: isReadOnly ? 'not-allowed' : 'pointer' }}
                                            value={param.type ?? 'string'}
                                            onChange={e => updateParam(idx, 'type', e.target.value)}
                                            disabled={isReadOnly}
                                        >
                                            {['string', 'number', 'boolean', 'object', 'array'].map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: secondaryTextColor, cursor: isReadOnly ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                                            <input
                                                type="checkbox"
                                                checked={!!param.required}
                                                onChange={e => updateParam(idx, 'required', e.target.checked)}
                                                disabled={isReadOnly}
                                                style={{ accentColor: 'var(--color-accent)' }}
                                            />
                                            必填
                                        </label>
                                        {!isReadOnly && (
                                            <button onClick={() => removeParam(idx)} style={{
                                                background: 'none', border: 'none', color: 'var(--status-failed)',
                                                cursor: 'pointer', fontSize: '16px', padding: '0 4px', opacity: 0.7, lineHeight: 1,
                                            }}>✕</button>
                                        )}
                                    </div>
                                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <input
                                            style={paramFieldStyle}
                                            placeholder="说明（可选）"
                                            value={param.description ?? ''}
                                            onChange={e => updateParam(idx, 'description', e.target.value)}
                                            disabled={isReadOnly}
                                        />
                                        <input
                                            style={paramFieldStyle}
                                            placeholder={`示例值（如 ${param.type === 'number' ? '42' : param.type === 'boolean' ? 'true' : '"value"'}）`}
                                            value={param.example !== undefined ? (typeof param.example === 'object' ? JSON.stringify(param.example) : String(param.example)) : ''}
                                            onChange={e => {
                                                let val: any = e.target.value;
                                                try { val = JSON.parse(e.target.value); } catch { /* keep as string */ }
                                                updateParam(idx, 'example', val);
                                            }}
                                            disabled={isReadOnly}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {renderTextArea('输出参数映射 (outputParameters)', 'outputParameters', true)}
                {renderTextArea('默认输入模板 (inputTemplate)', 'inputTemplate', true)}
                {renderTextArea('工作流级变量 (variables)', 'variables', true)}
            </>
        );
    };

    const renderAdvancedTab = () => (
        <>
            {renderToggle('启用状态监听 (workflowStatusListenerEnabled)', 'workflowStatusListenerEnabled')}
            {(localDef as any)?.workflowStatusListenerEnabled && (
                renderInput('状态事件目标 (Listener Sink)', 'workflowStatusListenerSink', 'text', { placeholder: 'conductor:workflow_status_event' })
            )}

            <div style={{ borderTop: `1px solid ${borderColor}`, marginTop: '8px', paddingTop: '20px' }}>
                {renderToggle('强制 Schema 校验 (enforceSchema)', 'enforceSchema')}
                {(localDef as any)?.enforceSchema && (
                    <>
                        {renderTextArea('输入 Schema (inputSchema)', 'inputSchema', true, 4)}
                        {renderTextArea('输出 Schema (outputSchema)', 'outputSchema', true, 4)}
                    </>
                )}
            </div>

            <div style={{ borderTop: `1px solid ${borderColor}`, marginTop: '8px', paddingTop: '20px' }}>
                <label style={{ ...labelStyle, marginBottom: '16px' }}>并发限流 (RATE LIMIT)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
                    <div>
                        <label style={labelStyle}>RATE LIMIT KEY</label>
                        <input
                            className="wsp-input"
                            type="text"
                            value={(localDef as any)?.rateLimitConfig?.rateLimitKey ?? ''}
                            onChange={(e) => handleNestedChange('rateLimitConfig', 'rateLimitKey', e.target.value)}
                            disabled={isReadOnly}
                            placeholder="限流键"
                            style={{ ...inputStyle, opacity: isReadOnly ? 0.6 : 1 }}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>并发上限</label>
                        <input
                            className="wsp-input"
                            type="number"
                            value={(localDef as any)?.rateLimitConfig?.concurrentExecLimit ?? ''}
                            onChange={(e) => handleNestedChange('rateLimitConfig', 'concurrentExecLimit', e.target.value === '' ? 0 : parseInt(e.target.value))}
                            disabled={isReadOnly}
                            placeholder="0"
                            style={{ ...inputStyle, opacity: isReadOnly ? 0.6 : 1 }}
                        />
                    </div>
                </div>
            </div>
        </>
    );

    const renderTabContent = () => {
        switch (activeTab) {
            case 'basic': return renderBasicTab();
            case 'timeout': return renderTimeoutTab();
            case 'params': return renderParamsTab();
            case 'advanced': return renderAdvancedTab();
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="工作流全局配置"
            onClick={onClose}
            style={{
                position: 'fixed',
                left: 0,
                top: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0,0,0,0.5)',
                zIndex: 1300,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                backdropFilter: 'blur(4px)',
                animation: 'fadeIn 0.2s ease'
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '680px',
                    maxHeight: '85vh',
                    background: 'var(--glass-surface)',
                    borderRadius: '16px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    border: `1px solid ${borderColor}`,
                    backdropFilter: 'blur(20px)'
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '24px 32px 0 32px',
                    background: 'var(--bg-highlight)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '20px', color: textColor }}>工作流全局配置</h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: secondaryTextColor }}>
                                {isReadOnly ? '当前为只读模式' : '配置工作流级属性，所有更改将实时保存'}
                            </p>
                        </div>
                        <button
                            className="wsp-close"
                            onClick={onClose}
                            aria-label="关闭"
                            style={{ background: 'none', border: 'none', color: textColor, fontSize: '24px', cursor: 'pointer', opacity: 0.6 }}
                        >✕</button>
                    </div>

                    {/* Tab Bar */}
                    <div style={{ display: 'flex', borderBottom: `1px solid ${borderColor}` }}>
                        {TABS.map(tab => (
                            <button
                                className="wsp-tab"
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    padding: '10px 20px',
                                    fontSize: '13px',
                                    fontWeight: activeTab === tab.id ? 600 : 400,
                                    color: activeTab === tab.id ? 'var(--color-accent)' : secondaryTextColor,
                                    background: 'none',
                                    border: 'none',
                                    borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    marginBottom: '-1px',
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
                    {renderTabContent()}
                </div>

                {/* Footer */}
                <div style={{ padding: '20px 32px', borderTop: `1px solid ${borderColor}`, background: 'var(--bg-highlight)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        className="wsp-footer-btn"
                        onClick={onClose}
                        style={{
                            padding: '12px 32px',
                            background: 'var(--color-accent)',
                            color: 'var(--text-inverse)',
                            border: 'none',
                            borderRadius: '12px',
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
