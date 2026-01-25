# 最佳实践 (Best Practices)

本文档提供了在使用 Conductor Workflow IDE 建模时的常见场景和推荐范式。

## 1. 状态机模式 (State Machine)

处理复杂的业务状态流转时，建议使用 `SWITCH` 任务（代替旧版的 `DECISION`）。

**场景**: 订单状态流转 (Created -> Paid -> Shipped / Cancelled)。

**建议**:
- 使用 `SWITCH` 任务，基于 `${workflow.input.orderType}` 或前序任务输出进行判断。
- 确保覆盖 `default` 分支，用于处理未知状态或异常兜底。
- 尽量避免嵌套超过 3 层的 Switch，如有需要，考虑拆分为 `SUB_WORKFLOW`（子流程）。

## 2. 高并发处理 (Parallel Execution)

当需要并行处理一个动态列表时（例如：给 1000 个用户发送邮件），**严禁**使用简单的循环。

**场景**: 批量数据处理。

**建议**:
- 使用 **FORK_JOIN_DYNAMIC** 任务。
- **Dynamic Task**: 设置为一个子流程 (SubWorkflow)，在该子流程中处理单条数据。
- **Input Parameters**: 将列表数据传入 `dynamicForkTasksInputParamName`。
- **优势**: Conductor 后端会并发调度这些任务，极大提升吞吐量。

## 3. 异常重试与回滚 (Saga Pattern)

虽然 Conductor 支持 Task 级别的 `retryCount`，但有时我们需要更复杂的业务级重试。

**场景**: 支付失败后，需要调用退款接口。

**建议**:
- 使用 **DO_WHILE** 循环包裹核心逻辑。
- 在循环内部，使用一个任务检查业务状态。
- 如果失败，在循环内执行补偿任务（如退款 API），并在下一次迭代重试，或退出循环并标记失败。

## 4. 变量管理

**建议**:
- 尽量减少全局变量的使用。
- 优先使用 Result 引用：`${task_ref.output.someKey}`。
- 如果必须传递跨多层级的参数，建议在工作流启动时放入 `input`，或使用中间的 `JSON_JQ_TRANSFORM` 任务进行数据清洗和聚合。
