# Conductor Workflow IDE (ReactFlow UI)

基于 React 19, ReactFlow 和 Vite 构建的企业级 [Netflix Conductor](https://conductor-oss.org/) 工作流可视化设计器。

![Workflow IDE](https://user-images.githubusercontent.com/placeholder-image.png)

## ✨ 特性

- **可视化建模**: 支持 DAG 工作流的拖拽式设计。
- **智能布局**: 支持复杂图表的自动布局 (TB/LR)，包括针对超大流程优化的“蛇形布局”。
- **运行态监控**: 实时可视化执行状态，支持路径高亮和任务详情查看。
- **强大的搜索**: 毫秒级任务搜索与高亮定位。
- **企业级能力**:
  - TypeScript 全量类型定义 (WorkflowDef, TaskDef)
  - 深色/浅色主题支持
  - 只读模式 / 编辑模式切换
  - 撤销/重做 & 智能剪贴板

## 📦 安装

```bash
npm install reactflow-ui
```

## 🚀 使用指南

### 库模式 (集成到 React 应用)

```tsx
import { WorkflowIDE } from 'reactflow-ui';
import 'reactflow-ui/dist/reactflow-ui.css';

function App() {
  return (
    <WorkflowIDE 
      theme="dark"
      onSave={(workflow) => console.log('保存:', workflow)}
    />
  );
}
```

详细集成步骤和 API 参考，请查阅 **[集成指南](./INTEGRATION.md)**。

## 🛠️ 开发指南 (Development Guide)

如果您希望参与本项目的开发或进行二次开发，请参考以下步骤。

### 环境准备
- Node.js >= 18.0.0
- npm 或 yarn

### 启动本地开发环境
本项目包含一个演示应用 (`src/demo`)，用于开发和调试 IDE 组件。

```bash
# 1. 克隆仓库
git clone https://github.com/yiyisf/reactflow-ui.git
cd reactflow-ui

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```
启动后访问 `http://localhost:5173` 即可看到演示页面。

### 构建库文件
打包生成用于发布的 ESM 和 UMD 文件：

```bash
npm run build
```
产物将生成在 `dist/` 目录下。

### 项目结构
- `src/components/`: IDE 核心组件 (设计器、属性面板等)。
- `src/store/`: 基于 Zustand 的状态管理。
- `src/types/`: TypeScript 类型定义 (Conductor 协议与 UI 状态)。
- `src/demo/`: 开发阶段使用的演示应用。
- `src/WorkflowIDE.tsx`: 组件库的主入口文件。

## 📚 文档资源
- [集成指南 (Integration Guide)](./INTEGRATION.md)
- [最佳实践 (Best Practices)](./docs/best-practices.md)

## 📄 许可证
MIT
