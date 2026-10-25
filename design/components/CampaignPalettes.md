# CampaignPalettes

海报与社媒图片可选的五个活动主题色；主题色只替换强调色，标志始终是品牌橙。

## 使用者提供
- 主题：Ember / Glacier / Nebula / Signal / Solar 之一，按内容类型选（见"海报与社媒"一节的对照表）。
- 在画面根元素上设置 `--a: var(--campaign-<主题>)`、`--a-hi: var(--campaign-<主题>-hi)`、`--on: var(--on-campaign-<主题>)`，标题关键词、eyebrow、轨道图形和行动按钮都引用这三个变量。

## 规则
- 一张图一个主题色；非 Ember 主题时，标志是画面里唯一的橙色。
- 行动按钮文字用对应的 `on-campaign-*`，不要用白字。
- 产品界面（IDE、文档站）不使用活动主题色，始终用品牌橙。
