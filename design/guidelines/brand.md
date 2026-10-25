# CMASTER 品牌手册

CMASTER 是编排平台、Workflow IDE（`@yiyi_zhang/reactflow-ui`）、文档站与所有宣发素材共用的设计语言。风格代号 **Bento Launchpad**：深海军蓝夜空、顶部三色极光、便当格卡片、等宽小标题，用橙色点亮可以操作的地方。

## 气质

像一块深夜里的发射台控制面板：底色沉静，信息被整齐地装进一格一格的卡片，真正需要你行动的地方亮着橙色的光。

- **沉静的深色。** 中性色是偏冷的海军蓝（`canvas` → `surface-3`），让橙色、青色、靛色三种光都显得干净，不脏不闷。
- **一格一事。** 内容装进 Bento 卡片，每张卡只讲一件事：一个能力、一个数字、一段代码。
- **技术感来自真实细节。** 等宽字体的小标题、代码胶囊、版本号、命令行，而不是装饰性的科幻元素。
- **三种光，三种含义。** 橙色 `brand-500` = 操作与品牌；青色 `data` = 数据与运行；靛色 `ai` = AI。不要混用。

## 标志性元素

这五样东西组合在一起，就是 CMASTER 的样子。产品、文档、宣发都从这里取。

1. **极光背景**：页面顶部三层径向光晕叠在 `canvas` 上——中上方 `aurora-brand`（椭圆 85%×55%），右上 `aurora-data`，左中 `aurora-ai`。只用于宣传页、文档首页、海报、视频；IDE 内部和文档正文页不用。
2. **Bento 卡片**：`surface-2` 底、1px `border-default` 描边、`radius-xl`（大卡）或 `radius-lg`（小卡）、`shadow-card` 顶部高光。悬停时描边变 `border-strong`，可选中时用 `glow-select`。网格间距 `space-4`。
3. **等宽小标题（eyebrow）**：`eyebrow` 样式，大写英文，`brand-text` 色，放在区块标题或卡片标题上方，例如 `SELF-SERVICE PATH`、`API IMPORT`。
4. **渐变关键词标题**：`display-xl` / `display` 居中，标题里的关键词用 `text-primary` → `brand-300` 的线性渐变（浅色主题用 `brand-text` 纯色，不用渐变）。一个标题最多一处渐变。
5. **代码胶囊**：行内技术名词用 `code-sm`，`surface-3` 底、`border-default` 描边、`radius-sm`，例如 `WorkflowIdeProvider`。

## 设计原则

1. **画布是主角（IDE）。** 外围面板退后，只有节点、连线和选中态有颜色。
2. **橙色只做一件事。** 主操作、选中、当前标签与模式、运行、品牌标识。产品界面中约一成面积，宣传页可到两成。警告用 `status-warning`，不用橙色。
3. **状态一眼可读。** 颜色 + 图标 + 中文词，缺一不可。
4. **渐进披露。** 业务 / 标准 / 开发者三档密度；文档同样分"快速上手"和"深入参考"。
5. **AI 先预览后落地。** Shadow Graph 提案，采纳后可整体撤销。
6. **真实胜过修饰。** 截图、示例、数字都用真实的或可核实的；没上线的能力不展示。

## 文案

- **中文优先，动词开头。** "运行""发布到能力库""复制命令"；不写"确定""提交"。
- **标题写结果，副标题写怎么做到。** 例："五分钟走完第一个流程" + "登记产品、规范命名、选择起点、沙箱试跑、申请上线。"
- **称呼用"你"。** 报错写"发生了什么 + 怎么修"。
- **中英文与数字之间加空格。** 技术标识一律代码胶囊。
- **不用 emoji。** 包括按钮、标题、链接、页脚。图标统一用 Lucide。
- **统一术语：**

| 用这个词 | 指 | 不要写 |
|---|---|---|
| 流程 | 一个 workflow 定义 | 工作流（开发者文档可并用） |
| 步骤 | 业务模式中的一张卡片 | 任务卡 |
| 节点 | 开发者模式画布上的 task | 组件 |
| 能力 | 能力库里可复用的标准流程（std） | 模板、原子 |
| 试运行 | 浏览器本地沙箱执行 | 沙箱跑 |
| 运行 | 在真实环境执行 | 执行 |
| 发布 | 沉淀为能力库中的能力 | 上架 |

## 色彩

- **层级：** `canvas`（页面与画布）→ `surface-0`（外壳）→ `surface-1`（面板）→ `surface-2`（卡片、节点）→ `surface-3`（输入框、胶囊、悬停）。
- **文字：** `text-primary` 标题与正文，`text-secondary` 导语与描述，`text-muted` 提示与脚注；在所有 surface 上满足 4.5:1。
- **品牌：** 主按钮 `brand-500` + `on-brand` 文字；悬停 `brand-400`，按下 `brand-600`；橙色文字和细线用 `brand-text`；选中底色 `brand-tint`；宣传页主 CTA 加 `glow-brand`。
- **数据与 AI：** `data` / `data-tint`；`ai` / `ai-tint`。两者只做小面积标记。
- **状态：** `status-*` + 对应 `*-tint`。
- **节点分类：** `cat-task`、`cat-control`、`cat-data`、`cat-human`，只用于 28px 图标块和库条目色点。
- **不要：** 大面积渐变底、紫蓝渐变按钮、彩色左边框卡片、把状态色当装饰。

## 字体

- **Geist**（拉丁）+ 苹方 / Noto Sans SC（中文）作为 `sans`；**Geist Mono** 作为 `mono`。均来自 Google Fonts。
- 宣传页与海报：`display-xl`、`display`、`metric`。产品与文档：`title-lg` / `title-md` / `title-sm`、`prose`（文档正文）、`body`、`body-sm`、`caption`。等宽：`eyebrow`、`code`、`code-sm`。
- 字标 CMASTER 用 `sans` 800、字距 -0.02em，首字母 C 用 `brand-500`。
- 正文行宽不超过 68 个汉字；数字列开启 `tabular-nums`。

## 间距与布局

- 4px 网格。控件 `space-2`，节点 `space-3`，面板 `space-4`，Bento 卡片内边距 `space-6`，卡片间距 `space-4`。
- 宣传页区块之间 `space-24`，区块标题与内容之间 `space-8`；内容最大宽度 1120px。
- IDE 区域尺寸见"IDE 布局与交互"；文档站布局见"文档站"。

## 圆角与阴影

- 徽章、胶囊 `radius-sm`；按钮、输入 `radius-md`；节点、小卡、代码块 `radius-lg`；大 Bento 卡、对话框、截图 `radius-xl`；版本胶囊、模式切换 `radius-pill`。
- 卡片 `shadow-card`，浮层 `shadow-float`，对话框与营销截图 `shadow-dialog`。停靠面板只用描边。

## 动效

- 120ms 微交互，200ms 面板与浮层，320ms 画布镜头。缓动 `cubic-bezier(.2,.8,.2,1)`。
- 宣传页：区块进入时上移 12px 淡入一次；极光光晕可以 20s 极慢漂移。不做视差和粒子。
- 运行光晕 1.6s 脉动，血缘虚线 1s 流动。尊重 `prefers-reduced-motion`。

## 图标

- **Lucide**，线宽 1.75；工具栏与菜单 16px，节点图标块 14px，Bento 卡片标题前 18px，空状态 24px。
- IDE 映射：数据血缘 `Waypoints`，AI 微调 `Sparkles`（`ai` 色），撤销/重做 `Undo2`/`Redo2`，诊断 `Stethoscope`，配置 `Settings2`，试运行 `FlaskConical`，模拟数据 `SlidersHorizontal`，瀑布流回放 `ChartGantt`，业务模式 `LayoutList`，开发者模式 `Code2`。
- 只有图标的按钮必须有 `title` 与 `aria-label`。
- 数据里的图标（动作、模板、任务类型、流程库扩展字段）存图标名而不是 emoji，例如 `icon: 'server'`，用 `<CmIcon name={...} />` 渲染；可用名称见 `src/components/icons/iconRegistry.ts`。宿主或治理服务仍传 emoji 时，常见 emoji 会自动映射为对应图标，未知值显示默认的设置图标。

## Logo

- 标志：C 形圆弧 + 三个系统节点 + 中心枢纽。深色背景用 `cmaster-mark-dark.svg`，浅色用 `cmaster-mark-light.svg`，应用图标与 favicon 用 `cmaster-app-icon.svg`。
- 最小 16px，周围留白不少于标志高度一半；不改色、不描边、不加阴影。
- 现有 `BrandLogo` 与 `public/logo.svg`（靛紫/青色）替换为此标志。

## 无障碍

- 焦点环：2px 实线 `focus-ring`，偏移 2px。
- 文本 4.5:1，图标与控件边框 3:1，深浅主题都要满足。
- 画布键盘操作：⌘Z / ⌘⇧Z、⌘C / ⌘V、Delete、⌘S、⌘K。
