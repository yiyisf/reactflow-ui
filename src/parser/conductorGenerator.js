/**
 * Conductor 工作流生成器助手函数
 * 用于操作工作流 JSON 定义
 */

/**
 * 根据 taskReferenceName 在任务列表中查找任务
 */
export function findTaskByRef(tasks, taskRef) {
    if (!tasks) return null;
    for (const task of tasks) {
        if (task.taskReferenceName === taskRef) return task;

        // 递归查找嵌套任务
        if (task.decisionCases) {
            for (const caseKey of Object.keys(task.decisionCases)) {
                const found = findTaskByRef(task.decisionCases[caseKey], taskRef);
                if (found) return found;
            }
            const foundDefault = findTaskByRef(task.defaultCase, taskRef);
            if (foundDefault) return foundDefault;
        }

        if (task.forkTasks) {
            for (const branch of task.forkTasks) {
                const found = findTaskByRef(branch, taskRef);
                if (found) return found;
            }
        }

        if (task.loopOver) {
            const found = findTaskByRef(task.loopOver, taskRef);
            if (found) return found;
        }
    }
    return null;
}

/**
 * 从任务列表中删除指定任务
 */
export function removeTaskFromDef(tasks, taskRef) {
    if (!tasks) return false;

    const index = tasks.findIndex(t => t.taskReferenceName === taskRef);
    if (index !== -1) {
        tasks.splice(index, 1);
        return true;
    }

    for (const task of tasks) {
        if (task.decisionCases) {
            for (const caseKey of Object.keys(task.decisionCases)) {
                if (removeTaskFromDef(task.decisionCases[caseKey], taskRef)) return true;
            }
            if (removeTaskFromDef(task.defaultCase, taskRef)) return true;
        }

        if (task.forkTasks) {
            for (const branch of task.forkTasks) {
                if (removeTaskFromDef(branch, taskRef)) return true;
            }
        }

        if (task.loopOver) {
            if (removeTaskFromDef(task.loopOver, taskRef)) return true;
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
            if (branchInfo.branchCase === 'default') {
                // Default 分支
                if (!task.defaultCase) task.defaultCase = [];
                task.defaultCase.unshift(newTask);
                return true;
            } else if (branchInfo.branchCase !== undefined) {
                // Decision 分支
                if (!task.decisionCases) task.decisionCases = {};
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

/**
 * 同步 FORK_JOIN 与配套 JOIN 任务的 joinOn 字段
 */
export function syncForkJoinOn(tasks) {
    if (!tasks) return;

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];

        if (task.type === 'FORK_JOIN' && i + 1 < tasks.length) {
            const nextTask = tasks[i + 1];
            if (nextTask.type === 'JOIN') {
                const joinOn = [];
                (task.forkTasks || []).forEach(branch => {
                    if (branch && branch.length > 0) {
                        joinOn.push(branch[branch.length - 1].taskReferenceName);
                    }
                });
                nextTask.joinOn = joinOn;
            }
        }

        // 递归同步嵌套结构
        if (task.decisionCases) {
            Object.values(task.decisionCases).forEach(branchTasks => syncForkJoinOn(branchTasks));
            if (task.defaultCase) syncForkJoinOn(task.defaultCase);
        }
        if (task.forkTasks) {
            task.forkTasks.forEach(branchTasks => syncForkJoinOn(branchTasks));
        }
        if (task.loopOver) {
            syncForkJoinOn(task.loopOver);
        }
    }
}
