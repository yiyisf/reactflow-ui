import useWorkflowStore from '../store/workflowStore';

/**
 * 获取节点的运行态信息（mode、executionData、retryCount）
 */
export const useNodeExecution = (taskReferenceName: string) => {
    const { mode, executionData } = useWorkflowStore();
    const execution = mode === 'run' ? executionData?.[taskReferenceName] : null;
    const isRunning = mode === 'run';

    // 如果 attempts 中存在 iteration > 1 的条目，说明是 DO_WHILE 迭代，不是重试
    const hasLoopIterations = execution?.attempts.some(a => a.iteration !== undefined && a.iteration > 1) ?? false;
    const lastAttempt = execution?.attempts[execution.attempts.length - 1];
    const retryCount = hasLoopIterations ? 0 : (lastAttempt?.retryCount ?? 0);

    return { mode, execution, isRunning, retryCount };
};
