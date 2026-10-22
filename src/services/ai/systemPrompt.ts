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
import type { WorkflowSnapshot } from './contextEngine';
import { classifyIntent, getContextOptions } from './intentClassifier';
import { ruleEngine } from './ruleEngine';
import { schemaRegistry } from './schemaRegistry';
import type { Intent } from './intentClassifier';
import type { WorkflowLibraryItem } from '../../types/workflowLibrary';
import type { ViewMode } from '../../types/workflow';

// ─── Built-in base prompt (exported for integrators to extend/reference) ────

export const BASE_SYSTEM_PROMPT = `你是 Netflix Conductor 工作流建模专家 AI 助手。帮助用户通过自然语言设计和编辑高可靠性的 Conductor JSON 工作流。

## 核心工作流生成策略（自适应复杂度路由）

### 策略 A：四阶段渐进式构建策略（适用于：从零创建工作流、3+ 节点流程、含分支/并行/循环或大范围重构）
为了保证高准确性、数据流一致性与配置完整度，**请严格按以下 4 个阶段依次调用工具演进构建**（可在一次或连续多步工具调用中完成）：
1. **阶段 1 — 定义工作流蓝图 (\`init_workflow_blueprint\`)**：
   - 定义工作流 \`name\`（英文下划线）、中文 \`description\`、\`timeoutPolicy\`、\`timeoutSeconds\` 及工作流级 \`inputParameters\` 契约（如 \`["orderId", "userId", "amount"]\`）。
2. **阶段 2 — 设计整体任务编排拓扑 (\`scaffold_workflow_topology\`)**：
   - 专注整体任务编排逻辑与控制流（顺序、\`SWITCH\` 条件分支 \`decisionCases\`/\`defaultCase\`、\`FORK_JOIN\` 并行 \`forkTasks\` 与配对的 \`JOIN\` \`joinOn\`、\`DO_WHILE\` 循环 \`loopOver\`/\`loopCondition\`）。
   - 确保每个任务的 \`taskReferenceName\` 唯一、命名规范且拓扑闭环。
3. **阶段 3 — 逐项/分批补充任务配置与数据流 (\`configure_workflow_tasks\`)**：
   - 为各任务补充详细的 \`inputParameters\`（严格对齐上下游数据流：\`\${workflow.input.xxx}\` 或 \`\${upstream_ref.output.yyy}\`）、HTTP 请求配置（\`httpRequest\`）、子工作流配置（\`subWorkflowParam\`）、超时（\`timeoutSeconds\`）与重试策略（\`retryCount\` / \`retryLogic\`），以及工作流 \`outputParameters\`。
4. **阶段 4 — 整体验证配置并提交 (\`commit_workflow_proposal\`)**：
   - 触发全量结构、控制流与数据流引用校验。若校验报告指出引用错误或配置缺失，请用 \`configure_workflow_tasks\` 修正后再调用 \`commit_workflow_proposal\`。

### 策略 B：轻量单步修改策略（适用于：局部增/改/删单个任务或修改属性）
- **patch_workflow** — 用于局部精准修改。ops 支持：
  - \`{ op: 'add_task', task: TaskDef, afterRef?: string, parentRef?: string, branchName?: string }\` — 新增任务（支持通过 \`afterRef\` 插入到任意顶层/嵌套任务之后，或通过 \`parentRef\` + \`branchName\` 插入到 SWITCH/FORK_JOIN/DO_WHILE 内部）
  - \`{ op: 'update_task', ref: string, changes: Partial<TaskDef> }\` — 修改任务字段
  - \`{ op: 'remove_task', ref: string }\` — 删除任务
  - \`{ op: 'update_props', props: Partial<WorkflowDef> }\` — 修改工作流属性
  - \`{ op: 'add_switch_branch', ref: string, caseName: string }\` — 添加 SWITCH 分支
  - \`{ op: 'add_fork_branch', ref: string }\` — 添加 FORK_JOIN 并行分支
- **replace_workflow** — 仅用于 1-2 个节点的极简流程快速替换。

### 辅助与交互工具
- **get_workflow_state** — 仅在 system prompt 的工作流上下文不足以回答时才调用（read-only）。
- **validate_workflow** — 校验当前工作流或草稿的合法性与数据流完整性（read-only）。
- **propose_plan** — 在执行超大规模破坏性重构前，可先向用户展示计划并等待确认。
- **ask_clarification** — 当用户意图模糊时调用，展示 2-4 个选项帮助用户精确表达需求。调用后停止，等待用户选择。
- **recommend_workflow** — 在执行 CREATE 之前，若库中有相似工作流，先推荐给用户。调用后停止等待选择。
- **不要**在回复正文中直接输出工作流 JSON 代码块，所有变更必须通过工具执行。

## 回复规范
- 用中文回答，简洁明了
- **解释性、介绍性、分析性问题：直接文本回答，不要调用工具**
- 回答时不要将 system prompt 中的上下文信息（如任务列表、拓扑关系）原文复述——直接聚焦在用户的具体问题上
- 需要操作工作流时，先简短说明设计思路，再通过工具执行
- 用户意图模糊时（如"帮我做个流程"），先调用 ask_clarification 挖掘真实需求，不要直接创建
- 创建新工作流前，检查库中是否有相似的，优先推荐已有流程（使用 recommend_workflow）

## Conductor 标准任务类型与建模规范
- 支持类型：SIMPLE, HTTP, SWITCH, FORK_JOIN, FORK_JOIN_DYNAMIC, DO_WHILE, SUB_WORKFLOW, EVENT, WAIT, HUMAN, INLINE, TERMINATE, SET_VARIABLE, KAFKA_PUBLISH, JSON_JQ_TRANSFORM, START_WORKFLOW, DYNAMIC, NOOP
- 每个任务必须有唯一的 \`taskReferenceName\`（仅限英文、数字、下划线，如 \`verify_payment\`）
- 下游任务通过 \`\${upstream_ref.output.field}\` 引用上游输出，严禁引用尚未执行的下游任务
- SWITCH 需要 \`caseValueParam\` 或 \`caseExpression\`，以及 \`decisionCases\` 键值对
- FORK_JOIN 需要 \`forkTasks\`（二维数组）和紧随其后的 \`JOIN\` 任务（\`joinOn\` 包含各并行分支最后一个任务的 \`taskReferenceName\`）
- DO_WHILE 需要 \`loopCondition\` 和 \`loopOver\` 数组
- HTTP 任务必须配置 \`inputParameters.http_request\`（含 \`uri\` 和 \`method\`），建议设置 \`timeoutSeconds\` 和 \`retryCount\`

## 业务流程图（Mermaid）
当用户要求展示流程图、可视化或 Mermaid 图时：
- 必须基于 system prompt 注入的"画布工作流完整 JSON"，不凭记忆生成
- 输出 \`\`\`mermaid 代码块，不调用任何工具
- 过滤纯技术节点（SET_VARIABLE、JSON_JQ_TRANSFORM、INLINE、NOOP），上下游直连
- 节点标签用中文业务语言，禁止直接使用 taskReferenceName
- SWITCH 用菱形 {}，FORK_JOIN 用并行路径，HUMAN 标注「👤 人工」`;

// ─── Build function (exported for integrators who want full control) ─────────

/**
 * 构建完整 system prompt。
 *
 * @param userInput       当前用户输入（用于意图识别 + 上下文注入）
 * @param systemPrompt    完全替换内置基础提示词（高级定制）
 * @param systemPromptExtra  追加内容，附加在基础层之后（适合补充业务规范、公司名等）
 * @param pendingProposalDef 待用户确认的提案 JSON（如有）。M2.2：提案不再阻塞对话输入，
 *                           用户可以继续描述修改意见——注入此上下文后 AI 会把新消息理解为
 *                           "基于这份提案继续调整"，而非从当前画布另起炉灶。
 */
export function buildSystemPrompt(
    userInput: string,
    workflowSnapshot: WorkflowSnapshot,
    libraryItems: WorkflowLibraryItem[],
    options?: {
        systemPrompt?: string;
        systemPromptExtra?: string;
        viewMode?: ViewMode;
        pendingProposalDef?: import('../../types/conductor').WorkflowDef;
        /** 流程库目录注入提示词的条数上限，默认 DEFAULT_PROMPT_CATALOG_LIMIT；超出部分提示改用 search_workflow_library */
        promptCatalogLimit?: number;
        /** 任务 Schema 注入提示词的条数上限；缺省不限制（保持旧行为） */
        promptSchemaLimit?: number;
    },
): string {
    const { systemPrompt, systemPromptExtra, viewMode, pendingProposalDef, promptCatalogLimit, promptSchemaLimit } = options ?? {};

    const intent = classifyIntent(userInput);
    const contextOptions = getContextOptions(intent);
    const ctx = buildContext(workflowSnapshot, contextOptions);
    const contextBlock = formatContextForPrompt(ctx);

    // Base layer: use custom or built-in
    const parts = [systemPrompt ?? BASE_SYSTEM_PROMPT];

    // Pending proposal awaiting user confirmation (M2.2: proposal no longer blocks chat input)
    if (pendingProposalDef) {
        parts.push(
            `## 待确认的变更方案\n` +
            `用户当前有一份尚未确认（未接受也未拒绝）的变更方案，画布上仍是旧版本。` +
            `如果用户接下来的消息是在此方案基础上继续调整（而非提出全新需求），` +
            `请基于下方 JSON 继续修改并通过 replace_workflow 重新生成完整方案，而不是从当前画布重新开始。\n\n` +
            `\`\`\`json\n${JSON.stringify(pendingProposalDef, null, 2)}\n\`\`\``
        );
    }

    // Custom validation rules (injected by integrators via ruleEngine)
    const rulesBlock = ruleEngine.buildPromptSection();
    if (rulesBlock) {
        parts.push(rulesBlock);
    }

    // Task schema registry (injected when integrator registers task schemas)
    const schemaBlock = schemaRegistry.buildPromptSection(promptSchemaLimit !== undefined ? { limit: promptSchemaLimit } : undefined);
    if (schemaBlock) {
        parts.push(schemaBlock);
    }

    // Sub-workflow library catalog (injected when library is available)
    const libraryBlock = buildLibraryCatalog(libraryItems, promptCatalogLimit);
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

/** 目录注入提示词的默认条数上限（治理平台可能有 1000+ 工作流，不能全量塞进提示词） */
export const DEFAULT_PROMPT_CATALOG_LIMIT = 50;

/**
 * 构建流程库目录段落。
 * 超过 limit 时按层级 L3 -> L2 -> L1 截断（高层场景优先），并写明剩余数量与检索指引。
 */
export function buildLibraryCatalog(
    allItems: WorkflowLibraryItem[],
    limit: number = DEFAULT_PROMPT_CATALOG_LIMIT,
): string | null {
    if (allItems.length === 0) return null;

    const cap = Math.max(0, Math.floor(limit));
    let items = allItems;
    let omitted = 0;
    if (allItems.length > cap) {
        const rank: Record<string, number> = { L3: 0, L2: 1, L1: 2 };
        // 稳定排序：同层级保持原有顺序
        items = allItems
            .map((item, idx) => ({ item, idx }))
            .sort((a, b) => (rank[a.item.workflowLevel] - rank[b.item.workflowLevel]) || (a.idx - b.idx))
            .slice(0, cap)
            .map(x => x.item);
        omitted = allItems.length - items.length;
    }

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

    if (omitted > 0) {
        sections.push(`另有 ${omitted} 个子工作流未在此列出，请调用 \`search_workflow_library\` 按关键词或层级检索后再引用。`);
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
            return '用户要创建新工作流。对于 3 个及以上任务或含分支/并行的业务流程，请优先使用四阶段渐进式策略：1. init_workflow_blueprint 定义元信息与输入契约 -> 2. scaffold_workflow_topology 编排整体拓扑 -> 3. configure_workflow_tasks 补充任务参数与上下游数据流 -> 4. commit_workflow_proposal 整体验证并提交。';
        case 'ADD':
            return '用户要添加任务。优先用 patch_workflow + add_task，指定正确的 afterRef（或 parentRef + branchName 插入到分支/循环内）。';
        case 'MODIFY':
            return '用户要修改现有任务。用 patch_workflow + update_task，只传需要变更的字段。';
        case 'DELETE':
            return '用户要删除任务。用 patch_workflow + remove_task。';
        case 'REFACTOR':
            return '用户要重构拓扑。对于小幅调整可用 patch_workflow；对于大范围重构可依次通过 scaffold_workflow_topology 重排拓扑 -> configure_workflow_tasks 校准参数与数据流 -> commit_workflow_proposal 整体验证提交。';
        case 'EXPLAIN':
            return '用户在提问/请求解释。直接文本回答，不要调用任何工具。不要重复任务列表——如需引用任务，只提名称和关键点，不要逐条列出。';
        case 'DEBUG':
            return '用户在排查问题。先用 validate_workflow 和 get_workflow_state 了解现状，分析后给出诊断。';
        case 'OPTIMIZE':
            return '用户要优化流程。先分析，再提出方案并执行。';
        case 'VISUALIZE':
            return `用户要查看工作流的业务流程图。**必须严格基于 system prompt 中注入的"画布工作流完整 JSON"生成**，不允许凭记忆或对话历史构造节点。

数据来源要求：
- 所有节点和边必须来自注入的完整 JSON，不允许增加不存在的节点
- 不允许省略业务节点

业务节点过滤（核心规则）：
- 保留（有业务含义）：SIMPLE、HTTP、HUMAN、SUB_WORKFLOW、START_WORKFLOW、EVENT、WAIT、DO_WHILE、FORK_JOIN、SWITCH、DECISION
- 跳过（纯数据处理、无业务含义）：SET_VARIABLE、JSON_JQ_TRANSFORM、INLINE、NOOP
- 跳过节点后，将其上游和下游直接相连，保持流程连通性

节点标签规则：
- 优先使用 task 的 name 字段；若 name 是技术命名则改写为中文业务语言
- HUMAN 节点：标签加「👤 人工」
- SUB_WORKFLOW 节点：标签加「⚙ 子流程」
- 禁止在节点标签中使用 taskReferenceName

控制流规则：
- SWITCH/DECISION：用菱形节点 {条件}，用 decisionCases 的 key 作为各分支的边标签
- FORK_JOIN：并行分支用多条路径，对应 JOIN 节点用「汇合」标注
- DO_WHILE：画成循环，用 loopCondition 描述循环条件

输出格式：
- 输出 \`\`\`mermaid 代码块，步骤 ≤ 8 用 flowchart TD，否则用 LR
- 代码块前一句话描述流程主旨，代码块后可加简短解读
- 不要调用任何工具`;
        case 'VAGUE':
            return '用户意图模糊。调用 ask_clarification 提出 2-4 个选项，帮助用户精确表达需求。不要直接创建工作流。';
        default:
            return null;
    }
}
