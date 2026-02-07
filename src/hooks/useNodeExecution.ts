import useWorkflowStore from '../store/workflowStore';

/**
 * 获取节点的运行态信息（mode 和 executionData）
 */
export const useNodeExecution = (taskReferenceName: string) => {
    const { mode, executionData } = useWorkflowStore();
    const execution = mode === 'run' ? executionData?.[taskReferenceName] : null;
    const isRunning = mode === 'run';

    return { mode, execution, isRunning };
};
