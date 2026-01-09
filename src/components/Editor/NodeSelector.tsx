import { useState } from 'react';
import { TaskType } from '../../types/conductor';
import { TASK_TYPES, TASK_CATEGORIES, TaskCategory } from '../../config/taskTypes';

interface NodeSelectorProps {
    onSelect: (type: TaskType) => void;
    onCancel: () => void;
    theme?: 'dark' | 'light';
}

const NodeSelector = ({ onSelect, onCancel }: NodeSelectorProps) => {
    const [activeCategory, setActiveCategory] = useState<TaskCategory>('CORE');

    // 过滤当前分类的任务
    const currentTasks = TASK_TYPES.filter(task => task.category === activeCategory);

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
                className="glass-panel"
                style={{
                    backgroundColor: 'var(--glass-surface)',
                    borderRadius: '16px',
                    padding: '0',
                    width: '600px',
                    height: '500px',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
                    border: '1px solid var(--glass-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header & Tabs */}
                <div style={{
                    padding: '20px 24px 0',
                    borderBottom: '1px solid var(--border-primary)',
                    backgroundColor: 'var(--bg-secondary)'
                }}>
                    <h3 style={{
                        marginTop: 0,
                        marginBottom: '16px',
                        color: 'var(--text-primary)',
                        fontSize: '18px',
                        fontWeight: '600'
                    }}>
                        添加任务
                    </h3>

                    <div style={{ display: 'flex', gap: '24px' }}>
                        {TASK_CATEGORIES.map(cat => (
                            <button
                                key={cat.key}
                                onClick={() => setActiveCategory(cat.key)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '0 0 12px 0',
                                    fontSize: '14px',
                                    fontWeight: activeCategory === cat.key ? '600' : '500',
                                    color: activeCategory === cat.key ? 'var(--color-accent)' : 'var(--text-secondary)',
                                    borderBottom: activeCategory === cat.key ? '2px solid var(--color-accent)' : '2px solid transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '24px',
                    backgroundColor: 'var(--bg-primary)'
                }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '12px'
                    }}>
                        {currentTasks.map(task => {
                            const Icon = task.icon;
                            return (
                                <button
                                    key={task.type}
                                    onClick={() => onSelect(task.type as TaskType)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '16px',
                                        padding: '16px',
                                        backgroundColor: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border-primary)',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'all 0.2s',
                                        color: 'var(--text-primary)',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.borderColor = 'var(--color-accent)';
                                        e.currentTarget.style.backgroundColor = 'var(--bg-highlight)';
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.borderColor = 'var(--border-primary)';
                                        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                >
                                    <div style={{
                                        padding: '10px',
                                        borderRadius: '8px',
                                        backgroundColor: 'var(--bg-secondary)',
                                        color: 'var(--color-accent)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <Icon size={24} strokeWidth={1.5} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>{task.label}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{task.description}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid var(--border-primary)',
                    backgroundColor: 'var(--bg-secondary)',
                    display: 'flex',
                    justifyContent: 'flex-end'
                }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 24px',
                            backgroundColor: 'transparent',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        取消
                    </button>
                </div>
            </div>

            <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
        </div>
    );
};

export default NodeSelector;
