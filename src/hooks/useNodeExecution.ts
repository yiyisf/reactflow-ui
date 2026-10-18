import useWorkflowStore from '../store/workflowStore';
import type { TaskExecutionData, ExecutionStatus } from '../types/workflow';

/**
 * 获取节点的运行态信息（mode、executionData、retryCount），
 * 支持 DO_WHILE 循环迭代轮次切换与 Time-Travel 时间旅行状态投影。
 */
export const useNodeExecution = (taskReferenceName: string) => {
    const {
        mode,
        executionData,
        workflowDef,
        activeLoopIterations,
        timeTravelTimestamp,
    } = useWorkflowStore();
    const rawExecution = mode === 'run' ? executionData?.[taskReferenceName] : null;
    const isRunning = mode === 'run';

    let execution: TaskExecutionData | null = rawExecution ? { ...rawExecution } : null;

    // 1. Check if this task belongs to a DO_WHILE loop with an active iteration selected
    if (isRunning && execution && execution.attempts.length > 1 && workflowDef?.tasks) {
        let selectedIter = 0;
        for (const [loopRef, iterNum] of Object.entries(activeLoopIterations)) {
            if (!iterNum) continue;
            const loopExec = executionData?.[loopRef];
            if (loopExec || execution.attempts.some(a => a.iteration === iterNum)) {
                selectedIter = iterNum;
                break;
            }
        }
        if (selectedIter > 0) {
            const matchedAttempt =
                execution.attempts.find(a => a.iteration === selectedIter) ||
                execution.attempts[selectedIter - 1];
            if (matchedAttempt) {
                execution = {
                    ...execution,
                    status: matchedAttempt.status as ExecutionStatus,
                    startTime: matchedAttempt.startTime,
                    endTime: matchedAttempt.endTime,
                    input: matchedAttempt.inputData,
                    output: matchedAttempt.outputData,
                    iteration: matchedAttempt.iteration ?? selectedIter,
                };
            }
        }
    }

    // 2. Project node status at timeTravelTimestamp if Time-Travel scrubber is active
    if (isRunning && execution && timeTravelTimestamp !== null) {
        const start = execution.startTime ?? 0;
        const end = execution.endTime ?? start;
        if (start > timeTravelTimestamp) {
            execution = {
                ...execution,
                status: 'SCHEDULED',
            };
        } else if (start <= timeTravelTimestamp && end > timeTravelTimestamp) {
            execution = {
                ...execution,
                status: 'IN_PROGRESS',
            };
        }
    }

    // 如果 attempts 中存在 iteration > 1 的条目，说明是 DO_WHILE 迭代，不是重试
    const hasLoopIterations =
        execution?.attempts.some(a => a.iteration !== undefined && a.iteration > 1) ?? false;
    const lastAttempt = execution?.attempts[execution.attempts.length - 1];
    const retryCount = hasLoopIterations ? 0 : (lastAttempt?.retryCount ?? 0);

    let durationText: string | undefined;
    if (isRunning && execution?.startTime) {
        if (timeTravelTimestamp !== null && execution.startTime > timeTravelTimestamp) {
            durationText = '待执行';
        } else if (
            timeTravelTimestamp !== null &&
            execution.startTime <= timeTravelTimestamp &&
            (execution.endTime ?? execution.startTime) > timeTravelTimestamp
        ) {
            durationText = `${timeTravelTimestamp - execution.startTime}ms...`;
        } else if (execution.endTime && execution.endTime >= execution.startTime) {
            const ms = execution.endTime - execution.startTime;
            durationText = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
        } else if (execution.status === 'IN_PROGRESS' || execution.status === 'SCHEDULED') {
            durationText = '运行中';
        }
    }

    return { mode, execution, isRunning, retryCount, durationText };
};
