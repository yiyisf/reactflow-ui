export { WorkflowIDE } from './WorkflowIDE';
export type { WorkflowIDEProps, WorkflowIDERef } from './WorkflowIDE';
export type { WorkflowDef, TaskDef, WorkflowInputParam, WorkflowInstance, SchemaDef } from './types/conductor';
export { parseWorkflowInputParams } from './types/conductor';
export type { AIServiceConfig } from './services/aiService';
export type { ExecutionActions, RestartOptions, ViewMode, RunState, WorkflowExecutionInput } from './types/workflow';

// ── v1.0.0: W-LSP (Workflow Language Server) & Data Lineage ──────────────────
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

// ── v1.0.0: Deterministic In-Browser Sandbox Dry-Run Engine ──────────────────
export {
    executeLocalSandboxDryRun,
    buildDefaultWorkflowMockInput,
    generateDefaultTaskOutputPreview,
} from './utils/localSandboxEngine';
export type {
    SandboxDryRunOptions,
    TaskMockOverride,
} from './utils/localSandboxEngine';

// ── v1.1.0: Zero-Code Business Mode & Action Store ───────────────────────────
export * from './actions/types';
export { ActionRegistry, defaultActionRegistry } from './actions/registry';
export { BUILTIN_ECS_ACTIONS } from './actions/builtin/ecs';
export { BUILTIN_COMMON_ACTIONS } from './actions/builtin/common';
export {
    buildActionFromWorkflowDef,
    buildActionFromTaskDef,
    buildActionsFromLibrary,
    buildActionsFromTaskDefs,
} from './actions/fromDefinitions';
export type {
    ActionExtension,
    RegisteredTaskDef,
    LibraryWorkflowEntry,
    RegisteredTaskEntry,
} from './actions/fromDefinitions';
export { createStepFromAction } from './stepmodel/factory';
export * from './stepmodel/types';
export {
    compileStepToTaskDef,
    compileStepModelToWorkflowDef,
} from './stepmodel/compile';
export {
    decompileTaskDefToStep,
    decompileWorkflowDefToStepModel,
} from './stepmodel/decompile';
export { StepFlowEditor } from './components/business/StepFlowEditor';
export { DecisionBranchCard } from './components/business/DecisionBranchCard';
export { ForkJoinCard } from './components/business/ForkJoinCard';
export { LoopDoWhileCard } from './components/business/LoopDoWhileCard';
export { DataPillInput } from './components/business/DataPillInput';
export { ActionForm } from './components/business/ActionForm';

// ── v1.1.0: Scenario-Based Template Center & 3-Step Setup Wizard ─────────────
export * from './template/types';
export { TemplateStore, defaultTemplateStore } from './template/templateStore';
export { applyTemplateVariables } from './template/applyTemplate';
export { BUILTIN_WORKFLOW_TEMPLATES } from './template/builtin/templates';
export { TemplateGallery } from './components/template/TemplateGallery';
export { TemplateSetupWizard } from './components/template/TemplateSetupWizard';

// ── v1.1.0: Production-to-Template Sanitizer & Extractor ─────────────────────
export * from './template/sanitizer/types';
export { scanWorkflowDef, scanObjectForSensitiveFindings } from './template/sanitizer/rules';
export { analyzeTasksForPruning, applyTaskPruning } from './template/sanitizer/prune';
export { extractTemplateFromInstance } from './template/sanitizer/anonymize';
export { TemplateExtractor } from './components/template/TemplateExtractor';

// ── v1.1.0: Storyline Run Timeline & Friendly Conversational Diagnosis ───────
export * from './utils/friendlyErrorTranslator';
export { FriendlyErrorCard } from './components/business/FriendlyErrorCard';
export type { FriendlyErrorCardProps } from './components/business/FriendlyErrorCard';
export { RunStoryTimeline } from './components/business/RunStoryTimeline';
export type { RunStoryTimelineProps } from './components/business/RunStoryTimeline';

// ── 流程库数据源（LibraryProvider）：Provider 接口 / 目录 / 投影 ─────────────
export * from './library';
export type { WorkflowLevel, WorkflowLibraryItem } from './types/workflowLibrary';
export type { TaskSchema } from './services/ai/schemaRegistry';

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
