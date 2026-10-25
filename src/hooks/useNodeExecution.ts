import useWorkflowStore from '../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';
import type { TaskExecutionData } from '../types/workflow';
import { countRetries, findEnclosingLoopRef, selectExecutionForIteration } from '../utils/executionImport';

/**
 * 获取节点的运行态信息（mode、executionData、retryCount），
 * 支持 DO_WHILE 循环迭代轮次切换与 Time-Travel 时间旅行状态投影。
 */
export const useNodeExecution = (taskReferenceName: string) => {
    const { mode, executionData, workflowDef, activeLoopIterations, timeTravelTimestamp } = useWorkflowStore(useShallow((s) => ({
            mode: s.mode,
            executionData: s.executionData,
            workflowDef: s.workflowDef,
            activeLoopIterations: s.activeLoopIterations,
            timeTravelTimestamp: s.timeTravelTimestamp,
        })));
    const rawExecution = mode === 'run' ? executionData?.[taskReferenceName] : null;
    const isRunning = mode === 'run';

    let execution: TaskExecutionData | null = rawExecution ? { ...rawExecution } : null;

    // 1. R3: apply only the iteration chosen for THIS node's enclosing DO_WHILE; within it, the last attempt wins.
    if (isRunning && execution && execution.attempts.length > 1 && workflowDef?.tasks) {
        const loopRef = findEnclosingLoopRef(workflowDef.tasks, taskReferenceName);
        execution = selectExecutionForIteration(execution, loopRef, activeLoopIterations);
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

    // R5: loop iterations are not retries. Show the retries of the shown iteration (or of the task outside loops).
    const shownIteration = execution?.iteration;
    const shownAttempts = execution
        ? (shownIteration !== undefined ? execution.attempts.filter(a => a.iteration === shownIteration) : execution.attempts)
        : [];
    const retryCount = countRetries(shownAttempts);

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
