/**
 * 把导入生成的动作作为步骤追加到流程末尾（纯函数，业务模式与专业模式共用）。
 * B2 向导的「从接口导入」也可直接复用。
 */

import type { ActionDefinition } from '../actions/types';
import { ActionRegistry } from '../actions/registry';
import type { TaskDef, WorkflowDef, WorkflowInputParam } from '../types/conductor';
import { parseWorkflowInputParams } from '../types/conductor';
import { compileStepToTaskDef } from '../stepmodel/compile';
import { createStepFromAction } from '../stepmodel/factory';

/** 没有当前流程时使用的空白骨架 */
export function blankImportWorkflow(name = 'imported_api_workflow'): WorkflowDef {
    return {
        name,
        description: '由接口导入生成',
        version: 1,
        schemaVersion: 2,
        tasks: [],
        inputParameters: [],
    };
}

function collectRefs(tasks: TaskDef[], out: Set<string>): void {
    for (const t of tasks) {
        if (t.taskReferenceName) out.add(t.taskReferenceName);
        for (const lane of t.forkTasks || []) collectRefs(lane, out);
        for (const list of Object.values(t.decisionCases || {})) collectRefs(list, out);
        if (t.defaultCase) collectRefs(t.defaultCase, out);
        if (t.loopOver) collectRefs(t.loopOver, out);
    }
}

/** 取出任务里引用的 `${workflow.input.xxx}` 的顶层入参名 */
export function collectWorkflowInputRefs(tasks: TaskDef[]): string[] {
    const names = new Set<string>();
    const text = JSON.stringify(tasks);
    for (const m of text.matchAll(/\$\{workflow\.input\.([A-Za-z_][\w-]*)/g)) names.add(m[1]);
    return Array.from(names);
}

/**
 * 为每个动作按默认值生成一个步骤并追加到 `def.tasks` 末尾；
 * 步骤引用的 `${workflow.input.xxx}`（敏感头占位、路径参数默认值等）会补进流程的入参声明。
 * 不修改入参，返回新的定义。
 */
export function appendImportedActions(def: WorkflowDef | null | undefined, actions: ActionDefinition[]): WorkflowDef {
    const base = def ?? blankImportWorkflow();
    const registry = new ActionRegistry(actions);
    const refs = new Set<string>();
    collectRefs(base.tasks || [], refs);

    const added: TaskDef[] = [];
    const startIndex = (base.tasks || []).length;
    actions.forEach((action, i) => {
        let step = createStepFromAction(action);
        while (refs.has(step.taskReferenceName)) step = createStepFromAction(action);
        refs.add(step.taskReferenceName);
        added.push(compileStepToTaskDef(step, startIndex + i, base.name, registry));
    });

    const existing = parseWorkflowInputParams(base.inputParameters as any[] | undefined).map((p) => p.name);
    const missing = collectWorkflowInputRefs(added).filter((n) => !existing.includes(n));
    let inputParameters = base.inputParameters;
    if (missing.length > 0) {
        if (Array.isArray(inputParameters) && inputParameters.length > 0 && typeof inputParameters[0] === 'string') {
            inputParameters = [...(inputParameters as string[]), ...missing];
        } else {
            const extra: WorkflowInputParam[] = missing.map((name) => ({ name, type: 'string', description: '接口导入引入的入参' }));
            inputParameters = [...((inputParameters as WorkflowInputParam[] | undefined) || []), ...extra];
        }
    }

    return { ...base, tasks: [...(base.tasks || []), ...added], ...(inputParameters ? { inputParameters } : {}) };
}
