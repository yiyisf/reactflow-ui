# BentoGrid

Bento 卡片与 12 列网格，用来组织宣传页与文档首页的内容。

## 使用者提供
- 每张卡：标签（`cm-card__label`，品牌 / `--data` / `--ai` 三种）、`title-lg` 标题、`body` 描述，可选内容（代码块、列表、表格、截图）。
- 列宽：8 + 4、4 + 4 + 4、6 + 6、12。

## 规则
- 卡片 `surface-2` + `border-default` + `radius-xl` + `shadow-card`，内边距 `space-6`，网格间距 `space-4`。
- 每个区块最多一张 `is-key` 强调卡（橙色描边 + `glow-select`）。
- 标签颜色表达语义：品牌（能力、版本）、`--data`（数据、安全、接口）、`--ai`（AI、实验）。
- 960px 以下单列。
