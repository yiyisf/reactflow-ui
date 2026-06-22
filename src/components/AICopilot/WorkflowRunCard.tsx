import React, { useState, useCallback, useEffect, useRef } from 'react';
import useWorkflowStore from '../../store/workflowStore';
import { parseWorkflowInputParams, WorkflowInputParam, WorkflowInstance } from '../../types/conductor';

interface WorkflowRunCardProps {
    onTriggerExecution?: (
        workflowName: string,
        version: number,
        input: Record<string, any>
    ) => Promise<{ workflowId: string }>;
    onPollExecution?: (workflowId: string) => Promise<WorkflowInstance | null>;
    executionPollInterval?: number;
}

type CardPhase = 'form' | 'running' | 'done' | 'error';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'TIMED_OUT', 'TERMINATED']);

const STATUS_LABEL: Record<string, string> = {
    COMPLETED: '已完成',
    FAILED: '执行失败',
    TIMED_OUT: '执行超时',
    TERMINATED: '已终止',
    RUNNING: '执行中',
    PAUSED: '已暂停',
};

const WorkflowRunCard: React.FC<WorkflowRunCardProps> = ({
    onTriggerExecution,
    onPollExecution,
    executionPollInterval = 3000,
}) => {
    const { workflowDef, setRunState, importExecutionJSON } = useWorkflowStore();
    const params: WorkflowInputParam[] = parseWorkflowInputParams(workflowDef?.inputParameters);
    const hasParams = params.length > 0;

    const [phase, setPhase] = useState<CardPhase>('form');
    const [formValues, setFormValues] = useState<Record<string, string>>({});
    const [submitError, setSubmitError] = useState('');
    const [workflowId, setWorkflowId] = useState<string | null>(null);
    const [execStatus, setExecStatus] = useState<string>('RUNNING');
    const [elapsedSec, setElapsedSec] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startTimeRef = useRef<number>(0);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        };
    }, []);

    const buildInputObject = useCallback((): Record<string, any> => {
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
    }, [formValues, params]);

    const handleExecute = useCallback(async () => {
        if (!workflowDef) return;

        const inputObj = buildInputObject();

        const missing = params.filter(p => p.required && (inputObj[p.name] === undefined || inputObj[p.name] === ''));
        if (missing.length > 0) {
            setSubmitError(`必填参数未填写：${missing.map(p => p.name).join(', ')}`);
            return;
        }

        setSubmitError('');
        setPhase('running');
        setExecStatus('RUNNING');
        startTimeRef.current = Date.now();
        setElapsedSec(0);
        timerRef.current = setInterval(() => {
            setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);

        if (!onTriggerExecution) {
            setTimeout(() => {
                if (timerRef.current) clearInterval(timerRef.current);
                setExecStatus('COMPLETED');
                setPhase('done');
            }, 2000);
            return;
        }

        try {
            setRunState('triggering');
            const { workflowId: wId } = await onTriggerExecution(
                workflowDef.name,
                workflowDef.version ?? 1,
                inputObj
            );
            setWorkflowId(wId);
            setRunState('polling', wId);
            // 注意：刻意不调用 setMode('run')。本卡片渲染于 AIChatPanel 内部，
            // 而 AIChatPanel 仅在 edit 模式渲染；切到 run 模式会卸载本卡片并中断轮询。
            // 进度跟踪由本卡片内联完成，执行数据通过 importExecutionJSON 注入 store。

            if (!onPollExecution) {
                if (timerRef.current) clearInterval(timerRef.current);
                setExecStatus('RUNNING');
                setPhase('running');
                return;
            }

            let interval = executionPollInterval;
            const MAX_INTERVAL = 15000;

            const poll = async () => {
                try {
                    const instance = await onPollExecution(wId);
                    if (instance) {
                        importExecutionJSON(instance);
                        setExecStatus(instance.status ?? 'RUNNING');
                        if (TERMINAL_STATUSES.has(instance.status)) {
                            if (timerRef.current) clearInterval(timerRef.current);
                            setRunState('done', wId);
                            setPhase(instance.status === 'COMPLETED' ? 'done' : 'error');
                            return;
                        }
                    }
                } catch { /* ignore individual errors */ }
                interval = Math.min(interval * 1.5, MAX_INTERVAL);
                pollTimerRef.current = setTimeout(poll, interval);
            };

            pollTimerRef.current = setTimeout(poll, interval);
        } catch (err: any) {
            if (timerRef.current) clearInterval(timerRef.current);
            const msg = err?.message || '执行触发失败';
            setRunState('error', null, msg);
            setSubmitError(msg);
            setPhase('error');
        }
    }, [workflowDef, buildInputObject, params, onTriggerExecution, onPollExecution,
        setRunState, importExecutionJSON, executionPollInterval]);

    if (!workflowDef) return null;

    const cardStyle: React.CSSProperties = {
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-strong)',
        borderRadius: 10,
        overflow: 'hidden',
        marginTop: 8,
        fontSize: 13,
    };

    const headerStyle: React.CSSProperties = {
        padding: '10px 14px',
        background: 'rgba(59, 130, 246, 0.08)',
        borderBottom: '1px solid var(--border-primary)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    };

    // ── Running phase ──────────────────────────────────────────────────────────
    if (phase === 'running') {
        const isTerminal = TERMINAL_STATUSES.has(execStatus);
        const minutes = Math.floor(elapsedSec / 60);
        const secs = elapsedSec % 60;
        const elapsed = minutes > 0 ? `${minutes}分${secs}秒` : `${secs}秒`;

        return (
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <span style={{ fontSize: 15 }}>⚡</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>执行中</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>
                        {workflowDef.name} v{workflowDef.version ?? 1}
                    </span>
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {!isTerminal && (
                            <div style={{
                                width: 16, height: 16, border: '2px solid var(--color-accent)',
                                borderTopColor: 'transparent', borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite', flexShrink: 0,
                            }} />
                        )}
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                            {STATUS_LABEL[execStatus] ?? execStatus}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 'auto' }}>
                            已用时 {elapsed}
                        </span>
                    </div>
                    {workflowId && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            ID: {workflowId}
                        </div>
                    )}
                    <div style={{
                        height: 3, background: 'var(--bg-tertiary)', borderRadius: 2, overflow: 'hidden',
                    }}>
                        {!isTerminal && (
                            <div style={{
                                height: '100%',
                                background: 'var(--color-accent)',
                                width: '40%',
                                animation: 'progress-slide 1.5s ease-in-out infinite',
                            }} />
                        )}
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                        你可以继续对话，执行完成后可在画布中查看结果。
                    </p>
                </div>
            </div>
        );
    }

    // ── Done phase ─────────────────────────────────────────────────────────────
    if (phase === 'done') {
        return (
            <div style={{ ...cardStyle, borderColor: 'rgba(34,197,94,0.3)' }}>
                <div style={{ ...headerStyle, background: 'rgba(34,197,94,0.08)', borderBottomColor: 'rgba(34,197,94,0.2)' }}>
                    <span style={{ fontSize: 15 }}>✅</span>
                    <span style={{ fontWeight: 600, color: '#4ade80' }}>执行完成</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>
                        {workflowDef.name}
                    </span>
                </div>
                <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                    工作流已成功执行完成。
                    {workflowId && (
                        <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                            ID: {workflowId}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Error phase ────────────────────────────────────────────────────────────
    if (phase === 'error') {
        return (
            <div style={{ ...cardStyle, borderColor: 'rgba(239,68,68,0.3)' }}>
                <div style={{ ...headerStyle, background: 'rgba(239,68,68,0.08)', borderBottomColor: 'rgba(239,68,68,0.2)' }}>
                    <span style={{ fontSize: 15 }}>❌</span>
                    <span style={{ fontWeight: 600, color: '#f87171' }}>
                        {STATUS_LABEL[execStatus] ?? '执行失败'}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>
                        {workflowDef.name}
                    </span>
                </div>
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {submitError && (
                        <p style={{ margin: 0, fontSize: 12, color: '#f87171' }}>{submitError}</p>
                    )}
                    {workflowId && (
                        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                            ID: {workflowId}
                        </div>
                    )}
                    <button
                        onClick={() => {
                            setPhase('form');
                            setSubmitError('');
                            setWorkflowId(null);
                            setExecStatus('RUNNING');
                            setElapsedSec(0);
                        }}
                        style={{
                            alignSelf: 'flex-start',
                            padding: '4px 12px',
                            background: 'rgba(239,68,68,0.12)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: 6,
                            color: '#f87171',
                            fontSize: 12,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        重试
                    </button>
                </div>
            </div>
        );
    }

    // ── Form phase ─────────────────────────────────────────────────────────────
    return (
        <div style={cardStyle}>
            <div style={headerStyle}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ color: 'var(--color-accent)', flexShrink: 0 }}>
                    <path d="M4 3l9 5-9 5z" />
                </svg>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>发起执行</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {workflowDef.name} <span style={{ opacity: 0.6 }}>v{workflowDef.version ?? 1}</span>
                </span>
            </div>

            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!hasParams ? (
                    <div style={{
                        padding: '10px 14px',
                        background: 'rgba(59,130,246,0.06)',
                        borderRadius: 6,
                        border: '1px solid rgba(59,130,246,0.15)',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                    }}>
                        无需填写输入参数，点击下方按钮直接发起执行。
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {params.map(param => (
                            <div key={param.name}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {param.name}
                                    </span>
                                    {param.required && (
                                        <span style={{ color: '#f87171', fontSize: 11 }}>*</span>
                                    )}
                                    {param.type && (
                                        <span style={{
                                            fontSize: 10, padding: '1px 5px',
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: 3, color: 'var(--text-muted)',
                                            fontFamily: 'var(--font-mono)',
                                        }}>
                                            {param.type}
                                        </span>
                                    )}
                                </div>
                                {param.description && (
                                    <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--text-secondary)' }}>
                                        {param.description}
                                    </p>
                                )}
                                {param.type === 'boolean' ? (
                                    <select
                                        value={formValues[param.name] ?? ''}
                                        onChange={e => setFormValues(p => ({ ...p, [param.name]: e.target.value }))}
                                        style={inputStyle}
                                    >
                                        <option value="">请选择</option>
                                        <option value="true">true</option>
                                        <option value="false">false</option>
                                    </select>
                                ) : (param.type === 'object' || param.type === 'array') ? (
                                    <textarea
                                        rows={3}
                                        style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                                        placeholder={param.example ? JSON.stringify(param.example, null, 2) : '{}'}
                                        value={formValues[param.name] ?? ''}
                                        onChange={e => setFormValues(p => ({ ...p, [param.name]: e.target.value }))}
                                    />
                                ) : (
                                    <input
                                        type={param.type === 'number' ? 'number' : 'text'}
                                        style={inputStyle}
                                        placeholder={
                                            param.example !== undefined ? String(param.example) :
                                            param.defaultValue !== undefined ? String(param.defaultValue) : ''
                                        }
                                        value={formValues[param.name] ?? ''}
                                        onChange={e => setFormValues(p => ({ ...p, [param.name]: e.target.value }))}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {submitError && (
                    <p style={{ margin: 0, fontSize: 12, color: '#f87171' }}>{submitError}</p>
                )}

                <button
                    onClick={handleExecute}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '8px 16px',
                        background: 'var(--color-accent)',
                        color: 'white', border: 'none', borderRadius: 6,
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'filter 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                    onMouseLeave={e => (e.currentTarget.style.filter = '')}
                >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 3l9 5-9 5z" />
                    </svg>
                    {onTriggerExecution ? '发起执行' : '模拟执行'}
                </button>
            </div>
        </div>
    );
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-strong)',
    borderRadius: 5,
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
};

export default WorkflowRunCard;
