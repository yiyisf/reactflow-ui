# Changelog

All notable changes to `@yiyi_zhang/reactflow-ui` are documented in this file.

---

## [Unreleased]

> 主题：CMASTER 设计系统落地的第一步 —— 设计规范进仓库，并让人和 AI 都按同一套规则产出、被同一套检查把关。规范入口见 `design/README.md`。

### Added
- **CMASTER 设计 tokens 编译**：`design/tokens.json` 为唯一来源，`npm run tokens:build` 生成 `src/styles/cmaster-tokens.css`（`--cm-*` 变量，`data-mode="dark" | "light"` 双主题）与 `src/styles/cmasterTokens.ts`（含 5 套活动主题色）；`npm run tokens:check` 进 CI，生成物过期即失败。新增单测 `cmasterTokens.test.ts`：两个主题下文字与地色对比度 ≥ 4.5:1、状态色与焦点环 ≥ 3:1、橙底文字与活动主题按钮文字 ≥ 4.5:1、标志橙在所有主题不变。
- **AI 协作约定**：根目录 `CLAUDE.md`（硬规则与完成前检查）、`AGENTS.md`、项目 skill `.claude/skills/cmaster-design`（按任务类型指向规范与黄金示例，含交付前检查清单）；`design/` 收录品牌手册、IDE 布局、文档站、宣传页、海报与社媒规范，24 个组件规范、参考样式 `reference/components.css`、9 个黄金示例与 Logo。
- **截图回归**：Playwright 视觉测试覆盖演示 IDE（深 / 浅 × 业务卡片流 / 全景画布 / 专业模式，视图通过点击界面切换，并校验三个视图截图确实不同）与全部黄金示例，并检查橙色按钮悬停时文字不与底色相同；`Visual regression` 工作流在官方 Playwright 容器中比对，`Visual baselines` 工作流（PR 加 `update-visual-baselines` 标签或手动触发）生成并提交基线。

### Changed
- **IDE 换用 CMASTER 视觉**：旧变量（`--bg-*`、`--text-*`、`--border-*`、`--font-*`、`--radius-*`、`--color-success/warning/error/info`、`--status-*`）改为 `--cm-*` 的别名，深色主题由 slate 灰蓝换为 CMASTER 海军蓝，圆角放大一档，运行中状态改用数据青色，`themeColor="orange"` 使用 CMASTER 橙（`#ff6a13`）。`themeColor="blue"` 保留但标记为弃用。演示站加载 Geist / Geist Mono 字体；库本身不加载字体。
- **橙底文字改为深色**：新增 `--color-on-accent`（橙色品牌为 `--cm-on-brand` 深色，蓝色品牌仍为白色）与 `--color-on-danger`，替换 54 处写死在强调色底上的白字（工具栏主按钮、节点角标、业务卡片、模板中心、AI 面板、演示站顶栏等）。
- **IDE 外壳的 emoji 换成 Lucide 图标**（线宽 1.75）：工具栏（数据血缘、AI 微调、撤销 / 重做、诊断、配置、沙箱试运行、模拟数据、瀑布流回放、返回编辑）、主题切换、业务视图切换、导入接口、模板中心、执行状态栏、AI IDE 视图切换与对话开关、Shadow Graph 评审条（按钮文案改为"全部采纳 / 放弃"，增删改计数改用 `--cm-diff-*`）。模板中心按钮不再使用蓝色。
- 新增守卫测试 `src/styles/designRules.test.ts`：禁止在强调色底上写死白字；已迁移的文件不允许再出现 emoji。
- **数据图标改为图标名**：新增 `CmIcon` 组件与 `iconRegistry`（66 个 Lucide 图标名 + 77 个常见 emoji 别名）。内置动作、模板、任务类型元数据、演示流程库数据的 `icon` 由 emoji 改为图标名（如 `'server'`、`'rocket'`）；`ActionDefinition.icon` / `WorkflowTemplate.icon` 仍为 `string`，宿主或治理服务传入的 emoji 会映射为对应图标显示，未知值显示默认图标。业务卡片、动作选择器、运行故事线、模板中心与向导、AI 指令中心、表单向导、提案卡片中的 emoji 一并换成图标；按钮与状态文案去掉了前缀 emoji。`getTaskTypeMeta` 的默认图标由 `'⚙️'` 改为 `'settings'`。
- **AI 面板全面换用 tokens 与图标**：`AiNative.css` 的 223 处写死颜色、`components/AiNative` 各组件内联颜色全部改为 `--cm-*` / 旧别名，透明度用 `color-mix(in srgb, var(--cm-x) N%, transparent)`；状态色走 `--cm-status-*`，AI 元素走 `--cm-ai`，阴影走 `--cm-shadow-*`，状态色填充上的文字用 `--cm-on-danger`。内联指令浮层（⌘K）不再固定深色，随主题切换；Mermaid 图改用主题变量。AI 面板全部 emoji 与 ✓ ✕ ↺ ▶ 等符号换成 Lucide 图标，执行结果、连接测试与内联指令提示均为"颜色 + 图标 + 文字"。文案："确认执行"改为"运行"、"✓ 确认"改为"立即执行"、"执行中…"改为"运行中"，错误提示说明如何处理。
- 演示站顶栏、示例选择器、文件与演示设置菜单、AI 配置弹窗去掉 emoji；运行态示例用"运行中 / 失败 / 成功"标注状态。`HeaderPopover` 的 `icon` 接受 React 节点。
- 守卫测试加强：emoji 检查也拦截 ✓ ✕ ✗ ↺ ▶ ⚠ 等文字符号；`components/AiNative` 下所有文件自动纳入"无 emoji"与新增的"无写死颜色"检查。截图回归新增 AI 设计器视图（深 / 浅），浅色图标检查也覆盖 AI 视图。

- **演示站改用 CMASTER 主题**：`DemoApp.css` / `DemoHeader.css` 全部换用 tokens，删除 `.app.light-theme` 平行主题（它用 slate 色重新声明了 `--bg-*` / `--text-*`，优先级高于 CMASTER 浅色主题，导致演示站浅色模式并非 CMASTER 浅色）以及 19 组已无引用的旧样式；AI 已配置状态改为成功色浅底 + 文字，开关、弹出层、搜索框、错误提示随主题切换。`demo/` 纳入"无写死颜色"检查。

- **业务模式、模板中心与对话框换用 tokens 与图标**：`components/business`、`components/template`、`components/onboarding`、`components/import` 及沙箱试运行、全屏编辑、确认 / 输入对话框、Toast、空状态面板中约 400 处写死颜色改为 tokens（中性色按用途映射到 `--bg-*` / `--text-*` / `--border-*`，深浅自动切换；沙箱试运行弹窗不再在组件内判断深浅），约 85 处 emoji 换成 Lucide 图标或去掉（下拉选项与标签文字中的 emoji 直接删除）。上游数据选择器的步骤图标改用 `CmIcon`。守卫测试改为按目录登记已迁移代码，同时检查 emoji 与写死颜色。

- **IDE 其余组件完成迁移**：任务详情面板、节点（循环 / 分支 / 并行 / 任务 / 子流程）、执行瀑布图 / 摘要 / 任务面板、健康检查、JSON 预览与结构化查看器、参数建议浮层、旧版 AI 对话面板、设置面板、画布控件与 `executionStyles.css` 的写死颜色与 emoji 全部替换。运行态节点角标改为 Lucide 图标 + 中文状态词（提示与无障碍名称）；任务详情的专项配置区图标改为 Lucide，并修复了把十六进制透明度拼到 `var()` 上导致背景与边框失效的问题；小地图运行中节点改用运行青色（原为橙色）。
- `getTaskTypeMeta().color` 改为分类色 token（`--cm-cat-task / control / data / human`，终止为失败色）；`getCategoryIcon()` 返回图标名（配合 `CmIcon` 使用），`getCategoryColor()` 返回状态色 token；解析器生成的分支连线颜色改用 token。模板脱敏与接口导入生成的默认图标改为图标名。Mermaid 中 WAIT / HUMAN 节点改用圆角形状代替 emoji 前缀。
- **守卫覆盖全部 UI 源码**：`designRules.test.ts` 对 `src/` 下所有 `.ts/.tsx/.css` 检查 emoji 与写死颜色，仅保留 6 个有理由的例外（tokens 桥接文件、Logo 图形、蓝色品牌色样、emoji 别名表、两个只给模型看的 AI 上下文文件）。

- **统一使用 CMASTER 标志**：`BrandLogo` 换为 CMASTER 标志（C 形圆弧 + 三个系统节点 + 中心枢纽，标志橙 `#ff6a13`，节点内芯随主题取表面色），演示站顶栏字标改为 CMASTER（首字母 C 为品牌橙）；`public/logo.svg`（favicon）换为 CMASTER 应用图标；首页与 v1.0 / v1.1 / v1.2 历史发布页顶栏的标志与字标同步替换。`BrandLogo` 的 props 不变。

- **宣传页换用 CMASTER 视觉，每个版本一个主题色**：新增 `src/marketing/campaign.css`，页面在 `<html>` 上声明 `data-campaign`，强调色统一走 `--a / --a-hi / --on`，其余颜色走 tokens。首页 v1.3.0 用 Glacier，v1.2.0 / v1.1.0 / v1.0.0 历史页分别用 Signal / Nebula / Ember；页面结构、文案与交互演示保持不变，去掉全部 emoji（对照表里的 ✓ / ✗ 改为"支持 / 不支持"标记）。首页产品名改为 CMASTER。`public/product-launch.html` 与 `docs/product-launch-v1.0.0.html` 两份旧副本改为跳转到 `v1-0.html`。新增 `releasePages.test.ts`：每页一个主题色、相邻版本不重复、无 emoji、颜色只来自 tokens。轮换规则见 `design/guidelines/marketing.md`「主题色轮换」。

### Fixed
- 浅色主题下业务卡片等处的图标不可见：宿主页面在 `[data-mode]` 之外解析的深色文字色被浅色 IDE 继承。每个 `[data-mode]` 根节点现在重设 `color: var(--text-primary)`。业务卡片中禁用的上移 / 下移箭头改用 `--cm-text-disabled`，两个主题下都可辨认。
- AI 面板中把十六进制透明度拼接到颜色字符串上的写法（如 `${color}40`）改为 `color-mix`，避免颜色换成变量后边框失效。

---

### Fixed（v1.3.1 · 专业模式编辑器结构正确性）
- **E1–E4 新建任务的字段位置按 Conductor 要求写**：SWITCH 写 `evaluatorType + expression`（评估模式新增 graaljs，导入的 `expression` 在面板正常显示），DECISION 仍用 `caseValueParam`；INLINE 的 `evaluatorType` 写入 `inputParameters`（导入时迁移旧版顶层值）；HTTP 默认值写入 `inputParameters.http_request`，新节点不再报"缺少 uri"；KAFKA_PUBLISH 统一读写 `inputParameters.kafka_request`。新建默认值集中到 `src/utils/taskEditing.ts` 的 `createDefaultTask`。
- **E5 / E6 并行分支**：不再在每次操作时把 JOIN 的 `joinOn` 覆盖成全部分支末尾，只在分支末尾因结构编辑变化时更新对应项，只等待部分分支的设计会保留，画布用"不等待"虚线标出未被等待的分支；新建 FORK_JOIN 的空分支占位改为可点击的 "+"，点击或在占位与 JOIN 之间的连线上点 "+" 都会插入到该分支。
- **E7 / E14 名称校验**：引用名改成重复、含非法字符或保留字（`workflow`、`__` 开头）时，面板显示原因并保留草稿，store 也拒绝提交；分支重命名拒绝已存在的名称与保留字 `default`，添加 / 重命名分支对话框即时提示。`renameDecisionBranch` 现在返回 `boolean`。
- **E8 / E15 粘贴**：选中 FORK 时粘贴到配对 JOIN 之后；粘贴容器任务时子树内的引用（`loopCondition` 中的 `$.ref`、`${兄弟.output}`、`joinOn`）随引用名一起改名，指向外部的引用不变；粘贴 FORK_JOIN / FORK_JOIN_DYNAMIC 自动补上配对 JOIN。
- **E9 撤销**：撤销历史只记录流程数据，⌘Z 不再撤回主题、模式、连线样式、布局方向与锁定状态；同一字段的连续输入合并为一条撤销记录。
- **E10–E13 画布操作**：关闭 ReactFlow 内置的 Backspace 删除（以前只删画布不删定义），键盘删除统一走 `removeNode` 并先确认；关闭手动连线（不会写入定义）；删除或撤销后若选中的任务已不存在则关闭详情面板；删除 JOIN / FORK / 容器任务时确认文案写明会连带删除哪些任务。
- **E16 / E17**：SWITCH 出口连线上的 "+" 插到 SWITCH 之后（同层）而不是分支内部；WAIT 在"等待时长 / 等待到指定时间"之间切换时删除另一个字段。
- **E18 JSON 输入框可以逐字输入**：Headers、Body、子流程入参、启动工作流入参、终止输出、Kafka 消息、变量与通用 inputParameters 改为本地草稿，失焦时解析，格式有误时保留草稿并说明原因。
- **E19 / E20**：超时、重试策略、重试延迟、超时策略写入 `taskDefinition`（读取时兼容旧版顶层值，面板注明会代替已注册的同名任务定义）；`retryCount` 仍写在任务上。FORK_JOIN_DYNAMIC 简化模式字段写入 `inputParameters`（导入时迁移）。
- **E21 校验**：新增"表达式引用了不存在的任务"、"SWITCH 缺少 expression / evaluatorType"、"FORK 后未紧跟 JOIN"、"joinOn 引用不存在的任务"；只写了 `caseValueParam` 的旧 SWITCH 给出警告。修复误报：`TERMINATED` 是合法终止状态，缺省 `version` 不再报错。
- **E22 工作流入参**：设置面板编辑入参后 `inputParameters` 保持为参数名数组；类型、说明、必填、示例写入 `inputSchema`（JSON Schema），默认值写入 `inputTemplate`。`parseWorkflowInputParams(raw, def?)` 新增可选的第二个参数用于读回这些信息，新增 `serializeWorkflowInputParams`。
- **E23 JSON 面板**：非编辑态一律只读；"当前选中节点"应用时整体替换任务对象（新增 store 动作 `replaceTask`），删掉的键会真正删除；节点标签不再列出 `*_dynamic_placeholder`。在 JSON 面板中按 ⌘S 只应用到画布。
- ⌘S 在输入框中也生效；宿主没有提供 `onSave` 时给出提示，而不是没有反应。W-LSP 对 SUB_WORKFLOW 的输出补全改为 `subWorkflowId`，引用名重构同时覆盖 `caseExpression`。

## [1.3.0] - 2026-10-24

> 主题：自助接入 —— 新团队在测试环境里自己完成「登记产品 → 规范命名建流程 → 接上已有接口 → 试跑 → 申请上线」。设计见 `docs/design/v1.3.0-自助接入设计.md`。

### Added
- **扩展点注册机制**：新增 `IdeProviders`（`library` / `onboarding` / `telemetry`）、`WorkflowIdeProvider` 与 `useIdeProviders()`；`WorkflowIDE` / `AiWorkflowIDE` 新增可选 `providers` prop。逐字段解析：专用 prop（如 `libraryProvider`）> 组件 `providers` > 外层 `WorkflowIdeProvider` > 无；按字段比较引用，宿主每次渲染新建 `providers` 对象不会触发目录重载。只传 `libraryProvider` 的现有用法行为不变。新增纯函数 `resolveProviders` / `stabilizeProviders`。
- **自助接入向导**：配置 `providers.onboarding` 后，两个 IDE 工具栏出现「新建流程」（3 步向导：产品 → 命名 → 起点）与「申请上线」（仅 `tmp` 类型流程可用，选择 `custom` / `std`、预览正式名称、指数退避轮询审批进度，2 秒起 30 秒封顶）；`WorkflowIDE` 在测试环境开放试用且用户无所属产品时，空画布显示「开始试用」引导卡片。命名遵循 `类型-层级-业务域-产品-功能`，试用环境类型固定 `tmp`，生产环境可选 `custom` / `std`；向导选择的层级在宿主未传 `currentWorkflowLevel` 时作为默认值。接口失败可重试且保留已填内容，产品被他人占用时提示联系负责人。不配置 `onboarding` 时行为与之前完全一致。新增导出 `OnboardingProvider` 及相关类型（`OnboardingContext`、`ProductInfo`、`StartTrialResult`、`PromotionStatus`）、`WorkflowNameBuilder`、`OnboardingWizard`、`PromotionPanel`、`OnboardingGuideCard` 与纯函数 `buildWorkflowName` / `suggestFuncSlug` / `buildSkeletonWorkflow` / `promotionTargetName` / `nextPollDelay` 等（`/ai` 入口同步）。
- **接口导入**：工具栏「导入接口」（业务 / 专业模式均可用）粘贴或上传 OpenAPI 3 / Swagger 2 / Postman Collection v2.1（JSON）或 curl 命令，勾选接口后生成 HTTP 业务动作并追加为步骤（编译为 Conductor `HTTP` 任务，重新打开仍还原为同一动作）。字段沿用 `buildFields`、出参沿用 `buildOutputs`（键为 `response.body.<字段>`）。**敏感头不落定义**：`Authorization` / `Cookie` / `X-Api-Key` / 名称含 token、secret、api-key 的头与 curl `-u` 一律替换为 `${workflow.input.xxx}` 占位并提示。仅支持 JSON，YAML 提示先转 JSON；导入结果只在当前流程与本会话动作库内，登记为流程库能力属 v1.4.0。新增纯函数 `detectFormat` / `parseApiText` / `parseOpenApi3` / `parseSwagger2` / `parsePostman21` / `parseCurl` / `buildHttpAction` / `appendImportedActions`、组件 `ApiImportDialog`（`onInsert` 回调，便于向导复用）与 `WorkflowIDERef.openApiImport()`。Demo 样例见 `public/sample-imports/`。
- **接入埋点 `TelemetrySink`**：新增 `IdeEvent` / `IdeEventName` / `TelemetrySink` 与 `createTelemetryBuffer`（5 秒或 20 条攒批，页面隐藏 / `pagehide` 时 flush，sink 异常不影响界面，仅 `console.warn` 一次；无 sink 时丢弃）。首批 10 个事件：`ide_opened`、`trial_started`、`workflow_created`、`step_added`、`api_imported`、`sandbox_run`、`workflow_saved`、`promotion_requested`、`promotion_state`、`ai_event`，各事件的 `props` 与上报它的 IDE 见接入指南。事件只含名称、时间、IDE 类型、流程名与简单属性，`props` 中非 string / number / boolean 的值会被剔除，不采集参数值、表达式、提示词、对话内容与执行数据。`sandbox_run` 带 `props.entry`（`business` / `template` / `pro`），覆盖业务卡片、模板中心（快捷试跑与向导内试跑）与专业模式（一键试跑与沙箱配置弹窗）三个入口，同一次试跑只报一条；`step_added` 覆盖 `builtin`（含专业模式画布新增）/ `library` / `import` / `template`。`StepFlowEditor` 新增可选回调 `onStepAdded` / `onSandboxRun`，`TemplateGallery` 新增可选 `onSandboxRun`。
- **Demo**：`createMockProviders()`（模拟治理服务流程库 + 自助接入 + 控制台 `[telemetry]` 埋点），`DemoApp` 改用 `WorkflowIdeProvider`；工具栏「流程库」重新加载 / 模拟失败照常可用；`createMockOnboardingProvider()`（内存产品、冲突、失败注入、上线申请逐步推进与驳回）；顶栏重新整理：常用的模式切换常驻，演示用开关（只读、允许操作、流程库加载、TEST / PROD 环境、重置产品、层级）收进「🧪 演示设置」面板，文件操作收进「文件」菜单，窄屏不再横向溢出。
- **文档**：接入指南新增 4.5 节（`WorkflowIdeProvider` / `providers` 的解析顺序、稳定性、`TelemetrySink` 示例、事件与 `props` 一览及数据安全说明）与 4.6 节（`OnboardingProvider` 契约、与治理服务接口对照、示例实现）；发布计划补全 v1.3.0 人工走查清单。
- **测试守卫**：`IdeEventName` 清单（`IDE_EVENT_NAMES`）与设计文档、接入指南事件表必须一致；扫描所有 `track(...)` 调用，事件名必须在清单内、清单内事件必须有上报、`props` 取值只能来自白名单。

### Fixed
- 开发环境 React StrictMode 下 `ide_opened` 会重复上报：现按 IDE 实例去重（守卫保存在 ref 中），真正重新挂载仍各报一次。

---

## [1.2.0] - 2026-10-23

> 主题：流程库就绪 —— 标准能力一次沉淀，处处安全复用。

### Added
- **下拉字段支持「插入数据」**：可改为引用上游步骤输出或全局入参（运行时取值），也可切回选择；已保存的值为 `${...}` 表达式时自动进入动态取值。字段 `acceptsPills` 为 `false` 时不提供。
- `/ai` 入口补充导出 `parseWorkflowName`、`validateWorkflowName`、`createConductorLibraryProvider`。
- **流程库能力动作**：由 Conductor 标准 `WorkflowDef` / 已注册 `TaskDef` 生成业务动作（`buildActionFromWorkflowDef` 等），入参取自 `inputSchema`，出参取自 `outputSchema` / `outputParameters`；流程库能力编译为 `SUB_WORKFLOW`，步骤记录 `libraryRef`，**首次引用时固定版本，库升级后不自动跟随**，由用户确认后手动升级。
- 分支 / 并行泳道 / 循环体内支持任意层级嵌套控制流。
- **流程库数据源 `LibraryProvider`**（设计见 `docs/design/流程库数据源-LibraryProvider设计.md`）：新增公共层 `src/library`，同一份规范化目录（`LibraryCatalog`）投影为业务动作（`toActions`）、AI 任务 Schema（`toTaskSchemas`）与 AI 流程库目录（`toLibraryItems`），不再需要宿主把同一批能力分别喂给 `actions` / `workflowLibrary` / `taskSchemas` 三处。版本统一规范化为整数；同名多版本取最大版本；历史版本按需获取并缓存。
- **两个 IDE 新增 `libraryProvider` prop**：`WorkflowIDE` 将库内流程注册为业务动作；`AiWorkflowIDE` 合并进 AI 目录 / Schema / 检索工具。同名条目 Provider 优先于静态 prop；不传该 prop 时 `actions` / `workflowLibrary` / `taskSchemas` 行为不变。目录按 IDE 实例独立，`libraryProvider` 变化时重新加载，卸载时中止进行中的请求。
- **`WorkflowIDE` 新增 `currentWorkflowLevel`**：提供后动作选择器隐藏违反分层调用规则的流程库动作（L1 不显示 L2/L3，L2 不显示 L3）；已下线条目不出现在选择器中，已引用的步骤照常显示与编译。动作选择器与 `LibraryPanel` 显示「加载中 / 加载失败，点击重试」，失败不阻塞编辑。
- **`AiWorkflowIDE` 新增 `promptCatalogLimit`**（默认 50）：流程库目录注入系统提示词按层级 L3 → L1 截断，超出部分提示 AI 改用 `search_workflow_library`；Provider 实现了 `search` 时检索走服务端，否则在本地目录内匹配（结果最多展示 50 条）。
- **默认 Conductor 实现 `createConductorLibraryProvider`**：直接读取 Conductor OSS 元数据接口（`/metadata/workflow`、`/metadata/workflow/{name}?version=`、可选 `/metadata/taskdefs`），同名多版本取最大版本，404 视为不存在；认证头由宿主通过 `headers()` 注入（组件库不保存凭据），并支持 `fetch` 注入、`filter`（限定流程库范围）、`resolveExtension`（补充层级 / 分类 / 图标 / 下线标记）与网关路径覆盖。
- **流程库能力升级差异与「版本不可用」**：点击「⬆ 有新版本」时取旧、新两个版本的定义，展示升级差异（新增 / 删除 / 类型变化的入参、新增 / 删除的出参；会影响已填内容的条目置顶，如「已填写的值将丢失」「下游引用将失效」），无差异时提示「入参出参未变化」，确认后才升级；升级时同步清理已删除入参的值、补上新增入参的默认值。固定版本在库中不存在或已下线时徽标显示「⚠ 版本不可用」，步骤保持原样编译，不自动改版本；目录加载失败时不显示新版本提示。新增纯函数 `diffWorkflowVersions` / `summarizeDiff` / `resolveLibraryBadgeState` 并从入口导出。
- **流程库「业务域」**：`LibraryExtension` / `ActionDefinition` / `WorkflowLibraryItem` 新增可选 `domain`（业务域，取值由服务端提供，不写死列表）。新增纯函数 `parseWorkflowName` / `validateWorkflowName`（命名规范 `类型-层级-业务域-产品-功能`），记录未提供 `extension.domain` / `level` 时按名称兜底，显式值优先。动作选择器在存在业务域时按业务域分组（无业务域归「其他」），AI 系统提示词目录显示 `[业务域: X]`，`search_workflow_library` 新增 `domain` 参数，`LibraryPanel` 显示并可按业务域筛选。不使用业务域时行为不变。
- **Demo 演示后端**（仅演示站使用，不进入包产物）：新增模拟编排治理服务 `src/demo/mockGovernance/`——12 个按命名规范 `类型-层级-业务域-产品-功能` 命名的流程库能力（覆盖 9 个业务域与 L1 / L2 / L3，含完整中文 schema）、2 个原子任务，以及多版本、已下线、固定版本被撤回等场景；`createMockGovernanceProvider` 带模拟网络延迟、可注入加载失败、支持 `AbortSignal` 与服务端检索。演示站的 `WorkflowIDE` / `AiWorkflowIDE` 已接入，工具栏新增「流程库」（重新加载 / 模拟加载失败）与「层级」（`currentWorkflowLevel`）控制，示例列表新增「引用库能力」示例（含「有新版本」「版本不可用」）。
- **宿主接入指南** `docs/integration-guide.md`：面向内部项目，覆盖安装与入口、最小接入、全部已有扩展点、用治理服务实现 `LibraryProvider`、命名规范与业务域、版本固定行为、常见问题与各版本计划的扩展点；示例实现 `src/demo/examples/governanceLibraryProvider.ts`（ETag 缓存、404 → `null`、认证头注入、`AbortSignal`）随 CI 类型检查并带单元测试。

### Changed
- **AI IDE 的「业务视图」改用经典模式的业务卡片流**（`StepFlowEditor`）：原只读的步骤卡片（`BusinessCanvas`）移除。业务视图现在可直接编辑，并支持流程库能力（按业务域选择、版本固定与升级差异）、下拉字段插入数据、多层嵌套控制流与运行故事线。步骤头部的「🤖」按钮保留原有「请 AI 介绍该步骤」的能力；AI 方案待审阅时业务视图只读。业务视图下的编辑只更新定义，切回技术视图时再补建画布。
- `StepFlowEditor` 新增可选 `onAskAi`。

### Fixed
- **业务动作选择弹窗跟随主题**：弹窗经 Portal 渲染时未带主题属性，暗色模式下背景透明、配色与项目不一致；现已修复，并将筛选拆为「分类」「业务域」两行、搜索移到标题栏、卡片显示层级与业务域。沙箱配置弹窗与参数联想浮层同样补上主题属性。
- **业务卡片展开后不再重复显示动作信息**：去掉表单顶部与步骤头部重复的名称 / 描述横幅，保留敏感操作提示。
- **AI 生成的子工作流不再随意填版本**：此前 `workflowSynthesizer` 对缺少版本的 `SUB_WORKFLOW` 一律填 `t.version ?? 1`；现在新建引用固定为流程库目录的当前最新版本（目录没有该流程时保持原行为并提示）。已有版本号以及画布上已存在的步骤一律不会被自动改变。
- `LibraryPanel` 插入子工作流时不再把 `"1.2.0"` 这类版本串错误解析成 `120`。
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
- 覆盖率统计补充 stepmodel / actions / 沙箱 / W-LSP / 脱敏器 / store；CI 新增阻塞式全量类型检查（并修复测试与演示代码中原有的类型错误）；ESLint 预置 TS 规则（安装 `typescript-eslint` 后自动启用）。

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
