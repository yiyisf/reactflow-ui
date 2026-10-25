# ModeSwitch

在同一份流程数据的三档信息密度之间切换（对应现有 ModeSlider 与 `VIEW_MODE_CATEGORIES`）。

## 规则
- 胶囊轨道 `surface-3` + `radius-pill`；当前档 `brand-500` 填充、`on-brand` 文字。
- 按钮用 `aria-pressed` 表达状态，键盘可用左右方向键切换。
- 切换时保留选中对象与视口中心；业务模式下无法表达的结构显示为"高级步骤"卡片。
- 文案固定为"业务 / 标准 / 开发者"，不要加 emoji 或英文。
