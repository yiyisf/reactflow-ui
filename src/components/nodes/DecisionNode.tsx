import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import useWorkflowStore from '../../store/workflowStore';
import { WorkflowNodeData } from '../../types/workflow';
import { useNodeLayout } from '../../hooks/useNodeLayout';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import ExecutionStatusBadge from './ExecutionStatusBadge';
import { truncate, getNodeHeader } from '../../utils/nodeMeta';
import PromptDialog from '../PromptDialog';
import ConfirmDialog from '../ConfirmDialog';

type DecisionNodeProps = NodeProps<WorkflowNodeData>;

/** 对话框状态类型 */
type DialogState =
    | { type: 'none' }
    | { type: 'add' }
    | { type: 'rename'; branch: string }
    | { type: 'delete'; branch: string };

/**
 * 决策/分支节点组件（菱形）
 * 支持在编辑模式下添加/删除/重命名分支（均使用页面内 modal，不调用浏览器原生弹框）
 */
const DecisionNode = ({ id, data, selected }: DecisionNodeProps) => {
    const { layoutDirection } = useNodeLayout(data);
    const { mode, execution, isRunning } = useNodeExecution(data.taskReferenceName);
    const { addDecisionBranch, removeDecisionBranch, renameDecisionBranch, viewMode } = useWorkflowStore();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [dialog, setDialog] = useState<DialogState>({ type: 'none' });

    // 根据布局方向确定主要的 Handle 位置
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;

    const branches = Object.keys(data.decisionCases || data.task?.decisionCases || {});

    // ── 对话框触发 ───────────────────────────────────────────────

    const handleAddBranch = () => {
        setIsMenuOpen(false);
        setDialog({ type: 'add' });
    };

    const handleRemoveBranch = (e: React.MouseEvent, branch: string) => {
        e.stopPropagation();
        setDialog({ type: 'delete', branch });
    };

    const handleRenameBranch = (e: React.MouseEvent, branch: string) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        setDialog({ type: 'rename', branch });
    };

    // ── 对话框确认 ───────────────────────────────────────────────

    const handleAddConfirm = (name: string) => {
        if (name) addDecisionBranch(id, name);
        setDialog({ type: 'none' });
    };

    const handleRenameConfirm = (newName: string) => {
        if (dialog.type !== 'rename') return;
        if (newName && newName !== dialog.branch) {
            renameDecisionBranch(id, dialog.branch, newName);
        }
        setDialog({ type: 'none' });
    };

    const handleDeleteConfirm = () => {
        if (dialog.type !== 'delete') return;
        removeDecisionBranch(id, dialog.branch);
        setDialog({ type: 'none' });
    };

    const closeDialog = () => setDialog({ type: 'none' });

    // 运行态 CSS 类名映射
    const getExecutionClassName = (status: string | undefined) => {
        if (!status) return '';
        const mapping: Record<string, string> = {
            'SCHEDULED': 'execution-node-scheduled',
            'IN_PROGRESS': 'execution-node-in-progress',
            'COMPLETED': 'execution-node-completed',
            'COMPLETED_WITH_ERRORS': 'execution-node-completed-with-errors',
            'FAILED': 'execution-node-failed',
            'FAILED_WITH_TERMINAL_ERROR': 'execution-node-failed-terminal',
            'TIMED_OUT': 'execution-node-timed-out',
            'SKIPPED': 'execution-node-skipped',
            'CANCELED': 'execution-node-canceled',
        };
        return mapping[status] || '';
    };

    const executionClass = isRunning ? getExecutionClassName(execution?.status) : '';

    return (
        <NodeWrapper
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
            isDecision={true}
            isHighlighted={data.isHighlighted}
            executionStatus={execution?.status}
            simRunning={data.simRunning}
            simDone={data.simDone}
        >
            <div style={{ position: 'relative' }}>
                <Handle type="target" position={targetPosition} style={{ background: '#fff', [layoutDirection === 'LR' ? 'left' : 'top']: '-5px' }} />

                {/* 运行态徽章 */}
                {isRunning && execution?.status && (
                    <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 20 }}>
                        <ExecutionStatusBadge status={execution.status} />
                    </div>
                )}

                <div
                    className={executionClass}
                    style={{
                        width: '150px',
                        height: '150px',
                        background: isRunning && execution?.status
                            ? undefined
                            : 'var(--bg-secondary)',
                        border: selected
                            ? '4px solid #fbbf24'
                            : (isRunning && execution?.status ? undefined : '4px solid var(--border-primary)'),
                        transform: 'rotate(45deg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: selected
                            ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                            : (isRunning && execution?.status ? undefined : '0 4px 12px rgba(0,0,0,0.15)'),
                        transition: 'all 0.3s ease',
                        cursor: 'pointer',
                    }}
                    onClick={() => mode === 'edit' && setIsMenuOpen(!isMenuOpen)}
                >
                    <div
                        style={{
                            transform: 'rotate(-45deg)',
                            color: '#fff',
                            textAlign: 'center',
                            padding: '10px',
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {/* Header (Task Type) */}
                        <div style={{
                            fontSize: '14px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            opacity: 0.7,
                            marginBottom: '4px',
                            color: 'var(--color-accent)'
                        }}>
                            {getNodeHeader(data.taskType, viewMode)}
                        </div>

                        {/* Title (Label) */}
                        <div style={{
                            fontSize: '18px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            lineHeight: '1.2',
                            wordBreak: 'break-word',
                            maxHeight: '60px',
                            overflow: 'hidden',
                            marginBottom: '4px'
                        }}>
                            {data.label}
                        </div>

                        {mode === 'edit' && (
                            <div style={{
                                marginTop: '4px',
                                width: '24px',
                                height: '24px',
                                fontSize: '16px',
                                background: 'rgba(255,255,255,0.1)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '4px auto 0',
                                color: 'var(--text-secondary)'
                            }}>
                                +
                            </div>
                        )}

                        {/* 运行态时间 */}
                        {isRunning && execution?.startTime && (
                            <div style={{ fontSize: '9px', opacity: 0.7, marginTop: '8px' }}>
                                {execution.endTime
                                    ? `${((execution.endTime - execution.startTime) / 1000).toFixed(1)}s`
                                    : '◌'}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── 分支控制菜单 (仅编辑模式) ─────────────────── */}
                {mode === 'edit' && isMenuOpen && (
                    <div className="glass-panel" style={{
                        position: 'absolute',
                        top: '160px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: 'var(--glass-surface)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        padding: '8px',
                        zIndex: 1000,
                        minWidth: '200px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                        animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        backdropFilter: 'blur(12px)'
                    }}>
                        <div style={{
                            padding: '4px 8px 6px',
                            fontSize: '11px',
                            color: 'var(--text-secondary)',
                            borderBottom: '1px solid var(--glass-border)',
                            marginBottom: '4px',
                            fontWeight: 600,
                            letterSpacing: '0.05em',
                        }}>
                            分支管理
                        </div>

                        {/* 分支列表 */}
                        {branches.map(branch => (
                            <div key={branch} style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '5px 6px',
                                borderRadius: '4px',
                                gap: '4px',
                            }}>
                                <span style={{
                                    flex: 1,
                                    fontSize: '12px',
                                    color: 'var(--text-primary)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    minWidth: 0,
                                }}>
                                    {branch}
                                </span>
                                {/* 重命名按钮 */}
                                <button
                                    onClick={(e) => handleRenameBranch(e, branch)}
                                    style={{
                                        width: '22px',
                                        height: '22px',
                                        borderRadius: '4px',
                                        backgroundColor: 'var(--color-accent)',
                                        color: 'white',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '11px',
                                        padding: 0,
                                        flexShrink: 0,
                                        opacity: 0.85,
                                    }}
                                    title={`重命名分支 "${branch}"`}
                                >
                                    ✏
                                </button>
                                {/* 删除按钮 */}
                                <button
                                    onClick={(e) => handleRemoveBranch(e, branch)}
                                    style={{
                                        width: '22px',
                                        height: '22px',
                                        borderRadius: '50%',
                                        backgroundColor: '#ef4444',
                                        color: 'white',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '13px',
                                        padding: 0,
                                        flexShrink: 0,
                                        opacity: 0.9,
                                    }}
                                    title={`删除分支 "${branch}"`}
                                >
                                    ×
                                </button>
                            </div>
                        ))}

                        {/* 添加分支 */}
                        <button
                            onClick={handleAddBranch}
                            style={{
                                width: '100%',
                                marginTop: '6px',
                                padding: '8px',
                                backgroundColor: 'var(--color-accent)',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 'bold'
                            }}
                        >
                            + 添加新分支
                        </button>
                    </div>
                )}

                {/* 开发者模式：在菱形下方显示分支表达式 */}
                {viewMode === 'developer' && (() => {
                    const expr = data.task?.caseExpression
                        || (data.task?.inputParameters?.expression as string);
                    const param = data.task?.caseValueParam;
                    if (!expr && !param) return null;
                    return (
                        <div style={{
                            position: 'absolute',
                            top: '158px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            textAlign: 'center',
                            fontSize: 10,
                            color: 'var(--text-secondary)',
                            maxWidth: 140,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                            fontFamily: 'var(--font-mono, monospace)',
                        }}>
                            {expr ? truncate(expr, 22) : `param: ${param}`}
                        </div>
                    );
                })()}

                {/* 分支输出 Handles */}
                {layoutDirection === 'TB' ? (
                    <>
                        <Handle type="source" position={Position.Bottom} style={{ background: '#fff', bottom: '-5px' }} />
                        <Handle type="source" position={Position.Left} id="left" style={{ background: '#fff', left: '-5px' }} />
                        <Handle type="source" position={Position.Right} id="right" style={{ background: '#fff', right: '-5px' }} />
                    </>
                ) : (
                    <>
                        <Handle type="source" position={Position.Right} style={{ background: '#fff', right: '-5px' }} />
                        <Handle type="source" position={Position.Top} id="top" style={{ background: '#fff', top: '-5px' }} />
                        <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: '#fff', bottom: '-5px' }} />
                    </>
                )}
            </div>

            {/* ── 页面内对话框（Portal，挂载到 document.body）────── */}

            {/* 添加分支 */}
            {dialog.type === 'add' && (
                <PromptDialog
                    title="添加新分支"
                    label="分支条件值（Case Value）"
                    defaultValue={`case_${branches.length + 1}`}
                    placeholder="例如：approved、rejected、pending"
                    confirmText="添加"
                    onConfirm={handleAddConfirm}
                    onCancel={closeDialog}
                />
            )}

            {/* 重命名分支 */}
            {dialog.type === 'rename' && (
                <PromptDialog
                    title={`重命名分支`}
                    label={`当前名称：${dialog.branch}`}
                    defaultValue={dialog.branch}
                    placeholder="输入新的分支条件值"
                    confirmText="重命名"
                    onConfirm={handleRenameConfirm}
                    onCancel={closeDialog}
                />
            )}

            {/* 删除分支 */}
            {dialog.type === 'delete' && (
                <ConfirmDialog
                    message={`确定要删除分支 "${dialog.branch}" 及其下的所有任务吗？此操作不可撤销。`}
                    onConfirm={handleDeleteConfirm}
                    onCancel={closeDialog}
                />
            )}
        </NodeWrapper>
    );
};

export default memo(DecisionNode);
