import React, { useState, useCallback, useEffect } from 'react';
import useWorkflowStore from '../store/workflowStore';
import { parseWorkflowInputParams, WorkflowInputParam } from '../types/conductor';
import { WorkflowInstance } from '../types/conductor';
import './WorkflowRunPanel.css';

export interface WorkflowRunPanelProps {
    onTriggerExecution?: (
        workflowName: string,
        version: number,
        input: Record<string, any>
    ) => Promise<{ workflowId: string }>;
    onPollExecution?: (workflowId: string) => Promise<WorkflowInstance | null>;
    executionPollInterval?: number;
}

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'TIMED_OUT', 'TERMINATED']);

const WorkflowRunPanel: React.FC<WorkflowRunPanelProps> = ({
    onTriggerExecution,
    onPollExecution,
    executionPollInterval = 3000,
}) => {
    const { workflowDef, showRunPanel, setShowRunPanel, setRunState, importExecutionJSON, setMode } = useWorkflowStore();

    const [inputMode, setInputMode] = useState<'form' | 'json'>('form');
    const [formValues, setFormValues] = useState<Record<string, string>>({});
    const [jsonInput, setJsonInput] = useState('{}');
    const [jsonError, setJsonError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    const params: WorkflowInputParam[] = parseWorkflowInputParams(workflowDef?.inputParameters);

    // Reset state when panel opens
    useEffect(() => {
        if (!showRunPanel) return;
        setFormValues({});
        setJsonInput('{}');
        setJsonError('');
        setSubmitError('');
        setIsSubmitting(false);
    }, [showRunPanel]);

    // Sync form → json when switching modes
    const switchToJson = useCallback(() => {
        try {
            const obj: Record<string, any> = {};
            params.forEach(p => {
                const raw = formValues[p.name];
                if (raw !== undefined && raw !== '') {
                    if (p.type === 'number') obj[p.name] = Number(raw);
                    else if (p.type === 'boolean') obj[p.name] = raw === 'true';
                    else if (p.type === 'object' || p.type === 'array') {
                        try { obj[p.name] = JSON.parse(raw); } catch { obj[p.name] = raw; }
                    } else {
                        obj[p.name] = raw;
                    }
                } else if (p.defaultValue !== undefined) {
                    obj[p.name] = p.defaultValue;
                }
            });
            setJsonInput(JSON.stringify(obj, null, 2));
        } catch { /* keep existing */ }
        setInputMode('json');
    }, [formValues, params]);

    const switchToForm = useCallback(() => {
        try {
            const obj = JSON.parse(jsonInput);
            const newVals: Record<string, string> = {};
            params.forEach(p => {
                const v = obj[p.name];
                if (v !== undefined) {
                    newVals[p.name] = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
                }
            });
            setFormValues(newVals);
            setJsonError('');
        } catch { setJsonError('JSON 格式有误，无法切换为表单模式'); }
        setInputMode('form');
    }, [jsonInput, params]);

    const getInputObject = useCallback((): Record<string, any> | null => {
        if (inputMode === 'json') {
            try {
                return JSON.parse(jsonInput);
            } catch {
                setJsonError('JSON 格式有误，请检查后重试');
                return null;
            }
        }
        const obj: Record<string, any> = {};
        params.forEach(p => {
            const raw = formValues[p.name] ?? (p.defaultValue !== undefined ? String(p.defaultValue) : '');
            if (raw === '' && !p.required) return;
            if (p.type === 'number') obj[p.name] = Number(raw);
            else if (p.type === 'boolean') obj[p.name] = raw === 'true';
            else if (p.type === 'object' || p.type === 'array') {
                try { obj[p.name] = JSON.parse(raw); } catch { obj[p.name] = raw; }
            } else obj[p.name] = raw;
        });
        return obj;
    }, [inputMode, jsonInput, formValues, params]);

    const handleExecute = useCallback(async () => {
        if (!onTriggerExecution || !workflowDef) return;

        const inputObj = getInputObject();
        if (inputObj === null) return;

        // Validate required fields
        const missingRequired = params.filter(p => p.required && (inputObj[p.name] === undefined || inputObj[p.name] === ''));
        if (missingRequired.length > 0) {
            setSubmitError(`必填参数未填写：${missingRequired.map(p => p.name).join(', ')}`);
            return;
        }

        setIsSubmitting(true);
        setSubmitError('');
        setRunState('triggering');

        try {
            const { workflowId } = await onTriggerExecution(
                workflowDef.name,
                workflowDef.version ?? 1,
                inputObj
            );

            setRunState('polling', workflowId);
            setShowRunPanel(false);

            // Switch to run mode placeholder while polling
            setMode('run');

            if (!onPollExecution) return;

            // Exponential back-off polling
            let interval = executionPollInterval;
            const MAX_INTERVAL = 15000;
            let pollTimer: ReturnType<typeof setTimeout>;

            const poll = async () => {
                try {
                    const instance = await onPollExecution(workflowId);
                    if (instance) {
                        importExecutionJSON(instance);
                        if (TERMINAL_STATUSES.has(instance.status)) {
                            setRunState('done', workflowId);
                            return;
                        }
                    }
                } catch { /* ignore individual poll errors */ }

                interval = Math.min(interval * 1.5, MAX_INTERVAL);
                pollTimer = setTimeout(poll, interval);
            };

            pollTimer = setTimeout(poll, interval);
            // Store cleanup reference on the store for potential cancellation
            (useWorkflowStore.getState() as any).__pollTimer = pollTimer;
        } catch (err: any) {
            const msg = err?.message || '执行触发失败，请检查配置后重试';
            setRunState('error', null, msg);
            setSubmitError(msg);
            setIsSubmitting(false);
        }
    }, [onTriggerExecution, onPollExecution, workflowDef, getInputObject, params,
        setRunState, setShowRunPanel, importExecutionJSON, setMode, executionPollInterval]);

    if (!showRunPanel || !workflowDef) return null;

    const hasParams = params.length > 0;

    return (
        <div className="wrp-overlay" onClick={() => setShowRunPanel(false)}>
            <div className="wrp-panel" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="wrp-header">
                    <div className="wrp-header-title">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ color: 'var(--status-completed)' }}>
                            <path d="M4 3l9 5-9 5z" />
                        </svg>
                        执行验证
                    </div>
                    <div className="wrp-workflow-name">
                        {workflowDef.name} <span className="wrp-version">v{workflowDef.version ?? 1}</span>
                    </div>
                    <button className="wrp-close" onClick={() => setShowRunPanel(false)}>✕</button>
                </div>

                {/* Content */}
                <div className="wrp-content">
                    <div className="wrp-section-label">
                        工作流输入参数
                        {hasParams && (
                            <div className="wrp-mode-toggle">
                                <button
                                    className={inputMode === 'form' ? 'active' : ''}
                                    onClick={inputMode === 'json' ? switchToForm : undefined}
                                >
                                    表单模式
                                </button>
                                <button
                                    className={inputMode === 'json' ? 'active' : ''}
                                    onClick={inputMode === 'form' ? switchToJson : undefined}
                                >
                                    JSON 编辑器
                                </button>
                            </div>
                        )}
                    </div>

                    {!hasParams && inputMode === 'form' && (
                        <p className="wrp-hint">
                            该工作流未声明输入参数。你可以在 <strong>工作流设置 → 参数配置</strong> 中添加，也可以直接在 JSON 编辑器中手动填写。
                        </p>
                    )}

                    {inputMode === 'form' ? (
                        <div className="wrp-form">
                            {params.map(param => (
                                <div key={param.name} className="wrp-field">
                                    <label className="wrp-field-label">
                                        {param.name}
                                        {param.required && <span className="wrp-required">*</span>}
                                        {param.type && <span className="wrp-type">{param.type}</span>}
                                    </label>
                                    {param.description && (
                                        <p className="wrp-field-desc">{param.description}</p>
                                    )}
                                    {(param.type === 'object' || param.type === 'array') ? (
                                        <textarea
                                            className="wrp-input"
                                            rows={3}
                                            placeholder={param.example ? JSON.stringify(param.example, null, 2) : '{}'}
                                            value={formValues[param.name] ?? ''}
                                            onChange={e => setFormValues(prev => ({ ...prev, [param.name]: e.target.value }))}
                                        />
                                    ) : param.type === 'boolean' ? (
                                        <select
                                            className="wrp-input"
                                            value={formValues[param.name] ?? (param.defaultValue !== undefined ? String(param.defaultValue) : '')}
                                            onChange={e => setFormValues(prev => ({ ...prev, [param.name]: e.target.value }))}
                                        >
                                            <option value="">请选择</option>
                                            <option value="true">true</option>
                                            <option value="false">false</option>
                                        </select>
                                    ) : (
                                        <input
                                            className="wrp-input"
                                            type={param.type === 'number' ? 'number' : 'text'}
                                            placeholder={param.example !== undefined ? String(param.example) : (param.defaultValue !== undefined ? String(param.defaultValue) : '')}
                                            value={formValues[param.name] ?? ''}
                                            onChange={e => setFormValues(prev => ({ ...prev, [param.name]: e.target.value }))}
                                        />
                                    )}
                                </div>
                            ))}
                            {!hasParams && (
                                <button className="wrp-switch-json" onClick={switchToJson}>
                                    切换为 JSON 编辑器手动填写
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="wrp-json-editor">
                            <textarea
                                className="wrp-input wrp-json"
                                rows={12}
                                value={jsonInput}
                                onChange={e => { setJsonInput(e.target.value); setJsonError(''); }}
                                spellCheck={false}
                                placeholder='{\n  "key": "value"\n}'
                            />
                            {jsonError && <p className="wrp-error">{jsonError}</p>}
                        </div>
                    )}

                    {submitError && <p className="wrp-error wrp-submit-error">{submitError}</p>}
                </div>

                {/* Footer */}
                <div className="wrp-footer">
                    <button className="wrp-btn wrp-btn-cancel" onClick={() => setShowRunPanel(false)}>
                        取消
                    </button>
                    {onTriggerExecution ? (
                        <button
                            className="wrp-btn wrp-btn-execute"
                            onClick={handleExecute}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="wrp-spinner" />
                                    执行中...
                                </>
                            ) : (
                                <>
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M4 3l9 5-9 5z" />
                                    </svg>
                                    发起执行
                                </>
                            )}
                        </button>
                    ) : (
                        <span className="wrp-hint-inline">
                            未配置 onTriggerExecution 回调
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WorkflowRunPanel;
