# Phase 5: 增强校验与工作流健康检查 (Advanced Validations)

## 1. 目标 (Objective)
建立一个强大的实时校验引擎，在用户设计工作流时确保逻辑正确、配置完整且符合 Conductor 标准，减少在部署后才发现的问题。

## 2. 核心功能项 (Core Features)

### 2.1 结构性校验 (Structural Validation)
*   **环路检测 (Circular Dependency)**: 检测工作流中是否存在逻辑环路（非 DO_WHILE 引起）。
*   **孤立节点检测 (Isolated Nodes)**: 发现没有连接任何其他节点的任务。
*   **终点可达性 (Reachability)**: 确保所有路径最终能到达结束状态。

### 2.2 配置项校验 (Configuration Validation)
*   **必填项检查**:
    *   HTTP 任务: URL, Method 必填。
    *   LAMBDA 任务: `scriptExpression` 必填。
    *   SUB_WORKFLOW: `name`, `version` 必填。
*   **引用名合法性**: 仅允许字母、数字和下划线，禁止重复（已初步实现）。

### 2.3 引用映射校验 (Reference Mapping Validation)
*   **输入映射检查**: 检查 `${task_ref.output.msg}` 中的 `task_ref` 是否在当前节点之前存在。
*   **嵌套层级深度**: 提醒过于复杂的嵌套工作流。

### 2.4 可视化反馈 (UI Feedback)
*   **节点警告标识**: 在有问题的节点右上角显示红色/黄色感叹号图标。
*   **健康检查面板 (Health Drawer)**: 一个可折叠的侧边面板，列出所有当前 Errors 和 Warnings。

## 3. 详细任务拆解 (Work Items)

| 任务 ID | 内容 | 说明 |
| :--- | :--- | :--- |
| **V5.1** | **校验引擎逻辑开发 (Validation Engine)** | 创建 `src/utils/validator.js`，实现基础的递归检查函数。 |
| **V5.2** | **Store 状态集成** | 在 `workflowStore.js` 中引入校验逻辑，每次 `updateTask` 后自动更新 `errors` 状态。 |
| **V5.3** | **节点错误预览 UI** | 修改 `TaskNode.jsx` 等，根据 `isError` 状态渲染高亮边框。 |
| **V5.4** | **健康检查概览面板** | 在右下角或顶部标题栏实现一个“体检报告”入口，展示问题列表。 |
| **V5.5** | **表达式语法高亮增强** | 集成轻量级语法检测，发现 JS 脚本中的明显语法错误。 |
