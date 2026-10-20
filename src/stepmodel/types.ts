import type { TaskDef, WorkflowDef } from '../types/conductor';

export interface PillToken {
  /** The Conductor reference path, e.g. "ecs_create_0.output.instanceId" or "workflow.input.userId" */
  rawRef: string;
  /** Human-friendly Chinese label, e.g. "实例ID" or "用户ID" */
  label: string;
  /** Task or step origin label, e.g. "创建云主机" */
  stepLabel?: string;
  /** Optional formatting filter, e.g. "lowercase", "date" */
  format?: string;
}

export interface BusinessStep {
  id: string;
  actionId: string;
  taskReferenceName: string;
  name: string;
  description?: string;
  values: Record<string, any>;
  /**
   * If true, this step represents an unmapped technical Conductor task (e.g. raw JQ or custom Lambda)
   * which is preserved losslessly as a read-only "Professional Step" card in business mode.
   */
  isProFallback?: boolean;
  rawTaskDef?: TaskDef;
}

export interface BusinessWorkflowModel {
  name: string;
  description?: string;
  version?: number;
  steps: BusinessStep[];
  inputParameters?: any[];
  rawWorkflowDef?: WorkflowDef;
}
