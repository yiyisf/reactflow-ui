import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CircleCheck, CircleX, Play, X } from 'lucide-react';
import { parseWorkflowInputParams } from '../../types/conductor';
import type { WorkflowDef, WorkflowInstance } from '../../types/conductor';
import { coerceRunInputs } from './runInputs';
import useWorkflowStore from '../../store/workflowStore';
import UnsavedRunNotice from '../UnsavedRunNotice';

interface WorkflowRunCardProps {
    workflowDef: WorkflowDef;
    /** Signature matches WorkflowIDE's onTriggerExecution — one adapter serves both components. */
    onTriggerExecution: (workflowName: string, version: number, input: Record<string, any>) => Promise<{ workflowId: string }>;
    /** Signature matches WorkflowIDE's onPollExecution: null while pending, WorkflowInstance once available. */
    onPollExecution: (workflowId: string) => Promise<WorkflowInstance | null>;
    onClose: () => void;
}

type Phase = 'form' | 'running' | 'done' | 'error';

const TERMINAL_STATUSES = new Set([
    'COMPLETED', 'COMPLETED_WITH_ERRORS',
    'FAILED', 'FAILED_WITH_TERMINAL_ERROR',
    'TIMED_OUT', 'TERMINATED', 'CANCELED',
]);
const SUCCESS_STATUSES = new Set(['COMPLETED', 'COMPLETED_WITH_ERRORS']);

const CARD: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-primary)',
    borderRadius: 10,
    padding: '16px',
    margin: '8px 0',
    fontSize: 13,
};

const BTN_BASE: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 500,
};

const WorkflowRunCard: React.FC<WorkflowRunCardProps> = ({
    workflowDef,
    onTriggerExecution,
    onPollExecution,
    onClose,
}) => {
    const inputParams = parseWorkflowInputParams(workflowDef.inputParameters as any, workflowDef);
    const [phase, setPhase] = useState<Phase>('form');
    const [paramValues, setParamValues] = useState<Record<string, string>>(() =>
        Object.fromEntries(inputParams.map(p => [p.name, '']))
    );
    const [executionId, setExecutionId] = useState<string | null>(null);
    const [execStatus, setExecStatus] = useState<string>('');
    const [execOutput, setExecOutput] = useState<Record<string, any> | null>(null);
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelledRef = useRef(false);
    // R19：运行卡片同样按「名称 + 版本」启动已保存的版本；只在填写表单时计算，避免运行中反复序列化定义
    const hasUnsavedChanges = useWorkflowStore(st => phase === 'form' && st.workflowDef !== null && st.hasUnsavedChanges());

    useEffect(() => {
        return () => {
            cancelledRef.current = true;
            if (pollRef.current) clearTimeout(pollRef.current);
        };
    }, []);

    const startPolling = useCallback(async (workflowId: string) => {
        const poll = async () => {
            if (cancelledRef.current) return;
            try {
                const instance = await onPollExecution(workflowId);
                if (cancelledRef.current) return;
                if (!instance) {
                    // null = still pending, no status update yet — keep polling
                    pollRef.current = setTimeout(poll, 2000);
                    return;
                }
                setExecStatus(instance.status);
                if (TERMINAL_STATUSES.has(instance.status)) {
                    if (SUCCESS_STATUSES.has(instance.status)) {
                        setExecOutput(instance.output ?? null);
                        setPhase('done');
                    } else {
                        setErrorMsg(`执行结束，状态：${instance.status}`);
                        setPhase('error');
                    }
                } else {
                    pollRef.current = setTimeout(poll, 2000);
                }
            } catch (e: any) {
                if (!cancelledRef.current) {
                    setErrorMsg(e?.message ?? '轮询执行状态失败');
                    setPhase('error');
                }
            }
        };
        poll();
    }, [onPollExecution]);

    const handleRun = useCallback(async () => {
        // Send numbers / booleans / JSON as their declared types, not as strings
        const { input, errors } = coerceRunInputs(inputParams, paramValues);
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;
        setPhase('running');
        setExecStatus('');
        try {
            const { workflowId } = await onTriggerExecution(workflowDef.name, workflowDef.version ?? 1, input);
            if (cancelledRef.current) return;
            setExecutionId(workflowId);
            await startPolling(workflowId);
        } catch (e: any) {
            if (!cancelledRef.current) {
                setErrorMsg(e?.message ?? '启动执行失败');
                setPhase('error');
            }
        }
    }, [workflowDef.name, workflowDef.version, paramValues, inputParams, onTriggerExecution, startPolling]);

    const CloseBtn = () => (
        <button
            onClick={onClose}
            aria-label="关闭执行卡片"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, padding: 0, display: 'inline-flex' }}
        >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
    );

    if (phase === 'form') {
        return (
            <div style={CARD}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}><Play size={16} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -3, marginRight: 6 }} />运行工作流</div>
                    <CloseBtn />
                </div>
                <div style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: 12 }}>
                    工作流：<strong style={{ color: 'var(--text-primary)' }}>{workflowDef.name}</strong>
                </div>
                {hasUnsavedChanges && (
                    <div style={{ marginBottom: 'var(--cm-space-3)' }}>
                        <UnsavedRunNotice workflowName={workflowDef.name} version={workflowDef.version} />
                    </div>
                )}

                {inputParams.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '6px 0', marginBottom: 12 }}>
                        无需填写输入参数
                    </div>
                ) : (
                    <div style={{ marginBottom: 12 }}>
                        {inputParams.map(p => (
                            <div key={p.name} style={{ marginBottom: 10 }}>
                                <label style={{ display: 'block', fontWeight: 500, fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
                                    {p.name}
                                    {p.required !== false && <span style={{ color: 'var(--cm-status-failed)', marginLeft: 2 }}>*</span>}
                                    {p.description && (
                                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                                            {p.description}
                                        </span>
                                    )}
                                </label>
                                <input
                                    type="text"
                                    value={paramValues[p.name] ?? ''}
                                    onChange={e => {
                                        setParamValues(v => ({ ...v, [p.name]: e.target.value }));
                                        if (fieldErrors[p.name]) setFieldErrors(fe => { const next = { ...fe }; delete next[p.name]; return next; });
                                    }}
                                    aria-invalid={!!fieldErrors[p.name]}
                                    placeholder={p.defaultValue != null
                                        ? (typeof p.defaultValue === 'object' ? JSON.stringify(p.defaultValue) : String(p.defaultValue))
                                        : p.type === 'object' ? '{"key": "value"}' : p.type === 'array' ? '["a", "b"]' : p.type === 'boolean' ? 'true / false' : `输入 ${p.name}…`}
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                        border: `1px solid ${fieldErrors[p.name] ? 'var(--cm-status-failed)' : 'var(--border-primary)'}`,
                                        background: 'var(--bg-primary)',
                                        color: 'var(--text-primary)',
                                        fontSize: 12,
                                        outline: 'none',
                                        fontFamily: p.type === 'object' || p.type === 'array' ? 'var(--cm-font-mono)' : undefined,
                                    }}
                                />
                                {fieldErrors[p.name] && (
                                    <div role="alert" style={{ marginTop: 4, fontSize: 11, color: 'var(--cm-status-failed)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <CircleX size={12} strokeWidth={1.75} aria-hidden="true" />{fieldErrors[p.name]}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{ ...BTN_BASE, border: '1px solid var(--border-primary)', background: 'none', color: 'var(--text-secondary)' }}
                    >
                        取消
                    </button>
                    <button
                        onClick={handleRun}
                        style={{ ...BTN_BASE, border: 'none', background: 'var(--color-accent)', color: 'var(--color-on-accent)', fontWeight: 600 }}
                    >
                        运行
                    </button>
                </div>
            </div>
        );
    }

    if (phase === 'running') {
        return (
            <div style={CARD}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: 'var(--cm-status-running)' }}><Play size={16} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -3, marginRight: 6 }} />运行中</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>
                    工作流：<strong>{workflowDef.name}</strong>
                </div>
                {executionId && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 8, fontFamily: 'monospace' }}>
                        ID: {executionId}
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
                    <span className="ai-tool-spinner" />
                    {execStatus ? `状态：${execStatus}` : '等待执行结果…'}
                </div>
            </div>
        );
    }

    if (phase === 'done') {
        return (
            <div style={{ ...CARD, borderColor: 'color-mix(in srgb, var(--cm-status-success) 40%, transparent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--cm-status-success)' }}><CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -3, marginRight: 6 }} />执行完成</div>
                    <CloseBtn />
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: execOutput ? 10 : 0 }}>
                    工作流：<strong>{workflowDef.name}</strong>
                    {executionId && (
                        <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', marginLeft: 8, fontSize: 11 }}>
                            {executionId}
                        </span>
                    )}
                </div>
                {execOutput && (
                    <pre style={{
                        background: 'var(--bg-primary)',
                        borderRadius: 6,
                        padding: '8px',
                        fontSize: 11,
                        overflow: 'auto',
                        maxHeight: 160,
                        margin: 0,
                        color: 'var(--text-secondary)',
                    }}>
                        {JSON.stringify(execOutput, null, 2)}
                    </pre>
                )}
            </div>
        );
    }

    return (
        <div style={{ ...CARD, borderColor: 'color-mix(in srgb, var(--cm-status-failed) 40%, transparent)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--cm-status-failed)' }}><CircleX size={16} strokeWidth={1.75} aria-hidden="true" style={{ verticalAlign: -3, marginRight: 6 }} />执行失败</div>
                <CloseBtn />
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{errorMsg}</div>
        </div>
    );
};

export default WorkflowRunCard;
