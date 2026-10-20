import type { WorkflowDef } from '../../types/conductor';
import type { SensitiveFinding } from './types';

// 正则识别模式库
const PATTERNS = {
  CREDENTIAL_KEY: /(token|secret|password|passwd|authorization|apikey|api_key|webhook|access_key|private_key|auth)/i,
  PRIVATE_IP: /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/,
  PUBLIC_IP: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/,
  PHONE: /\b1[3-9]\d{9}\b/,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  CLOUD_RESOURCE_ID: /\b(i|d|s|vpc|vsw|sg|disk|snap)-[a-z0-9]{8,24}\b/i,
};

/**
 * 递归深度扫描一个对象的所有属性值，识别其中的敏感配置
 */
export function scanObjectForSensitiveFindings(
  obj: any,
  taskRef: string,
  basePath: string,
  findings: SensitiveFinding[] = []
): SensitiveFinding[] {
  if (!obj || typeof obj !== 'object') return findings;

  for (const [key, val] of Object.entries(obj)) {
    // 忽略内置系统控制元字段
    if (key === '_actionId' || key === 'actionName') continue;

    const currentPath = `${basePath}.${key}`;

    if (val === null || val === undefined) continue;

    if (typeof val === 'string') {
      // 1. 检查键名是否属于高危凭据/密钥
      if (PATTERNS.CREDENTIAL_KEY.test(key) && val.length > 5) {
        findings.push({
          id: `finding_${findings.length + 1}`,
          kind: 'credential',
          path: currentPath,
          taskRef,
          keyName: key,
          rawValue: val,
          maskedValue: '',
          suggestedVarName: `${key}_凭证密钥`,
          action: 'variable', // 凭据强制推荐提取为必填变量
        });
        continue;
      }

      // 2. 检查内网 IP
      if (PATTERNS.PRIVATE_IP.test(val)) {
        findings.push({
          id: `finding_${findings.length + 1}`,
          kind: 'network',
          path: currentPath,
          taskRef,
          keyName: key,
          rawValue: val,
          maskedValue: val.replace(PATTERNS.PRIVATE_IP, '172.16.0.42'),
          suggestedVarName: `${key}_内网IP`,
          action: 'mask',
        });
        continue;
      }

      // 3. 检查手机号
      if (PATTERNS.PHONE.test(val)) {
        findings.push({
          id: `finding_${findings.length + 1}`,
          kind: 'pii',
          path: currentPath,
          taskRef,
          keyName: key,
          rawValue: val,
          maskedValue: val.replace(PATTERNS.PHONE, '13800138000'),
          suggestedVarName: '通知联系手机',
          action: 'mask',
        });
        continue;
      }

      // 4. 检查邮箱
      if (PATTERNS.EMAIL.test(val)) {
        findings.push({
          id: `finding_${findings.length + 1}`,
          kind: 'pii',
          path: currentPath,
          taskRef,
          keyName: key,
          rawValue: val,
          maskedValue: val.replace(PATTERNS.EMAIL, 'ops-notify@example.com'),
          suggestedVarName: '接收人邮箱',
          action: 'mask',
        });
        continue;
      }

      // 5. 检查特定云资源 ID (如特定实例 ID: i-bp1...)
      if (PATTERNS.CLOUD_RESOURCE_ID.test(val)) {
        // 如果是表达式 (如 ${step.output.instanceId}) 则无需脱敏
        if (!val.includes('${')) {
          findings.push({
            id: `finding_${findings.length + 1}`,
            kind: 'resourceId',
            path: currentPath,
            taskRef,
            keyName: key,
            rawValue: val,
            maskedValue: 'i-bp18a9z3j42m09a',
            suggestedVarName: `${key}_云资源ID`,
            action: 'variable',
          });
          continue;
        }
      }
    } else if (typeof val === 'object') {
      scanObjectForSensitiveFindings(val, taskRef, currentPath, findings);
    }
  }

  return findings;
}

/**
 * 扫描整个工作流定义，收集所有的敏感项
 */
export function scanWorkflowDef(def: WorkflowDef): SensitiveFinding[] {
  const findings: SensitiveFinding[] = [];

  (def.tasks || []).forEach((task, index) => {
    const basePath = `tasks[${index}].inputParameters`;
    if (task.inputParameters) {
      scanObjectForSensitiveFindings(task.inputParameters, task.taskReferenceName, basePath, findings);
    }
    if (task.httpRequest) {
      scanObjectForSensitiveFindings(task.httpRequest, task.taskReferenceName, `tasks[${index}].httpRequest`, findings);
    }
  });

  return findings;
}
