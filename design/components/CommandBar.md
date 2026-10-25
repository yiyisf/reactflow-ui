# CommandBar

按 ⌘K / Ctrl K 在画布上唤起的 AI 指令栏（InlineCanvasCopilot）。

## 规则
- 宽 520px，`radius-xl`，`shadow-dialog`，背后 `overlay` 遮罩；选中节点时出现在节点上方，否则在视口上方 1/4 处。
- 第一行是自然语言输入，左侧 Sparkles 图标用 `brand-text`；第二行显示作用对象（DataPill 形式）。
- 建议动作列表可用方向键选择，回车执行；执行结果一律以 ShadowDiff 提案呈现。
- Esc 关闭；输入为空时显示最近使用的指令。
