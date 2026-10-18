# Changelog

All notable changes to `@yiyi_zhang/reactflow-ui` are documented in this file.

---

## [1.0.0] - 2026-10-18

`v1.0.0` 是 `@yiyi_zhang/reactflow-ui` 的首个正式生产级大版本（GA Release），完成了从“可视化流程图编辑器”向**“AI 原生 + 确定性工程闭环的下一代工作流 IDE”**的全面跃迁。

### 🌟 Major Features (四大核心支柱架构)

#### 1. 确定性工作流语言服务 (W-LSP) 与数据血缘图谱
- **0ms 确定性变量补全 (`workflowLsp.ts` & `ParameterSuggester.tsx`)**：
  - 在任意输入框键入 `${` 时，基于 DAG 拓扑自动计算当前节点的严格上游祖先集合（杜绝引用下游或同级不可达节点）。
  - 融合五类 Schema 数据源（运行态真实 Output、人工 Mock Output、`TaskSchema` 契约、节点自身配置自省、任务类型默认输出），实时展示字段类型与 `⚡ 实时值预览`。
  - 采用 `createPortal(..., document.body)` 视口自适应锚定，彻底消除侧边栏 `backdrop-filter` 包含块偏移与水平滚动截断。
- **画布级数据流血缘图谱 (`showDataLineage`)**：
  - 工具栏新增 **`🔗 数据血缘`** 开关，在画布上叠加蓝色动态虚线边 (`🔗 taskRef.output.field`)，直观呈现跨节点的数据流转关系；选中单个节点时自动聚焦其上下游血缘。
- **跨节点安全引用重构 (`refactorTaskReferenceName`)**：
  - 重命名节点的 `taskReferenceName` 时，自动扫描并同步更新全图所有下游节点 `inputParameters`、`expression`、`decisionCases`、`loopCondition` 中的 `${oldRef...}` 引用，并在面板内给出更新计数反馈。

#### 2. 浏览器本地确定性沙箱引擎与时间旅行调试器
- **0ms 本地沙箱试跑 (`localSandboxEngine.ts`)**：
  - 无需启动后端 Conductor 服务，在浏览器内即可完整推演 `SIMPLE`、`HTTP`、`INLINE`、`SWITCH`、`FORK_JOIN`、`DO_WHILE`、`SET_VARIABLE`、`TERMINATE` 等全量控制流，自动解析 `${workflow.input.xxx}` 与 `${taskRef.output.xxx}` 表达式。
- **🧪 人工模拟数据配置台 (`SandboxConfigModal.tsx`)**：
  - **工作流全局入参 (`workflow.input`)**：自动提取显式声明入参与全图隐式引用的 `${workflow.input.xxx}` 字段，生成可编辑 JSON 模板。
  - **节点级 Mock 与故障注入**：支持为任意节点覆写 Mock Output JSON、自定义执行耗时 (`durationMs`)、为 `SWITCH` 节点强制指定走哪条分支 (`forcedBranch`)，或注入 `FAILED` / `TIMED_OUT` 状态以演练容错与补偿分支。
- **📊 并发甘特瀑布流与时间旅行调试 (`ExecutionWaterfallPanel.tsx`)**：
  - 运行态底部可展开并发执行甘特图，按真实时间轴展示各阶段与并行分支耗时占比。
  - 支持毫秒级**时间旅行滑块 (`Time-Travel Scrubber`)** 与 `0.5x / 1x / 2x` 倍速自动回放，画布节点与边随时间轴实时变色。
- **🔄 `DO_WHILE` 循环迭代切片器与结构化 JSON 树 (`StructuredJsonViewer.tsx`)**：
  - `LoopNode` 头部内嵌 `[1] [2] [3]` 迭代胶囊，点击即可在画布与详情面板中切换查看对应轮次的输入输出快照。
  - 运行态详情面板支持 JSON 树形折叠、关键词高亮检索，以及悬停一键复制 `${taskRef.output.path}` 引用表达式。

#### 3. 画布原生 AI Co-Pilot (`Cmd+K`) 与 Shadow Graph 视觉 Diff
- **画布内联 AI 指令栏 (`InlineCanvasCopilot.tsx`)**：
  - 按下 `Cmd+K` / `Ctrl+K` 或点击工具栏 **`⌘K AI微调`**，在选中节点旁（或画布中央）唤起轻量级指令输入栏，支持自然语言局部增删改节点。
- **👻 Shadow Graph 架构变更预览**：
  - AI 提出工作流变更提案时，画布直接渲染差异预览图（新增节点绿色高亮、修改节点琥珀色高亮、移除节点红色虚线），支持一键采纳或逐节点部分采纳 (`applyPartialProposal`)。
- **零外部依赖的原生 SVG 流程图引擎 (`MermaidBlock.tsx`)**：
  - 移除体积超过 60MB 的 `mermaid` 运行时依赖，改用内置 Dagre + 原生 SVG 渲染器，包体积大幅缩减且渲染零闪烁。

#### 4. 双向实时代码同步、语义级缩放与统一工具栏
- **双向实时分屏 JSON 编辑器 (`JsonPreviewPanel.tsx`)**：
  - 左下角控制中心点击 **`{ } JSON`** 即可展开分屏代码编辑器，支持 300ms 防抖双向同步、错误行号定位、一键格式化与文件下载。
- **三级语义缩放 (`Semantic Zoom LOD`)**：
  - 根据画布缩放倍率自动切换 **宏观色块 (`<0.55x`) / 标准卡片 (`0.55x~1.15x`) / 微距参数透视 (`>1.15x`)**。
- **统一右上角胶囊工具栏 (`ActionBar.tsx` & `ModeSlider.tsx`)**：
  - 将 **📋 业务 / 🔧 标准 / 💻 全开发** 三级视图切换滑块与数据血缘、AI 微调、撤销重做、健康诊断、沙箱试运行整合至同一毛玻璃胶囊工具栏，并在运行态提供一键 **`✏️ 返回编辑`** 按钮。

### 🐛 Bug Fixes & Polish
- 修复 `WorkflowIDE` 在未传入外部 `workflowExecution` Prop 时触发本地沙箱试跑或执行验证后，点击节点未弹出 `ExecutionTaskPanel` 的问题。
- 修复 `AiWorkflowIDE` 技术画布模式下点击节点未弹出右侧 `TaskDetailPanel`（编辑态）或 `ExecutionTaskPanel`（运行态）的问题。
- 修复 `ParameterSuggester` 在开启 `backdrop-filter` 的侧边抽屉内定位偏右、需要横向滚动才能查看的问题。
- 移除 `package.json` 中未再使用的重型依赖 `mermaid`，显著降低下游项目安装体积。

---

## [0.5.0-beta.0] - 2026-10-16

### Added
- **`AiWorkflowIDE` (`/ai` 独立子路径入口)**：
  - 支持多模型协议适配（OpenAI / Anthropic Claude / DeepSeek / 通义千问 Qwen / 自定义 Endpoint 代理传输层）。
  - 内置多轮 Agentic 工具调用循环、子工作流分层复用库 (`L1/L2/L3`)、自定义校验规则引擎 (`ruleEngine`)、任务 Schema 注册表 (`schemaRegistry`)。
  - 支持本地草稿自动持久化与崩溃恢复 (`draftPersist`)。
  - 支持多实例隔离 (`IdeStoresProvider`)，同一页面挂载多个 `<AiWorkflowIDE>` 互不干扰。

---

## [0.4.0] - 2026-09-20

### Added
- **P4.1 AI 参数自动填充**：`TaskDetailPanel` 新增"✨ AI 填充"按钮，根据任务类型与上下文一键生成 `inputParameters`。
- **P4.2 执行验证闭环**：新增 `WorkflowRunPanel`、`onTriggerExecution` / `onPollExecution` Props 与结构化 `WorkflowInputParam` 入参声明。
- **P4.3 执行结果分析**：新增 `ExecutionSummaryPanel` 与 `executionAnalyzer` 智能故障诊断引擎。

---

## [0.3.0] - 2026-08-15

### Added
- 全屏表达式/脚本编辑器 (`FullscreenEditor`)、`SWITCH` 页面内分支管理 Modal、`DO_WHILE` 循环体首位插入任务、三级视图模式 (`Business` / `Standard` / `Developer`)。
