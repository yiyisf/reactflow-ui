export { WorkflowIDE } from './WorkflowIDE';
export type { WorkflowIDEProps, WorkflowIDERef } from './WorkflowIDE';
export type { WorkflowDef, TaskDef, WorkflowInputParam, WorkflowInstance } from './types/conductor';
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
