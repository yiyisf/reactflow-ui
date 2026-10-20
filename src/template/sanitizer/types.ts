import type { WorkflowInstance } from '../../types/conductor';
import type { WorkflowTemplate } from '../types';

/**
 * 敏感识别项类别
 */
export type SensitiveKind =
  | 'credential' // 凭证密匙 (Token, Secret, Password, Webhook)
  | 'network'    // 内网 IP, 私有主机名, 内网域名
  | 'pii'        // 个人隐私 (姓名, 手机, 邮箱, 身份证)
  | 'resourceId' // 真实云资源 ID (实例 ID, 磁盘 ID, 快照 ID)
  | 'threshold'; // 业务阈值与数值

/**
 * 扫描出的敏感配置条目
 */
export interface SensitiveFinding {
  id: string;
  kind: SensitiveKind;
  path: string;           // 例如: "tasks[0].inputParameters.http_request.headers.Authorization"
  taskRef: string;        // 所在任务的 taskReferenceName
  keyName: string;        // 字段名, 如 "Authorization" 或 "instanceId"
  rawValue: any;          // 生产环境原始值
  maskedValue: any;       // 建议脱敏后的安全值
  suggestedVarName?: string; // 建议提炼出的模板变量名, 如 "云主机实例ID"
  action: 'mask' | 'variable' | 'keep'; // 处理动作: 脱敏打码 | 提取为填空变量 | 保留
}

/**
 * 拓扑剪枝建议项
 */
export interface PruneRecommendation {
  taskReferenceName: string;
  taskName: string;
  taskType: string;
  reason: string;         // 建议剪枝的原因 (如: "检测为调试日志任务", "边缘重试降级节点")
  selected: boolean;      // 管理员是否确认剪枝去除
}

/**
 * 模板萃取生成结果包
 */
export interface ExtractionResult {
  template: WorkflowTemplate;
  findings: SensitiveFinding[];
  prunedTasks: PruneRecommendation[];
  report: {
    extractedAt: string;
    totalTasksScanned: number;
    sensitiveItemsCount: number;
    credentialsRedactedCount: number;
    variablesCreatedCount: number;
  };
}

/**
 * 模板提炼输入选项
 */
export interface ExtractTemplateOptions {
  instance: WorkflowInstance;
  title?: string;
  category?: WorkflowTemplate['category'];
  valueProposition?: string;
  author?: string;
}
