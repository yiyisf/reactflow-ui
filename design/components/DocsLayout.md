# DocsLayout

文档站正文页的整体布局（详见"文档站"一节）。

## 规则
- 顶部导航 `surface-0` 80% + 模糊，含标志、版本胶囊、⌘K 搜索、GitHub、"进入工作台"。
- 侧边栏 `surface-1`，分组标题用 eyebrow（`text-muted`）；当前页 `brand-tint` 底 + `brand-text` + 左侧 2px 橙色指示线。
- 正文最宽 760px：面包屑 → eyebrow（版本）→ H1 → 一句"读完能做到什么" → 正文。
- 右侧目录当前项 `brand-text`；1280px 以下隐藏。
- 正文页不使用极光背景，只有文档首页使用。
