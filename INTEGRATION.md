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
import React from 'react';
import { WorkflowIDE, WorkflowDef } from 'reactflow-ui';
import 'reactflow-ui/style.css'; // 务必引入样式文件

const MyWorkflowApp = () => {
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

不传入 `workflowDef` 时，画布会显示 **空状态引导面板**，用户可选择：
- **空白工作流** — 创建纯净空画布，通过中心引导按钮添加第一个任务。
- **AI 生成** — 打开 AI 对话面板，通过自然语言描述一键生成完整工作流。
- **导入 JSON** — 触发宿主应用提供的导入回调。

## ⚙️ 组件属性 (Props)

### 基础配置

| 属性名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `workflowDef` | `WorkflowDef` | `undefined` | 初始加载的工作流定义 JSON 对象。不传时显示空状态引导面板。 |
| `readOnly` | `boolean` | `false` | 是否开启只读模式。开启后无法拖拽、连接或编辑节点。 |
| `height` | `string \| number` | `'100%'` | 组件高度。 |
| `theme` | `'dark' \| 'light'` | `'dark'` | 主题模式。 |
| `themeColor` | `'blue' \| 'orange'` | `'blue'` | 品牌主色调。 |
| `layoutDirection` | `'TB' \| 'LR'` | `'LR'` | 默认布局方向 (从上到下/从左到右)。用户仍可在界面手动切换。 |

### 功能交互

| 属性名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `onSave` | `(def: WorkflowDef) => void` | 保存回调，通过 Ctrl+S / Cmd+S 快捷键或 `ref.save()` 触发。 |
| `onWorkflowChange` | `(def: WorkflowDef) => void` | 工作流定义变更时的实时回调。仅在任务增删改、属性修改等数据变化时触发；拖拽、缩放、选中等纯 UI 操作不触发。 |
| `onRequestImport` | `() => void` | (可选) 空状态面板点击「导入 JSON」时触发。宿主应用可在此打开文件选择器或自定义导入逻辑。 |
| `searchQuery` | `string` | (可选) 传入搜索关键词，匹配的任务节点会高亮显示。 |

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

## 🔗 Ref API (命令式访问)

通过 `ref` 可以在任意时刻主动读取或操作 IDE 状态：

```tsx
import { useRef } from 'react';
import { WorkflowIDE, WorkflowIDERef } from 'reactflow-ui';
import 'reactflow-ui/style.css';

const App = () => {
  const ideRef = useRef<WorkflowIDERef>(null);

  const handleExport = () => {
    const def = ideRef.current?.getWorkflowDef();
    if (def) console.log('当前工作流:', def);
  };

  return (
    <div style={{ height: '100vh' }}>
      <button onClick={() => ideRef.current?.createBlankWorkflow('my_flow')}>新建</button>
      <button onClick={handleExport}>导出</button>
      <button onClick={() => ideRef.current?.save()}>保存</button>
      <WorkflowIDE
        ref={ideRef}
        onSave={(def) => fetch('/api/save', { method: 'POST', body: JSON.stringify(def) })}
        onWorkflowChange={(def) => console.log('changed:', def.name)}
      />
    </div>
  );
};
```

### WorkflowIDERef 方法

| 方法 | 返回值 | 说明 |
| :--- | :--- | :--- |
| `getWorkflowDef()` | `WorkflowDef \| null` | 获取当前最新的工作流定义 |
| `getValidationResults()` | `ValidationResults` | 获取当前校验结果（错误和警告列表） |
| `save()` | `void` | 触发 `onSave` 回调（等同于 Ctrl+S） |
| `createBlankWorkflow(name?)` | `void` | 程序化创建空白工作流并进入编辑模式。可选传入工作流名称，默认为 `'new_workflow'`。调用后画布显示中央 [+] 引导按钮，撤销历史自动清空。 |

## 📄 从零新建工作流

IDE 支持三种创建工作流的方式，无需预先提供 JSON：

### 方式一：空状态引导面板（内置 UI）

不传 `workflowDef` 即可触发。画布中央会显示引导面板，包含名称输入框和三个操作按钮。

```tsx
<WorkflowIDE
  onSave={handleSave}
  onRequestImport={() => {
    // 打开文件选择器或其他导入逻辑
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => handleFileUpload(e);
    input.click();
  }}
/>
```

用户点击「空白工作流」后，画布立即进入编辑模式并显示中央 [+] 引导按钮，点击该按钮即可呼出节点选择器添加第一个任务。相比旧版本，新版本移除了冗余的 `START` 和 `END` 虚拟节点，使工作流视图更加聚焦业务逻辑。

### 方式二：命令式 API

通过 ref 在宿主应用任意位置触发：

```tsx
// 例如：在 Header 导航栏中的「新建」按钮
<button onClick={() => ideRef.current?.createBlankWorkflow('order_process')}>
  新建工作流
</button>
```

### 方式三：AI 生成

空状态面板中点击「AI 生成」会自动创建空白工作流并打开 AI 对话面板。用户描述需求后，AI 生成完整 JSON 并一键应用到画布。

也可以通过代码触发：

```ts
// 派发自定义事件打开 AI 面板
window.dispatchEvent(new CustomEvent('open-ai-chat'));
```

## 🤖 AI Copilot (智能辅助)

`reactflow-ui` 集成了基于大模型的智能助手，可帮助用户快速建模和配置参数。

### 启用 AI 服务

组件默认使用 OpenAI 标准接口。您可以通过以下几种方式配置：

1. **环境变量/本地存储**:
   在应用启动前设置 `localStorage`：
   ```js
   localStorage.setItem('AI_API_KEY', 'your-openai-api-key');
   localStorage.setItem('AI_BASE_URL', 'https://api.your-proxy.com/v1'); // 可选
   localStorage.setItem('AI_MODEL', 'gpt-4o'); // 可选，默认为 gpt-4o
   ```

2. **Props 注入** (优先级高于 localStorage):
   ```tsx
   <WorkflowIDE
     aiConfig={{ apiKey: 'your-key', baseUrl: 'https://api.your-proxy.com/v1', model: 'gpt-4o' }}
   />
   ```

### 核心能力

- **自然语言建模**: 点击右下角 ✨ 图标展开对话框，输入需求即可生成 JSON 建议并一键应用。
- **从零创建**: 空状态面板支持直接通过 AI 对话从零生成完整工作流，无需手动编排。
- **参数智能提示**: 在节点编辑面板中，点击输入框右侧的 ✨ 图标，获取基于上下文的 JSONPath 建议。

## 🛠️ TypeScript 支持

本库提供完整的 TypeScript 定义。您可以直接导入核心类型：

```tsx
import {
  WorkflowIDE,
  WorkflowIDERef,
  WorkflowIDEProps,
  WorkflowDef,
  TaskDef,
  AIServiceConfig
} from 'reactflow-ui';
```
