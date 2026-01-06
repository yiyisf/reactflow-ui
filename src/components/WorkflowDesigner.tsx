import React, { useState, useMemo, useCallback } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    Panel,
    MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import useWorkflowStore from '../store/workflowStore';
import TaskNode from './nodes/TaskNode';
import DecisionNode from './nodes/DecisionNode';
import ForkJoinNode from './nodes/ForkJoinNode';
import LoopNode from './nodes/LoopNode';
import SubWorkflowNode from './nodes/SubWorkflowNode';
import NodeSelector from './Editor/NodeSelector';
import ExecutionTaskPanel from './ExecutionTaskPanel';

// 注册自定义节点，Key 必须与 parser 中生成的 type 一致
const nodeTypes = {
    taskNode: TaskNode,
    decisionNode: DecisionNode,
    forkNode: ForkJoinNode.ForkNode,
    joinNode: ForkJoinNode.JoinNode,
    loopNode: LoopNode,
    subWorkflowNode: SubWorkflowNode,
};

const WorkflowDesigner: React.FC = () => {
    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        mode,
        setSelectedTask,
        theme,
        edgeType,
        addNode,
        nodesLocked,
        executionData,
    } = useWorkflowStore();

    const [showSelector, setShowSelector] = useState(false);
    const [activeEdgeData, setActiveEdgeData] = useState<any>(null);

    // 处理新节点选择
    const handleTypeSelect = useCallback((type: string) => {
        if (activeEdgeData) {
            const { sourceId, targetId, edgeId, edgeData } = activeEdgeData;
            addNode(
                { data: { label: `New ${type}`, taskReferenceName: `${type.toLowerCase()}_${Date.now()}`, taskType: type } },
                sourceId,
                targetId,
                edgeId,
                edgeData
            );
        }
        setShowSelector(false);
        setActiveEdgeData(null);
    }, [activeEdgeData, addNode]);

    // 为边添加元数据和箭头标记
    const processedEdges = useMemo(() => {
        return edges.map((edge) => {
            const isLoopBack = edge.id.includes('loop-back');
            const baseStyle = {
                ...edge.style,
                stroke: theme === 'light' ? '#475569' : '#64748b',
                strokeWidth: 2,
                strokeDasharray: isLoopBack ? '5,5' : undefined,
            };

            // 如果是运行模式且有执行数据，应用动态样式
            if (mode === 'run' && executionData) {
                const sourceStatus = executionData[edge.source]?.status;
                const targetStatus = executionData[edge.target]?.status;

                const isSourceCompleted = sourceStatus === 'COMPLETED' || edge.source === 'start';
                const isTargetCompleted = targetStatus === 'COMPLETED';
                const isTargetInProgress = targetStatus === 'IN_PROGRESS';

                if (isSourceCompleted && isTargetCompleted) {
                    return {
                        ...edge,
                        style: { ...baseStyle, stroke: 'var(--status-completed)', strokeWidth: 4 },
                        animated: false,
                    };
                }

                if (isSourceCompleted && isTargetInProgress) {
                    return {
                        ...edge,
                        style: { ...baseStyle, stroke: 'var(--status-in-progress)', strokeWidth: 4 },
                        animated: true,
                    };
                }
            }

            return {
                ...edge,
                type: edgeType === 'step' ? 'step' : 'default',
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 20,
                    height: 20,
                    color: theme === 'light' ? '#475569' : '#64748b',
                },
                style: baseStyle,
                animated: true,
            };
        });
    }, [edges, edgeType, theme, mode, executionData]);

    // 背景颜色 - 使用 CSS变量
    const backgroundColor = 'var(--bg-secondary)';

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: backgroundColor }}>
            <ReactFlow
                nodes={nodes}
                edges={processedEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                onNodeClick={(_: any, node: any) => {
                    if (mode === 'run') {
                        setSelectedTask(node.data.task || null);
                    } else {
                        setSelectedTask(node.data.task || null);
                    }
                }}
                fitView
                nodesDraggable={!nodesLocked}
                nodesConnectable={!nodesLocked}
                elementsSelectable={true}
                minZoom={0.2}
                maxZoom={2}
            >
                <Background color="var(--border-primary)" gap={20} />
                <Controls showInteractive={false} />
                <MiniMap
                    style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}
                    maskColor="rgba(0, 0, 0, 0.1)"
                    nodeColor={(node: any) => {
                        if (node.type === 'taskNode') return 'var(--color-accent)';
                        if (node.type === 'decisionNode') return 'var(--status-failed)';
                        if (node.type === 'forkNode') return 'var(--color-accent)';
                        if (node.type === 'joinNode') return 'var(--status-completed)';
                        return '#ccc';
                    }}
                />

                {/* 运行态状态栏 */}
                {mode === 'run' && (
                    <Panel position="bottom-center">
                        <ExecutionStatusBar />
                    </Panel>
                )}

                {/* 运行态详情面板 */}
                {mode === 'run' && <ExecutionTaskPanel />}
            </ReactFlow>

            {showSelector && (
                <NodeSelector
                    theme={theme}
                    onSelect={handleTypeSelect}
                    onCancel={() => setShowSelector(false)}
                />
            )}
        </div>
    );
};

/**
 * 内部组件：运行态状态栏
 */
const ExecutionStatusBar = () => {
    const {
        executionData,
        loadSampleExecution,
        importExecutionJSON,
        workflowInstance,
        setSelectedTask
    } = useWorkflowStore();

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target?.result as string);
                    importExecutionJSON(json);
                } catch (err) {
                    console.error('Failed to parse execution JSON:', err);
                    alert('JSON 解析失败，请检查格式是否正确');
                }
            };
            reader.readAsText(file);
        }
    };

    // 如果没有执行数据，显示启动按钮
    if (!executionData) {
        return (
            <div className="execution-status-bar">
                <input
                    type="file"
                    id="execution-json-upload"
                    accept=".json"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                />
                <div className="status-item">
                    <span className="status-label">准备就绪</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={loadSampleExecution}
                        style={{
                            background: 'var(--color-accent)',
                            color: '#fff',
                            border: 'none',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        🚀 加载示例运行
                    </button>
                    <button
                        onClick={() => document.getElementById('execution-json-upload')?.click()}
                        title="上传 Conductor 运行态 JSON"
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-primary)',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        📁 导入执行 JSON
                    </button>
                </div>
            </div>
        );
    }

    // 统计状态
    const statsArr = Object.values(executionData);
    const completedCount = statsArr.filter(t => t.status === 'COMPLETED').length;
    const failedCount = statsArr.filter(t => t.status === 'FAILED' || t.status === 'FAILED_WITH_TERMINAL_ERROR' || t.status === 'TIMED_OUT').length;
    const inProgressCount = statsArr.filter(t => t.status === 'IN_PROGRESS' || t.status === 'SCHEDULED').length;


    return (
        <div className="execution-status-bar">
            {workflowInstance && (
                <>
                    <div className="status-item">
                        <span className="status-label"> Workflow ID:</span>
                        <span className="status-value highlight" style={{ color: 'var(--text-primary)', opacity: 0.8 }}>{workflowInstance.workflowId}</span>
                    </div>
                    <div className="status-divider" />
                </>
            )}
            <div className="status-item">
                <span className="status-label">状态:</span>
                <span className="status-value highlight" style={{
                    color: workflowInstance?.status === 'COMPLETED' ? 'var(--status-completed)' : 'var(--status-in-progress)'
                }}>{workflowInstance?.status || '运行中'}</span>
            </div>
            <div className="status-divider" />
            <div className="status-item">
                <span className="status-label">已完成:</span>
                <span className="status-value">{completedCount}</span>
            </div>
            <div className="status-item">
                <span className="status-label" style={{ color: 'var(--status-failed)' }}>失败:</span>
                <span className="status-value" style={{ color: 'var(--status-failed)' }}>{failedCount}</span>
            </div>
            <div className="status-item">
                <span className="status-label" style={{ color: 'var(--status-in-progress)' }}>处理中:</span>
                <span className="status-value" style={{ color: 'var(--status-in-progress)' }}>{inProgressCount}</span>
            </div>
            <div className="status-divider" />
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={() => {
                        // 特殊处理：将 selectedTask 设为一个具有 workflow input/output 的虚拟对象
                        setSelectedTask({
                            name: 'Workflow Global Data',
                            taskReferenceName: '__workflow_global__',
                            type: 'SIMPLE'
                        } as any);
                    }}
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-primary)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '600'
                    }}
                >
                    🔍 全局 I/O
                </button>
            </div>
        </div>
    );
};

export default WorkflowDesigner;
