# Conductor Workflow IDE (ReactFlow UI)

基于 React 19、ReactFlow 和 Vite 构建的企业级 [Netflix Conductor](https://conductor-oss.org/) 工作流可视化设计器。

## ✨ 核心特性

### 🎨 可视化建模
- **从零创建**：无需预先提供 JSON，通过空状态引导面板新建空白工作流，配合中心 **[+]** 引导按钮快速开始建模
- **完整任务类型**：支持 HTTP、SIMPLE、INLINE/LAMBDA、SWITCH、FORK_JOIN、DO_WHILE、SUB_WORKFLOW、SET_VARIABLE、TERMINATE 等全量 Conductor 任务类型
- **极简视图**：移除冗余的 START/END 虚拟节点，工作流图更加聚焦业务逻辑
- **智能布局**：自动 Dagre 布局（TB/LR），超大流程自动触发蛇形布局，编辑/只读模式行为一致

### 🔀 复杂结构编辑
- **SWITCH 分支管理**：在节点上直接添加、重命名、删除分支，全部通过页面内 Modal，无浏览器原生弹框
- **DO_WHILE 循环体**：循环任务以容器方式展示，支持在循环体内任意位置插入任务（含首位）
- **FORK_JOIN 并行分支**：支持动态分支添加和管理

### ✏️ 编辑体验
- **全屏代码编辑器**：点击任意表达式/脚本/JSON 字段右上角 **⛶** 按钮，展开全屏编辑器，支持 Ctrl+S 保存、Esc 取消，底部状态栏显示行数和字符数
- **任务引用名实时编辑**：引用名输入框支持流畅输入，失焦/回车后提交，避免逐字符刷新
- **撤销/重做**：完整的编辑历史，支持 Ctrl+Z / Ctrl+Shift+Z
- **智能剪贴板**：任务复制粘贴

### 👁️ 视图模式
- **Business 模式**：仅展示核心业务节点，控制/数据节点折叠为边标签
- **Standard 模式**：业务 + 控制流节点（默认）
- **Developer 模式**：显示全部节点，含数据转换等辅助节点，节点上展示表达式预览

### 🚀 运行态监控
- 节点根据执行状态（Scheduled / In Progress / Completed / Failed / Timed Out / Skipped）实时变色
- 已完成路径连线高亮，进行中路径动态动画，编辑/只读模式使用静态实线
- 点击节点展示执行详情面板（输入/输出/耗时/重试次数）
- **运行态操作**：暂停、继续、终止、重试、重启（支持选择定义版本）、从指定任务重跑、跳过任务
- `allowOperations` 全局权限开关，快速控制操作按钮是否可用

### 🤖 AI Copilot（智能辅助）
- **仅在编辑模式可用**，避免干扰只读/运行态场景
- 自然语言描述生成完整工作流，支持对话式迭代修改
- 差异卡片（Diff Card）预览变更内容，一键应用/撤销
- 参数智能提示：节点属性面板中基于上下文推荐 JSONPath 表达式

### 🎯 视觉体验
- 深色/浅色主题 + 品牌主色调（科技蓝/活力橙）
- 节点边框和阴影经过调校，深色模式下更清晰可辨
- 切换工作流时自动执行 Fit View，无需手动缩放定位
- 校验错误徽章（❗⚠️）仅在编辑模式显示，不干扰只读查看

### 🏢 企业级能力
- TypeScript 全量类型定义（WorkflowDef、TaskDef、ExecutionActions…）
- 命令式 API（`ref`）支持程序化创建、保存、导出
- 强类型 Ref API：`getWorkflowDef()`、`save()`、`createBlankWorkflow()`

---

## 📦 安装

```bash
npm install reactflow-ui reactflow react react-dom
```

## 🚀 快速开始

```tsx
import { useRef } from 'react';
import { WorkflowIDE, WorkflowIDERef } from 'reactflow-ui';
import 'reactflow-ui/style.css';

function App() {
  const ideRef = useRef<WorkflowIDERef>(null);

  return (
    <div style={{ height: '100vh' }}>
      <button onClick={() => ideRef.current?.createBlankWorkflow('my_flow')}>新建</button>
      <WorkflowIDE
        ref={ideRef}
        theme="dark"
        themeColor="blue"
        onSave={(workflow) => console.log('保存:', workflow)}
        onRequestImport={() => { /* 打开文件选择器 */ }}
      />
    </div>
  );
}
```

不传 `workflowDef` 时画布显示引导面板，支持空白创建、AI 生成或导入 JSON。

详细集成步骤和 API 参考：**[集成指南 →](./INTEGRATION.md)**

---

## 🛠️ 开发指南

### 环境要求
- Node.js >= 18.0.0
- npm 或 yarn

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/yiyisf/reactflow-ui.git
cd reactflow-ui

# 安装依赖
npm install

# 启动开发服务器（含演示应用）
npm run dev
# 访问 http://localhost:5173
```

### 构建

```bash
npm run build
# 产物生成在 dist/ 目录
```

### 项目结构

```
src/
├── components/        # UI 核心组件（设计器、属性面板、节点…）
│   ├── nodes/         # 各类型节点组件（TaskNode、DecisionNode、LoopNode…）
│   ├── AICopilot/     # AI 助手面板
│   └── Controls/      # 工具栏、模式切换器
├── store/             # Zustand 状态管理（workflowStore）
├── parser/            # Conductor JSON ↔ ReactFlow 节点/边转换
├── layout/            # Dagre 自动布局（含蛇形布局）
├── types/             # TypeScript 类型定义
├── styles/            # CSS 变量和执行状态样式
├── utils/             # 校验器、工作流生成工具
└── demo/              # 演示应用（开发调试用）
```

---

## 📚 文档资源

- [集成指南 (Integration Guide)](./INTEGRATION.md)
- [最佳实践 (Best Practices)](./docs/best-practices.md)
- [路线图 (Roadmap)](./ROADMAP.md)

## 📄 许可证

MIT
