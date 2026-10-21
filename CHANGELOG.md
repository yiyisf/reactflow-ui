# Changelog

All notable changes to `@yiyi_zhang/reactflow-ui` are documented in this file.

---

## [Unreleased]

### Added
- **流程库能力动作**：由 Conductor 标准 `WorkflowDef` / 已注册 `TaskDef` 生成业务动作（`buildActionFromWorkflowDef` 等），入参取自 `inputSchema`，出参取自 `outputSchema` / `outputParameters`；流程库能力编译为 `SUB_WORKFLOW`，步骤记录 `libraryRef`，**首次引用时固定版本，库升级后不自动跟随**，由用户确认后手动升级。
- 分支 / 并行泳道 / 循环体内支持任意层级嵌套控制流。

### Fixed
- 业务模式：宣传页版本入口收进下拉；ROI 估算现在包含团队人数；模板中心弹窗跟随系统主题。
- 业务卡片：步骤 ID 不再随时间变化（此前每次编辑都会重建卡片、收起展开项、丢失输入焦点）。

### Performance
- 业务卡片视图下编辑只更新定义，不再每次按键都做整图布局；切回画布时再补建。
- Store 订阅改为按需（`useShallow`），逐节点组件不再因无关状态变化而重渲染。
- 撤销历史上限 100 条；历史比较先做引用相等判断，避免每次状态变化都序列化整份定义。
- 动作选择弹窗的筛选只在弹窗打开时计算。

### Maintenance
- 抽出 `StepListEditor` / `ActionPickerModal`，合并三张控制流卡片中重复的子步骤列表代码。
- 控制流卡片的原生 `alert` / `confirm` 改用项目自带对话框。
- 覆盖率统计补充 stepmodel / actions / 沙箱 / W-LSP / 脱敏器 / store；CI 新增非阻塞的全量类型检查；ESLint 预置 TS 规则（安装 `typescript-eslint` 后自动启用）。

---

## [1.1.0] - 2026-10-21

`v1.1.0` 是 `@yiyi_zhang/reactflow-ui` 的重大里程碑发布，全面实现了**“业务与技术双模全融合”**，彻底打破资深研发工程师与业务/运维专家之间的使用鸿沟。

### 🌟 Major Features (五大核心新特性)

#### 1. 业务卡片流设计器 (Business StepFlow) 与双模同屏无损热切换
- **双模毫秒级热切换 (`uiMode: 'business' | 'pro'`)**：
  - 工具栏一键切换 `👔 业务模式` 与 `💻 开发者模式`，状态零丢失。
  - **业务模式**：摒弃复杂的微服务连线拓扑与原生 JSON，以面向交付的业务卡片流（Step Cards）展示流程，支持步骤自由拖拽插入、上下移动与内联配置。
  - **无损编译与反编译系统 (`compile.ts` & `decompile.ts`)**：
    - 研发 StepModel 架构，实现业务步骤模型与 Conductor 原生 DAG 拓扑之间的双向递归无损转换。
    - 针对非标微服务任务提供透明的 `isProFallback` 保护，确保任意高阶特性在切换回专业模式时毫秒保真。

#### 2. 云平台业务动作库与动态参数胶囊体系
- **首发生态对接类阿里云云主机 (ECS) 全生命周期动作库**：
  - 内置 8 大高频云平台原生动作：云主机创建 (`ecs.create`)、启停与重启 (`ecs.start`/`stop`/`reboot`)、平滑升降配 (`ecs.modify_spec`)、容灾磁盘快照 (`ecs.create_snapshot`)、重装系统与释放实例等。
  - 提供模块化 `ActionRegistry` 与 `defaultActionRegistry`，支持接入方 0 门槛通过前端 SDK 注册内部私有云动作与自定义表单渲染器。
- **动态参数胶囊 (`ParamCapsule`) 与上游数据智能绑定**：
  - 输入参数支持结构化标签与高亮胶囊预览，智能联想并绑定上游输出引用（如 `${create_vm.output.instanceId}`），告别繁琐手写变量语法。

#### 3. 业务容器化高级控制流卡片 (Advanced Control Flow Containers)
- **条件分支路由卡片 (`DecisionBranchCard`)**：
  - 基于 `DECISION` / `SWITCH` 任务，提供交互式多分支 Tab 切换栏、一键追加/删除分支以及分支内嵌套卡片序列。
- **并行任务组泳道卡片 (`ForkJoinCard`)**：
  - 基于 `FORK_JOIN` 与 `JOIN` 任务配对，提供多泳道水平切换、泳道动态增删与泳道内步骤串行编排。
- **循环迭代容器卡片 (`LoopDoWhileCard`)**：
  - 基于 `DO_WHILE` 任务，支持循环跳出条件可视化配置、循环体步骤嵌套编排，内置死循环熔断保护。
- **全面主题响应**：所有控制流卡片深度适配 `科技蓝` / `熔核橙` 双品牌色与 `明暗` 双模式。

#### 4. 生产实例一键脱敏提炼为模板工具链 (Template Extractor)
- **线上实例一键提炼资产 (`TemplateExtractor.tsx` & `anonymize.ts`)**：
  - 支持将生产环境或演练场中调试完成的复杂工作流实例一键提炼为企业级规范模板。
  - **智能隐私脱敏引擎**：自动识别内网 IP、公网 IP、云凭证 AccessKey、密码与机密 ID，转换为模板参数占位符（如 `${workflow.input.targetIp}`）。
- **场景化业务模板中心 (`TemplateGallery.tsx`)**：
  - 内置 8 大经典生产场景模板：云主机全生命周期自动化、业务高峰自动扩容与健康打标、生产发布前安全快照与容灾备份、非工作时间定时关机省电、数据库平滑变更与冷备恢复等。
  - 支持一键调起参数配置向导 (`TemplateSetupWizard.tsx`) 与确定性浏览器沙箱全流程试跑验证。

#### 5. 运行故事线时间轴与生活化诊断自愈建议 (Run Story Timeline)
- **流水账故事线展开 (`RunStoryTimeline.tsx`)**：
  - 运行态告别晦涩难懂的堆栈报错与任务状态码，以人类自然语言的流水账形式叙述工作流生命周期。
- **生活化故障诊断与自愈行动指南**：
  - 遇到任务超时或执行失败时，智能分析故障根因并提供白话自愈建议与一键重试动作。

### 🎨 Design & Polish
- 统一重构主题色彩系统，实现 WCAG AA 级高对比度适配，杜绝浅色模式下文字模糊或泛白。
- 模态弹窗系统全面升级采用 React Portal (`createPortal(..., document.body)`)，彻底杜绝包含块定位漂移与变形。
- 启动页与宣传页重构：新增 v1.1.0 GA 宣传发布页，并完整保留并归档 v1.0.0 历史首发宣传专页 (`/v1-0.html`)。

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
