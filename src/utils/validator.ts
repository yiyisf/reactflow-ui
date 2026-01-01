import { WORKFLOW_RULES, TASK_RULES } from './validationRules';
import { WorkflowDef, TaskDef } from '../types/conductor';
import { ValidationItem, ValidationResults } from '../types/workflow';

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
                isValid = rule.value.includes(value);
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

    // 2. 递归校验任务
    const validateTasksRecursive = (tasks: TaskDef[]) => {
        tasks.forEach(task => {
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

    // 3. 结构性校验 (如环路检测)
    detectCycles();

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
};

/**
 * 环路检测 (占位空间，后续可实现拓扑排序)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const detectCycles = () => {
    // 基础环路逻辑...
};
