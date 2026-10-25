import { describe, it, expect } from 'vitest';
import { parseMermaidFlowchart } from './mermaidParser';
import { workflowToMermaid } from '../../utils/workflowToMermaid';
import { BUILTIN_WORKFLOW_TEMPLATES } from '../../template/builtin/templates';
import type { WorkflowDef, TaskDef } from '../../types/conductor';

const t = (ref: string, type = 'SIMPLE', extra: Record<string, unknown> = {}): TaskDef =>
    ({ name: ref, taskReferenceName: ref, type, ...extra }) as unknown as TaskDef;

/** A workflow that exercises every shape and link form workflowToMermaid emits. */
const controlFlowSample: WorkflowDef = {
    name: 'control_sample',
    version: 1,
    tasks: [
        t('fetch'),
        t('fork', 'FORK_JOIN', { forkTasks: [[t('branch_a')], [t('branch_b'), t('branch_b2')]] }),
        t('join', 'JOIN'),
        t('decide', 'SWITCH', { decisionCases: { 是: [t('approve', 'HUMAN')], 否: [t('stop', 'TERMINATE')] }, defaultCase: [t('fallback')] }),
        t('loop', 'DO_WHILE', { loopOver: [t('poll'), t('wait_a_bit', 'WAIT')] }),
        t('通知'),
        t('审批'),
    ],
} as WorkflowDef;

describe('parseMermaidFlowchart (A6)', () => {
    it('parses the IDE’s own workflowToMermaid output for a control-flow sample', () => {
        const parsed = parseMermaidFlowchart(workflowToMermaid(controlFlowSample));
        expect(parsed).not.toBeNull();
        const byId = new Map(parsed!.nodes.map(n => [n.id, n]));
        expect(byId.get('decide')?.shape).toBe('diamond');
        expect(byId.get('fork')?.shape).toBe('parallelogram');
        expect(byId.get('stop')?.shape).toBe('circle');
        expect(byId.get('approve')?.shape).toBe('stadium');
        expect(byId.get('__start__')?.label).toBe('开始');
        // labelled edges `decide -- "是" --> approve`
        expect(parsed!.edges).toContainEqual({ from: 'decide', to: 'approve', label: '是', dashed: undefined });
        expect(parsed!.edges.some(e => e.from === 'decide' && e.label === '默认')).toBe(true);
        expect(parsed!.edges.some(e => e.to === 'loop' && e.label === '循环')).toBe(true);
        // Chinese refs stay distinct nodes (no collapse to `__`)
        const chineseNodes = parsed!.nodes.filter(n => n.label === '通知' || n.label === '审批');
        expect(chineseNodes).toHaveLength(2);
        expect(new Set(chineseNodes.map(n => n.id)).size).toBe(2);
        // no node is a mangled edge fragment
        expect(parsed!.nodes.every(n => !n.label.includes('-->'))).toBe(true);
    });

    it.each(BUILTIN_WORKFLOW_TEMPLATES.map(tpl => [tpl.title, tpl.definition] as [string, WorkflowDef]))(
        'parses workflowToMermaid output of the built-in template "%s"',
        (_title, def) => {
            const code = workflowToMermaid(def);
            const parsed = parseMermaidFlowchart(code);
            expect(parsed).not.toBeNull();
            const edgeLines = code.split('\n').filter(l => l.includes('-->'));
            expect(parsed!.edges).toHaveLength(edgeLines.length);
            const ids = new Set(parsed!.nodes.map(n => n.id));
            for (const e of parsed!.edges) {
                expect(ids.has(e.from)).toBe(true);
                expect(ids.has(e.to)).toBe(true);
            }
        },
    );

    it('handles chains, trailing semicolons, pipe labels, dashed links and & groups', () => {
        const parsed = parseMermaidFlowchart([
            'graph LR;',
            '  A[开始] --> B{是否通过?} -->|是| C(("结束"));',
            '  B -.->|否| D[/"重试"/]',
            '  D & 审批 --> C',
        ].join('\n'));
        expect(parsed?.direction).toBe('LR');
        expect(parsed?.edges).toEqual([
            { from: 'A', to: 'B', label: undefined, dashed: undefined },
            { from: 'B', to: 'C', label: '是', dashed: undefined },
            { from: 'B', to: 'D', label: '否', dashed: true },
            { from: 'D', to: 'C', label: undefined, dashed: undefined },
            { from: '审批', to: 'C', label: undefined, dashed: undefined },
        ]);
        expect(parsed?.nodes.find(n => n.id === 'B')).toEqual({ id: 'B', label: '是否通过?', shape: 'diamond' });
        expect(parsed?.nodes.find(n => n.id === 'C')?.shape).toBe('circle');
        expect(parsed?.nodes.find(n => n.id === 'D')?.shape).toBe('parallelogram');
    });

    it('handles links without spaces and `-- text -->` labels without quotes', () => {
        const parsed = parseMermaidFlowchart('flowchart TD\nA-->B-->C\nC -- 失败 --> D');
        expect(parsed?.edges.map(e => `${e.from}>${e.to}${e.label ? `:${e.label}` : ''}`)).toEqual(['A>B', 'B>C', 'C>D:失败']);
    });

    it('returns null for non-flowchart input', () => {
        expect(parseMermaidFlowchart('sequenceDiagram\nA->>B: hi')).toBeNull();
        expect(parseMermaidFlowchart('')).toBeNull();
    });
});
