import { memo } from 'react';

/**
 * 任务详情面板组件 - 抽屉式
 */
const TaskDetailPanel = ({ task, onClose, theme = 'dark' }) => {
    const bgColor = theme === 'light'
        ? 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)'
        : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
    const textColor = theme === 'light' ? '#0f172a' : '#fff';
    const borderColor = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    const secondaryTextColor = theme === 'light' ? '#475569' : '#94a3b8';
    const codeBgColor = theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.3)';
    const hoverBgColor = theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)';

    // 如果没有选中任务，完全隐藏面板
    if (!task) {
        return null;
    }

    const renderValue = (value) => {
        if (typeof value === 'object' && value !== null) {
            return (
                <pre style={{
                    background: codeBgColor,
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    overflow: 'auto',
                    maxHeight: '200px',
                    lineHeight: '1.5',
                    color: textColor
                }}>
                    {JSON.stringify(value, null, 2)}
                </pre>
            );
        }
        return <div style={{ fontSize: '13px', color: theme === 'light' ? '#334155' : '#e2e8f0' }}>{String(value)}</div>;
    };

    const renderSection = (title, content) => {
        if (!content && content !== 0 && content !== false) return null;

        return (
            <div style={{ marginBottom: '20px' }}>
                <div style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    color: secondaryTextColor,
                    marginBottom: '8px',
                    fontWeight: '600'
                }}>
                    {title}
                </div>
                {renderValue(content)}
            </div>
        );
    };

    return (
        <div style={{
            position: 'fixed',
            right: 0,
            top: 0,
            width: '400px',
            height: '100vh',
            background: bgColor,
            borderLeft: `1px solid ${borderColor}`,
            color: textColor,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: theme === 'light' ? '-4px 0 20px rgba(0,0,0,0.1)' : '-4px 0 20px rgba(0,0,0,0.3)',
            zIndex: 1000,
            animation: 'slideInFromRight 0.3s ease-out',
        }}>
            <style>{`
        @keyframes slideInFromRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>

            {/* Header */}
            <div style={{
                padding: '20px',
                borderBottom: `1px solid ${borderColor}`,
                background: theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.2)'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '12px'
                }}>
                    <div style={{ flex: 1 }}>
                        <div style={{
                            fontSize: '10px',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            color: secondaryTextColor,
                            marginBottom: '6px',
                            fontWeight: '600'
                        }}>
                            {task.type || task.label || 'NODE'}
                        </div>
                        <div style={{
                            fontSize: '18px',
                            fontWeight: 'bold',
                            marginBottom: '4px',
                            lineHeight: '1.3'
                        }}>
                            {task.name || task.label || '节点'}
                        </div>
                        <div style={{
                            fontSize: '12px',
                            color: secondaryTextColor,
                            fontStyle: 'italic'
                        }}>
                            {task.taskReferenceName || 'N/A'}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: hoverBgColor,
                            border: 'none',
                            color: textColor,
                            width: '32px',
                            height: '32px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            flexShrink: 0,
                            marginLeft: '12px'
                        }}
                        onMouseEnter={(e) => e.target.style.background = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)'}
                        onMouseLeave={(e) => e.target.style.background = hoverBgColor}
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px'
            }}>
                {renderSection('描述', task.description)}
                {renderSection('输入参数', task.inputParameters)}
                {renderSection('输出参数', task.outputParameters)}

                {task.type === 'DECISION' || task.type === 'SWITCH' ? (
                    <>
                        {renderSection('决策映射', task.decisionCases)}
                        {renderSection('默认分支', task.defaultCase)}
                        {renderSection('输入参数名', task.caseValueParam)}
                        {renderSection('表达式', task.caseExpression)}
                    </>
                ) : null}

                {task.type === 'FORK_JOIN' || task.type === 'FORK_JOIN_DYNAMIC' ? (
                    <>
                        {renderSection('并行任务', task.forkTasks)}
                    </>
                ) : null}

                {task.type === 'DO_WHILE' ? (
                    <>
                        {renderSection('循环条件', task.loopCondition)}
                        {renderSection('循环体任务', task.loopOver)}
                    </>
                ) : null}

                {task.type === 'SUB_WORKFLOW' ? (
                    <>
                        {renderSection('子工作流参数', task.subWorkflowParam)}
                    </>
                ) : null}

                {task.type === 'HTTP' ? (
                    <>
                        {renderSection('HTTP 请求', task.httpRequest)}
                    </>
                ) : null}

                {task.type === 'JOIN' ? (
                    <>
                        {renderSection('连接任务', task.joinOn)}
                    </>
                ) : null}

                {renderSection('可选任务', task.optional)}
                {renderSection('异步完成', task.asyncComplete)}
                {renderSection('启动延迟 (秒)', task.startDelay)}
                {renderSection('重试次数', task.retryCount)}
                {renderSection('超时时间 (秒)', task.timeoutSeconds)}
                {renderSection('超时策略', task.timeoutPolicy)}
                {renderSection('响应超时 (秒)', task.responseTimeoutSeconds)}

                {/* 完整任务配置 */}
                <div style={{
                    marginTop: '30px',
                    paddingTop: '20px',
                    borderTop: `1px solid ${borderColor}`
                }}>
                    <div style={{
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        color: secondaryTextColor,
                        marginBottom: '12px',
                        fontWeight: '600'
                    }}>
                        完整配置
                    </div>
                    <pre style={{
                        background: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.4)',
                        padding: '16px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        overflow: 'auto',
                        maxHeight: '400px',
                        lineHeight: '1.6',
                        border: `1px solid ${borderColor}`,
                        color: textColor
                    }}>
                        {JSON.stringify(task, null, 2)}
                    </pre>
                </div>
            </div>
        </div>
    );
};

export default memo(TaskDetailPanel);
