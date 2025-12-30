/**
 * Conductor 工作流生成器
 * 将 React Flow 的图结构还原为 Conductor JSON
 * 
 * 注意：由于我们在 store 中直接维护了 workflowDef，
 * 简单的结构修改可以直接操作 workflowDef 对象。
 */

export function findTaskByRef(tasks, refName) {
    for (const task of tasks || []) {
        if (task.taskReferenceName === refName) return task;

        // 递归查找分支
        if (task.decisionCases) {
            for (const caseKey of Object.keys(task.decisionCases)) {
                const found = findTaskByRef(task.decisionCases[caseKey], refName);
                if (found) return found;
            }
            if (task.defaultCase) {
                const found = findTaskByRef(task.defaultCase, refName);
                if (found) return found;
            }
        }

        if (task.forkTasks) {
            for (const branch of task.forkTasks) {
                const found = findTaskByRef(branch, refName);
                if (found) return found;
            }
        }

        if (task.loopOver) {
            const found = findTaskByRef(task.loopOver, refName);
            if (found) return found;
        }
    }
    return null;
}

/**
 * 在工作流定义中删除一个任务
 */
export function removeTaskFromDef(tasks, refName) {
    if (!tasks) return false;

    const index = tasks.findIndex(t => t.taskReferenceName === refName);
    if (index !== -1) {
        tasks.splice(index, 1);
        return true;
    }

    for (const task of tasks) {
        if (task.decisionCases) {
            for (const caseKey of Object.keys(task.decisionCases)) {
                if (removeTaskFromDef(task.decisionCases[caseKey], refName)) return true;
            }
            if (removeTaskFromDef(task.defaultCase, refName)) return true;
        }

        if (task.forkTasks) {
            for (const branch of task.forkTasks) {
                if (removeTaskFromDef(branch, refName)) return true;
            }
        }

        if (task.loopOver) {
            if (removeTaskFromDef(task.loopOver, refName)) return true;
        }
    }
    return false;
}

/**
 * 在指定的 sourceRef 之后插入一个新任务
 */
export function insertTaskAfter(tasks, sourceRef, newTask) {
    if (!tasks) return false;

    const index = tasks.findIndex(t => t.taskReferenceName === sourceRef);
    if (index !== -1) {
        tasks.splice(index + 1, 0, newTask);
        return true;
    }

    // 如果是 'start'，插入到顶层第一个
    if (sourceRef === 'start' && tasks === arguments[0]) {
        tasks.unshift(newTask);
        return true;
    }

    for (const task of tasks) {
        if (task.decisionCases) {
            for (const caseKey of Object.keys(task.decisionCases)) {
                if (insertTaskAfter(task.decisionCases[caseKey], sourceRef, newTask)) return true;
            }
            if (insertTaskAfter(task.defaultCase, sourceRef, newTask)) return true;
        }

        if (task.forkTasks) {
            for (const branch of task.forkTasks) {
                if (insertTaskAfter(branch, sourceRef, newTask)) return true;
            }
        }

        if (task.loopOver) {
            if (insertTaskAfter(task.loopOver, sourceRef, newTask)) return true;
        }
    }
    return false;
}

/**
 * 专门用于向分支（Decision Case 或 Fork Branch）的首部插入第一个任务
 */
export function insertFirstTaskIntoBranch(tasks, parentRef, branchInfo, newTask) {
    for (const task of tasks || []) {
        if (task.taskReferenceName === parentRef) {
            if (branchInfo.branchCase !== undefined) {
                // Decision 分支
                if (!task.decisionCases[branchInfo.branchCase]) task.decisionCases[branchInfo.branchCase] = [];
                task.decisionCases[branchInfo.branchCase].unshift(newTask);
                return true;
            } else if (branchInfo.forkIndex !== undefined) {
                // Fork 分支
                if (!task.forkTasks[branchInfo.forkIndex]) task.forkTasks[branchInfo.forkIndex] = [];
                task.forkTasks[branchInfo.forkIndex].unshift(newTask);
                return true;
            }
        }

        // 递归查找
        if (task.decisionCases) {
            for (const key of Object.keys(task.decisionCases)) {
                if (insertFirstTaskIntoBranch(task.decisionCases[key], parentRef, branchInfo, newTask)) return true;
            }
            if (insertFirstTaskIntoBranch(task.defaultCase, parentRef, branchInfo, newTask)) return true;
        }
        if (task.forkTasks) {
            for (const branch of task.forkTasks) {
                if (insertFirstTaskIntoBranch(branch, parentRef, branchInfo, newTask)) return true;
            }
        }
    }
    return false;
}
