# StepCard

业务模式（StepFlow）中的一个步骤。用户只看到"做什么"和关键参数，不看到引用名和类型。

## 使用者提供
- 序号、步骤名（`title-md`）、引用的能力版本（`cm-tag--std`，如 `std v3`）。
- 2–3 个关键参数摘要（`dt` 用 `text-muted`，`dd` 用 `text-primary`）；引用上游的值显示为 DataPill。

## 规则
- 宽 420px，卡片间距 `space-8`，中间放插入按钮（悬停变 `brand-500`）。
- 选中：1.5px `brand-500` 边框 + `glow-select`，右侧打开属性面板。
- 分支、并行、循环使用容器卡片（DecisionBranchCard 等），外框同样式，内部嵌套步骤缩进 `space-6`。
- 无法用卡片表达的结构显示为"高级步骤"，提供"在开发者模式中编辑"链接。
