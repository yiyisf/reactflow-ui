# Conductor Workflow IDE 发展路线图 (ROADMAP)

本文档记录 Conductor Workflow IDE (`@yiyi_zhang/reactflow-ui`) 的演进历程与未来规划，见证其从可视化流程图组件进化为**下一代 AI 原生工作流编排与仿真 IDE**。

---

## 🚧 v1.3.0：自助接入（发布准备中）

**目标**：新团队在测试环境里不靠平台方陪跑，自己完成"登记产品 → 规范命名建流程 → 接上已有接口 → 试跑 → 申请上线"。目标发布时间 2026-11-13，见 [`docs/v1.3.0-release-plan.md`](./docs/v1.3.0-release-plan.md)，设计见 [`docs/design/v1.3.0-自助接入设计.md`](./docs/design/v1.3.0-自助接入设计.md)，当前变更见 `CHANGELOG.md` 的 `[Unreleased]`。

- [x] **扩展点注册机制（B1）**：`IdeProviders`（`library` / `onboarding` / `telemetry`）、`WorkflowIdeProvider`、`useIdeProviders()`；逐字段解析（专用 prop > 组件 `providers` > 外层 > 无），按字段比较引用；Demo `createMockProviders()`
- [x] **接入埋点 `TelemetrySink`（B1）**：5 秒或 20 条攒批、页面隐藏时 flush；不采集参数值、表达式、提示词与对话内容
- [x] **自助接入向导（B2）**：`OnboardingProvider` 契约、`WorkflowNameBuilder`（五段式命名与实时校验）、`OnboardingWizard`、`PromotionPanel`（申请上线与审批进度）、空画布「开始试用」引导；Demo 模拟实现与 TEST / PROD 环境切换
- [x] **接口导入（B3）**：OpenAPI 3 / Swagger 2 / Postman v2.1 / curl（均为 JSON，不支持 YAML）生成 HTTP 业务动作，敏感头替换为 `${workflow.input.xxx}` 占位；样例见 `public/sample-imports/`
- [ ] **埋点铺设与收尾（B4）**：首批事件接入走查、接入指南与 CHANGELOG 更新、人工走查、宣传页、版本号定稿与发布

---

## ✅ v1.2.0：流程库就绪 (已发布 · 2026-10-23)

**目标**：让内部项目基于真实治理服务使用流程库——业务模式按业务域选到库能力、引用时固定版本、升级前看差异；AI IDE 能检索并正确引用库能力。发布计划见 [`docs/v1.2.0-release-plan.md`](./docs/v1.2.0-release-plan.md)，变更见 `CHANGELOG.md` 的 `[1.2.0]`。

- [x] **流程库数据源 `LibraryProvider`**：同一份规范化目录投影为业务动作、AI 任务 Schema 与 AI 流程库目录；`WorkflowIDE` / `AiWorkflowIDE` 新增 `libraryProvider` prop；默认 Conductor 实现 `createConductorLibraryProvider`
- [x] **流程库能力动作**：由 Conductor 标准 `WorkflowDef` / `TaskDef` 及 `inputSchema` / `outputSchema` 生成业务动作，编译为 `SUB_WORKFLOW`；首次引用固定版本，库升级后不自动跟随
- [x] **升级差异与「版本不可用」**：「⬆ 有新版本」展示入参 / 出参差异后再确认升级；固定版本被撤回或下线时显示「⚠ 版本不可用」，编译结果不变
- [x] **业务域与分层**：命名规范 `类型-层级-业务域-产品-功能`（`parseWorkflowName` / `validateWorkflowName`）、动作选择器按业务域分组、`currentWorkflowLevel` 分层过滤、AI 检索支持按业务域过滤、`promptCatalogLimit`
- [x] **Demo 演示后端与宿主接入指南**：模拟治理服务（`src/demo/mockGovernance/`）与 [`docs/integration-guide.md`](./docs/integration-guide.md)
- [x] **体验与质量**：下拉字段「插入数据」、弹窗跟随主题、多层嵌套控制流、卡片视图性能 / 按需订阅 / 撤销上限、类型检查成为 CI 门禁
- [x] **收尾**：版本号与 CHANGELOG 定稿、发布
- [ ] **顺延**：补 `@types/node` 并移除类型检查排除项（需在可访问 npm 的环境安装依赖）

---

## ✅ v1.1.0：业务与技术双模全融合 (已发布 · 2026-10-21)

**目标**：打破资深研发与业务 / 运维专家之间的使用鸿沟。

- [x] **业务卡片流设计器 (StepFlow)**：`uiMode: 'business' | 'pro'` 双模同屏无损热切换；`compile.ts` / `decompile.ts` 实现业务步骤模型与 Conductor 原生 DAG 的双向无损转换，非标任务由 `isProFallback` 保护
- [x] **云平台业务动作库与动态参数胶囊**：内置阿里云 ECS 全生命周期 8 个高频动作；`ActionRegistry` / `defaultActionRegistry` 支持接入方注册私有动作与自定义表单；`ParamCapsule` 智能绑定上游输出引用
- [x] **高级控制流卡片**：条件分支 (`DecisionBranchCard`)、并行泳道 (`ForkJoinCard`)、循环 (`LoopDoWhileCard`)，适配双品牌色与明暗模式
- [x] **生产实例一键脱敏提炼为模板**：`TemplateExtractor` + `anonymize.ts` 脱敏（内网 / 公网 IP、云凭证、密码等），场景化模板中心 `TemplateGallery`（内置 8 个场景模板）与参数配置向导
- [x] **运行故事线时间轴与生活化诊断自愈建议** (`RunStoryTimeline`)

---

## ✅ v1.0.0 GA：四大核心支柱架构 × 本地确定性沙箱 × W-LSP 语言服务 (已发布 🎉)

**目标**：对标 Temporal UI、n8n、LangGraph Studio 与 Cursor，打造兼具**零延迟确定性工程体验**与**画布原生 AI 协同能力**的 `1.0.0` 正式版。

### 🧬 支柱一：确定性工作流语言服务 (W-LSP) 与数据血缘图谱
- [x] **DAG 拓扑上游祖先计算 (`getUpstreamAncestors`)**：递归穿透 `SWITCH`、`FORK_JOIN`、`DO_WHILE` 嵌套容器，精确计算当前节点合法可引用的上游任务集合
- [x] **五源融合 Schema 推断与 0ms 自动补全 (`getCompletionItems`)**：融合运行态真实 Output、人工 Mock Output、`TaskSchema` 契约、节点配置自省与类型默认字段，提供带 `⚡ 实时值预览` 的 `${` 自动补全
- [x] **Portal 视口自适应补全浮层 (`ParameterSuggester`)**：基于 `createPortal` 挂载至 `document.body` 并支持碰撞翻转，彻底消除侧边抽屉滚动截断
- [x] **画布级数据血缘图谱 (`buildDataFlowGraph`)**：一键开启蓝色虚线动态血缘连线，可视化跨节点 `${taskRef.output.xxx}` 字段级流向
- [x] **跨节点安全引用重构 (`refactorTaskReferenceName`)**：修改 `taskReferenceName` 自动重写全图下游引用表达式

### ⚡ 支柱二：浏览器本地确定性沙箱 (0ms Dry-Run) 与时间旅行调试器
- [x] **纯前端确定性沙箱引擎 (`localSandboxEngine`)**：无需后端服务即可在浏览器内执行 `SIMPLE`、`HTTP`、`INLINE`、`SWITCH`（真实表达式路由）、`FORK_JOIN`（并发波次计算）、`DO_WHILE`（多轮迭代展开）、`SET_VARIABLE`、`TERMINATE`
- [x] **🧪 人工模拟数据与故障注入配置台 (`SandboxConfigModal`)**：支持自定义全局 `workflow.input`、单节点 Mock Output、自定义耗时、`SWITCH` 分支强制路由，以及 `FAILED` / `TIMED_OUT` 故障注入
- [x] **📊 并发甘特瀑布流与时间旅行回放 (`ExecutionWaterfallPanel`)**：支持并发甘特图可视化、毫秒级时间轴拖拽回放 (`Time-Travel Scrubber`) 与 `0.5x / 1x / 2x` 倍速播放
- [x] **🔄 循环迭代切片器 (`LoopIterationPill`) & 结构化 JSON 树 (`StructuredJsonViewer`)**：支持按轮次切换 `DO_WHILE` 迭代快照，以及树形检索与一键复制 JSONPath

### 🤖 支柱三：画布原生 AI Co-Pilot (`Cmd+K`) 与 Shadow Graph 视觉 Diff
- [x] **画布内联微调指令栏 (`InlineCanvasCopilot`)**：支持 `Cmd+K` / `Ctrl+K` 选中节点原位唤起 AI 微调指令浮层
- [x] **👻 Shadow Graph 架构级 Diff 预览**：画布原位渲染 `+新增` / `~修改` / `-移除` 预览节点，支持一键全部采纳或部分采纳 (`Partial Accept`)
- [x] **零外部依赖的轻量级流程图渲染 (`MermaidBlock`)**：内置基于 Dagre 的原生 SVG 渲染器，移除 60MB+ 的外部 `mermaid` 依赖

### 🎛️ 支柱四：双向实时代码同步、语义级缩放与统一工具栏
- [x] **双向实时分屏 JSON 编辑器 (`JsonPreviewPanel`)**：支持画布与 JSON DSL 代码 300ms 防抖双向实时同步与错误定位
- [x] **三级语义缩放 (`Semantic Zoom LOD`)**：根据缩放倍率自动切换宏观色块 (`<0.55x`)、标准卡片 (`0.55x~1.15x`) 与微距参数透视 (`>1.15x`)
- [x] **统一毛玻璃胶囊工具栏 (`ActionBar` & `ModeSlider`)**：整合三级视图切换滑块、数据血缘、AI 微调、历史栈、健康检查、沙箱试运行与返回编辑入口

---

## ✅ v0.5.0：AI 原生双栏编排 IDE (`AiWorkflowIDE`) 与企业级扩展能力 (已发布)

- [x] **独立 `/ai` 子路径导出 (`@yiyi_zhang/reactflow-ui/ai`)**：按需加载 AI 编排能力，保持主入口轻量
- [x] **多模型与生产级代理传输层 (`AiTransport`)**：支持 OpenAI / Claude / DeepSeek / Qwen 及企业后端 `endpoint` / `custom` 代理模式
- [x] **多轮 Agentic 工具调用与子工作流复用库 (`L1/L2/L3`)**：内置分层调用规范校验、自定义工具注册表 (`ToolRegistry`)、自定义校验规则引擎 (`RuleEngine`) 与任务 Schema 注册表 (`SchemaRegistry`)
- [x] **本地草稿持久化 (`draftPersist`) 与多实例隔离 (`IdeStoresProvider`)**：刷新页面不丢失工作流与对话上下文，支持同页多实例挂载

---

## ✅ v0.4.0：AI 参数自动化 × 执行验证闭环 × 智能结果分析 (已发布)

- [x] **P4.1 整体参数块 AI 自动生成**：`TaskDetailPanel` 支持"✨ AI 填充"及 Diff 预览
- [x] **P4.2 工作流入参配置与执行验证**：结构化 `WorkflowInputParam`、`WorkflowRunPanel` 表单/JSON 双模式、`onTriggerExecution` / `onPollExecution` 指数退避轮询
- [x] **P4.3 执行结果分析与智能故障诊断**：`ExecutionSummaryPanel` 概览卡片、步骤时序表、10+ 种 Conductor 错误模式诊断与一键"去修复"跳转

---

## ✅ v0.2.0 ~ v0.3.0：核心交互基建与库化交付 (已发布)

- [x] **全站 TypeScript 化与领域模型完备定义**
- [x] **UI Token 体系与 Dark/Light × Blue/Orange 主题架构**
- [x] **撤销/重做 (`zundo`)、快捷键体系、跨层级剪贴板**
- [x] **超大流程智能蛇形布局 (`Snake Layout`) 与 `DO_WHILE` 容器化子图渲染**
- [x] **运行态全套生命周期控制**：暂停、继续、终止、重试、跨版本重启、跳过任务、从指定任务重跑

---

## 🔭 远期构想

> **前瞻规划已迁移到 [`docs/roadmap.md`](./docs/roadmap.md)**（稳定线 vs 实验线 Labs，v1.2.0 – v1.5.0 版本计划与扩展点总表）。本文只保留尚未排期的远期构想，排期以 `docs/roadmap.md` 为准。

### 1. 多人实时协同编排 (Multiplayer Collaboration)
- [ ] 基于 Yjs / CRDT 的多用户画布光标同步与节点锁机制
- [ ] 团队级评论批注锚点（Canvas Sticky Notes & Review Threads）

### 2. 沙箱录制与回归测试套件 (Workflow Test Suite)
- [ ] 将 `SandboxConfigModal` 配置的入参、Mock 输出与故障注入保存为可复用的测试用例集（Test Suites）
- [ ] 一键批量执行多组沙箱断言（例如：断言 VIP 订单必走极速通道、断言支付超时必触发退款补偿）并导出 CI 报告

### 3. 性能剖析热力图 (Historical Telemetry Heatmap)
- [ ] 聚合生产环境数千次执行的 P50 / P95 / P99 耗时与失败率数据，直接在画布节点与边上渲染性能瓶颈热力图
