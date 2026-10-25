# WorkflowNode

画布上的一个 Conductor task。由分类图标块、标题、技术元信息和状态区组成。

## 使用者提供
- `category`：task / control / data / human，决定图标块颜色（`cat-*`）与 Lucide 图标。
- `title`：中文业务名称（`title-sm`）。
- `meta`：`taskReferenceName · TYPE`（`code-sm`，`text-muted`）；业务模式不显示。
- `status`：执行状态，见 StatusBadge。

## 状态
- 默认：`surface-2` + `border-default` + `shadow-node`。
- 选中：1.5px `brand-500` 边框 + `glow-select`。
- 运行中：`status-running` 边框 + 脉动 `glow-run`。
- 成功：`status-success` 边框。失败：`status-failed` 边框 + `failed-tint` 光晕。
- 跳过：虚线边框，60% 透明度。
- 开始/结束：`radius-pill` 胶囊节点。

## 规则
- 宽 240px（20 的倍数，对齐 `space-5` 点阵）；内边距 `space-3`；圆角 `radius-lg`。
- 分类色只出现在 28px 图标块中，不要把整个节点染色。
- 语义缩放：< 0.55 只留图标块和标题；> 1.15 在 meta 下方展开关键入参摘要。
