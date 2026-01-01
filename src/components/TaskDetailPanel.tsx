import { memo, useState, useEffect } from 'react';
import useWorkflowStore from '../store/workflowStore';
import { TaskDef } from '../types/conductor';

interface TaskDetailPanelProps {
    task: TaskDef | null;
    onClose: () => void;
    theme?: 'dark' | 'light';
}

/**
 * 任务配置面板组件 - 抽屉式，支持编辑模式
 */
const TaskDetailPanel = ({ task, onClose, theme = 'dark' }: TaskDetailPanelProps) => {
    const { mode, updateTask, checkTaskRefUniqueness } = useWorkflowStore();
    const [localTask, setLocalTask] = useState<TaskDef | null>(task);

    // 当选中的任务改变时，同步本地状态
    useEffect(() => {
        setLocalTask(task);
    }, [task]);

    if (!task) return null;

    // 确定当前展示的任务状态
    const displayTask = (localTask && localTask.taskReferenceName === task.taskReferenceName) ? localTask : task;

    const isEditMode = mode === 'edit';

    const bgColor = theme === 'light'
        ? 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
        : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
    const textColor = theme === 'light' ? '#0f172a' : '#fff';
    const borderColor = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)';
    const inputBg = theme === 'light' ? '#fff' : 'rgba(0,0,0,0.3)';
    const secondaryTextColor = theme === 'light' ? '#64748b' : '#94a3b8';

    // 处理字段变更
    const handleChange = (field: string, value: any) => {
        const updatedTask = { ...displayTask, [field]: value } as TaskDef;
        setLocalTask(updatedTask);
        updateTask(task.taskReferenceName, { [field]: value });
    };

    // 处理嵌套字段变更（如 httpRequest.url）
    const handleNestedChange = (parentField: string, field: string, value: any) => {
        const parentValue = (displayTask as any)[parentField] || {};
        const updatedParent = { ...parentValue, [field]: value };
        const updatedTask = { ...displayTask, [parentField]: updatedParent } as TaskDef;
        setLocalTask(updatedTask);
        updateTask(task.taskReferenceName, { [parentField]: updatedParent });
    };

    // 专门处理 HTTP 任务的参数变更，确保同步到 inputParameters
    const handleHttpChange = (field: string, value: any) => {
        const currentInputs = displayTask.inputParameters || {};
        const currentHttp = currentInputs.http_request || displayTask.httpRequest || {};

        const updatedHttp = { ...currentHttp, [field]: value };
        const updatedInputs = { ...currentInputs, http_request: updatedHttp };

        const updates: any = { inputParameters: updatedInputs };
        if (displayTask.httpRequest) {
            updates.httpRequest = updatedHttp;
        }

        const updatedTask = { ...displayTask, ...updates } as TaskDef;
        setLocalTask(updatedTask);
        updateTask(task.taskReferenceName, updates);
    };

    // 专门处理 inputParameters 内部的参数变更
    const handleInputParamChange = (key: string, value: any) => {
        const updatedInputs = { ...displayTask.inputParameters, [key]: value };
        const updates = { inputParameters: updatedInputs };

        const updatedTask = { ...displayTask, ...updates } as TaskDef;
        setLocalTask(updatedTask);
        updateTask(task.taskReferenceName, updates);
    };

    // 渲染专项配置区域容器
    const renderSpecialSection = (title: string, icon: string, color: string, children: React.ReactNode) => (
        <div style={{
            marginBottom: '24px',
            padding: '16px',
            borderRadius: '12px',
            background: `${color}10`,
            border: `1px solid ${color}30`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
        }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '16px', color: color, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{icon}</span> {title}
            </div>
            {children}
        </div>
    );

    // 渲染通用文本输入框
    const renderInput = (label: string, field: string, type: 'text' | 'number' = 'text') => {
        const isRefName = field === 'taskReferenceName';
        const isDuplicate = isRefName && !checkTaskRefUniqueness((displayTask as any)[field], task.taskReferenceName);

        return (
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: secondaryTextColor, marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                    {label}
                    {isRefName && isDuplicate && <span style={{ color: '#ef4444', marginLeft: '8px', textTransform: 'none' }}>⚠️ 已存在相同引用名</span>}
                </label>
                <input
                    type={type}
                    value={(displayTask as any)[field] || ''}
                    onChange={(e) => handleChange(field, e.target.value)}
                    disabled={!isEditMode || (isRefName && !isEditMode)}
                    style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${isDuplicate ? '#ef4444' : borderColor}`,
                        background: inputBg,
                        color: textColor,
                        fontSize: '13px',
                        outline: 'none',
                        opacity: isEditMode ? 1 : 0.8,
                        fontFamily: isRefName ? 'monospace' : 'inherit'
                    }}
                />
            </div>
        );
    };

    // 渲染多行文本/JSON 编辑器
    const renderTextArea = (label: string, field: string, isJson = false) => {
        const value = typeof (displayTask as any)[field] === 'object' ? JSON.stringify((displayTask as any)[field], null, 2) : (displayTask as any)[field];

        return (
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: secondaryTextColor, marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
                    {label} {isJson && <span style={{ opacity: 0.5, fontWeight: 'normal' }}>(JSON)</span>}
                </label>
                <textarea
                    value={value || ''}
                    onChange={(e) => {
                        let finalValue = e.target.value;
                        if (isJson) {
                            try {
                                finalValue = JSON.parse(e.target.value);
                            } catch (err) {
                                setLocalTask(prev => ({ ...prev!, [field]: e.target.value }) as any);
                                return;
                            }
                        }
                        handleChange(field, finalValue);
                    }}
                    disabled={!isEditMode}
                    rows={field === 'description' ? 3 : 5}
                    style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${borderColor}`,
                        background: inputBg,
                        color: textColor,
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        outline: 'none',
                        resize: 'vertical'
                    }}
                />
            </div>
        );
    };

    return (
        <div style={{
            position: 'fixed',
            right: 0,
            top: 0,
            width: '450px',
            height: '100vh',
            background: bgColor,
            borderLeft: `1px solid ${borderColor}`,
            color: textColor,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-10px 0 30px rgba(0,0,0,0.2)',
            zIndex: 1000,
            animation: 'slideInFromRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
            <style>{`
                @keyframes slideInFromRight {
                  from { transform: translateX(100%); opacity: 0; }
                  to { transform: translateX(0); opacity: 1; }
                }
            `}</style>

            {/* Header */}
            <div style={{
                padding: '24px',
                borderBottom: `1px solid ${borderColor}`,
                background: 'rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{
                        background: '#3b82f6',
                        color: '#fff',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        letterSpacing: '1px'
                    }}>
                        {displayTask.type || 'TASK'}
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: textColor, cursor: 'pointer', fontSize: '20px' }}>✕</button>
                </div>

                {isEditMode ? (
                    <input
                        value={displayTask.name || ''}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="任务名称"
                        style={{
                            display: 'block',
                            width: '100%',
                            fontSize: '22px',
                            fontWeight: 'bold',
                            background: 'transparent',
                            border: 'none',
                            color: textColor,
                            outline: 'none',
                            borderBottom: '2px dashed #3b82f6'
                        }}
                    />
                ) : (
                    <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{displayTask.name}</div>
                )}

                <div style={{ fontSize: '12px', color: secondaryTextColor, marginTop: '8px', fontFamily: 'monospace', opacity: 0.8 }}>
                    REF: {displayTask.taskReferenceName}
                </div>
            </div>

            {/* Scrollable Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

                {/* 1. HTTP 任务专项 UI */}
                {displayTask.type === 'HTTP' && renderSpecialSection('HTTP 请求配置', '🌐', '#3b82f6', (
                    <>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                            <select
                                value={displayTask.inputParameters?.http_request?.method || displayTask.httpRequest?.method || 'GET'}
                                onChange={(e) => handleHttpChange('method', e.target.value)}
                                disabled={!isEditMode}
                                style={{ width: '90px', padding: '10px', borderRadius: '8px', background: inputBg, color: textColor, border: `1px solid ${borderColor}`, cursor: 'pointer' }}
                            >
                                {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <input
                                placeholder="URL (支持 ${workflow.input.url})"
                                value={displayTask.inputParameters?.http_request?.url || displayTask.httpRequest?.url || ''}
                                onChange={(e) => handleHttpChange('url', e.target.value)}
                                disabled={!isEditMode}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', background: inputBg, color: textColor, border: `1px solid ${borderColor}` }}
                            />
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>HEADERS (JSON)</label>
                            <textarea
                                value={typeof (displayTask.inputParameters?.http_request?.headers || displayTask.httpRequest?.headers) === 'object'
                                    ? JSON.stringify(displayTask.inputParameters?.http_request?.headers || displayTask.httpRequest?.headers, null, 2)
                                    : '{}'}
                                onChange={(e) => { try { handleHttpChange('headers', JSON.parse(e.target.value)); } catch (err) { } }}
                                disabled={!isEditMode}
                                rows={3}
                                style={{ width: '100%', padding: '8px', borderRadius: '8px', background: inputBg, color: textColor, border: `1px solid ${borderColor}`, fontSize: '11px', fontFamily: 'monospace' }}
                            />
                        </div>
                        <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>BODY (RAW/JSON)</label>
                        <textarea
                            value={typeof (displayTask.inputParameters?.http_request?.body || displayTask.httpRequest?.body) === 'object'
                                ? JSON.stringify(displayTask.inputParameters?.http_request?.body || displayTask.httpRequest?.body, null, 2)
                                : (displayTask.inputParameters?.http_request?.body || displayTask.httpRequest?.body || '')}
                            onChange={(e) => {
                                let val = e.target.value;
                                try { val = JSON.parse(e.target.value); } catch (err) { }
                                handleHttpChange('body', val);
                            }}
                            disabled={!isEditMode}
                            rows={4}
                            style={{ width: '100%', padding: '8px', borderRadius: '8px', background: inputBg, color: textColor, border: `1px solid ${borderColor}`, fontSize: '11px', fontFamily: 'monospace' }}
                        />
                    </>
                ))}

                {/* 2. LAMBDA 任务专项 UI */}
                {displayTask.type === 'LAMBDA' && renderSpecialSection('Lambda 脚本配置', '📜', '#10b981', (
                    <>
                        <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>SCRIPT EXPRESSION (JS)</label>
                        <textarea
                            value={displayTask.inputParameters?.scriptExpression || ''}
                            onChange={(e) => handleInputParamChange('scriptExpression', e.target.value)}
                            disabled={!isEditMode}
                            rows={10}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#000', color: '#10b981', border: '1px solid #10b98150', fontSize: '12px', fontFamily: 'monospace', lineHeight: '1.5' }}
                        />
                        <div style={{ marginTop: '8px', fontSize: '10px', color: secondaryTextColor, fontStyle: 'italic' }}>
                            提示: 使用 `$.input.key` 访问参数，返回值为节点输出。
                        </div>
                    </>
                ))}

                {/* 3. JQ_TRANSFORM 专项 UI */}
                {displayTask.type === 'JSON_JQ_TRANSFORM' && renderSpecialSection('JQ 数据转换', '🔍', '#a78bfa', (
                    <>
                        <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>JQ QUERY</label>
                        <textarea
                            value={displayTask.inputParameters?.queryExpression || ''}
                            onChange={(e) => handleInputParamChange('queryExpression', e.target.value)}
                            disabled={!isEditMode}
                            rows={6}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: inputBg, color: '#a78bfa', border: `1px solid ${borderColor}`, fontSize: '12px', fontFamily: 'monospace', lineHeight: '1.5' }}
                        />
                    </>
                ))}

                {/* 4. SUB_WORKFLOW 专项 UI */}
                {displayTask.type === 'SUB_WORKFLOW' && renderSpecialSection('子工作流配置', '🏗️', '#6366f1', (
                    <>
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>WORKFLOW NAME</label>
                            <input
                                value={displayTask.subWorkflowParam?.name || ''}
                                onChange={(e) => handleNestedChange('subWorkflowParam', 'name', e.target.value)}
                                disabled={!isEditMode}
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', background: inputBg, color: textColor, border: `1px solid ${borderColor}` }}
                            />
                        </div>
                        <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>VERSION</label>
                        <input
                            type="number"
                            value={displayTask.subWorkflowParam?.version || 1}
                            onChange={(e) => handleNestedChange('subWorkflowParam', 'version', parseInt(e.target.value))}
                            disabled={!isEditMode}
                            style={{ width: '100px', padding: '10px', borderRadius: '8px', background: inputBg, color: textColor, border: `1px solid ${borderColor}` }}
                        />
                    </>
                ))}

                {/* 5. TERMINATE 专项 UI */}
                {displayTask.type === 'TERMINATE' && renderSpecialSection('终止状态配置', '⏹️', '#ef4444', (
                    <>
                        <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>TERMINATION STATUS</label>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            {['COMPLETED', 'FAILED'].map(s => (
                                <button
                                    key={s}
                                    onClick={() => handleInputParamChange('terminationStatus', s)}
                                    disabled={!isEditMode}
                                    style={{
                                        flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer',
                                        background: (displayTask.inputParameters?.terminationStatus || 'COMPLETED') === s ? '#ef4444' : inputBg,
                                        color: (displayTask.inputParameters?.terminationStatus || 'COMPLETED') === s ? '#fff' : textColor,
                                        border: `1px solid ${borderColor}`,
                                        fontWeight: 'bold', fontSize: '11px'
                                    }}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                        <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>TERMINATION REASON</label>
                        <input
                            placeholder="终止原因..."
                            value={displayTask.inputParameters?.terminationReason || ''}
                            onChange={(e) => handleInputParamChange('terminationReason', e.target.value)}
                            disabled={!isEditMode}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', background: inputBg, color: textColor, border: `1px solid ${borderColor}` }}
                        />
                    </>
                ))}

                {/* 6. EVENT 专项 UI */}
                {displayTask.type === 'EVENT' && renderSpecialSection('事件发送配置', '✉️', '#ec4899', (
                    <>
                        <label style={{ display: 'block', fontSize: '10px', color: secondaryTextColor, marginBottom: '4px' }}>EVENT SINK (地址/队列名)</label>
                        <input
                            placeholder="e.g. sqs:queue_name or conductor"
                            value={displayTask.sink || ''}
                            onChange={(e) => handleChange('sink', e.target.value)}
                            disabled={!isEditMode}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', background: inputBg, color: textColor, border: `1px solid ${borderColor}` }}
                        />
                    </>
                ))}

                {/* 7. WAIT 专项 UI */}
                {displayTask.type === 'WAIT' && renderSpecialSection('等待状态配置', '⏳', '#06b6d4', (
                    <div style={{ fontSize: '12px', color: secondaryTextColor, lineHeight: '1.6' }}>
                        此任务将使工作流进入 <b>IN_PROGRESS</b> 状态，直到外部信号触发更新或达到超时时间。
                        <br /><br />
                        您可以在下方设置超时限制。
                    </div>
                ))}

                {/* 8. Decision & Loop 专项 UI */}
                {(displayTask.type === 'DECISION' || displayTask.type === 'SWITCH') && renderSpecialSection('决策条件配置', '⚖️', '#f59e0b', (
                    <>
                        {renderInput('判断参数名', 'caseValueParam')}
                        {renderTextArea('JS 表达式', 'caseExpression')}
                    </>
                ))}

                {displayTask.type === 'DO_WHILE' && renderSpecialSection('循环逻辑配置', '🔄', '#d97706', (
                    <>
                        {renderTextArea('循环结束条件 (JS)', 'loopCondition')}
                    </>
                ))}

                {/* --- 通用配置区 --- */}
                <div style={{ marginTop: '32px', borderTop: `1px solid ${borderColor}`, paddingTop: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '16px', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '1px' }}>通用参数与属性</div>

                    {renderInput('任务唯一引用名 (Reference Name)', 'taskReferenceName')}
                    {renderInput('任务描述', 'description')}

                    {renderTextArea('输入参数 (inputParameters)', 'inputParameters', true)}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                        {renderInput('重试次数', 'retryCount', 'number')}
                        {renderInput('超时限制 (秒)', 'timeoutSeconds', 'number')}
                    </div>
                </div>

                {/* 只读完整定义 */}
                <div style={{ marginTop: '48px', opacity: 0.6 }}>
                    <details>
                        <summary style={{ fontSize: '11px', cursor: 'pointer', marginBottom: '8px' }}>查看完整 JSON (只读)</summary>
                        <pre style={{
                            background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px', fontSize: '10px', overflow: 'auto',
                            border: `1px solid ${borderColor}`, color: secondaryTextColor
                        }}>
                            {JSON.stringify(displayTask, null, 2)}
                        </pre>
                    </details>
                </div>
            </div>

            {/* Footer */}
            {isEditMode && (
                <div style={{ padding: '24px', borderTop: `1px solid ${borderColor}`, background: 'rgba(0,0,0,0.1)', display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1, fontSize: '11px', color: secondaryTextColor, display: 'flex', alignItems: 'center' }}>
                        ✅ 所有修改已实时同步
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px',
                            fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                        }}
                    >
                        完成退出
                    </button>
                </div>
            )}
        </div>
    );
};

export default memo(TaskDetailPanel);
