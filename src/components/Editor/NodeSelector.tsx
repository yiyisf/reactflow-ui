import { TaskType } from '../../types/conductor';

interface NodeSelectorProps {
    onSelect: (type: TaskType) => void;
    onCancel: () => void;
    theme?: 'dark' | 'light';
}

const taskTypes: { type: TaskType; label: string; icon: string; color: string }[] = [
    { type: 'SIMPLE', label: 'Simple Task', icon: '📝', color: '#3b82f6' },
    { type: 'HTTP', label: 'HTTP Task', icon: '🌐', color: '#8b5cf6' },
    { type: 'DECISION', label: 'Decision/Switch', icon: '🔀', color: '#f59e0b' },
    { type: 'FORK_JOIN', label: 'Fork/Join', icon: '🔱', color: '#10b981' },
    { type: 'FORK_JOIN_DYNAMIC', label: 'Dynamic Fork', icon: 'λ', color: '#10b981' },
    { type: 'DO_WHILE', label: 'Do-While Loop', icon: '🔄', color: '#f59e0b' },
    { type: 'SUB_WORKFLOW', label: 'Sub Workflow', icon: '🔗', color: '#6366f1' },
];

const NodeSelector = ({ onSelect, onCancel, theme = 'dark' }: NodeSelectorProps) => {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(4px)',
            animation: 'fadeIn 0.2s ease-out'
        }} onClick={onCancel}>
            <div
                style={{
                    backgroundColor: theme === 'light' ? '#fff' : '#1e293b',
                    borderRadius: '16px',
                    padding: '24px',
                    width: '400px',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
                    border: `1px solid ${theme === 'light' ? '#e2e8f0' : '#334155'}`,
                }}
                onClick={e => e.stopPropagation()}
            >
                <h3 style={{
                    marginTop: 0,
                    marginBottom: '20px',
                    color: theme === 'light' ? '#1e293b' : '#fff',
                    textAlign: 'center'
                }}>
                    选择任务类型
                </h3>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px'
                }}>
                    {taskTypes.map(task => (
                        <button
                            key={task.type}
                            onClick={() => onSelect(task.type)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '16px',
                                backgroundColor: theme === 'light' ? '#f8fafc' : '#334155',
                                border: `2px solid transparent`,
                                borderRadius: '12px',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.2s',
                                color: theme === 'light' ? '#1e293b' : '#fff'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = task.color;
                                e.currentTarget.style.backgroundColor = theme === 'light' ? '#f1f5f9' : '#3f4e63';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'transparent';
                                e.currentTarget.style.backgroundColor = theme === 'light' ? '#f8fafc' : '#334155';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            <span style={{ fontSize: '24px' }}>{task.icon}</span>
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{task.label}</div>
                                <div style={{ fontSize: '10px', opacity: 0.6 }}>{task.type}</div>
                            </div>
                        </button>
                    ))}
                </div>

                <button
                    onClick={onCancel}
                    style={{
                        marginTop: '24px',
                        width: '100%',
                        padding: '12px',
                        backgroundColor: 'transparent',
                        border: `1px solid ${theme === 'light' ? '#e2e8f0' : '#475569'}`,
                        borderRadius: '8px',
                        color: theme === 'light' ? '#64748b' : '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }}
                >
                    取消
                </button>
            </div>

            <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popIn {
          from { transform: scale(0); }
          to { transform: scale(1); }
        }
      `}</style>
        </div>
    );
};

export default NodeSelector;
