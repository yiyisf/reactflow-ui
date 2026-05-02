import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Plus } from 'lucide-react';

/**
 * 极简的 "+" 号引导节点，用于工作流末尾添加任务
 */
const PlusNode = ({ data }: NodeProps) => {
  const direction = data.layoutDirection || 'TB';
  const isLR = direction === 'LR';

  return (
    <div className="plus-node-container" style={{
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '50%',
      background: 'var(--bg-secondary, #1e293b)',
      border: '2px dashed var(--color-accent, #3b82f6)',
      color: 'var(--color-accent, #3b82f6)',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      padding: data.label && data.label !== '+' ? '0 12px' : '0',
      minWidth: data.label && data.label !== '+' ? '80px' : '32px',
      gap: '4px'
    }}>
      <Plus size={16} />
      {data.label && data.label !== '+' && (
        <span style={{ fontSize: '12px', fontWeight: 500 }}>{data.label}</span>
      )}
      
      <Handle
        type="target"
        position={isLR ? Position.Left : Position.Top}
        style={{ opacity: 0 }}
      />
      
      <style dangerouslySetInnerHTML={{ __html: `
        .plus-node-container:hover {
          transform: scale(1.1);
          background: var(--color-accent);
          color: #fff;
          border-style: solid;
          box-shadow: 0 0 10px var(--color-accent);
        }
      `}} />
    </div>
  );
};

export default memo(PlusNode);
