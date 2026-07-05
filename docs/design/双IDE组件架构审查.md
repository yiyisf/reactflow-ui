# WorkflowIDE / AiWorkflowIDE 双组件架构审查

> 范围：`feat/ai-workflow-ide` 分支（含 master 共享代码）。
> 背景：本项目作为 npm 组件包（`@yiyi_zhang/reactflow-ui`）对外提供两个核心组件——
> **WorkflowIDE**（专业技术编排人员）与 **AiWorkflowIDE**（非技术人员，AI 驱动）。
> WorkflowIDE 在 master 演进，AiWorkflowIDE 在本分支演进。

---

## 总评

两个组件共享了正确的底座（WorkflowDesigner 画布、workflowStore、parser/validator），方向没有问题。
但当前架构有 **一个发布阻塞缺陷、两个系统性风险、一组分层债务**：

1. 🔴 **发布阻塞**：`AiWorkflowIDE` 未从包入口导出，npm 消费者拿不到它。
2. 🔴 **系统性风险 A — 模块级单例状态**：3 个 zustand store + 3 个服务 registry 全是模块级单例，
   组件包却按"可多实例的 React 组件"对外承诺，两者根本矛盾。
3. 🔴 **系统性风险 B — 双 AI 技术栈平行演进**：两组件各自拥有一整套互不复用的 AI 实现，
   同类 bug 需要修两次（近期 SSE 修复只落在了一侧）。
4. 🟡 **分层债务**：服务层直接读全局 store；1200 行的 UI 组件内嵌 agentic loop；
   两个 IDE 外壳重复实现同一套 props→store 同步且行为已不一致。

以下按层展开。

---

## 一、包与公共 API 层

### 1.1 🔴 AiWorkflowIDE 没有进入包入口

`src/index.ts` 只导出 `WorkflowIDE` 及其类型。`AiWorkflowIDE`、`AiWorkflowIDEProps/Ref`、
`AiConfig`、`CustomTool`、`CustomValidationRule`、`TaskSchema`、`AiEvent`、
`WorkflowLibraryItem`、`BASE_SYSTEM_PROMPT`（文档注释里承诺可导入）全部缺失。
demo 靠相对路径 `import { AiWorkflowIDE } from '../AiWorkflowIDE'` 绕过了入口，掩盖了问题。

**修复**：补全导出是最低要求；但结合 1.2，建议直接做成**子路径入口**。

### 1.2 🟡 单 bundle 让非 AI 用户为 AI 栈买单

`package.json` 只有一个入口（ES + UMD 单 bundle）。AiWorkflowIDE 引入 AI 服务栈
（protocolAdapter 519 行、toolExecutor 526 行、contextEngine、mermaid 渲染链）。
mermaid 已是动态 `import()`（👍 这块做对了），但其余 AI 代码在 UMD 产物中无法被摇树。
只用 WorkflowIDE 的集成方会背上整个 AI 栈的体积。

**建议**：vite lib 模式多 entry：

```
exports: {
  ".":     dist/core   → WorkflowIDE + 共享类型
  "./ai":  dist/ai     → AiWorkflowIDE（内部 import 共享 chunk）
  "./style.css": ...
}
```

### 1.3 🟡 公共 API 上的 `any`

`workflowExecution?: any`、`onAiMetrics?: (metrics: any)`、`getAiMetrics(): any`、
`onSave?: (def: any)`（CanvasPreview）。组件包的对外类型是产品的一部分，
`WorkflowInstance`、`AiMetrics` 类型都已存在，应直接引用。

---

## 二、状态层：模块级单例 vs 组件包承诺（最重要的架构决策）

### 2.1 现状

```
useWorkflowStore  = create(persist(temporal(...)))   // 模块级单例
useAiStore        = create(persist(...))             // 模块级单例
useLibraryStore   = create(...)                      // 模块级单例
toolRegistry / ruleEngine / schemaRegistry           // 模块级 class 单例
```

所有组件/服务直接 import 单例使用。

### 2.2 后果

| 场景 | 现状行为 |
|------|----------|
| 同页渲染两个 AiWorkflowIDE（如多 tab 编辑器） | 共享同一份 workflowDef/messages，互相覆盖 |
| 同页并存 WorkflowIDE + AiWorkflowIDE | 同上；demo 的模式切换恰恰是**靠**这个副作用才"无缝"，掩盖了缺陷 |
| 集成方 A 页面用完，路由切到 B 页面再挂载 | 上一实例的对话、提案、undo 栈全部残留（store 不随组件卸载销毁） |
| 两个组件同时写 `conductor-ui-prefs` / `ai-workflow-config` localStorage | 偏好互相污染；库组件强制写宿主 localStorage 且不可关闭 |

`AiWorkflowIDE.tsx` 中 5 段 `prevRef + JSON.stringify` 比对的 useEffect
（aiConfig/library/customTools/rules/schemas → 单例同步）正是这个设计的补丁：
props 是 per-instance 的，目标却是全局的，只能在运行时不断"对表"。
这些 effect 每次渲染做 O(n) 序列化，且两个实例会互相把对方的注册覆盖掉。

### 2.3 建议：store factory + Context（zustand 官方库模式）

```tsx
// 创建时机：组件实例挂载
const [stores] = useState(() => ({
  workflow: createWorkflowStore({ persistKey: props.persistKey }),  // persist 可选/可命名
  ai:       createAiStore(),
  library:  createLibraryStore(),
  registries: { tools: new ToolRegistry(), rules: new RuleEngine(), schemas: new SchemaRegistry() },
}));

<IDEContext.Provider value={stores}> ... </IDEContext.Provider>
// 组件内部：const workflowDef = useIDEStore(s => s.workflowDef)
```

- 每个 IDE 实例一套隔离状态，卸载即回收；
- registries 变成实例属性，props 同步 effect 全部消失（初始化时直接构造）；
- persist 变为**可选项**（`persistKey?: string | false`），把"是否写宿主 localStorage"的决定权交还集成方；
- 迁移成本集中在 import 改写（`useWorkflowStore` → `useIDEStore(ctx)`），机械但量大——
  **越晚做越贵，这是本次审查中时间敏感度最高的一项**。

---

## 三、分层与依赖方向

### 3.1 🔴 服务层直接读全局 store

```
toolExecutor.ts:   useWorkflowStore.getState() / useLibraryStore.getState()
contextEngine.ts:  useWorkflowStore.getState()
systemPrompt.ts:   useLibraryStore.getState()
```

`toolExecutor` 头注释声称 "All modifying operations work on WorkflowDef JSON (pure functions)"，
实现却直接读全局状态——注释描述的才是正确架构。后果：

- 服务无法单测（必须先 mock 全局 store）；
- 无法在 headless 场景复用（如 Node 端批量校验、SSR）；
- 是 §2 单例化的绑架者之一：store 不去单例化，服务层就无法工作。

**建议**：服务层全部改为显式入参的纯函数：

```ts
executeToolCall(name, args, ctx: { workflowDef, libraryItems, mode })
buildSystemPrompt(input, opts, ctx: { libraryItems, workflowDef })
```

由调用方（agent runner，见 3.2）从实例 store 取值传入。依赖方向变为
`UI → runner → 纯服务 → 纯工具函数`，单向、可测。

### 3.2 🔴 AiCommandCenter：1237 行组件内嵌 agentic loop

`handleSendText` 一个 useCallback 里装了：多步 agent 循环、流式事件分发、6 种工具的
分支处理、self-heal 重试、工具结果补齐（Anthropic 角色对齐）、5 种 pending 卡片的
状态提交。这是典型的"业务编排长在 UI 上"：

- 无法脱离 React 测试 agent 行为；
- UI 重构（正是 UX 方案要做的事）必须小心翼翼绕开业务逻辑；
- `pendingAutoSend`（外部代码经 store 塞字符串 → 组件 effect 轮询消费 → 触发发送）
  是这个结构的衍生反模式：一条隐式命令总线，时序依赖 isStreaming/pendingProposal
  的空闲判断，难以推理。

**建议**：抽出 `AgentRunner`（`services/ai/agentRunner.ts`）：

```ts
class AgentRunner {
  constructor(deps: { config, tools, ctxProvider, emit: (e: AgentEvent) => void })
  send(text: string): Promise<void>   // 取代 pendingAutoSend
  abort(): void
}
// AgentEvent: step:start | text:delta | tool:start | tool:done | selfheal | proposal | plan | ...
```

- 组件退化为纯渲染：订阅事件流渲染消息/时间线/卡片；
- **这同时是 UX 重设计 P0-3（生成过程时间线）的前置条件**——没有结构化事件流，
  时间线只能继续用 toolStatus 字符串拼凑；
- `AiWorkflowIDE.handleAccept` 里 130 行的接受逻辑（undo、审计、Mermaid 追加、chips 生成）
  同理下沉为 store action / runner 方法。

### 3.3 🟡 全局 DOM 副作用与错误的响应式依据

`AiWorkflowIDE` 把 `data-layout` 写到 `document.documentElement`——库组件污染宿主根元素，
两个实例互踩；且断点依据是 `window.innerWidth` 而非**组件容器宽度**，
嵌入半屏抽屉/分栏时会误判为 desktop。

**建议**：`data-layout` 写在组件根 div；用 `ResizeObserver` 观察自身容器。

---

## 四、双 AI 技术栈平行演进

### 4.1 现状：两套互不复用的完整实现

| | WorkflowIDE 侧 | AiWorkflowIDE 侧 |
|---|---|---|
| 聊天 UI | `AICopilot/AIChatPanel.tsx`（422 行） | `AiNative/AiCommandCenter.tsx`（1237 行） |
| AI 服务 | `services/aiService.ts`（仅 OpenAI 协议） | `services/ai/protocolAdapter.ts`（OpenAI + Anthropic 双协议） |
| 变更机制 | 文本解析 `workflowDiff`（让模型输出 diff JSON 再正则提取） | 原生 tool-call + proposal/diff |
| 配置类型 | `AIServiceConfig` | `AiConfig` |
| 流式解析 | 自己一套 SSE 解析 | 另一套 SSE 解析 |

近期三个修复提交（SSE flush 损坏 tool args、replace_workflow 截断、消息角色对齐）
全部落在 protocolAdapter 侧——**aiService.ts 里同类问题无人回归**。
双栈是持续的双倍维护税。

### 4.2 建议：收敛到 `services/ai/*`，废弃 aiService.ts

- protocolAdapter（双协议、流式、tool-call）是明确的赢家，作为唯一 AI 传输层；
- WorkflowIDE 的 AIChatPanel 迁移到共享栈：对技术用户保留"生成 diff 供审阅"的产品行为，
  但底层用 tool-call（`patch_workflow`）替代文本解析——文本解析 diff 本质上是
  tool-call 出现前的权宜之计，脆弱且无法保证 JSON 合法；
- `AIServiceConfig` 与 `AiConfig` 合并为一个类型，`aiService.ts` 标记 `@deprecated`
  并在一个版本周期后删除。

---

## 五、双外壳重复与行为漂移

WorkflowIDE 与 AiWorkflowIDE 各自实现了一遍"外壳职责"，且已经出现行为不一致：

| 职责 | WorkflowIDE | AiWorkflowIDE | 漂移后果 |
|------|-------------|---------------|----------|
| theme/themeColor/layout 同步 | 每次 prop 变化都同步 | 仅 mount 应用一次（initRef） | 集成方动态换主题：一个生效一个不生效 |
| 加载 def 后清 undo 历史 | `temporal.clear()` | 不清 | AI 侧可 undo 回"空画布"意外状态 |
| workflowChange 通知 | store.subscribe + skip-initial | useEffect 依赖 workflowDef | AI 侧首帧也会通知，语义不同 |
| ref API | 4 方法 | 4 方法（不同集合） | 集成方无法以统一方式驱动两个组件 |

**建议**：提取 `useIDEShell(props)` 共享 hook（或 `<IDEProvider>` 组件），
统一承载：def/execution 注入、外观同步、onWorkflowChange 通知、ref API 基础集、
（§2 落地后）per-instance store 的创建与提供。两个 IDE 只保留各自的布局与特有面板。

顺带：`CanvasPreview` 目前只是 `WorkflowDesigner` 的 34 行透传包装，
若 ghost 预览短期不落地可直接删除，减少一层无意义间接。

---

## 六、工程与分支策略

### 6.1 🔴 分支模型正在制造重复历史

当前：master 领先 5 提交、本分支领先 59 提交，且共享文件两侧都在改
（workflowStore ±89、WorkflowDesigner ±81、WorkflowIDE ±94、aiService ±76）。
历史上已出现**同一变更的两份提交**（分支 `e72af67` 与 master `574a51a` 同为
"feat: v0.4.0 — AI参数自动化…"，cherry-pick 而非 merge）和一次手工解冲突
（`efb9b7c` protocolAdapter.ts）。这个模式持续下去，每次同步成本递增。

**建议**：
1. 立即 `git merge master`（不要 cherry-pick），此后**小步高频**同步；
2. 结构性解法是 §五：共享内核（store/parser/validator/designer/nodes/services-ai）
   与两个薄壳分离后，两条产品线的日常改动天然落在不同目录，冲突面大幅收窄；
3. AiWorkflowIDE 功能可发布后尽快合回 master，回归单主干 + 短命特性分支。
   双长命分支对"共享 70% 代码的两个组件"是最差的组织方式。

### 6.2 🟡 零测试 × 高频回归区域

无测试框架，而最近 5 个 fix 提交中 4 个集中在 protocolAdapter 的流式/工具调用解析——
这恰是**纯函数、最易测**的区域。§三的纯函数化完成后，建议引入 vitest 并优先覆盖：

1. `protocolAdapter`：SSE 分帧、tool_call 参数拼接（用录制的真实流 fixture 回放）；
2. `toolExecutor`：patch 操作 + diff 计算 + partial accept；
3. `conductorParser` / `validator` / `workflowToMermaid`。

这三块有测试兜底后，两个 IDE 壳的重构（§二/§五）才有安全网。

---

## 七、实施优先级

| 优先级 | 事项 | 理由 |
|--------|------|------|
| **P0** | 导出 AiWorkflowIDE（+ 子路径入口 `./ai`） | 发布阻塞 |
| **P0** | merge master、确立高频同步纪律 | 冲突成本随时间递增 |
| **P0** | store/registry 单例 → per-instance factory + Context | 破坏面最大，越晚越贵；是组件包正确性的根基 |
| **P1** | 服务层纯函数化（去 store import） + AgentRunner 抽取 | 解锁可测试性；是 UX 重设计 P0-3 的前置 |
| **P1** | vitest + protocolAdapter/toolExecutor 测试 | 保护高频回归区 |
| **P2** | AI 栈收敛（废弃 aiService.ts，AIChatPanel 迁移） | 消除双倍维护税 |
| **P2** | useIDEShell 共享外壳 + 行为对齐；删 CanvasPreview 透传层 | 消除行为漂移 |
| **P2** | data-layout 去全局化 + ResizeObserver；公共 API any 清理 | 库组件卫生 |

**与 UX 重设计（另见《AiWorkflowIDE-UX重设计方案》）的排序关系**：
AgentRunner（P1）应在 UX Phase A 之前或同时进行——提案预览卡与生成时间线都消费
结构化事件流，先抽 runner 再做 UI，可避免在 1237 行组件上继续堆叠。
