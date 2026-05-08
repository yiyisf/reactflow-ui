import { WorkflowDef, TaskDef } from '../types/conductor';

/**
 * AI Prompt Template System
 */

export const generateWorkflowSuggestionPrompt = (userRequest: string, currentWorkflow: WorkflowDef | null) => {
    const context = currentWorkflow
        ? `当前工作流（JSON）：\n${JSON.stringify({
            name: currentWorkflow.name,
            tasks: currentWorkflow.tasks.map(t => ({
                ref: t.taskReferenceName,
                type: t.type,
                name: t.name,
            })),
        }, null, 2)}`
        : '当前工作流：尚未定义。';

    return `
用户请求：${userRequest}

${context}

请用中文回答，简明说明你将做什么修改，并在回答末尾（如果有工作流变更）输出一个结构化 diff 块，格式如下：

\`\`\`diff-json
{
  "kind": "mod",
  "summary": "一句话描述变更",
  "rows": [
    { "kind": "add", "desc": "新增 xxx 任务" },
    { "kind": "mod", "desc": "修改 yyy 属性" }
  ],
  "patch": [
    { "op": "patchTask", "ref": "task_ref", "set": { "retryCount": 3 } }
  ]
}
\`\`\`

支持的 patch 操作：
- patchTask: { "op": "patchTask", "ref": "taskRef", "set": { ...fields } }
- insertAfter: { "op": "insertAfter", "after": "refA", "edgeTo": "refB", "task": {...} }
- insertBefore: { "op": "insertBefore", "before": "refA", "task": {...} }
- addTask: { "op": "addTask", "task": {...}, "extraEdges": [{...}] }
- removeTask: { "op": "removeTask", "ref": "taskRef" }

如果是全量生成新工作流，使用 kind="replace" 并在 diff-json 中加入 "payload": {...完整工作流JSON...}。
如果不涉及工作流变更（仅解释/回答），则不需要输出 diff-json 块。
`;
};

export const generateParameterHintPrompt = (task: TaskDef, workflow: WorkflowDef | null) => {
    return `
Context: I am configuring a Conductor task in a workflow.
Task Reference Name: ${task.taskReferenceName}
Task Type: ${task.type}

Full Workflow Structure for reference:
${JSON.stringify(workflow, null, 2)}

Requirement: Suggest 3 meaningful 'inputParameters' or JSONPath expressions for this task based on the workflow context.
Return the suggestions as a JSON array of objects with { label, value, description }.
`;
};
