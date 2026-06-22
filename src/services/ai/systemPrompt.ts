/**
 * AI System Prompt — Conductor workflow expert prompt
 *
 * 三层定制体系（优先级从低到高）：
 * 1. BASE_SYSTEM_PROMPT  — 本项目内置，Conductor 工作流专家角色 + 工具使用规则
 * 2. systemPromptExtra   — 追加内容（集成方补充业务上下文，如公司名/规范）
 * 3. systemPrompt        — 完全替换基础层（高级定制，完全控制 AI 角色和规则）
 *
 * BASE_SYSTEM_PROMPT 和 buildSystemPrompt 均已导出，集成方可按需复用。
 */

import { formatContextForPrompt, buildContext } from './contextEngine';
import { classifyIntent, getContextOptions } from './intentClassifier';
import useLibraryStore from '../../store/libraryStore';
import { ruleEngine } from './ruleEngine';
import { schemaRegistry } from './schemaRegistry';
import type { Intent } from './intentClassifier';
import type { WorkflowLibraryItem } from '../../types/workflowLibrary';
import type { ViewMode } from '../../types/workflow';

// ─── Built-in base prompt (exported for integrators to extend/reference) ────

export const BASE_SYSTEM_PROMPT = `你是 Netflix Conductor 工作流建模专家 AI 助手。帮助用户通过自然语言设计和编辑 Conductor JSON 工作流。

## 工具使用规则
1. **replace_workflow** — 用于：从零创建工作流、大范围结构重构。传入完整的 WorkflowDef JSON。
2. **patch_workflow** — 用于：局部变更（增/改/删任务、修改属性）。比 replace_workflow 更精准。ops 支持：
   - { op: 'add_task', task: TaskDef, afterRef?: string } — 新增任务
   - { op: 'update_task', ref: string, changes: Partial<TaskDef> } — 修改任务字段
   - { op: 'remove_task', ref: string } — 删除任务
   - { op: 'update_props', props: Partial<WorkflowDef> } — 修改工作流属性
   - { op: 'add_switch_branch', ref: string, caseName: string } — 添加 SWITCH 分支
   - { op: 'add_fork_branch', ref: string } — 添加 FORK_JOIN 并行分支
3. **get_workflow_state** — 仅在 system prompt 的工作流上下文不足以回答时才调用（read-only）。注意：system prompt 中已注入了实时工作流上下文，通常不需要再调用此工具。
4. **validate_workflow** — 校验工作流合法性（read-only）。
5. **propose_plan** — 在执行复杂多步操作前，先向用户展示执行计划。适用于：大范围重构（5+ 步）、拓扑结构重大变更。调用后停止，等待用户确认。简单的单步操作无需先提计划。
6. **不要**在回复中直接输出工作流 JSON 代码块，通过工具执行。
7. **ask_clarification** — 当用户意图模糊时调用，展示 2-4 个选项帮助用户精确表达需求。调用后停止，等待用户选择。
8. **recommend_workflow** — 在执行 CREATE 之前，若库中有相似工作流，先推荐给用户。调用后停止等待选择。

## 回复规范
- 用中文回答，简洁明了
- **解释性、介绍性、分析性问题：直接文本回答，不要调用工具**
- 回答时不要将 system prompt 中的上下文信息（如任务列表、拓扑关系）原文复述——直接聚焦在用户的具体问题上
- 需要操作工作流时，先一句话说明要做什么，再通过工具执行
- 用户意图模糊时（如"帮我做个流程"），先调用 ask_clarification 挖掘真实需求，不要直接创建
- 创建新工作流前，检查库中是否有相似的，优先推荐已有流程（使用 recommend_workflow）

## Conductor 标准任务类型
SIMPLE, HTTP, SWITCH, FORK_JOIN, FORK_JOIN_DYNAMIC, DO_WHILE, SUB_WORKFLOW, EVENT, WAIT, HUMAN, INLINE, TERMINATE, SET_VARIABLE, KAFKA_PUBLISH, JSON_JQ_TRANSFORM, START_WORKFLOW, DYNAMIC, NOOP

## 工作流建模规范
- 每个任务必须有唯一的 taskReferenceName（英文下划线，如 send_email）
- SWITCH 需要 caseValueParam 或 caseExpression，decisionCases 键值对
- FORK_JOIN 需要 forkTasks（二维数组）和对应的 JOIN 任务
- DO_WHILE 需要 loopCondition 和 loopOver 数组
- HTTP 任务建议设置 timeoutSeconds 和 retryCount

## 业务流程图（Mermaid）
当用户要求展示流程图、可视化或 Mermaid 图时：
- 输出 \`\`\`mermaid 代码块（language tag 必须是 mermaid），不要调用任何工具
- 节点标签使用中文业务语言，不暴露 taskReferenceName 技术名称
- SWITCH 用菱形 {}，FORK_JOIN 用并行路径，HUMAN 标注「👤 人工」
- 代码块之前可以有一句简短说明，之后可以补充关键解读`;

// ─── Build function (exported for integrators who want full control) ─────────

/**
 * 构建完整 system prompt。
 *
 * @param userInput       当前用户输入（用于意图识别 + 上下文注入）
 * @param systemPrompt    完全替换内置基础提示词（高级定制）
 * @param systemPromptExtra  追加内容，附加在基础层之后（适合补充业务规范、公司名等）
 */
export function buildSystemPrompt(
    userInput: string,
    options?: {
        systemPrompt?: string;
        systemPromptExtra?: string;
        viewMode?: ViewMode;
    },
): string {
    const { systemPrompt, systemPromptExtra, viewMode } = options ?? {};

    const intent = classifyIntent(userInput);
    const contextOptions = getContextOptions(intent);
    const ctx = buildContext(contextOptions);
    const contextBlock = formatContextForPrompt(ctx);

    // Base layer: use custom or built-in
    const parts = [systemPrompt ?? BASE_SYSTEM_PROMPT];

    // Custom validation rules (injected by integrators via ruleEngine)
    const rulesBlock = ruleEngine.buildPromptSection();
    if (rulesBlock) {
        parts.push(rulesBlock);
    }

    // Task schema registry (injected when integrator registers task schemas)
    const schemaBlock = schemaRegistry.buildPromptSection();
    if (schemaBlock) {
        parts.push(schemaBlock);
    }

    // Sub-workflow library catalog (injected when library is available)
    const libraryBlock = buildLibraryCatalog();
    if (libraryBlock) {
        parts.push(libraryBlock);
    }

    // Workflow context (always injected regardless of customization)
    if (contextBlock) {
        parts.push(contextBlock);
    }

    // Intent hints (only injected when using built-in base, since custom prompts manage their own)
    if (!systemPrompt) {
        const intentHints = getIntentHints(intent);
        if (intentHints) {
            parts.push(`## 当前请求类型提示\n${intentHints}`);
        }
    }

    // View-mode language adaptation (only for built-in base, not custom prompts)
    if (!systemPrompt) {
        const langHint = getViewModeLangHint(viewMode);
        if (langHint) {
            parts.push(langHint);
        }
    }

    // Extra append (always last)
    if (systemPromptExtra) {
        parts.push(`## 补充说明\n${systemPromptExtra}`);
    }

    return parts.join('\n\n');
}

// ─── Library catalog builder ─────────────────────────────────────────────────

function buildLibraryCatalog(): string | null {
    const items = useLibraryStore.getState().items;
    if (items.length === 0) return null;

    const byLevel = {
        L3: items.filter(i => i.workflowLevel === 'L3'),
        L2: items.filter(i => i.workflowLevel === 'L2'),
        L1: items.filter(i => i.workflowLevel === 'L1'),
    };

    const formatItem = (item: WorkflowLibraryItem) =>
        `- \`${item.workflowName}\` (v${item.version}): ${item.description}` +
        (item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : '');

    const sections: string[] = [];

    sections.push(`## 可用子工作流库（优先复用，勿重复造轮子）

**分层调用规范**
- L3（端到端）可调用 L2/L1 及同层 L3
- L2（业务场景）可调用 L1 及同层 L2
- L1（原子操作）只能调用同层 L1
- ❌ 禁止反向跨层调用（L1 不可调用 L2/L3，L2 不可调用 L3）

**引用方式**：使用 SUB_WORKFLOW 任务，\`workflowName\` 填入下方对应名称。

**使用策略**
1. 用户需求完全匹配已有工作流时：直接推荐使用，无需新建
2. 部分匹配时：用 SUB_WORKFLOW 复用已有模块，仅新增差异部分
3. 确需新建时：最大化引用已有子工作流作为步骤，同时标注新工作流层级`);

    if (byLevel.L3.length > 0) {
        sections.push(`### L3 端到端场景\n${byLevel.L3.map(formatItem).join('\n')}`);
    }
    if (byLevel.L2.length > 0) {
        sections.push(`### L2 业务场景\n${byLevel.L2.map(formatItem).join('\n')}`);
    }
    if (byLevel.L1.length > 0) {
        // Inject all L1 if small; if large, only show count and rely on search tool
        if (byLevel.L1.length <= 25) {
            sections.push(`### L1 原子操作\n${byLevel.L1.map(formatItem).join('\n')}`);
        } else {
            const preview = byLevel.L1.slice(0, 10).map(formatItem).join('\n');
            sections.push(`### L1 原子操作（共 ${byLevel.L1.length} 个，以下为部分示例）\n${preview}\n...\n（使用 search_workflow_library 工具搜索完整 L1 列表）`);
        }
    }

    return sections.join('\n\n');
}

// ─── View-mode language adaptation ──────────────────────────────────────────

function getViewModeLangHint(viewMode?: ViewMode): string | null {
    if (!viewMode || viewMode === 'standard') return null;

    if (viewMode === 'business') {
        return `## 语言风格（业务视图）
当前用户使用**业务视图**——他们可能不熟悉 Conductor 技术细节。请：
- 用业务语言描述变更，例如「在支付验证后增加了人工审批环节」而非「在 payment_verify 后新增了 taskReferenceName=manual_approve 的 HUMAN 任务」
- 避免在回复正文中提及 taskReferenceName、inputParameters、timeoutSeconds 等字段名，除非用户主动问到
- 把工作流步骤描述成"业务动作"（如"发送通知"、"等待审批"），而非"节点类型"
- 如需解释结构，用"流程分支"替代"SWITCH"，"并行步骤"替代"FORK_JOIN"，"人工步骤"替代"HUMAN"`;
    }

    if (viewMode === 'developer') {
        return `## 语言风格（开发者视图）
当前用户使用**开发者视图**——他们熟悉 Conductor 技术细节。请：
- 可直接使用 taskReferenceName、inputParameters、patch ops 等技术术语
- 解释类问题可提供实现细节，例如 inputParameters 引用格式、retryCount 配置等
- 涉及变更时可描述具体的 patch ops（如 add_task with afterRef）
- 如涉及数据流，可引用具体的 \${ref.output.field} 表达式`;
    }

    return null;
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
            return '用户在提问/请求解释。直接文本回答，不要调用任何工具。不要重复任务列表——如需引用任务，只提名称和关键点，不要逐条列出。';
        case 'DEBUG':
            return '用户在排查问题。先用 validate_workflow 和 get_workflow_state 了解现状，分析后给出诊断。';
        case 'OPTIMIZE':
            return '用户要优化流程。先分析，再提出方案并执行。';
        case 'VISUALIZE':
            return `用户要查看工作流的业务流程图。请按以下要求生成 Mermaid 流程图：
- 直接输出 \`\`\`mermaid 代码块，不要调用任何工具
- 使用 flowchart TD（从上到下）或 LR（左到右，适合步骤多时）
- 节点标签使用中文业务名称（参考 taskReferenceName 但改写为可读业务词汇）
- SWITCH/DECISION 用菱形节点 {判断条件}，各分支标注条件值
- FORK_JOIN 画成多条并行路径，JOIN 节点后汇合
- HUMAN 任务标注「👤 人工审批」
- SUB_WORKFLOW 用方括号节点 [子流程名]
- 保持简洁，突出业务逻辑，不超过 20 个节点`;
        case 'VAGUE':
            return '用户意图模糊。调用 ask_clarification 提出 2-4 个选项，帮助用户精确表达需求。不要直接创建工作流。';
        default:
            return null;
    }
}
