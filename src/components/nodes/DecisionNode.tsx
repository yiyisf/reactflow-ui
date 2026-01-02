import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import useWorkflowStore from '../../store/workflowStore';
import { WorkflowNodeData } from '../../types/workflow';

type DecisionNodeProps = NodeProps<WorkflowNodeData>;

/**
 * 决策/分支节点组件（菱形）
 * 支持在编辑模式下添加/删除分支
 */
const DecisionNode = ({ id, data, selected }: DecisionNodeProps) => {
    const layoutDirection = data.layoutDirection || 'TB';
    const { mode, addDecisionBranch, removeDecisionBranch } = useWorkflowStore();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // 根据布局方向确定主要的 Handle 位置
    // const sourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;

    const branches = Object.keys(data.decisionCases || {});

    const handleAddBranch = () => {
        const branchName = window.prompt('请输入新分支的名称 (case value):', `case_${branches.length + 1}`);
        if (branchName) {
            addDecisionBranch(id, branchName);
        }
        setIsMenuOpen(false);
    };

    const handleRemoveBranch = (e: React.MouseEvent, branch: string) => {
        e.stopPropagation();
        if (window.confirm(`确定要删除分支 "${branch}" 及其下的所有任务吗？`)) {
            removeDecisionBranch(id, branch);
        }
    };

    return (
        <NodeWrapper
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
        >
            <div style={{ position: 'relative' }}>
                <Handle type="target" position={targetPosition} style={{ background: '#fff', [layoutDirection === 'LR' ? 'left' : 'top']: '-5px' }} />

                <div
                    style={{
                        width: '150px',
                        height: '150px',
                        background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%)',
                        border: selected ? '3px solid #fbbf24' : '2px solid var(--color-accent-hover)',
                        transform: 'rotate(45deg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: selected
                            ? '0 10px 30px rgba(0,0,0,0.3), 0 0 0 4px rgba(251, 191, 36, 0.3)'
                            : '0 4px 12px rgba(0,0,0,0.15)',
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
                        }}
                    >
                        <div style={{
                            fontSize: '10px',
                            opacity: 0.9,
                            marginBottom: '4px',
                            textTransform: 'uppercase',
                            fontWeight: '600',
                            letterSpacing: '0.5px'
                        }}>
                            {data.taskType}
                        </div>
                        <div style={{
                            fontSize: '13px',
                            fontWeight: 'bold',
                            marginBottom: '4px',
                            lineHeight: '1.2'
                        }}>
                            {data.label}
                        </div>

                        {mode === 'edit' && (
                            <div style={{
                                marginTop: '8px',
                                width: '28px',
                                height: '28px',
                                fontSize: '18px',
                                background: 'rgba(255,255,255,0.2)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '8px auto 0'
                            }}>
                                +
                            </div>
                        )}
                    </div>
                </div>

                {/* 分支控制菜单 (仅编辑模式) */}
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
                        minWidth: '180px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                        animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        backdropFilter: 'blur(12px)'
                    }}>
                        <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)', marginBottom: '4px' }}>
                            分支管理
                        </div>
                        {branches.map(branch => (
                            <div key={branch} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 8px',
                                fontSize: '12px',
                                color: 'var(--text-primary)'
                            }}>
                                <span>{branch}</span>
                                <button
                                    onClick={(e) => handleRemoveBranch(e, branch)}
                                    style={{
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        backgroundColor: '#ef4444',
                                        color: 'white',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '12px',
                                        padding: 0
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={handleAddBranch}
                            style={{
                                width: '100%',
                                marginTop: '4px',
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

                {/* 分支输出 Handles - 分配固定 ID 方便解析时映射 */}
                {layoutDirection === 'TB' ? (
                    <>
                        {/* 主输出 (通常设为默认或第一个分支) */}
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
        </NodeWrapper>
    );
};

export default memo(DecisionNode);
