import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import useWorkflowStore from '../../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import { WorkflowNodeData } from '../../types/workflow';
import { useNodeLayout } from '../../hooks/useNodeLayout';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import ExecutionStatusBadge from './ExecutionStatusBadge';
import { truncate, getNodeHeader } from '../../utils/nodeMeta';
import PromptDialog from '../PromptDialog';
import { validateBranchName } from '../../utils/taskEditing';
import ConfirmDialog from '../ConfirmDialog';
import { Pencil } from 'lucide-react';

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
    const { mode, execution, isRunning, durationText } = useNodeExecution(data.taskReferenceName);
    const { addDecisionBranch, removeDecisionBranch, renameDecisionBranch, viewMode } = useWorkflowStore(useShallow((s) => ({
            addDecisionBranch: s.addDecisionBranch,
            removeDecisionBranch: s.removeDecisionBranch,
            renameDecisionBranch: s.renameDecisionBranch,
            viewMode: s.viewMode,
        })));
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
            proposalStatus={data.proposalStatus}
        >
            <div style={{
                position: 'relative',
                width: '164px',
                height: '164px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <Handle
                    type="target"
                    position={targetPosition}
                    style={{
                        background: 'var(--cm-surface-1)',
                        [layoutDirection === 'LR' ? 'left' : 'top']: '-3px',
                        zIndex: 15,
                    }}
                />

                {/* 运行态徽章 */}
                {isRunning && execution?.status && (
                    <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 20 }}>
                        <ExecutionStatusBadge status={execution.status} />
                    </div>
                )}

                <div
                    className={executionClass}
                    style={{
                        width: '122px',
                        height: '122px',
                        boxSizing: 'border-box',
                        borderRadius: '10px',
                        background: isRunning && execution?.status
                            ? undefined
                            : 'var(--glass-bg)',
                        backdropFilter: 'var(--glass-blur)',
                        WebkitBackdropFilter: 'var(--glass-blur)',
                        border: selected
                            ? '2.5px solid var(--color-accent)'
                            : (isRunning && execution?.status ? undefined : '2px solid rgba(var(--color-accent-rgb), 0.45)'),
                        transform: 'rotate(45deg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: selected
                            ? 'var(--node-shadow-hover), 0 0 0 3px var(--node-glow-color)'
                            : (isRunning && execution?.status ? undefined : 'var(--node-shadow)'),
                        transition: 'all 0.25s ease',
                        cursor: 'pointer',
                        flexShrink: 0,
                    }}
                    onClick={() => mode === 'edit' && setIsMenuOpen(!isMenuOpen)}
                >
                    <div
                        style={{
                            transform: 'rotate(-45deg)',
                            color: 'var(--text-primary)',
                            textAlign: 'center',
                            padding: '6px',
                            width: '116px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {/* Header (Task Type) */}
                        <div style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            opacity: 0.85,
                            marginBottom: '2px',
                            color: 'var(--color-accent)'
                        }}>
                            {getNodeHeader(data.taskType, viewMode)}
                        </div>

                        {/* Title (Reference Name / Label) */}
                        <div style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            lineHeight: 1.25,
                            maxWidth: '104px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }} title={data.taskReferenceName}>
                            {data.taskReferenceName}
                        </div>

                        {data.label && data.label !== data.taskReferenceName && (
                            <div style={{
                                fontSize: '10px',
                                color: 'var(--text-secondary)',
                                maxWidth: '98px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                marginTop: '1px',
                            }} title={data.label}>
                                {data.label}
                            </div>
                        )}

                        {mode === 'edit' && (
                            <div style={{
                                width: '18px',
                                height: '18px',
                                fontSize: '12px',
                                background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)',
                                border: '1px solid rgba(var(--color-accent-rgb), 0.4)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '4px auto 0',
                                color: 'var(--color-accent)',
                                fontWeight: 700,
                            }} title="管理决策分支">
                                +
                            </div>
                        )}

                        {/* 运行态耗时 */}
                        {isRunning && durationText && (
                            <div style={{
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono, monospace)',
                                color: 'var(--text-secondary)',
                                background: 'var(--bg-tertiary)',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                marginTop: '3px',
                            }}>
                                {durationText}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── 分支控制菜单 (仅编辑模式) ─────────────────── */}
                {mode === 'edit' && isMenuOpen && (
                    <div className="glass-panel" style={{
                        position: 'absolute',
                        top: '170px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: 'var(--glass-surface)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        padding: '8px',
                        zIndex: 1000,
                        minWidth: '200px',
                        boxShadow: 'var(--cm-shadow-float)',
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
                                        color: 'var(--color-on-accent)',
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
                                    <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
                                </button>
                                {/* 删除按钮 */}
                                <button
                                    onClick={(e) => handleRemoveBranch(e, branch)}
                                    style={{
                                        width: '22px',
                                        height: '22px',
                                        borderRadius: '50%',
                                        backgroundColor: 'var(--cm-status-failed)',
                                        color: 'var(--cm-on-danger)',
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
                                color: 'var(--color-on-accent)',
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
                    const expr = (data.task?.type === 'SWITCH' ? data.task?.expression : undefined)
                        || data.task?.caseExpression
                        || (data.task?.inputParameters?.expression as string);
                    const param = data.task?.caseValueParam;
                    if (!expr && !param) return null;
                    return (
                        <div style={{
                            position: 'absolute',
                            top: '166px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            textAlign: 'center',
                            fontSize: 10,
                            color: 'var(--text-secondary)',
                            maxWidth: 150,
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

                {/* 分支输出 Handles — 精确对齐菱形四角顶点 */}
                {layoutDirection === 'TB' ? (
                    <>
                        <Handle type="source" position={Position.Bottom} style={{ background: 'var(--cm-surface-1)', bottom: '-3px', zIndex: 15 }} />
                        <Handle type="source" position={Position.Left} id="left" style={{ background: 'var(--cm-surface-1)', left: '-3px', zIndex: 15 }} />
                        <Handle type="source" position={Position.Right} id="right" style={{ background: 'var(--cm-surface-1)', right: '-3px', zIndex: 15 }} />
                    </>
                ) : (
                    <>
                        <Handle type="source" position={Position.Right} style={{ background: 'var(--cm-surface-1)', right: '-3px', zIndex: 15 }} />
                        <Handle type="source" position={Position.Top} id="top" style={{ background: 'var(--cm-surface-1)', top: '-3px', zIndex: 15 }} />
                        <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: 'var(--cm-surface-1)', bottom: '-3px', zIndex: 15 }} />
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
                    validate={(v) => validateBranchName(data.task, v)}
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
                    validate={(v) => validateBranchName(data.task, v, dialog.branch)}
                    onConfirm={handleRenameConfirm}
                    onCancel={closeDialog}
                />
            )}

            {/* 删除分支 */}
            {dialog.type === 'delete' && (
                <ConfirmDialog
                    message={`确定要删除分支 "${dialog.branch}" 及其下的所有任务吗？此操作不可撤销。`}
                    confirmLabel="删除分支"
                    onConfirm={handleDeleteConfirm}
                    onCancel={closeDialog}
                />
            )}
        </NodeWrapper>
    );
};

export default memo(DecisionNode);
