import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseWorkflowInputParams } from '../../types/conductor';
import type { WorkflowDef } from '../../types/conductor';

interface WorkflowRunCardProps {
    workflowDef: WorkflowDef;
    onTriggerExecution: (workflowName: string, params: Record<string, any>) => Promise<string>;
    onPollExecution: (executionId: string) => Promise<{ status: string; output?: any }>;
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
    const inputParams = parseWorkflowInputParams(workflowDef.inputParameters as any);
    const [phase, setPhase] = useState<Phase>('form');
    const [paramValues, setParamValues] = useState<Record<string, string>>(() =>
        Object.fromEntries(inputParams.map(p => [p.name, '']))
    );
    const [executionId, setExecutionId] = useState<string | null>(null);
    const [execStatus, setExecStatus] = useState<string>('');
    const [execOutput, setExecOutput] = useState<any>(null);
    const [errorMsg, setErrorMsg] = useState<string>('');
    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelledRef = useRef(false);

    useEffect(() => {
        return () => {
            cancelledRef.current = true;
            if (pollRef.current) clearTimeout(pollRef.current);
        };
    }, []);

    const startPolling = useCallback(async (execId: string) => {
        const poll = async () => {
            if (cancelledRef.current) return;
            try {
                const result = await onPollExecution(execId);
                if (cancelledRef.current) return;
                setExecStatus(result.status);
                if (TERMINAL_STATUSES.has(result.status)) {
                    if (SUCCESS_STATUSES.has(result.status)) {
                        setExecOutput(result.output ?? null);
                        setPhase('done');
                    } else {
                        setErrorMsg(`执行结束，状态：${result.status}`);
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
        setPhase('running');
        setExecStatus('');
        try {
            const execId = await onTriggerExecution(workflowDef.name, paramValues);
            if (cancelledRef.current) return;
            setExecutionId(execId);
            await startPolling(execId);
        } catch (e: any) {
            if (!cancelledRef.current) {
                setErrorMsg(e?.message ?? '启动执行失败');
                setPhase('error');
            }
        }
    }, [workflowDef.name, paramValues, onTriggerExecution, startPolling]);

    const CloseBtn = () => (
        <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: 0 }}
        >
            ×
        </button>
    );

    if (phase === 'form') {
        return (
            <div style={CARD}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>▶ 执行工作流</div>
                    <CloseBtn />
                </div>
                <div style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: 12 }}>
                    工作流：<strong style={{ color: 'var(--text-primary)' }}>{workflowDef.name}</strong>
                </div>

                {inputParams.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '6px 0', marginBottom: 12 }}>
                        📝 无需填写输入参数
                    </div>
                ) : (
                    <div style={{ marginBottom: 12 }}>
                        {inputParams.map(p => (
                            <div key={p.name} style={{ marginBottom: 10 }}>
                                <label style={{ display: 'block', fontWeight: 500, fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
                                    {p.name}
                                    {p.required !== false && <span style={{ color: '#f87171', marginLeft: 2 }}>*</span>}
                                    {p.description && (
                                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                                            {p.description}
                                        </span>
                                    )}
                                </label>
                                <input
                                    type="text"
                                    value={paramValues[p.name] ?? ''}
                                    onChange={e => setParamValues(v => ({ ...v, [p.name]: e.target.value }))}
                                    placeholder={p.defaultValue != null ? String(p.defaultValue) : `输入 ${p.name}…`}
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                        border: '1px solid var(--border-primary)',
                                        background: 'var(--bg-primary)',
                                        color: 'var(--text-primary)',
                                        fontSize: 12,
                                        outline: 'none',
                                    }}
                                />
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
                        style={{ ...BTN_BASE, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600 }}
                    >
                        确认执行
                    </button>
                </div>
            </div>
        );
    }

    if (phase === 'running') {
        return (
            <div style={CARD}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>▶ 执行中…</div>
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
            <div style={{ ...CARD, borderColor: 'rgba(34,197,94,0.4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#4ade80' }}>✅ 执行完成</div>
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
        <div style={{ ...CARD, borderColor: 'rgba(239,68,68,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#f87171' }}>❌ 执行失败</div>
                <CloseBtn />
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{errorMsg}</div>
        </div>
    );
};

export default WorkflowRunCard;
