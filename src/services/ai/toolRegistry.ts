/**
 * Tool Registry v1 — extensible custom tool integration
 *
 * Integrators can register custom tools that the AI can call.
 * Custom tools appear alongside built-in tools in the agentic loop.
 *
 * Usage:
 * ```tsx
 * <AiWorkflowIDE
 *   customTools={[{
 *     definition: { type: 'function', function: { name: 'query_cmdb', ... } },
 *     execute: async (args) => JSON.stringify(await fetchCmdb(args.query)),
 *   }]}
 * />
 * ```
 */

import type { ToolDef } from './protocolAdapter';

export interface CustomTool {
    /** OpenAI-compatible function definition (used for both OpenAI and Anthropic) */
    definition: ToolDef;
    /**
     * Execution function.
     * Must return a string (or Promise<string>) to be sent back to the model as a tool result.
     * Throw an Error to surface a failure message to the model.
     */
    execute: (args: Record<string, any>) => string | Promise<string>;
}

export class ToolRegistry {
    private tools = new Map<string, CustomTool>();

    register(tool: CustomTool): void {
        this.tools.set(tool.definition.function.name, tool);
    }

    unregister(name: string): void {
        this.tools.delete(name);
    }

    get(name: string): CustomTool | undefined {
        return this.tools.get(name);
    }

    getAll(): CustomTool[] {
        return Array.from(this.tools.values());
    }

    getDefinitions(): ToolDef[] {
        return this.getAll().map(t => t.definition);
    }

    setTools(tools: CustomTool[]): void {
        this.tools.clear();
        for (const tool of tools) {
            this.tools.set(tool.definition.function.name, tool);
        }
    }

    has(name: string): boolean {
        return this.tools.has(name);
    }
}

export const toolRegistry = new ToolRegistry();
