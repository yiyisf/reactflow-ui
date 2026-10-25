import type { WorkflowTemplate, TemplateCategory } from './types';
import { BUILTIN_WORKFLOW_TEMPLATES } from './builtin/templates';

/**
 * 场景化模板仓库管理器
 */
export class TemplateStore {
  private templates: Map<string, WorkflowTemplate> = new Map();
  private version = 0;
  private listeners = new Set<() => void>();

  constructor(initialTemplates: WorkflowTemplate[] = []) {
    this.registerAll(initialTemplates);
  }

  /**
   * 注册单个工作流模板
   */
  register(template: WorkflowTemplate): void {
    this.templates.set(template.id, template);
    this.version += 1;
    this.listeners.forEach((fn) => fn());
  }

  /** 每次注册后递增；界面据此刷新（R17） */
  getVersion = (): number => this.version;

  /** 订阅模板变化（兼容 React useSyncExternalStore）；返回取消订阅函数 */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

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
