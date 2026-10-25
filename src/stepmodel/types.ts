import type { TaskDef, WorkflowDef } from '../types/conductor';
import type { LibraryRef } from '../actions/types';

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

/**
 * 控制流节点类型
 */
export type StepControlType = 'decision' | 'fork' | 'loop';

/**
 * 分支定义 (针对 DECISION / SWITCH)
 */
export interface BranchCase {
  caseKey: string;           // 分支命中值，如 "premium", "standard", 或 "__default__"
  caseLabel?: string;        // 业务展示标签，如 "VIP 优质客户" 或 "默认分支"
  steps: BusinessStep[];     // 该分支下执行的业务步骤列表
}

/**
 * 并行泳道 (针对 FORK_JOIN)
 */
export interface ForkLane {
  laneId: string;            // 泳道标识，如 "lane_0", "lane_1"
  laneLabel?: string;        // 泳道标签，如 "并发泳道 1: 云盘快照备份"
  steps: BusinessStep[];     // 泳道内并发执行的业务步骤列表
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
  /** 引用流程库能力时记录的名称与版本（首次引用时固定，不随库升级自动变化） */
  libraryRef?: LibraryRef;

  // 控制流拓展字段
  controlType?: StepControlType;

  // 1. 分支 (DECISION / SWITCH)
  /**
   * 按参数取值时的参数名（DECISION 的 caseValueParam / SWITCH value-param 的 expression），如 "userType"。
   * 判断用的取值本身绑定在 values[caseParam]（编译为 inputParameters[caseParam]，可为数据胶囊）。
   */
  caseParam?: string;
  /**
   * 按表达式判断时的脚本（DECISION 的 caseExpression / SWITCH javascript 的 expression）。
   * 不为 undefined（含空字符串）即表示"表达式模式"，此时 caseParam 不参与编译。
   */
  caseExpression?: string;
  branches?: BranchCase[];             // 各分支列表（含默认分支）

  // 2. 并行 (FORK_JOIN)
  forkLanes?: ForkLane[];              // 各条并发泳道
  pairedJoinTaskRef?: string;          // 关联的汇聚 JOIN 任务引用名
  /** 反编译时配对 JOIN 的原始定义（保留其 name / description 等字段，往返不丢失） */
  pairedJoinTaskDef?: TaskDef;

  // 3. 循环 (DO_WHILE)
  loopCondition?: string;              // 循环继续条件表达式
  loopSteps?: BusinessStep[];          // 循环体内执行的步骤序列
}

export interface BusinessWorkflowModel {
  name: string;
  description?: string;
  version?: number;
  steps: BusinessStep[];
  inputParameters?: any[];
  rawWorkflowDef?: WorkflowDef;
}
