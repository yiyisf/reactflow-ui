import type { TaskDef } from '../types/conductor';

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
}

export interface ActionDefinition {
  id: string;
  name: string;
  category: ActionCategory;
  icon: string;
  description: string;
  connector?: string;
  riskLevel: 'safe' | 'sensitive';
  fields: ActionField[];
  outputs: ActionOutputField[];
  compile: (values: Record<string, any>, ctx: CompileCtx) => TaskDef;
  decompile?: (task: TaskDef) => Record<string, any> | null;
  mockOutput?: (values: Record<string, any>) => Record<string, any>;
}
