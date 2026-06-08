/**
 * Workflow Library types — L1/L2/L3 sub-workflow catalog
 *
 * L1: 原子操作（单一功能，不依赖其他业务流程）
 * L2: 业务场景（完整的单一业务功能，可由 L1 组合而成）
 * L3: 端到端编排（跨系统复杂场景，可由 L2/L1 组合而成）
 *
 * 调用规则：高层可调用低层及同层，禁止反向跨层调用
 * L3 → L2/L1/L3(同层) ✅
 * L2 → L1/L2(同层)   ✅
 * L1 → L1(同层)       ✅
 * L1 → L2/L3          ❌
 * L2 → L3             ❌
 */

export type WorkflowLevel = 'L1' | 'L2' | 'L3';

/** 工作流库元数据（列表/搜索返回） */
export interface WorkflowLibraryItem {
    workflowName: string;
    workflowLevel: WorkflowLevel;
    version: string;
    description: string;
    tags: string[];
}

/** 工作流库详情（包含完整 WorkflowDef） */
export interface WorkflowLibraryDetail extends WorkflowLibraryItem {
    workflowDef: Record<string, any>;
}
