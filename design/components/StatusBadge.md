# StatusBadge

表示节点或流程的执行状态。状态永远同时使用颜色、图标和中文词。

## 映射（Conductor 状态 → 徽章）
| 状态 | 变体 | 图标 | 文字 |
|---|---|---|---|
| SCHEDULED | pending | Clock | 等待中 |
| IN_PROGRESS | running | 旋转圈 | 运行中 |
| COMPLETED | success | Check | 成功（或耗时） |
| FAILED / TERMINATED | failed | X | 失败 / 已终止 |
| TIMED_OUT | warning | TriangleAlert | 已超时 |
| PAUSED | warning | Pause | 已暂停 |
| SKIPPED | skipped | SkipForward | 已跳过 |

## 规则
- 高 22px，`radius-sm`，文字 12px 600；底色用对应 `*-tint`。
- 节点内空间不够时可只显示图标 + 耗时，但完整文字放进 tooltip。
- 运行中的旋转动画在 `prefers-reduced-motion` 下停止。
