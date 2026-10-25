# LandingHero

版本宣传页与文档首页的首屏，是 Bento Launchpad 风格最集中的体现。

## 结构（自上而下）
1. 顶栏：标志 + 字标、版本胶囊（`cm-version`）、锚点导航、主按钮"进入工作台"。滚动后背景变为 `surface-0` 80% + 模糊。
2. eyebrow：产品名 + 版本号。
3. 标题：`display-xl`，两行；第二行是本版本的核心承诺，用渐变（`cm-grad`，浅色主题自动改为 `brand-text` 纯色）。
4. 导语：`prose`，`text-secondary`，最宽 640px，一句话讲清"谁、在哪、能做什么"。
5. 特性胶囊：3–5 个，每个一图标 + 一短语，可内嵌代码胶囊。
6. 安装终端（Terminal）。
7. 行动按钮：一个主 CTA（`cm-btn--cta`，带 `glow-brand`）+ 一个次按钮 + 一个幽灵按钮。
8. 发布说明：`caption`。

## 规则
- 背景只用 `cm-aurora`（三层极光），不加图片、粒子或网格地面。
- 整屏只有一个 `glow-brand`。
- 标题写结果，不写功能名堆砌。
