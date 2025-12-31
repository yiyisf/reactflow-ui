# Phase 6: 多页签支持与版本历史管理 (Multi-tab & History)

## 1. 目标 (Objective)
提升复杂场景下的操作效率，支持用户同时编辑多个工作流，并提供强大的回滚（Undo/Redo）与本地版本快照功能。

## 2. 核心功能项 (Core Features)

### 2.1 多页签系统 (Multi-tab System)
*   **页签栏 (Tab Bar)**: 在 Header 下方增加类似浏览器的页签组件。
*   **并发状态管理**: Store 需要支持存储多个 `workflowDef` 实例，并标记 `activeTabId`。
*   **持久化**: 刷新页面后能恢复之前打开的页签（IndexDB/LocalStorage）。

### 2.2 历史记录 (Undo/Redo)
*   **操作栈**: 记录每一次节点的增删、移动和属性修改。
*   **快捷键支持**: 绑定 `Ctrl+Z` / `Ctrl+Y`。

### 2.3 版本快照与对比 (Snapshots & Diff)
*   **本地检查点 (Checkpoints)**: 用户可以手动点击“保存快照”，保存当前定义的本地副本。
*   **快照列表**: 展示时间戳、自定义备注。
*   **Diff 预览**: 在侧边栏展示当前版本与快照版本的 JSON 差异点。

## 3. 详细任务拆解 (Work Items)

| 任务 ID | 内容 | 说明 |
| :--- | :--- | :--- |
| **H6.1** | **状态存储重构 (Multi-tab Store)** | 重构 `workflowStore.js`，改为 `tabs: []` 结构，适配多实例存储。 |
| **H6.2** | **页签 UI 组件开发** | 实现横向滚动的 TabBar，支持关闭、新建和重命名页签。 |
| **H6.3** | **持久化逻辑实现** | 使用 `zustand/middleware/persist` 或 `localforage` 实现数据自动缓存。 |
| **H6.4** | **Undo/Redo 状态中间件** | 引入 `zundo` 或手动实现补丁包（JSON Patch）记录机制。 |
| **H6.5** | **本地快照与版本管理面板** | 创建侧边面板，支持用户对比 JSON 差异。 |
