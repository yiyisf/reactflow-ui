import type { WorkflowDef, TaskDef, WorkflowInstance } from '../../types/conductor';
import type { PruneRecommendation } from './types';

const PRUNE_NAME_PATTERNS = /(debug|fallback|compensate|retry|temporary|temp|log_dump|tracer)/i;

/**
 * 启发式分析工作流中的冗余节点，识别边缘防御与调试任务，生成建议剪枝清单
 */
export function analyzeTasksForPruning(
  def: WorkflowDef,
  instance?: WorkflowInstance
): PruneRecommendation[] {
  const recommendations: PruneRecommendation[] = [];
  const tasks = def.tasks || [];

  for (const task of tasks) {
    // 1. 检查任务名称与引用名称是否包含调试/边缘降级关键词
    if (PRUNE_NAME_PATTERNS.test(task.name) || PRUNE_NAME_PATTERNS.test(task.taskReferenceName)) {
      recommendations.push({
        taskReferenceName: task.taskReferenceName,
        taskName: task.name,
        taskType: task.type,
        reason: '检测到任务名称含调试/单次补偿/临时特征，建议从公共通用模板中剔除。',
        selected: true,
      });
      continue;
    }

    // 2. 检查运行态中被跳过且无下游任务引用的孤立节点
    if (instance) {
      const taskExec = instance.tasks.find((t) => t.referenceTaskName === task.taskReferenceName);
      if (taskExec && taskExec.status === 'SKIPPED') {
        recommendations.push({
          taskReferenceName: task.taskReferenceName,
          taskName: task.name,
          taskType: task.type,
          reason: '该任务在生产历史执行中被判定跳过 (SKIPPED)，通常属于特殊条件下的低频补偿分支。',
          selected: false,
        });
      }
    }
  }

  return recommendations;
}

/**
 * 根据管理员勾选的剪枝清单对工作流进行骨架修剪
 */
export function applyTaskPruning(def: WorkflowDef, prunedTaskRefs: Set<string>): WorkflowDef {
  const cloned = structuredClone(def);
  cloned.tasks = (cloned.tasks || []).filter(
    (t: TaskDef) => !prunedTaskRefs.has(t.taskReferenceName)
  );
  return cloned;
}
