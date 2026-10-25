import { memo, useMemo } from 'react';
import { Handle, NodeProps, useStore } from 'reactflow';
import NodeWrapper from './NodeWrapper';
import NodeLayout from './NodeLayout';
import { WorkflowNodeData } from '../../types/workflow';
import { useNodeLayout } from '../../hooks/useNodeLayout';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import { TASK_TYPES } from '../../config/taskTypes';
import { Activity } from 'lucide-react';
import useWorkflowStore from '../../store/workflowStore';
import { getNodeMeta, getNodeHeader } from '../../utils/nodeMeta';

type TaskNodeProps = NodeProps<WorkflowNodeData>;

/**
 * 常规任务节点组件 — 支持语义级缩放 (Semantic Zoom LOD) 与画布内联 ⌘K 快捷呼出
 */
const TaskNode = ({ id, data, selected }: TaskNodeProps) => {
    const taskType = data.taskType || 'SIMPLE';
    const { sourcePosition, targetPosition } = useNodeLayout(data);
    const { execution, isRunning, retryCount, durationText } = useNodeExecution(data.taskReferenceName);
    const viewMode = useWorkflowStore(s => s.viewMode);
    const mode = useWorkflowStore(s => s.mode);
    const setInlineCopilotTaskRef = useWorkflowStore(s => s.setInlineCopilotTaskRef);

    // Semantic Zoom Level-of-Detail (LOD)
    const zoom = useStore((s) => s.transform[2]);
    const isHighZoomLod = zoom >= 1.15;

    // 获取图标和标签
    const taskConfig = useMemo(() => TASK_TYPES.find(t => t.type === taskType), [taskType]);
    const IconComponent = taskConfig?.icon || Activity;

    const isNoop = taskType === 'NOOP';
    const isDynamicRuntime = data.isDynamicRuntime === true;
    const color = isNoop ? 'var(--text-secondary)' : 'var(--color-accent)';

    // 生成 Meta 信息（随 viewMode 变化）
    const meta = useMemo(() => {
        let fallback: string;
        if (isDynamicRuntime) fallback = `Dynamic (${taskType})`;
        else if (taskType === 'SIMPLE') fallback = data.label === 'Worker Task' ? 'Execute on Worker' : 'Worker Task';
        else if (taskType === 'HTTP') fallback = 'REST API Call';
        else if (taskType === 'JSON_JQ_TRANSFORM') fallback = 'JQ Expression';
        else if (taskType === 'INLINE' || taskType === 'LAMBDA') fallback = 'Inline Script';
        else if (taskType === 'START_WORKFLOW') fallback = 'Launch Workflow (no wait)';
        else if (taskType === 'DYNAMIC') fallback = 'Dynamic Task Type';
        else if (taskType === 'HUMAN') fallback = 'Human Approval';
        else if (taskType === 'NOOP') fallback = 'No Operation';
        else fallback = taskConfig?.label || taskType;
        return getNodeMeta(taskType, data, viewMode, fallback);
    }, [taskType, taskConfig, data, viewMode, isDynamicRuntime]);

    // Extract top 2 input parameter previews for Semantic Zoom High-LOD mode
    const lodParams = useMemo(() => {
        if (!isHighZoomLod || !data.task?.inputParameters) return [];
        const entries = Object.entries(data.task.inputParameters);
        return entries.slice(0, 2).map(([k, v]) => ({
            key: k,
            val: typeof v === 'object' ? JSON.stringify(v).slice(0, 28) : String(v).slice(0, 28),
        }));
    }, [isHighZoomLod, data.task?.inputParameters]);

    return (
        <NodeWrapper
            nodeId={id}
            selected={selected}
            isError={data.isError}
            hasWarning={data.hasWarning}
            isHighlighted={data.isHighlighted}
            executionStatus={execution?.status}
            simRunning={data.simRunning}
            simDone={data.simDone}
            proposalStatus={data.proposalStatus}
        >
            <div style={{
                borderRadius: '10px',
                background: isNoop ? 'var(--bg-tertiary)' : 'transparent',
                opacity: isNoop ? 0.75 : 1,
                position: 'relative',
                outline: isDynamicRuntime ? '2px dashed var(--color-accent)' : 'none',
                outlineOffset: '-2px',
            }}>
                <NodeLayout
                    icon={IconComponent}
                    header={getNodeHeader(taskType, viewMode)}
                    title={data.taskReferenceName}
                    subTitle={data.label && data.label !== data.taskReferenceName ? data.label : undefined}
                    meta={meta}
                    duration={durationText}
                    color={color}
                    status={execution?.status}
                    isRunning={isRunning}
                />

                {/* Semantic Zoom High-LOD Inline Parameter Preview */}
                {lodParams.length > 0 && (
                    <div style={{
                        padding: '4px 10px 6px',
                        borderTop: '1px dashed var(--border-primary)',
                        fontSize: '9px',
                        fontFamily: 'monospace',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                    }}>
                        {lodParams.map(p => (
                            <div key={p.key} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <span style={{ color: '#38bdf8' }}>{p.key}</span>: {p.val}
                            </div>
                        ))}
                    </div>
                )}

                {/* Inline Cmd+K Trigger Badge on selected node in edit mode */}
                {selected && mode === 'edit' && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setInlineCopilotTaskRef(data.taskReferenceName);
                        }}
                        title="在此节点触发 ⌘K 画布内联 AI 指令"
                        style={{
                            position: 'absolute',
                            top: '-10px',
                            right: '20px',
                            padding: '1px 6px',
                            borderRadius: '999px',
                            border: '1px solid rgba(99, 102, 241, 0.6)',
                            background: 'linear-gradient(135deg, #6366f1, #38bdf8)',
                            color: '#fff',
                            fontSize: '9px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            zIndex: 102,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        }}
                    >
                        ⌘K
                    </button>
                )}

                {/* 重试次数角标 */}
                {isRunning && retryCount > 0 && (
                    <div style={{
                        position: 'absolute',
                        bottom: '4px',
                        right: '4px',
                        background: 'var(--status-failed, #ef4444)',
                        color: '#fff',
                        borderRadius: '10px',
                        fontSize: '10px',
                        fontWeight: '700',
                        padding: '1px 6px',
                        zIndex: 10,
                        lineHeight: '1.4',
                        pointerEvents: 'none',
                    }}>
                        ×{retryCount}
                    </div>
                )}

                {/* 动态运行时角标 */}
                {isDynamicRuntime && (
                    <div style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: 'var(--color-accent)',
                        color: 'var(--color-on-accent, #fff)',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontWeight: '700',
                        padding: '1px 5px',
                        zIndex: 10,
                        pointerEvents: 'none',
                        opacity: 0.9,
                    }}>
                        动态
                    </div>
                )}

                <Handle type="target" position={targetPosition} style={{ background: '#fff' }} />
                <Handle type="source" position={sourcePosition} style={{ background: '#fff' }} />
            </div>
        </NodeWrapper>
    );
};

export default memo(TaskNode);
