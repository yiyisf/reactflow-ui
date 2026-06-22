import useWorkflowStore from '../store/workflowStore';
import { TaskDef } from '../types/conductor';

interface HealthCheckPanelProps {
    isOpen: boolean;
    onClose: () => void;
    theme?: 'dark' | 'light';
    onTaskSelect?: (task: TaskDef) => void;
}

/**
 * 工作流健康检查面板 - 展示错误和警告列表
 */
const HealthCheckPanel = ({ isOpen, onClose, theme = 'dark', onTaskSelect }: HealthCheckPanelProps) => {
    const { validationResults, setSelectedTask, taskMap } = useWorkflowStore();
    const { errors, warnings } = validationResults || { isValid: true, errors: [], warnings: [] };

    const handleTaskClick = (ref: string) => {
        if (ref && ref !== 'UNKNOWN') {
            const task = taskMap[ref];
            if (task) {
                if (onTaskSelect) {
                    onTaskSelect(task);
                } else {
                    setSelectedTask(task);
                }
                // Dispatch focus event so canvas fitView centers the node
                window.dispatchEvent(new CustomEvent('workflow-select-task', { detail: { ref } }));
            }
        }
    };

    const bgColor = 'var(--glass-surface)';
    const textColor = 'var(--text-primary)';
    const borderColor = 'var(--glass-border)';
    const secondaryTextColor = 'var(--text-secondary)';

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'absolute',
            top: '80px',
            right: '24px',
            width: '320px',
            maxHeight: '500px',
            backgroundColor: bgColor,
            border: `1px solid ${borderColor}`,
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            zIndex: 1100,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeInSlide 0.2s ease-out'
        }}>
            <style>{`
                @keyframes fadeInSlide {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .health-item:hover {
                    background-color: ${theme === 'light' ? '#f1f5f9' : 'rgba(255,255,255,0.05)'};
                }
            `}</style>

            <div style={{
                padding: '16px',
                borderBottom: `1px solid ${borderColor}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'rgba(0,0,0,0.02)'
            }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🩺</span> 工作流体检报告
                </div>
                <button
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', color: secondaryTextColor, cursor: 'pointer', fontSize: '18px' }}
                >
                    ✕
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {errors.length === 0 && warnings.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: '#10b981' }}>
                        <div style={{ fontSize: '32px', marginBottom: '12px' }}>✅</div>
                        <div style={{ fontWeight: 'bold' }}>未发现问题</div>
                        <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '4px' }}>工作流逻辑看起来很完美</div>
                    </div>
                ) : (
                    <>
                        {errors.map((err, idx) => (
                            <div
                                key={`err-${idx}`}
                                className="health-item"
                                role="button"
                                tabIndex={err.ref ? 0 : undefined}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTaskClick(err.ref); }}
                                onClick={() => handleTaskClick(err.ref)}
                                style={{
                                    padding: '12px',
                                    borderRadius: '8px',
                                    marginBottom: '4px',
                                    cursor: err.ref ? 'pointer' : 'default',
                                    borderLeft: '4px solid #ef4444',
                                    transition: 'background 0.2s'
                                }}
                            >
                                <div style={{ fontSize: '12px', color: '#ef4444', fontWeight: 'bold', marginBottom: '2px' }}>
                                    ERROR {err.ref !== 'UNKNOWN' && `[${err.ref}]`}
                                </div>
                                <div style={{ fontSize: '13px', color: textColor }}>{err.message}</div>
                            </div>
                        ))}

                        {warnings.map((warn, idx) => (
                            <div
                                key={`warn-${idx}`}
                                className="health-item"
                                role="button"
                                tabIndex={warn.ref ? 0 : undefined}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTaskClick(warn.ref); }}
                                onClick={() => handleTaskClick(warn.ref)}
                                style={{
                                    padding: '12px',
                                    borderRadius: '8px',
                                    marginBottom: '4px',
                                    cursor: warn.ref ? 'pointer' : 'default',
                                    borderLeft: '4px solid #f59e0b',
                                    transition: 'background 0.2s'
                                }}
                            >
                                <div style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 'bold', marginBottom: '2px' }}>
                                    WARNING {warn.ref !== 'UNKNOWN' && `[${warn.ref}]`}
                                </div>
                                <div style={{ fontSize: '13px', color: textColor }}>{warn.message}</div>
                            </div>
                        ))}
                    </>
                )}
            </div>

            <div style={{
                padding: '12px 16px',
                fontSize: '11px',
                color: secondaryTextColor,
                borderTop: `1px solid ${borderColor}`,
                backgroundColor: 'rgba(0,0,0,0.02)',
                display: 'flex',
                justifyContent: 'space-between'
            }}>
                <span>共 {errors.length} 个错误, {warnings.length} 个警告</span>
                {errors.length > 0 && <span style={{ color: '#ef4444' }}>无法保存/导出</span>}
            </div>
        </div>
    );
};

export default HealthCheckPanel;
