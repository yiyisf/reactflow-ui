/**
 * Schema Registry v1 — task input/output schema registration
 *
 * Integrators can register input/output schemas for known task types.
 * Registered schemas are injected into the AI system prompt so the model
 * generates correct inputParameters references from the start.
 *
 * Usage:
 * ```tsx
 * <AiWorkflowIDE
 *   taskSchemas={[{
 *     taskName: 'send_notification',
 *     taskType: 'SIMPLE',
 *     description: '发送站内消息通知',
 *     inputSchema:  { userId: 'string', message: 'string', channel: 'email|sms' },
 *     outputSchema: { messageId: 'string', status: 'sent|failed' },
 *   }]}
 * />
 * ```
 *
 * In inputParameters you can then reference upstream outputs:
 *   "userId": "${approve_task.output.userId}"
 */

export interface TaskSchema {
    /** Task name (SIMPLE worker name, SUB_WORKFLOW workflowName, or HTTP endpoint label) */
    taskName: string;
    /** Conductor task type — defaults to 'SIMPLE' */
    taskType?: string;
    /** Optional business-language description */
    description?: string;
    /**
     * Input field schema. Keys are field names, values are type descriptions.
     * Example: { "userId": "string", "amount": "number", "status": "pending|approved" }
     */
    inputSchema?: Record<string, string>;
    /**
     * Output field schema. Keys are field names, values are type descriptions.
     * These are the fields available as `${taskRef.output.<field>}` in downstream tasks.
     */
    outputSchema?: Record<string, string>;
}

class SchemaRegistry {
    private schemas = new Map<string, TaskSchema>();

    setSchemas(schemas: TaskSchema[]): void {
        this.schemas.clear();
        for (const s of schemas) {
            this.schemas.set(s.taskName, s);
        }
    }

    get(taskName: string): TaskSchema | undefined {
        return this.schemas.get(taskName);
    }

    getAll(): TaskSchema[] {
        return Array.from(this.schemas.values());
    }

    hasSchemas(): boolean {
        return this.schemas.size > 0;
    }

    buildPromptSection(): string | null {
        if (!this.hasSchemas()) return null;

        const lines: string[] = [
            '## 任务 Schema 注册表（数据流参考）',
            '以下任务的输入/输出字段已注册。生成 inputParameters 时请引用正确的上游输出字段（格式：`${taskRef.output.fieldName}`）。',
        ];

        for (const schema of this.getAll()) {
            const typeLabel = schema.taskType ? `(${schema.taskType})` : '';
            const desc = schema.description ? ` — ${schema.description}` : '';
            lines.push(`\n**${schema.taskName}** ${typeLabel}${desc}`);

            if (schema.inputSchema && Object.keys(schema.inputSchema).length > 0) {
                const fields = Object.entries(schema.inputSchema)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ');
                lines.push(`- 输入: ${fields}`);
            }
            if (schema.outputSchema && Object.keys(schema.outputSchema).length > 0) {
                const fields = Object.entries(schema.outputSchema)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ');
                lines.push(`- 输出: ${fields}`);
            }
        }

        return lines.join('\n');
    }
}

export const schemaRegistry = new SchemaRegistry();
