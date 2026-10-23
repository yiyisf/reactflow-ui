/**
 * AI 入口 — AiWorkflowIDE 及其配套类型/工具的公开导出。
 *
 * 集成方引入方式：
 * ```tsx
 * import { AiWorkflowIDE } from '@yiyi_zhang/reactflow-ui/ai';
 * import '@yiyi_zhang/reactflow-ui/style.css';
 * ```
 *
 * 拆分为独立入口的原因：只使用 WorkflowIDE（主入口 `.`）的集成方不需要
 * 承担 AI 协议适配、工具执行、Mermaid 渲染等代码体积。
 */

export { AiWorkflowIDE } from './AiWorkflowIDE';
export type { AiWorkflowIDEProps, AiWorkflowIDERef } from './AiWorkflowIDE';

// ── AI 协议 / 传输配置 ──────────────────────────────────────────────────────
export type { AiConfig, Message, ToolDef, StreamEvent, TestConnectionResult } from './services/ai/protocolAdapter';
export { PROVIDER_DEFAULTS, testConnection } from './services/ai/protocolAdapter';
export { BASE_SYSTEM_PROMPT, buildSystemPrompt } from './services/ai/systemPrompt';

// ── 传输层反转（生产环境推荐 endpoint 代理模式，取代浏览器直连模型服务商） ──
export type { AiTransport, AgentRequest } from './services/ai/transport';

// ── 草稿持久化（刷新不丢工作） ──────────────────────────────────────────────
export type { IdeDraft } from './services/ai/draftPersistence';

// ── 扩展点：自定义工具 / 校验规则 / Schema ──────────────────────────────────
export type { CustomTool } from './services/ai/toolRegistry';
export type { CustomValidationRule } from './services/ai/ruleEngine';
export type { TaskSchema } from './services/ai/schemaRegistry';

// ── 工作流库 ────────────────────────────────────────────────────────────────
export type { WorkflowLevel, WorkflowLibraryItem, WorkflowLibraryDetail } from './types/workflowLibrary';

// ── 流程库数据源（LibraryProvider）：与主入口同源，供仅引入 /ai 的集成方使用 ──
export type {
    LibraryProvider,
    LibraryExtension,
    LibraryWorkflowRecord,
    LibraryTaskRecord,
    LibraryListResult,
    LibrarySearchOptions,
    LibraryLoadStatus,
} from './library/types';
export { LibraryCatalog } from './library/catalog';
export type { LibraryEntry, LibraryCatalogSnapshot, LibraryCatalogOptions } from './library/catalog';
export { toActions, toTaskSchemas, toLibraryItems } from './library/projections';
export { parseWorkflowName, validateWorkflowName } from './library/naming';
export type { ParsedWorkflowName, WorkflowNameType } from './library/naming';
export { createConductorLibraryProvider } from './library/conductorProvider';
export type { ConductorLibraryProviderOptions } from './library/conductorProvider';
export { DEFAULT_PROMPT_CATALOG_LIMIT } from './services/ai/systemPrompt';

// ── 审计事件 ────────────────────────────────────────────────────────────────
export type { AiEvent, AiEventType } from './types/aiEvents';

// ── 提案 / diff（高级定制：自定义审查 UI 时可复用） ─────────────────────────
export type { DiffSummary, PartialAcceptSelection, PatchOp } from './services/ai/toolExecutor';
export { applyPartialProposal, describeDiff, computeDiff } from './services/ai/toolExecutor';

// ── 指标 ────────────────────────────────────────────────────────────────────
export type { AiMetrics } from './store/aiStore';

// ── 共享基础类型（与主入口一致，供仅引入 /ai 的集成方使用） ─────────────────
export type { WorkflowDef, TaskDef, WorkflowInputParam, WorkflowInstance } from './types/conductor';
export { parseWorkflowInputParams } from './types/conductor';
export type { ExecutionActions, ThemeMode, ThemeColor, LayoutDirection, ViewMode, TaskExecutionData, WorkflowExecutionInput } from './types/workflow';

// ── v1.0.0: W-LSP & 浏览器本地沙箱引擎 ──────────────────────────────────────
export {
    getCompletionItems,
    buildDataFlowGraph,
    refactorTaskReferenceName,
    getUpstreamAncestors,
    inferTaskOutputSchema,
} from './services/wlsp/workflowLsp';
export type {
    WlspCompletionItem,
    DataFlowGraph,
    DataFlowEdge,
    InferredField,
    UpstreamTaskInfo,
} from './services/wlsp/workflowLsp';
export {
    executeLocalSandboxDryRun,
    buildDefaultWorkflowMockInput,
    generateDefaultTaskOutputPreview,
} from './utils/localSandboxEngine';
export type {
    SandboxDryRunOptions,
    TaskMockOverride,
} from './utils/localSandboxEngine';

// ── v1.3.0: 扩展点注册（IdeProviders）与接入埋点（TelemetrySink） ───────────
export { WorkflowIdeProvider, useIdeProviders } from './providers/WorkflowIdeProvider';
export type { WorkflowIdeProviderProps } from './providers/WorkflowIdeProvider';
export { resolveProviders, stabilizeProviders } from './providers/resolve';
export type { ProviderSources } from './providers/resolve';
export type {
    IdeProviders,
    OnboardingProvider,
    OnboardingContext,
    ProductInfo,
    StartTrialResult,
    PromotionStatus,
} from './providers/types';
// 自助接入：向导 / 命名生成器 / 申请上线面板与纯函数
export { WorkflowNameBuilder, OnboardingWizard, PromotionPanel, OnboardingGuideCard } from './components/onboarding';
export type {
    WorkflowNameBuilderProps,
    OnboardingWizardProps,
    OnboardingCreateResult,
    PromotionPanelProps,
    OnboardingGuideCardProps,
} from './components/onboarding';
export {
    buildWorkflowName,
    validateNameParts,
    suggestFuncSlug,
    promotionTargetName,
    isPromotableName,
    buildSkeletonWorkflow,
    nextPollDelay,
    isTerminalPromotionState,
    buildPromotionTimeline,
    promotionStateLabel,
    pollPromotion,
} from './onboarding';
export type { WorkflowNameParts, PromotionTargetType, SkeletonInput, TimelineItem, PromotionState, StartSource } from './onboarding';
export { createTelemetryBuffer } from './telemetry/buffer';
export type { TelemetryBuffer, TelemetryBufferOptions } from './telemetry/buffer';
export type { TelemetrySink, IdeEvent, IdeEventName } from './telemetry/types';

// ── v1.3.0: 接口导入（OpenAPI 3 / Swagger 2 / Postman 2.1 / curl → HTTP 业务动作） ──
export {
    detectFormat,
    parseApiText,
    parseOpenApi3,
    parseSwagger2,
    parsePostman21,
    parseCurl,
    buildHttpAction,
    appendImportedActions,
    sanitizeHeaders,
} from './import';
export type {
    ImportFormat,
    DetectedFormat,
    ImportedOperation,
    ImportedParam,
    ImportedBody,
    ParseResult,
    BuildHttpActionOptions,
} from './import';
export { ApiImportDialog } from './components/import/ApiImportDialog';
export type { ApiImportDialogProps, ApiImportInsertInfo } from './components/import/ApiImportDialog';
