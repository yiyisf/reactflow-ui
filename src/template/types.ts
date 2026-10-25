import type { WorkflowDef } from '../types/conductor';

/**
 * 模板分类枚举：
 * - compute: 资源交付与计算管理
 * - security: 安全备份与应急合规
 * - cost: 资源节能与成本优化
 * - ops: 日常运维与自动自愈
 */
export type TemplateCategory = 'compute' | 'security' | 'cost' | 'ops';

/**
 * 模板变量定义（填空向导中的表单字段）
 */
export interface TemplateVariable {
  /** 变量唯一键名 */
  key: string;
  /** 中文业务标签名称，如 "通知目标群组" */
  label: string;
  /** 字段辅助提示说明 */
  help?: string;
  /** 变量输入控件类型 */
  type: 'text' | 'number' | 'select' | 'boolean' | 'account' | 'cron-friendly';
  /** 默认值 */
  defaultValue?: any;
  /** 下拉选项 */
  options?: { label: string; value: any }[];
  /** 是否必填 */
  required?: boolean;
  /** 占位提示文案 */
  placeholder?: string;
  /**
   * 变量注入路径列表：
   * 支持通过 JSONPath 或属性链将该值灌入 WorkflowDef 中对应的任务参数，
   * 例如: ["tasks[0].inputParameters.instanceName", "tasks[1].inputParameters.title"]
   */
  bindings: string[];
}

/**
 * 模板内置的高保真拟真沙盒数据场景
 */
export interface MockScenario {
  /** 场景名称，如 "默认成功场景"、"高负载触发升配场景" */
  name: string;
  /** 场景业务说明 */
  description?: string;
  /** 该场景下的工作流全局入参 */
  workflowInput: Record<string, any>;
  /** 任务级拟真输出覆盖映射 (taskReferenceName -> outputData) */
  taskOutputs?: Record<string, any>;
}

/**
 * 场景化工作流模板标准模型
 */
export interface WorkflowTemplate {
  /** 模板唯一标识 ID */
  id: string;
  /** 模板版本号 */
  version: string;
  /** 模板中文标题，如 "核心云主机每日定时快照备份" */
  title: string;
  /** 所属业务分类 */
  category: TemplateCategory;
  /** 模板视觉图标 Emoji */
  /** CMASTER icon name (components/icons/iconRegistry.ts, e.g. 'rocket'); legacy emoji still render via aliases. */
  icon: string;
  /** 一句话核心业务价值主张（拒绝技术罗列，讲清节省的时间与业务成效） */
  valueProposition: string;
  /** 详细场景背景说明 */
  description: string;
  /** 所需连接器图标或名称标识，如 ["cloud_host", "dingtalk"] */
  connectors: string[];
  /** 投资回报与提效收益指标 (ROI) */
  roi: {
    /** 单次执行预估节省人工分钟数 */
    minutesSavedPerRun: number;
    /** 典型业务每周触发频次 */
    typicalRunsPerWeek: number;
    /** 模板热度/累计使用次数 */
    popularityCount?: number;
  };
  /** 上手难度等级 */
  difficulty: 'starter' | 'intermediate' | 'advanced';
  /** 填空式启用向导的必填变量清单 (2~4 项最佳) */
  variables: TemplateVariable[];
  /** 经过剪枝与参数化的标准 Conductor 工作流骨架 */
  definition: WorkflowDef;
  /** 拟真业务沙盒数据集（用于无需授权即可一键本地试跑体验） */
  mockDataset: {
    scenarios: MockScenario[];
  };
  /** 模板溯源与发布审计信息 */
  provenance?: {
    source: 'official' | 'extracted';
    author?: string;
    publishedAt?: string;
    extractedFromWorkflowId?: string;
  };
}
