/**
 * AI System Prompt — Conductor 工作流专家级 prompt 模板
 */

import { formatContextForPrompt, buildContext } from './contextEngine';
import { classifyIntent, getContextOptions } from './intentClassifier';
import type { Intent } from './intentClassifier';

const BASE_SYSTEM_PROMPT = `你是一位 Netflix Conductor 工作流建模专家 AI 助手。你的目标是帮助用户通过自然语言高效地设计和编辑 Conductor JSON 工作流。

## 核心规则
1. 使用提供的工具 (tools) 来操作工作流，**不要**在回复中直接输出 JSON 代码块。
2. 每个任务必须有唯一的 taskReferenceName（英文下划线风格，如 send_notification）。
3. 标准任务类型: SIMPLE, HTTP, SWITCH, FORK_JOIN, FORK_JOIN_DYNAMIC, DO_WHILE, SUB_WORKFLOW, EVENT, WAIT, HUMAN, INLINE, TERMINATE, SET_VARIABLE, KAFKA_PUBLISH, JSON_JQ_TRANSFORM, START_WORKFLOW, DYNAMIC, NOOP。
4. SWITCH 需要 caseValueParam 或 caseExpression + decisionCases。
5. FORK_JOIN 需要对应的 JOIN 任务（add_task 会自动处理）。
6. 回答用中文，简洁明了。先说明你要做什么，然后通过工具执行。
7. 对于解释性问题，直接用文本回答，不需要调用工具。

## 最佳实践
- HTTP 任务应设置合理的超时 (timeoutSeconds) 和重试 (retryCount)
- 关键路径上的任务建议设置 retryCount >= 2
- WAIT 任务需要 duration 或 until 参数
- 复杂流程考虑使用 SWITCH 分支和 FORK_JOIN 并行
- 使用 TERMINATE 任务明确标记异常终止路径`;

/**
 * 构建完整的 system prompt（基础 + 上下文 + 额外指令）
 */
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

    // 意图特化指令
    const intentHints = getIntentHints(intent);
    if (intentHints) {
        parts.push(`## 当前用户意图提示\n${intentHints}`);
    }

    if (extraPrompt) {
        parts.push(`## 补充上下文（来自集成方）\n${extraPrompt}`);
    }

    return parts.join('\n\n');
}

function getIntentHints(intent: Intent): string | null {
    switch (intent) {
        case 'CREATE':
            return '用户想创建新工作流。先用 create_workflow 创建空流程，再用 add_task 逐个添加任务。确保任务间的拓扑关系合理。';
        case 'ADD':
            return '用户想添加新任务。使用 add_task 工具，注意设置正确的 afterRef 确保插入位置正确。';
        case 'MODIFY':
            return '用户想修改现有任务。使用 modify_task 工具，只传入需要修改的字段。';
        case 'DELETE':
            return '用户想删除任务。使用 remove_task 工具。';
        case 'REFACTOR':
            return '用户想重构流程拓扑（如串行改并行）。可能需要组合使用 remove_task、add_task、add_fork_branch 等多个工具。';
        case 'EXPLAIN':
            return '用户在提问。直接用文本回答，不需要调用任何工具。';
        case 'DEBUG':
            return '用户在排查问题。先用 get_workflow_context 和 validate_workflow 获取信息，分析后给出诊断意见。';
        case 'OPTIMIZE':
            return '用户想优化流程。先分析当前拓扑，给出优化建议和具体方案。可以调用工具执行优化。';
        default:
            return null;
    }
}
