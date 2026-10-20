import type { WorkflowTemplate, TemplateCategory } from './types';
import { BUILTIN_WORKFLOW_TEMPLATES } from './builtin/templates';

/**
 * 场景化模板仓库管理器
 */
export class TemplateStore {
  private templates: Map<string, WorkflowTemplate> = new Map();

  constructor(initialTemplates: WorkflowTemplate[] = []) {
    this.registerAll(initialTemplates);
  }

  /**
   * 注册单个工作流模板
   */
  register(template: WorkflowTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * 批量注册工作流模板
   */
  registerAll(templates: WorkflowTemplate[]): void {
    for (const t of templates) {
      this.register(t);
    }
  }

  /**
   * 获取所有可用模板
   */
  getAllTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 按 ID 查找模板
   */
  getTemplateById(id: string): WorkflowTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * 按分类或关键词检索模板
   */
  search(query?: string, category: TemplateCategory | 'all' = 'all'): WorkflowTemplate[] {
    let list = this.getAllTemplates();

    if (category && category !== 'all') {
      list = list.filter((t) => t.category === category);
    }

    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.valueProposition.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      );
    }

    return list;
  }
}

/**
 * 全局默认场景化模板中心仓库（预置 8 个官方黄金模板）
 */
export const defaultTemplateStore = new TemplateStore(BUILTIN_WORKFLOW_TEMPLATES);
