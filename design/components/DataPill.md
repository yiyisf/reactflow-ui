# DataPill

参数输入框中对上游输出的引用，以冰蓝胶囊显示，避免用户手写表达式。

## 两种呈现
- **业务 / 标准模式**：显示为"步骤名 + 字段中文名"（`<b>创建云主机</b> 公网 IP`）。
- **开发者模式**：显示原始表达式 `${create_vm.output.instanceId}`（`code-sm`）。
悬停任一形态时，tooltip 显示另一形态和最近一次运行的实际值。

## 规则
- 胶囊 `data-tint` 底、`data` 文字、`radius-sm`；可以与普通文字混排。
- 由 W-LSP 补全插入，只能引用合法上游祖先节点；上游被删除时胶囊变为 `status-failed` 描边并提示"引用已失效"。
- 字段：标签 12px 600 `text-secondary`，必填星号 `status-failed`，类型提示靠右 `text-muted`；聚焦 `brand-500` 边框 + `brand-tint` 光晕；错误时下方说明"缺什么、建议值"。
