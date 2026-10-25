import { TaskDef } from '../types/conductor';

/**
 * Conductor 工作流生成器助手函数
 * 用于操作工作流 JSON 定义
 */

/**
 * 根据 taskReferenceName 在任务列表中查找任务
 */
export function findTaskByRef(tasks: TaskDef[] | undefined, taskRef: string): TaskDef | null {
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
export function removeTaskFromDef(tasks: TaskDef[] | undefined, taskRef: string): boolean {
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
 * 递归搜索包含 taskRef 的平铺 tasks 层，返回该层列表
 */
export function findContainerList(
    tasks: TaskDef[] | undefined,
    taskRef: string
): TaskDef[] | null {
    if (!tasks) return null;
    if (tasks.some(t => t.taskReferenceName === taskRef)) return tasks;
    for (const task of tasks) {
        if (task.decisionCases) {
            for (const branch of Object.values(task.decisionCases)) {
                const found = findContainerList(branch, taskRef);
                if (found) return found;
            }
            const found = findContainerList(task.defaultCase, taskRef);
            if (found) return found;
        }
        if (task.forkTasks) {
            for (const branch of task.forkTasks) {
                const found = findContainerList(branch, taskRef);
                if (found) return found;
            }
        }
        if (task.loopOver) {
            const found = findContainerList(task.loopOver, taskRef);
            if (found) return found;
        }
    }
    return null;
}

/** 在同一 tasks 层中，找 forkRef 之后最近的 JOIN/EXCLUSIVE_JOIN */
export function findJoinForFork(tasks: TaskDef[], forkRef: string): string | null {
    const idx = tasks.findIndex(t => t.taskReferenceName === forkRef);
    if (idx < 0) return null;
    for (let i = idx + 1; i < tasks.length; i++) {
        if (tasks[i].type === 'JOIN' || tasks[i].type === 'EXCLUSIVE_JOIN') {
            return tasks[i].taskReferenceName;
        }
    }
    return null;
}

/** 在同一 tasks 层中，找 joinRef 之前最近的 FORK_JOIN/FORK_JOIN_DYNAMIC */
export function findForkForJoin(tasks: TaskDef[], joinRef: string): string | null {
    const idx = tasks.findIndex(t => t.taskReferenceName === joinRef);
    if (idx < 0) return null;
    for (let i = idx - 1; i >= 0; i--) {
        if (tasks[i].type === 'FORK_JOIN' || tasks[i].type === 'FORK_JOIN_DYNAMIC') {
            return tasks[i].taskReferenceName;
        }
    }
    return null;
}

/**
 * 在指定的 sourceRef 之后插入一个新任务
 */
export function insertTaskAfter(tasks: TaskDef[] | undefined, sourceRef: string, newTask: TaskDef): boolean {
    if (!tasks) return false;

    if (sourceRef === 'start') {
        tasks.unshift(newTask);
        return true;
    }

    const index = tasks.findIndex(t => t.taskReferenceName === sourceRef);
    if (index !== -1) {
        tasks.splice(index + 1, 0, newTask);
        return true;
    }

    // 递归查找
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
export function insertFirstTaskIntoBranch(tasks: TaskDef[] | undefined, parentRef: string, branchInfo: { branchCase?: string; forkIndex?: number }, newTask: TaskDef): boolean {
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
                if (!task.forkTasks) task.forkTasks = [];
                while (task.forkTasks.length <= branchInfo.forkIndex) task.forkTasks.push([]);
                if (!Array.isArray(task.forkTasks[branchInfo.forkIndex])) task.forkTasks[branchInfo.forkIndex] = [];
                task.forkTasks[branchInfo.forkIndex].unshift(newTask);
                return true;
            } else if ((branchInfo as any).isLoopAdd) {
                // Loop 内部添加
                if (!task.loopOver) task.loopOver = [];
                task.loopOver.unshift(newTask);
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
        if (task.loopOver) {
            if (insertFirstTaskIntoBranch(task.loopOver, parentRef, branchInfo, newTask)) return true;
        }
    }
    return false;
}

/** 收集任务树中所有 taskReferenceName */
export function collectTaskRefs(tasks: TaskDef[] | undefined, acc: Set<string> = new Set()): Set<string> {
    for (const task of tasks || []) {
        if (!task) continue;
        if (task.taskReferenceName) acc.add(task.taskReferenceName);
        if (task.decisionCases) Object.values(task.decisionCases).forEach(b => collectTaskRefs(b, acc));
        if (task.defaultCase) collectTaskRefs(task.defaultCase, acc);
        if (task.forkTasks) task.forkTasks.forEach(b => collectTaskRefs(b, acc));
        if (task.loopOver) collectTaskRefs(task.loopOver, acc);
    }
    return acc;
}

const branchLastRefs = (fork: TaskDef): Array<string | null> =>
    (fork.forkTasks || []).map(branch =>
        branch && branch.length > 0 ? branch[branch.length - 1].taskReferenceName : null
    );

/**
 * 同步 FORK_JOIN 与配套 JOIN 任务的 joinOn 字段（E5）
 *
 * - 不传 `previousTasks`（加载 / 导入）：只给缺失或为空的 joinOn 补齐"各分支最后一个任务"，已有 joinOn 原样保留。
 * - 传入 `previousTasks`（编辑操作前的任务树）：只更新被结构性编辑影响的那几项——
 *   分支最后一个任务变了就替换对应项、新增 / 原本为空的分支追加其末尾任务、分支变空或任务被删除则移除该项；
 *   用户原本没有 join 的分支保持不 join，其余条目（例如 join 分支中间的任务）不动。
 *   分支结构没有变化时 joinOn 完全不改写。
 */
export function syncForkJoinOn(tasks: TaskDef[] | undefined, previousTasks?: TaskDef[] | null): void {
    if (!tasks) return;
    const existingRefs = previousTasks ? collectTaskRefs(tasks) : null;
    syncForkJoinOnLevel(tasks, previousTasks ?? null, existingRefs);
}

function syncForkJoinOnLevel(tasks: TaskDef[], previousRoot: TaskDef[] | null, existingRefs: Set<string> | null): void {
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (!task) continue;

        if (task.type === 'FORK_JOIN' && i + 1 < tasks.length && tasks[i + 1]?.type === 'JOIN') {
            syncPair(task, tasks[i + 1], previousRoot, existingRefs);
        }

        // 递归同步嵌套结构
        if (task.decisionCases) {
            Object.values(task.decisionCases).forEach(branchTasks => branchTasks && syncForkJoinOnLevel(branchTasks, previousRoot, existingRefs));
        }
        if (task.defaultCase) syncForkJoinOnLevel(task.defaultCase, previousRoot, existingRefs);
        if (task.forkTasks) {
            task.forkTasks.forEach(branchTasks => branchTasks && syncForkJoinOnLevel(branchTasks, previousRoot, existingRefs));
        }
        if (task.loopOver) syncForkJoinOnLevel(task.loopOver, previousRoot, existingRefs);
    }
}

function syncPair(fork: TaskDef, join: TaskDef, previousRoot: TaskDef[] | null, existingRefs: Set<string> | null): void {
    const nextLast = branchLastRefs(fork);
    const current = Array.isArray(join.joinOn) ? join.joinOn : [];

    // 加载模式：只补齐缺失的 joinOn
    if (!previousRoot) {
        if (current.length === 0) join.joinOn = nextLast.filter((r): r is string => !!r);
        return;
    }

    const prevFork = findTaskByRef(previousRoot, fork.taskReferenceName);
    if (!prevFork || prevFork.type !== 'FORK_JOIN') {
        // 本次操作新建的 FORK：默认等待所有非空分支
        if (current.length === 0) join.joinOn = nextLast.filter((r): r is string => !!r);
        return;
    }

    const prevLast = branchLastRefs(prevFork);
    const unchanged = prevLast.length === nextLast.length && prevLast.every((r, idx) => r === nextLast[idx]);
    if (unchanged) return;

    const result: string[] = [];
    const push = (ref: string | null) => {
        if (ref && !result.includes(ref)) result.push(ref);
    };

    for (const entry of current) {
        const branchIdx = prevLast.indexOf(entry);
        if (branchIdx >= 0) {
            // 原来 join 在某分支末尾：跟随该分支新的末尾（分支变空 / 被删则去掉）
            push(branchIdx < nextLast.length ? nextLast[branchIdx] : null);
        } else if (!existingRefs || existingRefs.has(entry)) {
            // 用户自定义的条目（如分支中间的任务），只要任务还在就保留
            push(entry);
        }
    }

    // 新增分支，或原本为空的分支有了第一个任务：追加其末尾任务
    nextLast.forEach((ref, idx) => {
        const prev = idx < prevLast.length ? prevLast[idx] : null;
        if (ref && prev === null) push(ref);
    });

    join.joinOn = result;
}

/**
 * 迁移旧版本编辑器写在 WorkflowTask 顶层、Conductor 实际从 inputParameters 读取的字段（E2 / E20）。
 * 只在 inputParameters 中没有同名键时迁移，原地修改。
 */
export function normalizeLegacyTaskFields(tasks: TaskDef[] | undefined): void {
    for (const task of tasks || []) {
        if (!task) continue;
        const t = task as TaskDef & Record<string, any>;
        const moveToInput = (key: string) => {
            if (t[key] === undefined) return;
            const inputs = (t.inputParameters && typeof t.inputParameters === 'object') ? t.inputParameters : {};
            if (inputs[key] === undefined) inputs[key] = t[key];
            t.inputParameters = inputs;
            delete t[key];
        };
        if (t.type === 'INLINE') moveToInput('evaluatorType');
        if (t.type === 'FORK_JOIN_DYNAMIC') {
            ['forkTaskName', 'forkTaskType', 'forkTaskWorkflow', 'forkTaskWorkflowVersion', 'forkTaskInputs'].forEach(moveToInput);
        }
        if (t.decisionCases) Object.values(t.decisionCases).forEach(b => normalizeLegacyTaskFields(b));
        if (t.defaultCase) normalizeLegacyTaskFields(t.defaultCase);
        if (t.forkTasks) t.forkTasks.forEach(b => normalizeLegacyTaskFields(b));
        if (t.loopOver) normalizeLegacyTaskFields(t.loopOver);
    }
}

/** 找到 FORK_JOIN / FORK_JOIN_DYNAMIC 在同层紧随其后的配对 JOIN 引用名（E8） */
export function findPairedJoinRef(tasks: TaskDef[] | undefined, forkRef: string): string | null {
    const container = findContainerList(tasks, forkRef);
    if (!container) return null;
    return findJoinForFork(container, forkRef);
}
