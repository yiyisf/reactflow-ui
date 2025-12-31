import { memo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import useWorkflowStore from '../../store/workflowStore';

/**
 * 决策/分支节点组件（菱形）
 * 支持在编辑模式下添加/删除分支
 */
const DecisionNode = ({ id, data, selected }) => {
    const layoutDirection = data.layoutDirection || 'TB';
    const { mode, addDecisionBranch, removeDecisionBranch } = useWorkflowStore();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // 根据布局方向确定主要的 Handle 位置
    const sourcePosition = layoutDirection === 'LR' ? Position.Right : Position.Bottom;
    const targetPosition = layoutDirection === 'LR' ? Position.Left : Position.Top;

    const task = data.task || {};
    const branches = Object.keys(task.decisionCases || {});

    const handleAddBranch = () => {
        const branchName = window.prompt('请输入新分支的名称 (case value):', `case_${branches.length + 1}`);
        if (branchName) {
            addDecisionBranch(id, branchName);
        }
        setIsMenuOpen(false);
    };

    const handleRemoveBranch = (e, branch) => {
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
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        border: selected ? '3px solid #fbbf24' : '2px solid #d97706',
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
                                fontSize: '18px',
                                background: 'rgba(255,255,255,0.2)',
                                borderRadius: '4px',
                                padding: '2px 8px'
                            }}>
                                +
                            </div>
                        )}
                    </div>
                </div>

                {/* 分支控制菜单 (仅编辑模式) */}
                {mode === 'edit' && isMenuOpen && (
                    <div style={{
                        position: 'absolute',
                        top: '160px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        padding: '8px',
                        zIndex: 1000,
                        minWidth: '180px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                        animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                    }}>
                        <div style={{ padding: '4px 8px', fontSize: '11px', color: '#94a3b8', borderBottom: '1px solid #334155', marginBottom: '4px' }}>
                            分支管理
                        </div>
                        {branches.map(branch => (
                            <div key={branch} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 8px',
                                fontSize: '12px',
                                color: '#fff'
                            }}>
                                <span>{branch}</span>
                                <button
                                    onClick={(e) => handleRemoveBranch(e, branch)}
                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}
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
                                backgroundColor: '#3b82f6',
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

                {/* 主输出 Handle */}
                <Handle type="source" position={sourcePosition} style={{ background: '#fff', [layoutDirection === 'LR' ? 'right' : 'bottom']: '-5px' }} />
                {/* 分支输出 Handles - 保持在所有四个方向以支持多分支 */}
                {layoutDirection === 'TB' && (
                    <>
                        <Handle type="source" position={Position.Left} id="left" style={{ background: '#fff', left: '-5px' }} />
                        <Handle type="source" position={Position.Right} id="right" style={{ background: '#fff', right: '-5px' }} />
                    </>
                )}
                {layoutDirection === 'LR' && (
                    <>
                        <Handle type="source" position={Position.Top} id="top" style={{ background: '#fff', top: '-5px' }} />
                        <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: '#fff', bottom: '-5px' }} />
                    </>
                )}
            </div>
        </NodeWrapper>
    );
};

export default memo(DecisionNode);
