# Conductor Workflow IDE 集成指南

本指南主要介绍如何将 `reactflow-ui` 组件库集成到您的 React 应用程序中。

## 📦 安装

首先，您需要安装组件库及其前置依赖：

```bash
npm install reactflow-ui reactflow react react-dom
# 或者
yarn add reactflow-ui reactflow react react-dom
```

> **注意**: `react` 和 `react-dom` 版本需 >= 18.0.0。

## 🚀 快速开始

在您的 React 组件中引入 `<WorkflowIDE />`：

```tsx
import React, { useState } from 'react';
import { WorkflowIDE, WorkflowDef } from 'reactflow-ui';
import 'reactflow-ui/dist/reactflow-ui.css'; // 务必引入样式文件

const MyWorkflowApp = () => {
  const [workflow, setWorkflow] = useState<WorkflowDef>();

  const handleSave = (def: WorkflowDef) => {
    console.log('保存工作流:', def);
    // 调用后端 API 保存
  };

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <WorkflowIDE
        theme="dark"
        themeColor="blue"
        onSave={handleSave}
      />
    </div>
  );
};
```

## ⚙️ 组件属性 (Props)

### 基础配置

| 属性名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `workflowDef` | `WorkflowDef` | `undefined` | 初始加载的工作流定义 JSON 对象。 |
| `readOnly` | `boolean` | `false` | 是否开启只读模式。开启后无法拖拽、连接或编辑节点。 |
| `height` | `string \| number` | `'100%'` | 组件高度。 |
| `theme` | `'dark' \| 'light'` | `'dark'` | 主题模式。 |
| `themeColor` | `'blue' \| 'orange'` | `'blue'` | 品牌主色调。 |
| `layoutDirection` | `'TB' \| 'LR'` | `'LR'` | 默认布局方向 (从上到下/从左到右)。用户仍可在界面手动切换。 |

### 功能交互

| 属性名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `onSave` | `(def: WorkflowDef) => void` | 点击保存按钮时的回调。 |
| `onWorkflowChange` | `(def: WorkflowDef) => void` | (可选) 工作流定义发生变更时的实时回调。 |
| `searchQuery` | `string` | (可选) 这里传入搜索关键词，匹配的任务节点会高亮显示。 |

### 运行态集成 (Runtime)

如果需要展示工作流的执行状态，请传入 `workflowExecution` 属性。

```tsx
// 示例：加载运行数据
const executionData = await fetch('/api/workflow/execution/123').then(res => res.json());

<WorkflowIDE
  workflowDef={executionData.workflowDefinition} // 必须同时传入定义，否则无法渲染图表
  workflowExecution={executionData} // 传入完整的 Conductor Workflow Instance JSON
  readOnly={true} // 运行态通常建议开启只读
/>
```

当 `workflowExecution` 存在时，组件会自动切换到 **Run Mode**：
- 节点会根据状态（Running, Completed, Failed）显示不同颜色。
- 连线会高亮实际执行路径。
- 点击节点将展示输入/输出详情面板。

## 🛠️ TypeScript 支持

本库提供完整的 TypeScript 定义。您可以直接导入核心类型：

```tsx
import { 
  WorkflowDef, 
  TaskDef, 
  WorkflowInstance 
} from 'reactflow-ui';
```
