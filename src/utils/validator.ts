import { WORKFLOW_RULES, TASK_RULES } from './validationRules';
import { WorkflowDef, TaskDef } from '../types/conductor';
import { ValidationItem, ValidationResults } from '../types/workflow';
import { ruleEngine } from '../services/ai/ruleEngine';
import { buildDataFlowGraph } from '../services/wlsp/workflowLsp';

interface ValidationContext {
    taskRefs: Set<string>;
    taskMap: Record<string, TaskDef>;
}

interface ValidationRule {
    field: string;
    type: string;
    value?: any;
    message: string;
    level?: 'error' | 'warning';
    validate?: (value: any, target: any, context: ValidationContext) => boolean;
}

/**
 * 获取嵌套对象的值
 */
const getValue = (obj: any, path: string): any => {
    return path.split('.').reduce((prev, curr) => (prev && prev[curr] !== undefined) ? prev[curr] : undefined, obj);
};

/**
 * 核心校验执行器
 */
const executeRules = (target: any, rules: ValidationRule[], context: ValidationContext, results: { errors: ValidationItem[]; warnings: ValidationItem[] }) => {
    const { errors, warnings } = results;
    const ref = target.taskReferenceName || 'GLOBAL';

    rules.forEach(rule => {
        const value = getValue(target, rule.field);
        let isValid = true;

        switch (rule.type) {
            case 'required':
                isValid = value !== undefined && value !== null && value !== '';
                break;
            case 'min_length':
                isValid = Array.isArray(value) && value.length >= rule.value;
                break;
            case 'pattern':
                isValid = rule.value.test(value);
                break;
            case 'enum':
                // E24：没填时只由 required 规则决定（可以是警告），enum 只检查填了的值
                isValid = value === undefined || value === null || value === '' || rule.value.includes(value);
                break;
            case 'unique':
                if (rule.field === 'taskReferenceName' && value) {
                    if (context.taskRefs.has(value)) {
                        isValid = false;
                    } else {
                        context.taskRefs.add(value);
                    }
                }
                break;
            case 'custom':
                if (typeof rule.validate === 'function') {
                    isValid = rule.validate(value, target, context);
                }
                break;
            default:
                break;
        }

        if (!isValid) {
            const errorObj: ValidationItem = { type: target.taskReferenceName ? 'TASK' : 'GLOBAL', ref, message: rule.message };
            if (rule.level === 'warning') {
                warnings.push(errorObj);
            } else {
                errors.push(errorObj);
            }
        }
    });
};

/**
 * 校验整个工作流定义
 */
export const validateWorkflow = (workflowDef: WorkflowDef | null): ValidationResults => {
    const errors: ValidationItem[] = [];
    const warnings: ValidationItem[] = [];
    const context: ValidationContext = {
        taskRefs: new Set(),
        taskMap: {}
    };

    if (!workflowDef) return { isValid: false, errors: [{ type: 'GLOBAL', ref: '', message: '工作流定义为空' }], warnings: [] };

    // 1. 工作流级别校验
    executeRules(workflowDef, WORKFLOW_RULES as unknown as ValidationRule[], context, { errors, warnings });

    // 如果任务列表为空，提前返回
    if (!workflowDef.tasks || workflowDef.tasks.length === 0) {
        return { isValid: false, errors, warnings };
    }

    // 全部引用名（结构性校验用）
    const allRefs = new Set<string>();
    const collectRefs = (list: TaskDef[] | undefined) => {
        (list || []).forEach(t => {
            if (!t) return;
            if (t.taskReferenceName) allRefs.add(t.taskReferenceName);
            if (t.decisionCases) Object.values(t.decisionCases).forEach(collectRefs);
            collectRefs(t.defaultCase);
            (t.forkTasks || []).forEach(collectRefs);
            collectRefs(t.loopOver);
        });
    };
    collectRefs(workflowDef.tasks);

    // 2. 递归校验任务
    const validateTasksRecursive = (tasks: TaskDef[]) => {
        tasks.forEach((task, index) => {
            if (!task) return;
            // 结构：FORK_JOIN / FORK_JOIN_DYNAMIC 后必须紧跟 JOIN（E21）
            if (task.type === 'FORK_JOIN' || task.type === 'FORK_JOIN_DYNAMIC') {
                const next = tasks[index + 1];
                if (!next || next.type !== 'JOIN') {
                    errors.push({
                        type: 'TASK',
                        ref: task.taskReferenceName,
                        message: `并行任务 "${task.taskReferenceName}" 后面必须紧跟一个 JOIN 任务：请在它之后添加 JOIN，或删除中间插入的任务`,
                    });
                }
            }
            // 结构：joinOn 只能引用存在的任务（E21）
            if (Array.isArray(task.joinOn)) {
                task.joinOn.forEach(ref => {
                    if (!allRefs.has(ref)) {
                        errors.push({
                            type: 'TASK',
                            ref: task.taskReferenceName,
                            message: `JOIN 任务 "${task.taskReferenceName}" 的 joinOn 引用了不存在的任务 "${ref}"：请删除该项或改成分支中实际的任务引用名`,
                        });
                    }
                });
            }

            // 执行通用规则
            executeRules(task, TASK_RULES.common as unknown as ValidationRule[], context, { errors, warnings });

            // 执行特定类型规则
            const typeRules = TASK_RULES.types[task.type as keyof typeof TASK_RULES.types];
            if (typeRules) {
                executeRules(task, typeRules as unknown as ValidationRule[], context, { errors, warnings });
            }

            // 递归处理嵌套结构
            if (task.decisionCases) {
                Object.keys(task.decisionCases).forEach(key => {
                    validateTasksRecursive(task.decisionCases![key]);
                });
            }
            if (task.defaultCase) {
                validateTasksRecursive(task.defaultCase);
            }
            if (task.forkTasks) {
                task.forkTasks.forEach(branch => validateTasksRecursive(branch));
            }
            if (task.loopOver) {
                validateTasksRecursive(task.loopOver);
            }
        });
    };

    validateTasksRecursive(workflowDef.tasks);

    // 2b. 表达式引用了不存在的任务（${x.output…}，E21）
    const seenUndefined = new Set<string>();
    buildDataFlowGraph(workflowDef).diagnostics.forEach(d => {
        if (d.issue !== 'undefined_ref') return;
        const key = `${d.taskRef}|${d.expression}`;
        if (seenUndefined.has(key)) return;
        seenUndefined.add(key);
        errors.push({
            type: 'TASK',
            ref: d.taskRef,
            message: `任务 "${d.taskRef}" 的表达式 ${d.expression} 引用了不存在的任务：请改成已有任务的引用名，或先添加该任务`,
        });
    });

    // 3. 结构性校验 (环路检测)
    const cycleErrors = detectCycles(workflowDef.tasks);
    errors.push(...cycleErrors);

    // 4. Custom rules from rule engine (injected by integrators)
    if (ruleEngine.hasRules()) {
        const custom = ruleEngine.runAll(workflowDef);
        errors.push(...custom.errors);
        warnings.push(...custom.warnings);
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
};

/**
 * 基于 DFS 的环路检测
 * 构建任务间的依赖图，检测是否存在非法环路（排除 DO_WHILE 合法循环）
 */
const detectCycles = (tasks: TaskDef[]): ValidationItem[] => {
    const errors: ValidationItem[] = [];

    // 构建邻接表：taskRef -> 后继 taskRef 列表
    const adjacency = new Map<string, string[]>();
    const allRefs = new Set<string>();

    const buildGraph = (taskList: TaskDef[]) => {
        for (let i = 0; i < taskList.length; i++) {
            const task = taskList[i];
            const ref = task.taskReferenceName;
            allRefs.add(ref);

            if (!adjacency.has(ref)) adjacency.set(ref, []);

            // 顺序连接：当前任务 -> 下一个任务
            if (i < taskList.length - 1) {
                const nextRef = taskList[i + 1].taskReferenceName;
                // FORK_JOIN 的后继由 JOIN 处理，跳过顺序连线
                if (task.type !== 'FORK_JOIN' && task.type !== 'FORK_JOIN_DYNAMIC') {
                    adjacency.get(ref)!.push(nextRef);
                }
            }

            // DECISION/SWITCH 分支
            if (task.decisionCases) {
                for (const branch of Object.values(task.decisionCases)) {
                    if (branch.length > 0) {
                        adjacency.get(ref)!.push(branch[0].taskReferenceName);
                        buildGraph(branch);
                    }
                }
            }
            if (task.defaultCase && task.defaultCase.length > 0) {
                adjacency.get(ref)!.push(task.defaultCase[0].taskReferenceName);
                buildGraph(task.defaultCase);
            }

            // FORK_JOIN 分支
            if (task.forkTasks) {
                for (const branch of task.forkTasks) {
                    if (branch.length > 0) {
                        adjacency.get(ref)!.push(branch[0].taskReferenceName);
                        buildGraph(branch);
                    }
                }
            }

            // DO_WHILE 内部任务不参与外部图的环路检测（合法循环）
            // 但仍需注册到 allRefs 中
            if (task.loopOver) {
                for (const loopTask of task.loopOver) {
                    allRefs.add(loopTask.taskReferenceName);
                }
            }

            // JOIN 的 joinOn 引用
            if (task.joinOn) {
                for (const sourceRef of task.joinOn) {
                    if (!adjacency.has(sourceRef)) adjacency.set(sourceRef, []);
                    adjacency.get(sourceRef)!.push(ref);
                }
            }
        }
    };

    buildGraph(tasks);

    // DFS 环路检测
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const ref of allRefs) color.set(ref, WHITE);

    const dfs = (node: string): boolean => {
        color.set(node, GRAY);
        const neighbors = adjacency.get(node) || [];
        for (const neighbor of neighbors) {
            if (!color.has(neighbor)) continue; // 节点不在图中，跳过
            if (color.get(neighbor) === GRAY) {
                errors.push({
                    type: 'GLOBAL',
                    ref: neighbor,
                    message: `检测到环路：任务 "${node}" → "${neighbor}" 形成了循环依赖`
                });
                return true;
            }
            if (color.get(neighbor) === WHITE) {
                if (dfs(neighbor)) return true;
            }
        }
        color.set(node, BLACK);
        return false;
    };

    for (const ref of allRefs) {
        if (color.get(ref) === WHITE) {
            dfs(ref);
        }
    }

    return errors;
};
