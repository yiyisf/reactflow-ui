/**
 * Rules Engine v1 — custom validation rules for workflow validation
 *
 * Integrators can inject business-specific rules that validate generated
 * workflows. Rules are applied after the built-in Conductor validation,
 * and their descriptions are injected into the system prompt so the AI
 * generates compliant workflows from the start.
 *
 * Usage:
 * ```tsx
 * <AiWorkflowIDE
 *   validationRules={[{
 *     id: 'require-owner-email',
 *     level: 'error',
 *     description: '所有工作流必须设置 ownerEmail 字段（格式：xxx@company.com）',
 *     validate: (def) => {
 *       if (!def.ownerEmail?.endsWith('@company.com')) {
 *         return [{ type: 'GLOBAL', ref: '', message: 'ownerEmail 必须为公司邮箱' }];
 *       }
 *       return [];
 *     },
 *   }]}
 * />
 * ```
 */

import type { WorkflowDef } from '../../types/conductor';
import type { ValidationItem } from '../../types/workflow';

export interface CustomValidationRule {
    /** Unique rule identifier */
    id: string;
    /** Default severity. Individual validate() results take precedence. */
    level?: 'error' | 'warning';
    /**
     * Natural-language description injected into the AI system prompt.
     * Write it as a constraint the AI must follow when generating workflows.
     * Example: "所有 HTTP 任务必须设置 timeoutSeconds（不超过 30 秒）"
     */
    description: string;
    /**
     * Validation function. Return an empty array if the workflow passes.
     * Returned ValidationItems are appended to the main validation result.
     */
    validate: (workflowDef: WorkflowDef) => ValidationItem[];
}

class RuleEngine {
    private rules: CustomValidationRule[] = [];

    setRules(rules: CustomValidationRule[]): void {
        this.rules = [...rules];
    }

    getRules(): CustomValidationRule[] {
        return this.rules;
    }

    hasRules(): boolean {
        return this.rules.length > 0;
    }

    runAll(workflowDef: WorkflowDef): { errors: ValidationItem[]; warnings: ValidationItem[] } {
        const errors: ValidationItem[] = [];
        const warnings: ValidationItem[] = [];

        for (const rule of this.rules) {
            try {
                const items = rule.validate(workflowDef);
                for (const item of items) {
                    if (rule.level === 'warning') {
                        warnings.push(item);
                    } else {
                        errors.push(item);
                    }
                }
            } catch {
                // Rule execution failure is non-fatal — log and continue
                errors.push({
                    type: 'GLOBAL',
                    ref: '',
                    message: `自定义规则 "${rule.id}" 执行异常`,
                });
            }
        }

        return { errors, warnings };
    }

    buildPromptSection(): string | null {
        if (this.rules.length === 0) return null;
        const lines = this.rules.map(r => `- ${r.description}`).join('\n');
        return `## 业务校验规则（必须遵守）\n以下规则由集成方定义，生成工作流时必须满足：\n${lines}`;
    }
}

export const ruleEngine = new RuleEngine();
