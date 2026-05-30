/**
 * AI System Prompt — Conductor workflow expert prompt
 */

import { formatContextForPrompt, buildContext } from './contextEngine';
import { classifyIntent, getContextOptions } from './intentClassifier';
import type { Intent } from './intentClassifier';

const BASE_SYSTEM_PROMPT = `你是 Netflix Conductor 工作流建模专家 AI 助手。帮助用户通过自然语言设计和编辑 Conductor JSON 工作流。

## 工具使用规则
1. **replace_workflow** — 用于：从零创建工作流、大范围结构重构。传入完整的 WorkflowDef JSON。
2. **patch_workflow** — 用于：局部变更（增/改/删任务、修改属性）。比 replace_workflow 更精准。ops 支持：
   - { op: 'add_task', task: TaskDef, afterRef?: string } — 新增任务
   - { op: 'update_task', ref: string, changes: Partial<TaskDef> } — 修改任务字段
   - { op: 'remove_task', ref: string } — 删除任务
   - { op: 'update_props', props: Partial<WorkflowDef> } — 修改工作流属性
   - { op: 'add_switch_branch', ref: string, caseName: string } — 添加 SWITCH 分支
   - { op: 'add_fork_branch', ref: string } — 添加 FORK_JOIN 并行分支
3. **get_workflow_state** — 在需要了解当前工作流内容时调用（read-only）。
4. **validate_workflow** — 校验工作流合法性（read-only）。
5. **不要**在回复中直接输出工作流 JSON 代码块，通过工具执行。

## Conductor 标准任务类型
SIMPLE, HTTP, SWITCH, FORK_JOIN, FORK_JOIN_DYNAMIC, DO_WHILE, SUB_WORKFLOW, EVENT, WAIT, HUMAN, INLINE, TERMINATE, SET_VARIABLE, KAFKA_PUBLISH, JSON_JQ_TRANSFORM, START_WORKFLOW, DYNAMIC, NOOP

## 必须遵守的规范
- 每个任务必须有唯一的 taskReferenceName（英文下划线，如 send_email）
- SWITCH 需要 caseValueParam 或 caseExpression，decisionCases 键值对
- FORK_JOIN 需要 forkTasks（二维数组）和对应的 JOIN 任务
- DO_WHILE 需要 loopCondition 和 loopOver 数组
- HTTP 任务建议设置 timeoutSeconds 和 retryCount
- 用中文回答，简洁明了，先说明要做什么，再通过工具执行
- 纯解释性问题直接文本回复，不需要调用工具`;

export function buildSystemPrompt(
    userInput: string,
    extraPrompt?: string,
): string {
    const intent = classifyIntent(userInput);
    const contextOptions = getContextOptions(intent);
    const ctx = buildContext(contextOptions);
    const contextBlock = formatContextForPrompt(ctx);

    const parts = [BASE_SYSTEM_PROMPT];

    if (contextBlock) {
        parts.push(contextBlock);
    }

    const intentHints = getIntentHints(intent);
    if (intentHints) {
        parts.push(`## 当前请求类型提示\n${intentHints}`);
    }

    if (extraPrompt) {
        parts.push(`## 额外上下文\n${extraPrompt}`);
    }

    return parts.join('\n\n');
}

function getIntentHints(intent: Intent): string | null {
    switch (intent) {
        case 'CREATE':
            return '用户要创建新工作流。使用 replace_workflow 生成完整 WorkflowDef JSON。确保任务结构完整、taskReferenceName 唯一。';
        case 'ADD':
            return '用户要添加任务。优先用 patch_workflow + add_task，指定正确的 afterRef。';
        case 'MODIFY':
            return '用户要修改现有任务。用 patch_workflow + update_task，只传需要变更的字段。';
        case 'DELETE':
            return '用户要删除任务。用 patch_workflow + remove_task。';
        case 'REFACTOR':
            return '用户要重构拓扑。先用 get_workflow_state 了解现状，然后根据变更幅度选择 replace_workflow（大改）或多个 patch_workflow ops（小改）。';
        case 'EXPLAIN':
            return '用户在提问。直接文本回答，不要调用工具。';
        case 'DEBUG':
            return '用户在排查问题。先用 validate_workflow 和 get_workflow_state 了解现状，分析后给出诊断。';
        case 'OPTIMIZE':
            return '用户要优化流程。先分析，再提出方案并执行。';
        default:
            return null;
    }
}
