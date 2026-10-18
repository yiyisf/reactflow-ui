# Conductor Workflow IDE (`@yiyi_zhang/reactflow-ui` v1.0.0)

基于 **React 19、ReactFlow 与 Zustand** 构建的下一代企业级 [Netflix Conductor](https://conductor-oss.org/) 工作流可视化设计器与 AI 原生编排 IDE。

提供两个可独立按需集成的核心组件入口：
- **`WorkflowIDE`**（主入口 `@yiyi_zhang/reactflow-ui`）— 面向专业编排与研发人员的完整可视化 IDE
- **`AiWorkflowIDE`**（子路径 `@yiyi_zhang/reactflow-ui/ai`）— 对话优先、AI 驱动，支持多轮 Agentic 编排、子工作流库复用与混合交互

---

## 🌟 v1.0.0 四大核心支柱架构 (Next-Gen Architecture)

### 🧬 支柱一：确定性工作流语言服务 (W-LSP) 与数据血缘图谱
- **0ms 确定性 JSONPath 补全**：在节点配置面板输入 `${` 时，W-LSP 引擎实时遍历当前节点的所有**合法上游祖先节点**，融合五类数据源（运行态真实 Output、人工 Mock Output、`TaskSchema` 注册表、节点配置自省、类型默认字段）弹出零延迟自动补全，并附带 `⚡ 实时值预览`。
- **Portal 视口自适应锚定**：补全浮层挂载至 `document.body` 并自动感知视口边界翻转，彻底解决侧边抽屉滚动截断问题。
- **🔗 数据流血缘图谱 (Data Lineage Graph)**：一键开启画布级蓝色虚线动画边，直观展示跨节点 `${taskRef.output.xxx}` 的参数引用依赖与字段流向。
- **跨节点安全重构 (Refactor Rename)**：修改任意节点的 `taskReferenceName` 时，自动扫描并重写全图所有下游节点的 `${oldRef.output...}` 表达式，杜绝断链。

### ⚡ 支柱二：浏览器本地沙箱试跑 (0ms Dry-Run) 与时间旅行调试器
- **无需后端的确定性沙箱引擎 (`localSandboxEngine`)**：支持 `SIMPLE`、`HTTP`、`INLINE`（安全沙箱求值）、`SWITCH`（真实计算 `caseValueParam` / `expression` 路由）、`FORK_JOIN`（并发波次耗时推演）、`DO_WHILE`（多轮循环迭代生成 `__1`、`__2`、`__3`）、`SET_VARIABLE`、`TERMINATE` 等全量控制流。
- **🧪 人工模拟数据配置台 (`SandboxConfigModal`)**：
  - **Tab 1 — 全局入参 (`workflow.input`)**：自动提取工作流声明入参与全图 `${workflow.input.xxx}` 隐式引用，一键生成可编辑 JSON 模板。
  - **Tab 2 — 节点 Mock、故障注入与分支路由**：按节点自定义 Mock Output JSON、模拟耗时 (`durationMs`)、为 `SWITCH` 强制指定命中分支，或注入 `FAILED` / `TIMED_OUT` 异常以验证高可用容错链路。
- **📊 并发甘特瀑布流与时间旅行回放 (`ExecutionWaterfallPanel`)**：
  - 底部可展开并发执行甘特图，直观呈现并行分支耗时瓶颈。
  - 拖动**时间旅行滑块 (`Time-Travel Scrubber`)** 或点击 `▶ 0.5x / 1x / 2x` 回放，画布节点与连线按毫秒级时间戳实时还原任意历史时刻的执行状态。
- **🔄 循环迭代切片器 (`LoopIterationPill`) & 结构化 JSON 树 (`StructuredJsonViewer`)**：
  - `DO_WHILE` 节点内嵌 `[1] [2] [3]` 迭代切换胶囊，点击即可切换对应轮次的子任务快照。
  - 运行态详情面板支持字段搜索高亮、折叠展开与**一键复制 JSONPath (`${taskRef.output.xxx}`)**。

### 🤖 支柱三：画布原生 AI Co-Pilot (`Cmd+K`) 与 Shadow Graph 视觉 Diff
- **画布内联微调指令栏 (`InlineCanvasCopilot`)**：选中任意节点或直接在画布按下 `Cmd+K` / `Ctrl+K`，原位唤起毛玻璃 AI 指令浮层，支持局部新增下游节点、包裹重试循环、插入条件分支与自动补全参数。
- **👻 Shadow Graph 架构级 Diff 预览**：AI 生成或修改工作流提案时，画布直接渲染虚拟变更预览图（`+新增` 翠绿高亮、`~修改` 琥珀高亮、`-移除` 绯红虚线），支持顶部胶囊栏一键采纳或按节点部分采纳 (`Partial Accept`)。
- **零外部运行时依赖的轻量级流程图渲染**：内置基于 Dagre 的原生 SVG 流程图渲染引擎，无需体积庞大的外部 Mermaid 运行时即可在对话流中极速渲染架构图。

### 🎛️ 支柱四：双向实时代码同步、语义级缩放 (Semantic LOD) 与统一工作台
- **双向实时分屏 JSON 编辑器 (`JsonPreviewPanel`)**：底部 Dock 栏点击 **`{ } JSON`** 即可展开左画布 + 右代码的双栏分屏视图，修改 JSON 经过 300ms 防抖与结构校验后实时驱动画布重绘，画布拖拽/增删节点亦实时同步至代码。
- **三级语义缩放 (Semantic Zoom LOD)**：
  - **宏观鸟瞰 (`zoom < 0.55`)**：自动收起次要技术文本，渲染高对比度色块胶囊，百节点大图依然丝滑。
  - **标准编排 (`0.55 <= zoom <= 1.15`)**：展示节点标题、类型徽章、引用名与运行耗时。
  - **微距透视 (`zoom > 1.15`)**：节点卡片内直接透视展示核心入参摘要（如 `GET/POST URL`、`SWITCH` 路由表达式等），免去频繁开关抽屉。
- **统一毛玻璃胶囊工具栏 (`ActionBar`)**：将视图层级分段滑块（**📋 业务 / 🔧 标准 / 💻 全开发**）、**🔗 数据血缘**、**⌘K AI微调**、**↺/↻ 历史栈**、**🩺 诊断**、**⚙️ 配置**、**⚡ 沙箱试运行 | 🧪** 统一收纳于右上角流式 Dock。

---

## 📦 安装

```bash
npm install @yiyi_zhang/reactflow-ui reactflow react react-dom
```

> **环境要求**：`react >= 18.0.0`（完全兼容 React 18 与 React 19），`reactflow >= 11.11.0`。

---

## 🚀 快速开始

### 1. `WorkflowIDE`（面向专业编排与研发人员）

```tsx
import { useRef } from 'react';
import { WorkflowIDE, WorkflowIDERef } from '@yiyi_zhang/reactflow-ui';
import '@yiyi_zhang/reactflow-ui/style.css';

export default function App() {
  const ideRef = useRef<WorkflowIDERef>(null);

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <WorkflowIDE
        ref={ideRef}
        theme="dark"
        themeColor="blue"
        onSave={(workflow) => console.log('保存工作流:', workflow)}
        onWorkflowChange={(workflow) => console.log('变更回调:', workflow)}
      />
    </div>
  );
}
```

### 2. `AiWorkflowIDE`（面向业务与架构人员，AI 原生双栏编排）

从独立子路径 `@yiyi_zhang/reactflow-ui/ai` 导入：

```tsx
import { AiWorkflowIDE } from '@yiyi_zhang/reactflow-ui/ai';
import '@yiyi_zhang/reactflow-ui/style.css';

export default function AiApp() {
  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <AiWorkflowIDE
        aiConfig={{
          // 生产环境推荐使用后端代理模式，避免暴露模型 API Key
          transport: { mode: 'endpoint', endpoint: '/api/ai/workflow-agent' },
        }}
        draftPersist={{ key: 'my-workflow-ide-draft' }}
        onSave={(def) => console.log('保存:', def)}
      />
    </div>
  );
}
```

### 3. 编程式调用 W-LSP 与本地沙箱引擎 (v1.0.0 新增)

```tsx
import {
  executeLocalSandboxDryRun,
  buildDataFlowGraph,
  getCompletionItems,
} from '@yiyi_zhang/reactflow-ui';

// 1. 0ms 浏览器本地确定性沙箱试跑（支持自定义入参与故障注入）
const { instance } = executeLocalSandboxDryRun(workflowDef, {
  workflowInput: { orderId: 'ORD-2026', vipLevel: 3 },
  taskOverrides: {
    charge_card: { status: 'FAILED', errorMessage: '模拟支付网关 502 超时' },
  },
});

// 2. 构建工作流全局数据血缘图谱
const lineageGraph = buildDataFlowGraph(workflowDef);
```

---

## 🛠️ 本地开发与验证

```bash
# 安装依赖
npm install

# 启动本地开发调试环境（含完整演示工作台）
npm run dev

# 运行单元测试（Vitest）
npm test

# 代码规范检查
npm run lint

# 构建 NPM 发布产物（dist/）
npm run build
```

---

## 📁 项目结构

```
src/
├── index.ts                      # 主入口：WorkflowIDE + W-LSP + 沙箱引擎导出
├── ai.ts                         # AI 入口（/ai 子路径）：AiWorkflowIDE + Agent 工具链导出
├── WorkflowIDE.tsx               # 专业编排组件外壳
├── AiWorkflowIDE.tsx             # AI 原生编排组件外壳
├── components/
│   ├── WorkflowDesigner.tsx      # 核心画布（集成血缘连线、Shadow Graph、时间旅行）
│   ├── TaskDetailPanel.tsx       # 节点属性抽屉（集成 W-LSP 补全与重构提示）
│   ├── ExecutionTaskPanel.tsx    # 运行态详情抽屉（集成 StructuredJsonViewer）
│   ├── SandboxConfigModal.tsx    # 🧪 沙箱人工模拟数据与故障注入配置台
│   ├── ExecutionWaterfallPanel.tsx # 📊 并发甘特瀑布流与时间旅行回放面板
│   ├── JsonPreviewPanel.tsx      # { } 双向实时分屏 JSON 编辑器
│   ├── StructuredJsonViewer.tsx  # 树形 JSON 检索与一键复制 JSONPath 组件
│   ├── nodes/                    # 节点渲染层（含 Semantic LOD 三级语义缩放与 Loop 切片器）
│   ├── Controls/                 # 统一毛玻璃胶囊工具栏 ActionBar、ModeSlider、ControlHub
│   ├── AICopilot/                # W-LSP ParameterSuggester 补全浮层与对话面板
│   └── AiNative/                 # AiCommandCenter、InlineCanvasCopilot (Cmd+K)、MermaidBlock
├── services/
│   ├── wlsp/workflowLsp.ts       # W-LSP 工作流语言服务（祖先推导、Schema 推断、血缘、重构）
│   └── ai/                       # 多模型协议适配、Agent 循环、工具注册表、规则引擎
├── utils/
│   ├── localSandboxEngine.ts     # 浏览器本地确定性沙箱执行引擎
│   ├── validator.ts              # 静态拓扑与引用校验器
│   └── executionAnalyzer.ts      # 运行态智能故障诊断引擎
├── store/                        # Zustand 状态管理（workflowStore、aiStore、libraryStore）
├── parser/                       # Conductor DSL ↔ ReactFlow 节点/边双向解析器
└── layout/                       # Dagre 自动布局与超大流程蛇形布局引擎
```

---

## 📚 文档导航

- **[🚀 v1.0.0 产品发布宣传首页 (Product Launch Showcase)](./docs/product-launch-v1.0.0.html)** — 100% 单文件零依赖 HTML，含首屏 Before/After 耗时对比、一行命令极速体验、可拖动双滑块团队 ROI 收益计算器与交互式沙箱演练
- **[集成指南 (INTEGRATION.md)](./INTEGRATION.md)** — Props 详解、运行态接入、AI 代理配置、W-LSP 与沙箱 API
- **[版本更新日志 (CHANGELOG.md)](./CHANGELOG.md)** — `v1.0.0` 及历次版本完整变更记录
- **[发展路线图 (ROADMAP.md)](./ROADMAP.md)** — 演进里程碑与未来规划
- **[最佳实践 (docs/best-practices.md)](./docs/best-practices.md)** — 常见业务拓扑建模规范

## 📄 许可证

MIT
