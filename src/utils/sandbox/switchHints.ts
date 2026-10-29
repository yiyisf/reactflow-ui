import type { TaskDef } from '../../types/conductor';

export interface SwitchRoutingHint {
    switchRef: string;
    switchName: string;
    /** `workflow.input` 字段名：判断取值直接来自这个入参时，改入参就能切换分支 */
    inputField: string | null;
    /** 判断方式：按入参取值，或按脚本（只能在配置台强制指定分支） */
    evaluator: 'value-param' | 'javascript';
    cases: string[];
}

/**
 * S14：沙箱配置台的「条件分支快速路由」提示，按引擎选择分支的同一套规则识别判断依据：
 * - SWITCH value-param：`expression` 是参数名，取值在 `inputParameters[expression]`（兼容旧写法 `caseValueParam`）
 * - DECISION：`caseValueParam` 是参数名；有 `caseExpression` 时按脚本判断
 * - javascript / graaljs：按脚本判断，没有可直接切换的入参
 */
export function getSwitchRoutingHint(task: TaskDef): SwitchRoutingHint | null {
    if (task.type !== 'SWITCH' && task.type !== 'DECISION') return null;
    const cases = Object.keys(task.decisionCases || {});
    if (cases.length === 0) return null;
    const isDecision = task.type === 'DECISION';
    const evaluatorType = isDecision ? (task.caseExpression ? 'javascript' : 'value-param') : task.evaluatorType || 'value-param';
    const base = { switchRef: task.taskReferenceName, switchName: task.name || task.taskReferenceName, cases };
    if (evaluatorType !== 'value-param') return { ...base, inputField: null, evaluator: 'javascript' };
    const param = isDecision ? task.caseValueParam : task.expression || task.caseValueParam;
    const raw = param ? task.inputParameters?.[param] : undefined;
    const match = typeof raw === 'string' ? raw.match(/^\s*\$\{\s*workflow\.input\.([a-zA-Z0-9_]+)\s*\}\s*$/) : null;
    return { ...base, inputField: match ? match[1] : null, evaluator: 'value-param' };
}
