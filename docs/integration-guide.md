# 宿主接入指南

> 适用版本：v1.2.0 · 面向：把 `@yiyi_zhang/reactflow-ui` 嵌入自己系统的内部项目团队
> 演进路线与各版本的扩展点见 [`docs/roadmap.md`](./roadmap.md)；全部组件属性的逐项说明见仓库根目录 [`INTEGRATION.md`](../INTEGRATION.md) 与源码 TSDoc（`WorkflowIDEProps` / `AiWorkflowIDEProps`）。

## 1. 先读这一节：SDK 与你的系统的分工

SDK 是一个**前端组件库**，不直连任何后端。演示站（Demo）没有后端，用的是模拟数据；内部项目引入后，所有数据与能力都通过**扩展点**（回调 / Provider）接入你们自己的服务，**不需要修改 SDK 代码**。

```
 你的前端项目
 ┌──────────────────────────────────────────────┐
 │  <WorkflowIDE /> / <AiWorkflowIDE />         │
 │      │ onSave          ──→ 治理服务（保存，含命名与归属校验）
 │      │ libraryProvider ──→ 治理服务 /api/library/*（流程库）
 │      │ onTriggerExecution / onPollExecution ──→ 治理服务转发 Conductor
 │      │ aiConfig.transport ──→ 内部模型 API（经你们的后端代理）
 └──────────────────────────────────────────────┘
```

两条原则：

- **权限始终在服务端判断。** 前端拿到什么、看不到什么，由治理服务按当前用户决定；SDK 与示例代码都不做权限过滤。
- **不接扩展点，行为不变。** 每个扩展点都是可选的，没接的功能自动降级（例如不传 `onTriggerExecution` 就没有「执行验证」按钮）。

## 2. 安装与引入

```bash
npm install @yiyi_zhang/reactflow-ui reactflow react react-dom
```

`react` / `react-dom` 需 >= 18，`reactflow` 为 `^11.11.4`（均为 peerDependencies，由宿主提供）。

| 入口 | 内容 | 什么时候用 |
|---|---|---|
| `@yiyi_zhang/reactflow-ui` | `WorkflowIDE`（工作流 IDE，含业务模式）、流程库工具（`createConductorLibraryProvider`、`parseWorkflowName`、`validateWorkflowName`、`diffWorkflowVersions` 等）、类型 | 只需要 IDE，或需要命名 / 差异等工具函数 |
| `@yiyi_zhang/reactflow-ui/ai` | `AiWorkflowIDE`（AI 对话式建模）及 AI 相关类型、`LibraryProvider` 等流程库**类型** | 需要 AI 建模。AI 代码单独打包，只用 `WorkflowIDE` 的项目不会引入 |
| `@yiyi_zhang/reactflow-ui/style.css` | 样式 | **必须引入一次**（两个入口共用） |

> `/ai` 入口同样导出流程库的类型、`LibraryCatalog`、投影函数，以及 `parseWorkflowName`、`validateWorkflowName`、`createConductorLibraryProvider`，只引入 `/ai` 的宿主无需再从主入口引入。

组件按父容器高度撑满，**务必给容器一个明确的高度**（如 `height: 100vh`）。

## 3. 最小接入

### 3.1 WorkflowIDE

```tsx
import { WorkflowIDE, type WorkflowDef } from '@yiyi_zhang/reactflow-ui';
import '@yiyi_zhang/reactflow-ui/style.css';

export function WorkflowPage() {
  const handleSave = async (def: WorkflowDef) => {
    await fetch('/api/workflows', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(def),
    });
  };

  return (
    <div style={{ height: '100vh' }}>
      <WorkflowIDE uiMode="business" theme="light" onSave={handleSave} />
    </div>
  );
}
```

- `uiMode="business"` 为面向业务人员的卡片式编辑（流程库能力、数据胶囊都在这个模式下使用）；默认 `pro` 为完整画布 + JSON。
- 不传 `workflowDef` 时显示空状态引导（空白 / AI 生成 / 导入 JSON）；传入后会随 prop 变化重新加载。

### 3.2 AiWorkflowIDE

```tsx
import { AiWorkflowIDE } from '@yiyi_zhang/reactflow-ui/ai';
import '@yiyi_zhang/reactflow-ui/style.css';

export function AiWorkflowPage() {
  return (
    <div style={{ height: '100vh' }}>
      <AiWorkflowIDE
        aiConfig={{ apiKey: '', transport: { type: 'endpoint', url: '/api/ai/chat' } }}
        onSave={(def) => console.log('保存', def)}
      />
    </div>
  );
}
```

`aiConfig` 的写法见 4.3。两个组件可同时在同一系统中使用（技术人员用 `WorkflowIDE`，业务人员用 `AiWorkflowIDE`），执行回调签名一致，同一份后端适配器可以共用。

## 4. 扩展点逐项说明

下表为 v1.2.0 已有的全部扩展点（按 `WorkflowIDEProps` / `AiWorkflowIDEProps` 整理）。「W」= `WorkflowIDE`，「A」= `AiWorkflowIDE`。

| 扩展点 | 组件 | 用途 | 建议对接的后端 |
|---|---|---|---|
| `onSave` / `onWorkflowChange` | W A | 保存、实时变更 | 治理服务 |
| `onTriggerExecution` / `onPollExecution` / `executionPollInterval` | W A | 在 IDE 内发起执行并轮询 | 治理服务转发 Conductor |
| `workflowExecution` / `executionActions` | W A | 展示运行态、运行态操作 | 治理服务转发 Conductor |
| `aiConfig` | W A | 模型调用 | 内部模型 API（经后端代理） |
| `libraryProvider` | W A | 流程库目录与版本 | 治理服务 `/api/library/*` |
| `currentWorkflowLevel` | W | 当前流程层级，过滤违反分层规则的库能力 | — |
| `promptCatalogLimit` | A | 流程库目录注入提示词的条数上限 | — |
| `onAiEvent` / `onAiMetrics` | A | AI 审计事件、用量指标 | 治理服务事件接口 / 日志 |
| `aiPermissions` | A | 控制 AI 能否改动工作流 / 修复 | 由宿主按用户角色计算 |
| `draftPersist` / `onDraftChange` | A | 草稿自动保存 | localStorage 或你们的后端 |

另有 `actions`（W，自定义业务动作）、`workflowLibrary` / `taskSchemas` / `customTools` / `validationRules`（A，静态数据与自定义工具 / 规则）、`systemPromptExtra`（A，追加提示词）等，详见源码 TSDoc；接了 `libraryProvider` 之后，一般不再需要单独传 `actions` / `workflowLibrary` / `taskSchemas`。

### 4.1 保存：`onSave` / `onWorkflowChange`

```tsx
<WorkflowIDE
  onSave={async (def) => {
    // 用户按 Ctrl+S / Cmd+S 或 ref.save() 时触发
    const res = await fetch('/api/workflows', { method: 'PUT', body: JSON.stringify(def), headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) alert('保存失败：' + (await res.text()));
  }}
  onWorkflowChange={(def) => setDirty(true)} // 任务增删改等数据变化时触发；拖拽、缩放等纯 UI 操作不触发
/>
```

- 命名、归属（`ownerEmail`）、业务域是否合法等校验应由**治理服务**完成并返回明确的中文错误；前端可以用 `validateWorkflowName(def.name, domains)` 提前提示（见第 6 节），但不能代替服务端校验。

### 4.2 执行：`onTriggerExecution` / `onPollExecution` / `executionActions` / `workflowExecution`

```tsx
<WorkflowIDE
  workflowDef={def}
  onTriggerExecution={async (workflowName, version, input) => {
    const res = await fetch('/api/executions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: workflowName, version, input }),
    });
    const { workflowId } = await res.json();
    return { workflowId };
  }}
  onPollExecution={async (workflowId) => {
    const res = await fetch(`/api/executions/${workflowId}`);
    if (!res.ok) return null; // 返回 null 表示暂未取到，继续轮询
    return res.json();        // WorkflowInstance；到达终态（COMPLETED / FAILED / TIMED_OUT / TERMINATED）后停止轮询
  }}
  executionPollInterval={3000} // 初始间隔，内部指数退避，最大 15 秒
/>
```

- 用户点「▶ 执行验证」后，IDE 按 `inputParameters` 生成入参表单，调用 `onTriggerExecution`，拿到 `workflowId` 后自动切换到运行态并轮询。不传 `onTriggerExecution` 则没有该按钮。
- **只看已有的执行实例**：直接传 `workflowDef` + `workflowExecution`（完整的 Conductor Workflow 实例，或裸任务数组），IDE 进入运行态。
- **运行态操作**：传 `executionActions` 后，按钮按已提供的回调显示（未提供的回调对应按钮不渲染）。

```tsx
<WorkflowIDE
  workflowDef={instance.workflowDefinition}
  workflowExecution={instance}
  readOnly
  executionActions={{
    allowOperations: userCanOperate, // false 时所有操作按钮置灰并提示「操作权限受限」
    onPause: (id) => api.pause(id),
    onResume: (id) => api.resume(id),
    onTerminate: (id) => api.terminate(id),
    onRetry: (id) => api.retry(id),
    onRestart: (id, opts) => api.restart(id, { useLatestDef: !!opts?.useLatestDef }),
    onRerunFromTask: (id, taskRef, taskId) => api.rerun(id, taskId),
    onSkipTask: (id, taskRef, taskId) => api.skip(id, taskRef, taskId),
  }}
/>
```

`allowOperations` 只控制按钮是否可点，**真正的权限校验仍要在你们的后端做**。

### 4.3 AI：`aiConfig` 与相关扩展点

**`aiConfig`（生产环境请用 `transport`）**

| 写法 | 说明 |
|---|---|
| `{ apiKey, baseUrl?, model?, provider? }` | direct 模式：密钥留在用户浏览器并直连模型服务商，**仅限开发调试** |
| `{ apiKey: '', transport: { type: 'endpoint', url, headers? } }` | **推荐**：请求 `POST { messages, tools, meta }` 到你们的后端，后端以 SSE（`data: <JSON StreamEvent>\n\n`）回传；密钥、限流、审计都在后端。对接内部模型 API 用这一种 |
| `{ apiKey: '', transport: { type: 'custom', stream } }` | 已有网关 / SDK 时自己实现流式，直接产出 `StreamEvent` |

提供有效 `apiKey` 或 `transport` 后，组件内置的「AI 配置」按钮会自动隐藏。后端参考实现见 `INTEGRATION.md` 的「生产环境安全提示」一节。

**其余 AI 扩展点**

```tsx
<AiWorkflowIDE
  aiConfig={{ apiKey: '', transport: { type: 'endpoint', url: '/api/ai/chat' } }}
  libraryProvider={libraryProvider}        // 见第 5 节
  promptCatalogLimit={50}                  // 默认 50；超出部分提示 AI 改用 search_workflow_library 检索
  aiPermissions={{ canEdit: userCanEdit, canRepair: false, restrictionMessage: '当前账号没有编辑权限' }}
  onAiEvent={(e) => audit.send({ type: e.type, at: e.timestamp, raw: e.rawMessage })}
  onAiMetrics={(m) => console.log(m.acceptedProposals, m.totalPromptTokens)}
  draftPersist={{ key: 'my-app-ai-workflow-draft' }}
  onDraftChange={(draft) => backend.saveDraft(draft)}
/>
```

- `aiPermissions`：`canEdit`（默认 true）为 false 时 AI 只能读取、不能修改；`canRepair`（默认 true）为 false 时运行态修复不可用；`restrictionMessage` 为受限时的提示。这是**界面层**的限制，需与后端权限保持一致。
- `onAiEvent`：接收提案创建 / 接受 / 拒绝、工具调用、修复确认与执行、`ai:error`（`rawMessage` 带原始错误文本，只经此回调给到宿主，不展示给终端用户）等审计事件。
- `onAiMetrics`：提案接受 / 拒绝计数与 token 用量（模型服务商返回 usage 时才计入，尽力而为）。
- `draftPersist`：默认关闭；开启后写入宿主页面的 localStorage，**仅在未传 `workflowDef` 时恢复**。需要存到后端时用 `onDraftChange`（可与 `draftPersist` 同时使用）。
- `promptCatalogLimit`：流程库很大（治理平台 1000+ 工作流）时务必保持较小的值，让 AI 通过检索工具按需查找，而不是把全部目录塞进提示词。

### 4.4 流程库：`libraryProvider` / `currentWorkflowLevel`

```tsx
const libraryProvider = createGovernanceLibraryProvider({ baseUrl: '', headers: () => ({ Authorization: `Bearer ${token()}` }) });

<WorkflowIDE uiMode="business" libraryProvider={libraryProvider} currentWorkflowLevel="L2" />
<AiWorkflowIDE libraryProvider={libraryProvider} />
```

- `currentWorkflowLevel`（仅 `WorkflowIDE`）：当前正在编辑的流程层级。提供后动作选择器隐藏违反分层规则的库能力（L1 看不到 L2 / L3，L2 看不到 L3）；不传则不过滤。层级可以由 `parseWorkflowName(def.name)?.level` 得到。
- 目录加载中 / 失败时，动作选择器与流程库面板显示「加载中 / 加载失败，点击重试」，**失败不阻塞编辑**。

### 4.5 统一注册扩展点：`WorkflowIdeProvider` / `providers`（v1.3.0）

页面里有多个 IDE、或后续还要接入更多扩展点时，不必每个组件都传一遍 props，可以在外层配置一次：

```tsx
import { WorkflowIdeProvider } from '@yiyi_zhang/reactflow-ui';

const providers = { library: libraryProvider, telemetry: telemetrySink };

<WorkflowIdeProvider providers={providers}>
  <WorkflowIDE uiMode="business" />
  <AiWorkflowIDE />
</WorkflowIdeProvider>
```

`IdeProviders` 目前包含：`library`（`LibraryProvider`）、`onboarding`（`OnboardingProvider`，v1.3.0 仅提供契约类型，界面随后续批次提供）、`telemetry`（`TelemetrySink`）。也可以只在单个组件上传 `providers` prop，或在组件内通过 `useIdeProviders()` 读取外层配置。

**解析顺序**（逐字段，高优先级缺少该字段时才落到下一层）：

1. 组件上的专用 prop（如 `libraryProvider`）
2. 组件的 `providers` prop
3. 外层 `WorkflowIdeProvider`
4. 无（该功能不显示入口）

只传 `libraryProvider`、不使用 `WorkflowIdeProvider` 的现有写法行为不变。

**稳定性**：按字段比较引用。宿主每次渲染都新建 `providers` 对象没有关系，只要里面的 provider 实例不变，就不会重新加载流程库目录；但 provider 本身（如 `createGovernanceLibraryProvider(...)`）应只创建一次（模块级、`useMemo` 或 `useState`），不要在渲染中反复创建，否则每次都会触发目录重载。

#### 接入埋点：`TelemetrySink`

```tsx
import type { TelemetrySink, IdeEvent } from '@yiyi_zhang/reactflow-ui';

const telemetrySink: TelemetrySink = {
  // SDK 已按「5 秒或 20 条」攒批，页面隐藏（切换标签 / 关闭）时强制发送一次
  track(events: IdeEvent[]) {
    // 关闭页面时用 sendBeacon 更可靠；失败不影响界面（SDK 会吞掉异常，仅 console.warn 一次）
    const body = JSON.stringify(events);
    if (!navigator.sendBeacon?.('/api/onboarding/events', new Blob([body], { type: 'application/json' }))) {
      void fetch('/api/onboarding/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    }
  },
};
```

- 本版本上报的事件：`ide_opened`（IDE 挂载）、`workflow_saved`（触发 `onSave`）、`step_added`（业务模式新增步骤，`props.source` 为 `library` 或 `builtin`）、`sandbox_run`（本地沙箱试跑，`props.result` 为执行状态或 `error`）、`ai_event`（仅 `props.type`，即 `onAiEvent` 的事件类型）。`trial_started`、`workflow_created`、`promotion_*` 随后续批次接入；`api_imported`（接口导入）已接入。
- **不含任何载荷**：事件只有名称、时间、IDE 类型、流程名与简单属性；SDK 会剔除 `props` 中非 string / number / boolean 的值，不采集参数值、表达式、提示词、对话内容与执行数据。
- 没有 `telemetry` 时事件被直接丢弃，不产生定时器与页面监听。
- 需要自定义批量参数或在 IDE 之外复用时，可用 `createTelemetryBuffer(sink, { flushIntervalMs, maxBatchSize })` 自行包装。

### 4.6 接口导入（v1.3.0）

工具栏「导入接口」（编辑态，业务 / 专业模式均有）：粘贴或上传 → 自动识别格式 → 勾选接口 → 「插入 N 个步骤」。每个接口生成一个 HTTP 业务动作并追加到流程末尾（专业模式下追加为 `HTTP` 任务）。宿主也可用 `ref.current.openApiImport()` 打开，或单独使用 `ApiImportDialog` 的 `onInsert(actions, info)` 回调（配合 `appendImportedActions`）。

| 格式 | 说明 |
|---|---|
| OpenAPI 3.x（JSON） | `servers[0].url`（含变量默认值）、本地 `$ref`、`security` 推断认证头 |
| Swagger 2.0（JSON） | `schemes` / `host` / `basePath`、`definitions` 引用 |
| Postman Collection v2.1（JSON） | 文件夹作为标签；`{{var}}` 转为 `${workflow.input.var}` |
| curl | `-X`、`-H`、`-d` / `--data-raw` / `--data-binary`、`-u`、`-G`、行尾 `\` 续行 |

- **字段与出参**：参数、请求体属性沿用 `buildFields`（`title` → 名称，`enum` → 下拉，均可插入数据）；出参取 2xx 响应 schema，键为 `response.body.<字段>`（Conductor `HTTP` 任务的真实输出路径）。`$ref` 解析防循环，最大深度 6。
- **敏感头不落定义**：`Authorization`、`Cookie`、`Proxy-Authorization`、`X-Api-Key`、名称含 `token` / `secret` / `api-key` 的头与 curl `-u` 一律替换为 `${workflow.input.<名称>}` 占位（值需在流程入参中提供完整头内容，如 `Bearer xxx`），导入面板给出提示，建议改用凭据管理；curl / Postman 中名称敏感的查询参数与请求体字段默认值同样占位。步骤引用的 `workflow.input.*` 会自动补进流程入参声明。
- **限制**：仅 JSON，**不支持 YAML**（提示「YAML 请先转为 JSON 后再导入」，不引入 YAML 依赖）；不支持 multipart / 表单上传 / Cookie 参数；导入的动作只在当前流程与本次会话的动作库中，刷新后已有步骤以「专业步骤」卡片保留（定义无损），**登记为流程库能力属 v1.4.0**。
- 埋点：`api_imported`（`format`、`count`）与每个步骤一条 `step_added`（`source: 'import'`）。示例文件见仓库 `public/sample-imports/`。

## 5. 用治理服务实现 `LibraryProvider`

`LibraryProvider` 是流程库的统一数据源接口（`list` / `get` / 可选的 `search`）。治理服务提供以下接口，下面的 `createGovernanceLibraryProvider` 是对应的完整实现，可直接复制使用。

### 5.1 接口约定

| 接口 | 返回 | 说明 |
|---|---|---|
| `GET /api/library/catalog?kind=WORKFLOW,TASK` | `LibraryListResult` | 已发布（PUBLISHED）与已下线（DEPRECATED）的能力，每个名称只给当前版本；已下线的带 `deprecated: true`；`def.tasks` 可以为空（摘要即可，但 `inputSchema` / `outputSchema` 要完整）。支持 `ETag` / `If-None-Match`，未变化返回 304 |
| `GET /api/library/workflows/{name}/versions/{version}` | `LibraryWorkflowRecord` | 指定版本的完整定义；版本不存在、已撤回、当前用户无权限**统一返回 404** |
| `GET /api/library/search?q=&level=&domain=&limit=` | `LibraryWorkflowRecord[]` | 服务端检索（后续提供）。大目录时 AI 的 `search_workflow_library` 会走这里 |

补充字段放在记录的 `extension` 中（Conductor 标准定义里没有的信息）：

| 字段 | 含义 |
|---|---|
| `level` | `L1` / `L2` / `L3` |
| `domain` | 业务域，如「通知协助」，取值来自服务端维护的全局列表 |
| `category` | 动作分类：`compute` / `storage` / `network` / `monitor` / `notify` / `logic` / `human` / `custom` |
| `icon` | 图标（emoji 或字符） |
| `displayName` | 中文展示名（缺省显示流程名称） |
| `tags` | 标签，用于检索 |

`level` / `domain` 缺省时会按流程名称兜底解析（见第 6 节）。`inputSchema` / `outputSchema` 请使用内联 JSON Schema（`SchemaDef` 的 `type: 'JSON'` + `data`），并为每个属性写中文 `title`、`description`，枚举写 `enum`，必填写 `required`，示例写 `examples`——表单、数据胶囊、升级差异和 AI 生成都依赖这些信息。字段示例见 `src/demo/mockGovernance/libraryData.ts`。

### 5.2 示例实现

代码与 `src/demo/examples/governanceLibraryProvider.ts` 完全一致（仅类型导入路径换成了包名）；该文件随 CI 做类型检查，并有单元测试。

```ts
/**
 * 示例：用「编排治理服务」实现 LibraryProvider（宿主接入参考，不从包入口导出）。
 *
 * 本文件会随 CI 一起做类型检查，并与 docs/integration-guide.md 中的示例代码保持一致
 * （文档中的类型从包名 '@yiyi_zhang/reactflow-ui' 引入，此处用相对路径，其余完全相同）。
 *
 * 治理服务接口约定（权限全部在服务端判断，前端不做任何权限过滤）：
 * - GET {baseUrl}/api/library/catalog?kind=WORKFLOW,TASK
 *     -> LibraryListResult（PUBLISHED + DEPRECATED；已下线的带 deprecated: true；def.tasks 可为空）
 *     支持 ETag / If-None-Match，未变化时返回 304
 * - GET {baseUrl}/api/library/workflows/{name}/versions/{version}
 *     -> LibraryWorkflowRecord（含完整 def）；版本不存在 / 已撤回 / 无权限一律 404
 * - GET {baseUrl}/api/library/search?q=&level=&domain=&limit=
 *     -> LibraryWorkflowRecord[]（后续提供，默认不启用，见 enableSearch）
 */
import type {
  LibraryListResult,
  LibraryProvider,
  LibrarySearchOptions,
  LibraryWorkflowRecord,
} from '@yiyi_zhang/reactflow-ui';

export interface GovernanceLibraryProviderOptions {
  /** 治理服务根地址，如 `https://governance.example.com`；同域部署可传空字符串（使用相对路径） */
  baseUrl: string;
  /**
   * 认证头等，由宿主在每次请求前注入（组件库不保存任何凭据）。
   * 可返回 Promise，便于异步刷新 token。
   */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** 自定义 fetch（测试 / 网关封装）；缺省使用全局 fetch */
  fetch?: typeof fetch;
  /** 目录包含的种类，默认工作流与原子任务都要 */
  kinds?: Array<'WORKFLOW' | 'TASK'>;
  /** 是否启用服务端检索（治理服务提供 /api/library/search 后再打开）。默认 false，AI 在本地目录内匹配 */
  enableSearch?: boolean;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

function isListResult(body: unknown): body is LibraryListResult {
  return !!body && typeof body === 'object' && Array.isArray((body as LibraryListResult).workflows);
}

/**
 * 基于治理服务的流程库数据源。
 *
 * 注意：返回的 Provider 请在组件外或用 useMemo 创建并保持引用稳定——
 * `libraryProvider` 引用一变化，IDE 就会重新加载目录。
 */
export function createGovernanceLibraryProvider(options: GovernanceLibraryProviderOptions): LibraryProvider {
  const kinds = (options.kinds ?? ['WORKFLOW', 'TASK']).join(',');

  // 目录的 ETag 缓存：服务端返回 304 时直接复用上一次的结果
  let cachedEtag: string | undefined;
  let cachedCatalog: LibraryListResult | undefined;

  async function request(path: string, init: { signal?: AbortSignal; extraHeaders?: Record<string, string> }): Promise<Response> {
    const doFetch = options.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
    if (!doFetch) throw new Error('当前环境没有 fetch，请通过 options.fetch 传入');
    const injected = options.headers ? await options.headers() : {};
    return doFetch(joinUrl(options.baseUrl, path), {
      method: 'GET',
      headers: { Accept: 'application/json', ...injected, ...(init.extraHeaders ?? {}) },
      signal: init.signal,
    });
  }

  async function list(signal?: AbortSignal): Promise<LibraryListResult> {
    const path = `/api/library/catalog?kind=${encodeURIComponent(kinds)}`;
    const res = await request(path, {
      signal,
      extraHeaders: cachedEtag && cachedCatalog ? { 'If-None-Match': cachedEtag } : undefined,
    });
    if (res.status === 304 && cachedCatalog) return cachedCatalog;
    if (!res.ok) throw new Error(`获取流程库目录失败：HTTP ${res.status}`);
    const body: unknown = await res.json();
    if (!isListResult(body)) throw new Error('流程库目录返回格式不正确（期望包含 workflows 数组）');
    cachedCatalog = body;
    cachedEtag = res.headers.get('ETag') ?? undefined;
    return body;
  }

  async function get(name: string, version?: number, signal?: AbortSignal): Promise<LibraryWorkflowRecord | null> {
    let target = version;
    if (target === undefined) {
      // 接口必须带版本号：未指定时取目录里的当前最新版本
      const catalog = cachedCatalog ?? (await list(signal));
      target = catalog.workflows.find((r) => r.def.name === name)?.def.version;
      if (target === undefined) return null;
    }
    const res = await request(`/api/library/workflows/${encodeURIComponent(name)}/versions/${encodeURIComponent(String(target))}`, { signal });
    // 不存在 / 已撤回 / 无权限：服务端统一返回 404，对应「版本不可用」
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`获取流程库工作流「${name}」v${target} 失败：HTTP ${res.status}`);
    const record = (await res.json()) as LibraryWorkflowRecord | null;
    if (!record || !record.def || typeof record.def.name !== 'string') return null;
    return record;
  }

  async function search(query: string, opts: LibrarySearchOptions = {}, signal?: AbortSignal): Promise<LibraryWorkflowRecord[]> {
    const params = new URLSearchParams();
    params.set('q', query);
    if (opts.level) params.set('level', opts.level);
    if (opts.domain) params.set('domain', opts.domain);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    const res = await request(`/api/library/search?${params.toString()}`, { signal });
    if (!res.ok) throw new Error(`检索流程库失败：HTTP ${res.status}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new Error('流程库检索返回格式不正确（期望数组）');
    return body as LibraryWorkflowRecord[];
  }

  return { list, get, ...(options.enableSearch ? { search } : {}) };
}
```

要点：

- **认证**：`headers` 在每次请求前调用，可返回 Promise（异步刷新 token）。SDK 不保存任何凭据。
- **ETag**：第一次 200 记下 `ETag`，之后的目录请求带 `If-None-Match`，304 时复用上次结果。跨域部署时，服务端需允许请求头 `If-None-Match` 并通过 `Access-Control-Expose-Headers: ETag` 暴露响应头；同域部署无此问题。**ETag 应随用户（权限）变化**；切换用户 / 重新登录后请重新创建 Provider，不要沿用上一个用户的缓存。
- **404 → `null`**：`get` 找不到返回 `null`（不抛错），IDE 据此显示「版本不可用」。其它 HTTP 错误才抛出，目录层会把它记为加载失败。
- **AbortSignal**：直接透传给 `fetch`，组件卸载或 Provider 更换时中止进行中的请求。
- **检索**：`enableSearch` 默认关闭；治理服务上线 `/api/library/search` 后再打开。关闭时 AI 在已加载的目录内本地匹配。

### 5.3 在组件中使用

**Provider 必须保持引用稳定。** `libraryProvider` 的引用一变化，IDE 就会丢弃已加载的目录并重新请求；在 render 里直接 `createGovernanceLibraryProvider(...)` 会导致每次渲染都重新加载。

```tsx
import { useMemo } from 'react';
import { WorkflowIDE } from '@yiyi_zhang/reactflow-ui';
import { AiWorkflowIDE } from '@yiyi_zhang/reactflow-ui/ai';
import { createGovernanceLibraryProvider } from './governanceLibraryProvider';

function Editor({ useAi }: { useAi: boolean }) {
  // 同一个实例同时给两个 IDE；用户切换时依赖 userId 重新创建
  const libraryProvider = useMemo(
    () => createGovernanceLibraryProvider({
      baseUrl: import.meta.env.VITE_GOVERNANCE_URL ?? '',
      headers: () => ({ Authorization: `Bearer ${getToken()}` }),
    }),
    [userId],
  );
  return useAi
    ? <AiWorkflowIDE libraryProvider={libraryProvider} aiConfig={aiConfig} />
    : <WorkflowIDE uiMode="business" libraryProvider={libraryProvider} />;
}
```

### 5.4 本地没有治理服务时怎么联调

- 看效果：直接打开演示站，演示站用 `src/demo/mockGovernance/` 里的模拟治理服务（有网络延迟，可模拟加载失败），数据覆盖多个业务域、层级、多版本、已下线与已撤回场景。
- 对接自己的后端：先用 `createGovernanceLibraryProvider` 的 `fetch` 选项传入假 `fetch` 做单测（参考 `src/demo/examples/governanceLibraryProvider.test.ts`），再连真实服务。

## 6. 命名规范与业务域

治理平台的流程命名规范：**`类型-层级-业务域-产品-功能`**，以 `-` 分隔。

| 段 | 取值 | 示例 |
|---|---|---|
| 类型 | `std`（通用）/ `proxy`（代理）/ `tmp`（临时，自动清理）/ `custom`（自定义） | `std` |
| 层级 | `L1` 原子操作 / `L2` 业务场景 / `L3` 端到端编排 | `L1` |
| 业务域 | 来自服务端维护的全局可调整列表 | `通知协助` |
| 产品 | 自由名称，内部不含 `-` | `msg` |
| 功能 | 第 4 个 `-` 之后的全部内容，自身可含 `-` | `send_sms` |

示例：`std-L1-通知协助-msg-send_sms`。当前约定的业务域：云资源、配置管理、监控运维、数据服务、通知协助、安全服务、服务管理、运维操作、系统工具、应用管理（以服务端实际列表为准，SDK **不写死**）。

SDK 对命名与业务域的处理：

- **解析**：`parseWorkflowName(name)` 返回 `{ type, level, domain, product, func }`，不合规返回 `null`；`validateWorkflowName(name, allowedDomains?)` 返回中文错误列表（空数组 = 合法），传入 `allowedDomains` 才校验业务域。两者都是纯函数，主入口与 `/ai` 入口均有导出。
- **兜底**：库记录没有 `extension.level` / `extension.domain` 时，按名称解析得到；`extension` 中显式给出的值**始终优先**（两者层级不一致时保留 `extension.level`，不报错）；名称不符合规范则不兜底。
- **动作选择器**：存在业务域时，在原分类标签后追加业务域标签，按目录中首次出现的顺序排列，没有业务域的库动作归「其他」并固定在最后；搜索跨全部动作。
- **AI**：系统提示词目录显示 `[业务域: X]`，`search_workflow_library` 支持 `domain` 参数，并透传给 `provider.search`；流程库面板可按业务域筛选。

```ts
import { validateWorkflowName } from '@yiyi_zhang/reactflow-ui';

const errors = validateWorkflowName(def.name, domainsFromServer); // 例如：层级「L4」不合法，应为 L1 / L2 / L3 之一
```

## 7. 版本固定与升级

库能力在步骤中以 `SUB_WORKFLOW` 引用，**首次引用时固定为目录里的当前版本，库升级后不会自动跟随**。

| 场景 | 行为 |
|---|---|
| 业务模式或 AI 新建引用 | 记录目录中的当前版本（`subWorkflowParam.version`）；AI 生成时若缺少版本，也补成目录当前版本，已有版本号不会被改动 |
| 库发布了新版本 | 步骤仍按固定版本编译；徽标显示「⬆ 有新版本 vN」 |
| 用户点击升级 | 取旧、新两个版本的定义，展示**升级差异**（新增 / 删除 / 类型变化的入参，新增 / 删除的出参；会影响已填内容的置顶，如「已填写的值将丢失」「下游引用将失效」），确认后才升级 |
| 固定版本已被撤回（`get` 返回 404） | 徽标显示「⚠ 版本不可用」，保持原样编译，不自动改版本 |
| 能力已下线（`deprecated`） | 不再出现在动作选择器与 AI 检索里；已引用的步骤显示「版本不可用」，仍照常编译 |
| 目录加载失败 | 不显示新版本提示，不影响编辑与编译 |

对服务端的要求：已撤回的版本一定要返回 404（而不是 200），否则 IDE 无法提示「版本不可用」；同一名称的版本号用**整数**递增（`WorkflowDef.version`），展示用的 `1.2.0` 之类放在记录的 `versionLabel`。

## 8. 常见问题

**权限怎么处理？** 全部在服务端：目录只返回当前用户能看到的能力，`get` 对无权限的版本返回 404。SDK 的 `aiPermissions`、`executionActions.allowOperations` 只是界面层的开关，不能替代后端校验。

**生产环境可以直接用 `createConductorLibraryProvider` 连 Conductor 吗？** 不要。它直接读取 Conductor 的元数据接口，绕过了治理服务的权限与「发布 / 下线 / 撤回」状态，用户可能看到无权使用或未发布的能力。它适合本地开发或没有治理服务的环境；内部项目一律使用治理服务版本（第 5 节）。

**页面一刷新 / 重渲染目录就反复加载？** 检查 `libraryProvider` 是否每次渲染都新建；请用 `useMemo` 或放在组件外保持引用稳定。

**目录很大会不会卡？** 动作选择弹窗的筛选只在打开时计算，AI 提示词受 `promptCatalogLimit` 限制，其余能力由 `search_workflow_library` 检索；治理服务提供 `/api/library/search` 后打开 `enableSearch` 更佳。

**加载失败怎么办？** 界面会显示「加载失败，点击重试」，不影响编辑；已经引用的步骤不会因此误报「版本不可用」。排查先看浏览器网络面板中 `/api/library/catalog` 的状态码（401 / 403 先查认证头，跨域先查 CORS）。

**为什么库里的流程「看不到」？** 常见原因：被 `currentWorkflowLevel` 的分层规则过滤（L1 流程看不到 L2 / L3 能力）；能力已下线；服务端没有给当前用户返回；没有 `inputSchema`（会退化为只显示参数名，信息不全，建议补全 schema）。

**业务域列表变了要改 SDK 吗？** 不用。业务域只当字符串处理，取值来自服务端返回的记录。

**可以只用 AI 而不接流程库吗？** 可以。不传 `libraryProvider` 时行为与之前完全一致，仍可通过静态的 `workflowLibrary` / `taskSchemas` 提供目录。

**AI 密钥放哪里？** 不要放在前端。使用 `aiConfig.transport` 的 `endpoint` 模式，让你们的后端持有密钥并转发到内部模型 API。

## 9. 各版本计划的扩展点

下表摘自 [`docs/roadmap.md`](./roadmap.md)，规划可能随反馈调整。每个新扩展点都会同时提供契约文档和 Demo 用的模拟实现，内部项目只按契约对接后端，不改 SDK 代码。

| 扩展点 | 用途 | 引入版本 | 内部引入时的后端 |
|---|---|---|---|
| `onSave` / `onWorkflowChange` | 保存定义 | 已有 | 治理服务（含命名与归属校验） |
| `onTriggerExecution` / `onPollExecution` / `executionActions` | 执行与操作 | 已有 | 治理服务转发 Conductor |
| `aiConfig` | 模型调用 | 已有 | 内部模型 API |
| `libraryProvider` | 流程库目录与版本 | v1.2.0 | 治理服务 `/api/library/*` |
| `OnboardingProvider` | 试用、产品、业务域、上线申请 | v1.3.0 | 治理服务自助试用接口 |
| `TelemetrySink` | 接入漏斗与使用事件 | v1.3.0 | 治理服务事件接口 |
| `ReviewProvider` | 发布审核与影响范围 | v1.4.0 | 治理服务审核与引用索引 |
| `ExecutionSampleProvider` | 按权限取执行样本 | v1.5.0 | 治理服务执行查询 |
| `TemplateProvider` | 组织模板存取 | v1.5.0 | 治理服务模板接口 |

## 10. 相关文档

- [`docs/design/流程库数据源-LibraryProvider设计.md`](./design/流程库数据源-LibraryProvider设计.md)：`LibraryProvider` 的接口、目录、投影与版本固定设计
- [`docs/roadmap.md`](./roadmap.md)：演进路线与扩展点总表
- [`INTEGRATION.md`](../INTEGRATION.md)：全部组件属性、Ref API、AI 信任模型的详细说明
- `src/demo/examples/governanceLibraryProvider.ts`：本指南第 5 节示例代码（CI 类型检查）
- `src/demo/mockGovernance/`：演示站使用的模拟治理服务与示例数据

