# Conductor Workflow IDE 发展路线图 (ROADMAP)

本文档概述了 Conductor Workflow IDE 的未来发展方向，旨在从一个基础的设计工具进化为生产级、智能化的全流程建模平台。

---

## 🚀 2.0 阶段：架构重塑与专业化 (当前重点)

**目标：** 实现代码质量的跃迁，建立 UI 标准，并具备面向全公司的交付能力。

### P1: 架构基石 (TypeScript & Reliability)
- [ ] **全站 TypeScript 化**：从 JS 迁移到 TS，建立全量类型约束。
- [ ] **领域模型定义**：定义 `Workflow`, `Task`, `Instance` 等核心 Interface 规范。
- [ ] **状态机重写**：基于 TS 改写 Zustand Store，确保复杂的 Fork/Join 逻辑在开发阶段即无误。

### P2: 设计革命 (Modern Design System & Interaction)

#### P2.1: Design System (完成)
- [x] **UI Token 引入**：建立统一的色彩、边距、阴影、层级规范体系。
- [x] **主题架构**：支持 Dark/Light 模式与品牌色切换。

#### P2.2: 交互基建 (Core Interaction) (完成)
- [x] **撤销/重做**：引入 History 栈 (Undo/Redo)。
- [x] **快捷键统一**：统一 Delete 键与 UI 删除按钮的行为。
- [x] **智能剪贴板**：跨层级复制粘贴与自动连线。

#### P2.3: 组件级视觉升级 (Component Visual Polish) [已暂缓/忽略]
- [ ] **节点组件 2.0**：重构 `NodeWrapper`，支持玻璃拟态、呼吸动效、边缘 Glow transition。
- [ ] **交互动效**：优化连线时的吸附感、点击反馈以及面板弹出的动效衔接。

#### P2.4: 整体页面重塑 (Layout Redesign)
- [ ] **全站 UI 布局重绘**：基于设计规范重绘侧边栏、顶部菜单及背景纹理，建立系统级视觉一致性。
- [x] **超大流程布局优化**：实现智能蛇形布局 (Snake Layout)，支持 TB/LR 双向折行，解决 >30 节点的大图展示难题。
- [x] **布局间距自适应**：基于节点数量动态调整 Dagre RankSep/NodeSep。
- [x] **拓扑结构精简**：移除冗余的 `START`/`END`/`JOIN` 虚拟节点，实现更纯粹的业务逻辑可视化。

#### P2.5: 运行态能力 (Runtime Capabilities) (完成)
- [x] **执行可视化**：支持加载 Conductor 运行态 JSON，显示节点状态（成功/失败/运行中）。
- [x] **路径高亮**：动态高亮实际执行路径。
- [x] **详情面板**：运行态下支持查看 Input/Output 及重试记录。

### P3: 库化交付 (Library Mode & Distribution)
- [x] **解耦业务逻辑**：将项目重构为内聚的 UI 组件，支持 Props 注入和 Event 回调。
- [x] **Vite Lib Mode 适配**：支持构建 ESM、UMD 格式的包文件。
- [x] **NPM 生态发布**：(模拟完成) 发布并维护首个稳定版 NPM 包，支持 `npm install` 快速接入。

### P4: 开发者生态 (Documentation & Onboarding) (完成)
- [x] **IT 接入指南**：详细描述如何将 IDE 嵌入到现有 Java/React 后台系统中。
- [x] **API 参考手册**：基于 TSDoc 自动生成的实时文档。
- [x] **最佳实践案例**：提供常见业务场景的建模案例库。

---

## 🧠 3.0 阶段：智慧升华与仿真 (智能化、高交互)

**目标：** 引入 AI 与仿真能力，极大幅度降低复杂流程的建模与调试成本。

### P5: 视觉化 Diff 与版本管理
- [ ] **图面对比算法**：实现两个 JSON 版本的逻辑差异提取。
- [ ] **变更着色渲染**：在图上用颜色标识变更（绿-新增，红-删除，黄-修改）。
- [ ] **快照回溯**：支持查看任意历史版本预览，并一键回滚。

### P6: 零配置流程仿真器 (Workflow Simulator)
- [ ] **模拟运行引擎**：在前端执行流程逻辑，无需后端 Conductor 服务。
- [ ] **数据流动动画**：实时演示 Mock Data 在节点间的流转动态过程。
- [ ] **Mock 管理器**：支持为每个节点预设 Input/Output 模拟数据。

### P7: 专家级预设库 (Preset library)
- [ ] **典型拓扑模板**：内置 Saga 事务、多级补偿、动态 Fork 优化模式。
- [ ] **私有云模板库**：支持用户将自己的优秀设计保存为局部模板，供团队共享。

### P8: AI 灵感辅助 (AI Copilot) (完成)
- [x] **自然语言建模**：通过对话生成工作流框架（Prompt to JSON）。
- [x] **语义校验**：利用 AI 发现业务层面的逻辑瑕疵并提供优化建议。
- [x] **参数预测**：根据上下文自动补全 InputParameters 的映射关系。

---

## 📅 执行原则
1. **P1 优先**：TypeScript 是所有高级特性的地基，必须首先完成。
2. **渐进迭代**：每个 Feature 分支必须保持功能原子性，严禁大规模破坏性合入。
3. **向后兼容**：所有 2.0+ 的更新必须确保能够平滑解析旧版的 Conductor JSON 定义。
