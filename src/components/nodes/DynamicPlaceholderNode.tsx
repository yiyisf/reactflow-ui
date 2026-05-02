import { memo } from 'react';
import { Handle, NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';
import { WorkflowNodeData } from '../../types/workflow';
import { useNodeLayout } from '../../hooks/useNodeLayout';

type DynamicPlaceholderNodeProps = NodeProps<WorkflowNodeData>;

const DynamicPlaceholderNode = ({ data }: DynamicPlaceholderNodeProps) => {
    const { sourcePosition, targetPosition } = useNodeLayout(data);

    return (
        <div
            style={{
                width: '220px',
                height: '70px',
                border: '2px dashed var(--color-accent)',
                borderRadius: '8px',
                background: 'var(--bg-secondary)',
                opacity: 0.75,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                cursor: 'default',
                userSelect: 'none',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <GitBranch size={14} style={{ color: 'var(--color-accent)' }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-accent)' }}>
                    动态分支
                </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                运行时生成
            </span>

            <Handle
                type="target"
                position={targetPosition}
                style={{ background: 'var(--color-accent)', width: 8, height: 8 }}
            />
            <Handle
                type="source"
                position={sourcePosition}
                style={{ background: 'var(--color-accent)', width: 8, height: 8 }}
            />
        </div>
    );
};

export default memo(DynamicPlaceholderNode);
