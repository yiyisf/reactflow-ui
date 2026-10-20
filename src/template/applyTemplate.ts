import type { WorkflowDef } from '../types/conductor';
import type { WorkflowTemplate } from './types';

/**
 * 深入对象路径进行赋值（支持 tasks[0].inputParameters.foo 格式）
 */
function setByPath(obj: any, path: string, value: any): void {
  if (!obj || !path) return;

  // 将 tasks[0].inputParameters 统一标准化为 tokens: ['tasks', '0', 'inputParameters']
  const tokens = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

  let cur = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (cur[token] === undefined || cur[token] === null) {
      // 下一个是数字则初始化为数组，否则为对象
      const nextToken = tokens[i + 1];
      cur[token] = /^\d+$/.test(nextToken) ? [] : {};
    }
    cur = cur[token];
  }

  const lastToken = tokens[tokens.length - 1];
  cur[lastToken] = value;
}

/**
 * 将用户在向导中填写的变量值注入到模板的 Conductor WorkflowDef 骨架中
 *
 * @param template 选中的工作流模板
 * @param variableValues 用户填写的变量键值对
 * @returns 注入参数后的完整 WorkflowDef
 */
export function applyTemplateVariables(
  template: WorkflowTemplate,
  variableValues: Record<string, any>
): WorkflowDef {
  const resultDef: WorkflowDef = structuredClone(template.definition);

  for (const v of template.variables) {
    const userVal = variableValues[v.key] ?? v.defaultValue;
    if (userVal !== undefined) {
      for (const bindingPath of v.bindings) {
        setByPath(resultDef, bindingPath, userVal);
      }
    }
  }

  return resultDef;
}
