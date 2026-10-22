import type { TaskDef } from '../types/conductor';
import type { WorkflowLevel } from '../types/workflowLibrary';

export type ActionCategory =
  | 'compute'
  | 'storage'
  | 'network'
  | 'monitor'
  | 'notify'
  | 'logic'
  | 'human'
  | 'custom';

export type ActionFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'boolean'
  | 'account'
  | 'cron-friendly';

export interface ActionFieldOption {
  label: string;
  value: any;
  description?: string;
}

export interface ActionField {
  key: string;
  label: string;
  type: ActionFieldType;
  help?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: any;
  options?: ActionFieldOption[];
  acceptsPills?: boolean; // Whether the field supports DataPill token insertion
}

export interface ActionOutputField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  example?: any;
  description?: string;
}

export interface CompileCtx {
  taskReferenceName: string;
  stepIndex: number;
  workflowName?: string;
  /**
   * 该步骤引用流程库能力时记录的 {名称, 版本}。
   * 版本在首次引用时固定，库升级后不会自动跟随；version 缺省表示沿用原定义（不显式指定版本）。
   */
  libraryRef?: LibraryRef;
}

/** 步骤对流程库能力（SUB_WORKFLOW）的引用记录 */
export interface LibraryRef {
  name: string;
  version?: number;
}

export interface ActionDefinition {
  id: string;
  name: string;
  category: ActionCategory;
  icon: string;
  description: string;
  connector?: string;
  /** 动作来源：task = 原子任务（默认），workflow = 流程库能力（以 SUB_WORKFLOW 引用） */
  kind?: 'task' | 'workflow';
  /** kind = workflow 时：库中该能力的当前最新版本，用于提示“有新版本可升级” */
  workflowRef?: { name: string; version: number };
  /** 流程库层级 L1 / L2 / L3（调用方向规则见 workflowLibrary） */
  level?: WorkflowLevel;
  /** 业务域展示名（流程库动作）；动作选择器据此分组，缺省归入「其他」 */
  domain?: string;
  /** 已下线 / 不建议新引用：动作选择器隐藏，但已引用的步骤照常显示与编译 */
  deprecated?: boolean;
  tags?: string[];
  ownerEmail?: string;
  riskLevel: 'safe' | 'sensitive';
  fields: ActionField[];
  outputs: ActionOutputField[];
  compile: (values: Record<string, any>, ctx: CompileCtx) => TaskDef;
  decompile?: (task: TaskDef) => Record<string, any> | null;
  mockOutput?: (values: Record<string, any>) => Record<string, any>;
}
