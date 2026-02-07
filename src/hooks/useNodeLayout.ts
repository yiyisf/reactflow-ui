import { Position } from 'reactflow';
import { WorkflowNodeData } from '../types/workflow';

/**
 * 从节点数据中计算 Handle 的 source/target 位置
 */
export const useNodeLayout = (data: WorkflowNodeData) => {
    const layoutDirection = data.layoutDirection || 'TB';

    const sourcePosition = data.sourcePosition || (layoutDirection === 'LR' ? Position.Right : Position.Bottom);
    const targetPosition = data.targetPosition || (layoutDirection === 'LR' ? Position.Left : Position.Top);

    return { layoutDirection, sourcePosition, targetPosition };
};
