import type { WorkflowDef } from '../../types/conductor';
import type { WorkflowTemplate, TemplateVariable, MockScenario } from '../types';
import type { ExtractTemplateOptions, ExtractionResult } from './types';
import { scanWorkflowDef } from './rules';
import { analyzeTasksForPruning, applyTaskPruning } from './prune';

/**
 * 递归深度替换对象内的敏感字符为脱敏值
 */
function deepMaskObject(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepMaskObject);

  const res: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      // 掩码常见凭证与密钥
      if (/(token|secret|password|authorization|apikey)/i.test(k) && v.length > 5) {
        res[k] = '';
      } else if (/\b1[3-9]\d{9}\b/.test(v)) {
        res[k] = v.replace(/\b1[3-9]\d{9}\b/, '13800138000');
      } else if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(v)) {
        res[k] = v.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, 'ops-notify@example.com');
      } else if (/\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/.test(v)) {
        res[k] = v.replace(/\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/, '172.16.0.42');
      } else {
        res[k] = v;
      }
    } else if (typeof v === 'object' && v !== null) {
      res[k] = deepMaskObject(v);
    } else {
      res[k] = v;
    }
  }
  return res;
}

/**
 * 从真实生产执行实例中一键萃取、脱敏并生成标准化模板骨架
 */
export function extractTemplateFromInstance(options: ExtractTemplateOptions): ExtractionResult {
  const { instance, title, category, valueProposition, author } = options;

  const rawDef: WorkflowDef = instance.workflowDefinition
    ? structuredClone(instance.workflowDefinition)
    : {
        name: instance.workflowName || 'extracted_workflow',
        tasks: instance.tasks.map((t) => t.workflowTask || {
          name: t.taskDefName || t.referenceTaskName,
          taskReferenceName: t.referenceTaskName,
          type: (t.taskType as any) || 'SIMPLE',
          inputParameters: t.inputData,
        }),
      };

  // 1. 扫描敏感字段
  const findings = scanWorkflowDef(rawDef);

  // 2. 分析剪枝建议
  const prunedRecommendations = analyzeTasksForPruning(rawDef, instance);

  // 默认将选中的剪枝项剔除
  const confirmedPruneRefs = new Set(
    prunedRecommendations.filter((r) => r.selected).map((r) => r.taskReferenceName)
  );
  const prunedDef = applyTaskPruning(rawDef, confirmedPruneRefs);

  // 3. 构建模板变量清单与应用脱敏
  const variables: TemplateVariable[] = [];
  const processedDef = structuredClone(prunedDef);

  for (const finding of findings) {
    if (finding.action === 'variable') {
      const varKey = `var_${finding.keyName}_${Date.now().toString(36).slice(-3)}`;
      variables.push({
        key: varKey,
        label: finding.suggestedVarName || finding.keyName,
        type: typeof finding.rawValue === 'number' ? 'number' : 'text',
        defaultValue: finding.maskedValue || finding.rawValue,
        required: true,
        bindings: [finding.path],
      });
    }
  }

  // 4. 从真实执行输出中构造脱敏后的高保真沙盒 Mock 场景
  const taskOutputsMock: Record<string, any> = {};
  for (const t of instance.tasks) {
    if (t.outputData && !confirmedPruneRefs.has(t.referenceTaskName)) {
      taskOutputsMock[t.referenceTaskName] = deepMaskObject(t.outputData);
    }
  }

  const mockScenario: MockScenario = {
    name: '生产真实运行数据脱敏样本',
    description: `基于实例 ${instance.workflowId} 真实执行产物自动生成的高保真无害化数据集`,
    workflowInput: deepMaskObject(instance.input || {}),
    taskOutputs: taskOutputsMock,
  };

  const templateId = `tpl_extracted_${Date.now().toString(36)}`;
  const templateTitle = title || `${rawDef.name || '业务流'} (实战萃取模板)`;
  const templateCategory = category || 'ops';
  const templateValProp = valueProposition || `源于真实执行实例 ${instance.workflowId}，已完成自动化脱敏与参数提取。`;

  const template: WorkflowTemplate = {
    id: templateId,
    version: '1.0.0',
    title: templateTitle,
    category: templateCategory,
    icon: '💎',
    valueProposition: templateValProp,
    description: rawDef.description || '由管理员从高频成功的生产运行记录中提炼而成的标准化黄金模板。',
    connectors: ['cloud_host', 'dingtalk'],
    roi: {
      minutesSavedPerRun: 25,
      typicalRunsPerWeek: 10,
      popularityCount: 1,
    },
    difficulty: 'intermediate',
    variables,
    definition: processedDef,
    mockDataset: {
      scenarios: [mockScenario],
    },
    provenance: {
      source: 'extracted',
      author: author || 'Platform Admin',
      publishedAt: new Date().toISOString(),
      extractedFromWorkflowId: instance.workflowId,
    },
  };

  return {
    template,
    findings,
    prunedTasks: prunedRecommendations,
    report: {
      extractedAt: new Date().toISOString(),
      totalTasksScanned: rawDef.tasks?.length ?? 0,
      sensitiveItemsCount: findings.length,
      credentialsRedactedCount: findings.filter((f) => f.kind === 'credential').length,
      variablesCreatedCount: variables.length,
    },
  };
}
