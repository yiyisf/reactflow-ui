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

### 执行验证（P4.2 新增）

通过 `onTriggerExecution` 和 `onPollExecution` 两个回调，IDE 可在 edit 模式下直接触发 Conductor 执行并自动切换到 run 模式展示结果。

```tsx
<WorkflowIDE
  workflowDef={myWorkflow}
  onTriggerExecution={async (workflowName, version, input) => {
    // 调用后端 API 发起执行
    const res = await fetch('/api/conductor/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: workflowName, version, input }),
    });
    const { workflowId } = await res.json();
    return { workflowId };
  }}
  onPollExecution={async (workflowId) => {
    // 轮询执行状态；IDE 内部使用指数退避（初始 3s，最大 15s）
    const res = await fetch(`/api/conductor/workflow/${workflowId}`);
    if (!res.ok) return null;
    return res.json(); // 返回 WorkflowInstance JSON
  }}
  executionPollInterval={3000} // 可选，默认 3000ms
/>
```

**执行流程**：
1. 用户在 edit 模式点击工具栏的 **"▶ 执行验证"** 按钮
2. `WorkflowRunPanel` 弹出，根据工作流的 `inputParameters` 声明自动生成填写表单（支持表单模式 / JSON 编辑器切换）
3. 用户填写入参后点击"发起执行"，IDE 调用 `onTriggerExecution`
4. 获得 `workflowId` 后自动切换到 run 模式，按指数退避调用 `onPollExecution`
5. 加载到 `WorkflowInstance` 后渲染执行状态；到达终态（COMPLETED/FAILED/TIMED_OUT/TERMINATED）后停止轮询

> 未传入 `onTriggerExecution` 时，"执行验证"按钮不渲染，完全向后兼容。

#### 执行验证相关 Props

| 属性名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `onTriggerExecution` | `(name: string, version: number, input: Record<string, any>) => Promise<{ workflowId: string }>` | — | (可选) 触发工作流执行回调。返回 `workflowId` 后 IDE 自动切换 run 模式。 |
| `onPollExecution` | `(workflowId: string) => Promise<WorkflowInstance \| null>` | — | (可选) 轮询执行状态。返回 `null` 时继续轮询，返回终态实例后停止。 |
| `executionPollInterval` | `number` | `3000` | 初始轮询间隔（ms）。内部使用指数退避，最大退避到 15000ms。 |

### 运行态操作与权限控制 (Runtime Actions)

在运行态下，您可以通过传入 `executionActions` 属性来启用对工作流实例和任务级别的控制操作，并能够开启或限制用户操作权限：

```tsx
<WorkflowIDE
  workflowDef={executionData.workflowDefinition}
  workflowExecution={executionData}
  readOnly={true}
  executionActions={{
    // 全局操作权限控制：若设为 false，则所有操作按钮全部置灰并展示“操作权限受限”
    allowOperations: true, 

    // 工作流级控制
    onPause: (workflowId) => console.log('暂停工作流:', workflowId),
    onResume: (workflowId) => console.log('继续工作流:', workflowId),
    onTerminate: (workflowId) => console.log('终止工作流:', workflowId),
    onRetry: (workflowId) => console.log('重试工作流:', workflowId),
    onRestart: (workflowId, options) => console.log('重启工作流:', workflowId, options),

    // 任务级别操作 — 接收 taskId 以完美适配 Conductor OSS API 的重新运行与跳过
    onRerunFromTask: (workflowId, taskReferenceName, taskId) => {
      console.log(`从指定任务重跑：工作流ID=${workflowId}, 任务引用名=${taskReferenceName}, 任务实例ID=${taskId}`);
    },
    onSkipTask: (workflowId, taskReferenceName, taskId) => {
      console.log(`跳过指定任务：工作流ID=${workflowId}, 任务引用名=${taskReferenceName}, 任务实例ID=${taskId}`);
    }
  }}
/>
```

#### `executionActions` 参数定义

| 参数名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `allowOperations` | `boolean` | (可选) 全局操作权限。默认为 `true`。若传入 `false`，则 ActionBar 及 任务详情面板中的所有执行操作按钮将全部禁用（Opacity 减淡、置灰），并在 Hover 时浮现“操作权限受限”的 Tooltip。 |
| `onPause` | `(workflowId: string) => void` | (可选) 暂停工作流回调 |
| `onResume` | `(workflowId: string) => void` | (可选) 恢复继续工作流回调 |
| `onTerminate` | `(workflowId: string) => void` | (可选) 终止工作流回调 |
| `onRetry` | `(workflowId: string) => void` | (可选) 重试失败工作流回调 |
| `onRestart` | `(workflowId: string, options?: { useLatestDef: boolean }) => void` | (可选) 重新开始运行工作流回调（主按钮为使用最新工作流定义，下拉菜单可选使用执行时的定义） |
| `onRerunFromTask` | `(workflowId: string, taskReferenceName: string, taskId?: string) => void` | (可选) 从指定任务节点重新运行回调。第三个参数 `taskId` 为该任务的实例 ID，对齐 Conductor API `POST /workflow/{workflowId}/rerun` 中 `reRunFromTaskId` 请求体字段。 |
| `onSkipTask` | `(workflowId: string, taskReferenceName: string, taskId?: string) => void` | (可选) 跳过指定任务回调。第三个参数 `taskId` 为该任务实例 ID，对齐 Conductor API `PUT /workflow/{workflowId}/skiptask/{taskReferenceName}` 协议。 |

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

`reactflow-ui` 集成了基于大模型的智能助手，**仅在编辑模式下可用**。

### 启用 AI 服务

组件默认使用 OpenAI 标准接口，兼容任意 OpenAI 兼容代理：

1. **环境变量/本地存储**:
   ```js
   localStorage.setItem('AI_API_KEY', 'your-openai-api-key');
   localStorage.setItem('AI_BASE_URL', 'https://api.your-proxy.com/v1'); // 可选
   localStorage.setItem('AI_MODEL', 'gpt-4o'); // 可选，默认 gpt-4o
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
- **✨ AI 参数自动填充（v0.4.0）**: 节点编辑面板的 inputParameters 区域新增"AI 填充"按钮。AI 根据任务类型、工作流入参列表及上游任务列表，一键生成完整参数块，并以 diff 预览卡片展示，支持应用/取消。
- **差异卡片 (Diff Card)**: AI 输出以结构化变更卡片展示，支持一键应用或撤销，变更过程可追溯。

> 只读模式和运行态下 AI 助手对话面板不渲染，避免功能混淆。

---

## ✏️ 编辑体验 (v0.3.0 新增)

### 全屏表达式/脚本编辑器

编辑模式下，所有代码/表达式字段（INLINE 脚本、JQ 查询、JSON 参数、SWITCH caseExpression、DO_WHILE 循环条件等）右上角出现 **⛶** 按钮，点击展开全屏编辑器：

- 全视口 `textarea`，适合编写复杂脚本
- 顶部工具栏：语言类型徽章、字段标题、**Ctrl+S** 保存、**Esc** 取消
- 底部状态栏实时显示行数、字符数和未保存状态

### 任务引用名实时编辑

`taskReferenceName` 输入框采用"缓冲提交"模式：

- 输入过程中仅更新本地草稿，画布节点**不**实时跳动
- 失焦或按 **Enter** 时一次性提交到 Store，工作流重新解析

### SWITCH 分支管理（页面内 Modal）

点击 SWITCH/Decision 节点打开分支管理菜单，支持：

- **添加分支**：输入条件值（case value），Modal 内确认
- **重命名分支**：✏ 按钮 → Modal 内输入新名称 → 连线标签同步更新
- **删除分支**：× 按钮 → 确认 Modal → 分支及其下任务一并移除

### DO_WHILE 循环体编辑

- 循环体内任意两个任务间的连线支持 **+** 插入新任务
- 支持在第一个任务**之前**插入任务（循环头部添加）
- 支持在循环体末尾追加任务

---

## 👁️ 视图模式 (v0.3.0 新增)

通过工具栏切换三种详情级别：

| 模式 | 说明 |
| :--- | :--- |
| **Business** | 仅展示核心业务节点（HTTP、SIMPLE、SUB_WORKFLOW 等），控制/数据节点折叠为边标签 |
| **Standard** | 业务 + 控制流节点，默认模式 |
| **Developer** | 显示全部节点，SWITCH/DO_WHILE 节点上展示表达式预览 |

---

## 📊 执行结果分析（v0.4.0）

run 模式下工具栏新增 **"📊 分析"** 按钮，点击展开悬浮分析面板：

- **概览卡片**：总任务数、已完成、失败数、总耗时
- **成功率进度条**：直观展示整体执行质量
- **步骤时序表**：按 `startTime` 排序显示所有任务，字段包括状态、耗时、重试次数，点击行高亮对应节点并打开详情面板
- **智能故障诊断**：自动解析 `reasonForIncompletion`，识别 10+ 种错误模式：

| 诊断类别 | 覆盖场景 |
| :--- | :--- |
| 参数问题 | JSONPath 路径不存在、引用为空、类型不匹配 |
| 网络错误 | 连接超时、HTTP 4xx/5xx |
| 认证失败 | 401、token 无效 |
| 任务超时 | TIMED_OUT、超时配置过小 |
| 逻辑错误 | 循环条件表达式异常、INLINE 脚本执行失败 |

- **"去修复"跳转**：每条诊断卡片提供"去修复"按钮，一键切换到 edit 模式并自动选中问题任务，直接定位到对应参数字段

---

## 🏗️ 工作流入参声明（v0.4.0）

`WorkflowDef.inputParameters` 现支持两种格式，完全向后兼容：

```ts
// 旧格式（仍支持）
inputParameters: ['orderId', 'userId', 'amount']

// 新格式（v0.4.0），支持类型、描述、必填、示例值
inputParameters: [
  { name: 'orderId',  type: 'string',  required: true,  description: '订单 ID',  example: 'ORD-001' },
  { name: 'userId',   type: 'string',  required: true,  description: '用户 ID' },
  { name: 'amount',   type: 'number',  required: false, description: '金额（元）', example: 99.9 },
  { name: 'metadata', type: 'object',  required: false, description: '附加元数据' },
]
```

新格式的好处：
- `WorkflowRunPanel` 会根据 `type` 自动渲染合适的输入控件（文本/数字/布尔选择器/JSON textarea）
- `required: true` 的字段会在表单中标注 `*` 并在执行时进行必填校验
- `example` 值会作为输入框的 placeholder 展示

可在 **工作流设置 → 参数配置** Tab 中通过可视化编辑器管理，也可直接在 JSON 中编写。

---

## 🛠️ TypeScript 支持

本库提供完整的 TypeScript 定义。您可以直接导入核心类型：

```tsx
import {
  WorkflowIDE,
  WorkflowIDERef,
  WorkflowIDEProps,
  WorkflowDef,
  TaskDef,
  WorkflowInputParam,        // v0.4.0 新增：结构化入参类型
  WorkflowInstance,          // v0.4.0 新增：执行实例类型（用于 onPollExecution）
  AIServiceConfig,
  ExecutionActions,
  RestartOptions,
  ViewMode,
  RunState,                  // v0.4.0 新增：执行触发状态机类型
  parseWorkflowInputParams,  // v0.4.0 新增：解析入参声明工具函数
} from 'reactflow-ui';
```

---

## 📋 版本历史

### v0.4.0

**新功能**
- **P4.1 AI 参数自动填充**：TaskDetailPanel 新增"✨ AI 填充"按钮，根据任务类型与上下文一键生成 inputParameters，diff 预览后应用
- **P4.2 执行验证闭环**：
  - 新增 `onTriggerExecution` / `onPollExecution` / `executionPollInterval` Props
  - edit 模式工具栏新增"▶ 执行验证"按钮，弹出 `WorkflowRunPanel` 入参填写面板
  - `WorkflowRunPanel` 支持表单模式（基于 `WorkflowInputParam` 声明）/ JSON 编辑器双模式
  - 触发执行后指数退避轮询，自动切换 run 模式展示实时状态
  - `WorkflowSettingsPanel` 参数配置 Tab 升级为可视化入参编辑器（支持 type/required/description/example）
- **P4.3 执行结果分析**：
  - run 模式工具栏新增"📊 分析"按钮
  - 新增 `ExecutionSummaryPanel`：执行概览卡片、步骤时序表、智能故障诊断（10+ 错误模式）
  - 诊断卡片"去修复"按钮：一键切换 edit 模式并选中问题任务
- 新增 `WorkflowInputParam` 结构化类型，`WorkflowDef.inputParameters` 向后兼容 `string[]` 格式

### v0.3.0

**新功能**
- 全屏表达式/脚本编辑器（含 Ctrl+S、Esc、行数/字符数状态栏）
- SWITCH 分支重命名（页面内 Modal，替代 window.prompt）
- DO_WHILE 循环体首位插入任务
- Business / Standard / Developer 三级视图模式
- 模拟执行（Simulation）演示

**体验优化**
- 任务引用名输入缓冲提交，避免逐字符刷新
- 切换工作流自动 Fit View（延迟 50ms 等待渲染完成）
- 编辑/只读模式连线改为静态实线（运行态保留动画）
- 节点边框及阴影加深，深色模式下更清晰
- 校验徽章（❗⚠️）仅在编辑模式显示
- AI 助手仅在编辑模式渲染

**缺陷修复**
- 编辑模式循环体内连线「+」按钮不显示
- SWITCH 非 default 分支条件值无法修改
- 蛇形布局在编辑/只读模式行为不一致（plusNode 计入节点数导致错误触发）
- 任务唯一引用名输入框每次仅能键入一个字符
- 运行态 ExecutionTaskPanel 样式与 TaskDetailPanel 对齐

### v0.2.0

- 运行态操作：暂停、继续、终止、重试、重启、从指定任务重跑、跳过任务
- `allowOperations` 全局操作权限开关
- DO_WHILE 循环体容器化渲染（ReactFlow sub-nodes）
- AI 差异卡片（Diff Card）
- 视图详情级别初版

