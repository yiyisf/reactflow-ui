import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRunner } from './agentRunner';
import type { AgentRunnerStores } from './agentRunner';
import useAiStore from '../../store/aiStore';
import useWorkflowStore from '../../store/workflowStore';
import useLibraryStore from '../../store/libraryStore';
import { toolRegistry } from './toolRegistry';
import type { StreamEvent } from './protocolAdapter';
import type { AgentRequest } from './transport';

/** 项目 lib 为 ES2020，没有 Array.prototype.at；测试里用小工具取倒数第 n 个元素 */
const fromEnd = <T>(arr: T[], n = 1): T | undefined => arr[arr.length - n];

// Tests exercise AgentRunner against the module singletons — one store instance is
// as good as another for verifying orchestration logic, and it keeps test setup simple.
const testStores: AgentRunnerStores = { aiStore: useAiStore, libraryStore: useLibraryStore, toolRegistry };

/** Builds a custom transport whose successive send()-loop steps are scripted in order. */
function scriptedTransport(steps: StreamEvent[][]) {
    let call = 0;
    const seenRequests: AgentRequest[] = [];
    const stream = async function* (req: AgentRequest, _signal: AbortSignal): AsyncGenerator<StreamEvent> {
        seenRequests.push(req);
        const events = steps[Math.min(call, steps.length - 1)];
        call++;
        for (const e of events) yield e;
    };
    return { transport: { type: 'custom' as const, stream }, seenRequests, callCount: () => call };
}

function resetStores() {
    useAiStore.getState().clearMessages();
    useAiStore.getState().clearUndo();
    useWorkflowStore.getState().createBlankWorkflow('test_wf');
    useLibraryStore.getState().clearLibrary();
    toolRegistry.setTools([]);
}

describe('AgentRunner', () => {
    beforeEach(() => {
        resetStores();
    });

    it('runs a plain text turn with no tool calls', async () => {
        const { transport } = scriptedTransport([
            [{ type: 'text', content: '你好，我可以帮你设计工作流。' }, { type: 'done' }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('你好');

        const { messages, isStreaming } = useAiStore.getState();
        expect(isStreaming).toBe(false);
        expect(fromEnd(messages, 2)).toMatchObject({ role: 'user', content: '你好' });
        expect(fromEnd(messages)).toMatchObject({ role: 'assistant', content: '你好，我可以帮你设计工作流。' });
    });

    it('does nothing when apiKey is empty and no transport is configured', async () => {
        useAiStore.getState().setConfig({ apiKey: '', transport: undefined });
        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('hi');

        const { messages } = useAiStore.getState();
        expect(fromEnd(messages)?.content).toContain('API Key');
    });

    it('is a no-op while already streaming', async () => {
        useAiStore.getState().setStreaming(true);
        const { transport } = scriptedTransport([[{ type: 'text', content: 'should not run' }, { type: 'done' }]]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('hi');

        // messages untouched — send() returned immediately without adding anything
        expect(useAiStore.getState().messages).toHaveLength(1); // just the welcome message
    });

    it('creates a pendingProposal from a valid replace_workflow tool call', async () => {
        const validWorkflow = { name: 'wf', tasks: [{ name: 'a', taskReferenceName: 'a', type: 'SIMPLE' }], version: 1 };
        const { transport } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'replace_workflow', args: { workflow: validWorkflow } }],
            [{ type: 'text', content: '已生成' }, { type: 'done' }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('创建一个流程');

        const proposal = useAiStore.getState().pendingProposal;
        expect(proposal).not.toBeNull();
        expect(proposal?.proposedDef.name).toBe('wf');
        expect(proposal?.diff.added).toContain('a');
    });

    it('self-heals: retries once when the proposed workflow fails validation, then succeeds', async () => {
        const badWorkflow = { name: 'wf', tasks: [{ name: 'a', taskReferenceName: 'dup', type: 'SIMPLE' }, { name: 'b', taskReferenceName: 'dup', type: 'SIMPLE' }], version: 1 };
        const goodWorkflow = { name: 'wf', tasks: [{ name: 'a', taskReferenceName: 'a', type: 'SIMPLE' }], version: 1 };
        const { transport, callCount } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'replace_workflow', args: { workflow: badWorkflow } }],
            [{ type: 'tool_call', id: 't2', name: 'replace_workflow', args: { workflow: goodWorkflow } }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('创建一个流程');

        // A valid proposal ends the loop immediately — no extra confirmation turn is needed.
        expect(callCount()).toBe(2); // bad attempt (self-healed), then the corrected attempt
        const proposal = useAiStore.getState().pendingProposal;
        expect(proposal?.proposedDef.name).toBe('wf');
        expect(proposal?.proposedDef.tasks.map((t: any) => t.taskReferenceName)).toEqual(['a']);

        // Self-heal must be visible on the timeline, not a silent retry (UX Phase A requirement).
        const timeline = useAiStore.getState().timelineEntries;
        expect(timeline.some(e => e.icon === 'warning' && e.label.includes('正在自动修正'))).toBe(true);
        expect(timeline.some(e => e.label.includes('已生成方案'))).toBe(true);
    });

    it('logs a timeline entry for a completed read-only tool call', async () => {
        const { transport } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'search_workflow_library', args: { query: 'x' } }],
            [{ type: 'text', content: '没有找到相关流程' }, { type: 'done' }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('查一下有没有相关流程');

        expect(useAiStore.getState().timelineEntries.map(e => e.label)).toContain('已搜索工作流库');
    });

    it('clears the timeline at the start of each new send()', async () => {
        const { transport } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'validate_workflow', args: {} }],
            [{ type: 'text', content: 'ok' }, { type: 'done' }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('第一条消息');
        expect(useAiStore.getState().timelineEntries.length).toBeGreaterThan(0);

        // A fresh send with no tool calls should not carry over the previous turn's entries.
        const { transport: transport2 } = scriptedTransport([[{ type: 'text', content: 'hi' }, { type: 'done' }]]);
        useAiStore.getState().setConfig({ apiKey: '', transport: transport2 });
        await runner.send('第二条消息');
        expect(useAiStore.getState().timelineEntries).toEqual([]);
    });

    it('accepts with the still-invalid workflow once self-heal attempts are exhausted', async () => {
        const badWorkflow = { name: 'wf', tasks: [{ name: 'a', taskReferenceName: 'dup', type: 'SIMPLE' }, { name: 'b', taskReferenceName: 'dup', type: 'SIMPLE' }], version: 1 };
        // Model keeps producing the same broken workflow every attempt (MAX_SELF_HEAL = 2, so the
        // 3rd attempt is accepted-with-warning rather than self-healed again).
        const { transport, callCount } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'replace_workflow', args: { workflow: badWorkflow } }],
            [{ type: 'tool_call', id: 't2', name: 'replace_workflow', args: { workflow: badWorkflow } }],
            [{ type: 'tool_call', id: 't3', name: 'replace_workflow', args: { workflow: badWorkflow } }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('创建一个流程');

        expect(callCount()).toBe(3); // 2 self-heal attempts + the accepted-despite-errors 3rd
        const proposal = useAiStore.getState().pendingProposal;
        expect(proposal).not.toBeNull(); // accepted despite errors once the self-heal budget is spent
        expect(proposal?.proposedDef.tasks.map((t: any) => t.taskReferenceName)).toEqual(['dup', 'dup']);
    });

    it('creates a pendingPlan from propose_plan and pauses for confirmation', async () => {
        const { transport } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'propose_plan', args: { title: '重构计划', steps: [{ step: 1, action: '拆分任务' }] } }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('帮我重构');

        const plan = useAiStore.getState().pendingPlan;
        expect(plan?.title).toBe('重构计划');
        expect(plan?.steps).toHaveLength(1);
    });

    it('creates a pendingRepair from propose_repair', async () => {
        const { transport } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'propose_repair', args: { diagnosis: '任务超时', actions: [{ id: 'a1', label: '重跑', type: 'rerun_from', taskRef: 'x' }] } }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('为什么失败了');

        const repair = useAiStore.getState().pendingRepair;
        expect(repair?.diagnosis).toBe('任务超时');
    });

    it('creates a pendingClarification from ask_clarification', async () => {
        const { transport } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'ask_clarification', args: { question: '你想要哪种审批流程？', options: [{ id: 'a', label: '单级审批', description: '' }] } }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('帮我做个审批流程');

        expect(useAiStore.getState().pendingClarification?.question).toBe('你想要哪种审批流程？');
    });

    it('creates a pendingRecommendation from recommend_workflow', async () => {
        const { transport } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'recommend_workflow', args: { userIntent: '创建虚机', recommendations: [{ workflowName: 'create_vm', matchReason: '完全匹配', matchScore: 'exact' }] } }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('帮我创建一个虚机流程');

        expect(useAiStore.getState().pendingRecommendation?.recommendations[0].workflowName).toBe('create_vm');
    });

    it('dispatches a registered custom tool and feeds its result back to the model', async () => {
        toolRegistry.setTools([{
            definition: { type: 'function', function: { name: 'query_cmdb', description: '', parameters: {} } },
            execute: async () => 'cmdb says: 3 servers found',
        }]);
        const { transport, seenRequests } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'query_cmdb', args: {} }],
            [{ type: 'text', content: '找到了 3 台服务器' }, { type: 'done' }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('查询服务器数量');

        expect(fromEnd(useAiStore.getState().messages)?.content).toBe('找到了 3 台服务器');
        // second call's history must include the custom tool's result
        const secondCallMessages = seenRequests[1].messages;
        expect(secondCallMessages.some(m => m.role === 'tool' && m.content.includes('3 servers found'))).toBe(true);
    });

    it('stops after MAX_AGENT_STEPS to avoid an infinite loop', async () => {
        // The model calls a built-in read-only tool forever without ever finishing with plain text.
        const infiniteSteps = Array.from({ length: 10 }, (_, i) => (
            [{ type: 'tool_call' as const, id: `t${i}`, name: 'get_workflow_state', args: {} }]
        ));
        const { transport, callCount } = scriptedTransport(infiniteSteps);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('一直问');

        expect(callCount()).toBe(6); // MAX_AGENT_STEPS
        expect(useAiStore.getState().isStreaming).toBe(false);
    });

    it('respects aiPermissions.canEdit=false by using read-only tools only (no proposal even if the model tries)', async () => {
        // Even a replace_workflow tool_call should fall outside the active tool defs in read-only
        // mode; the runner still executes whatever the model calls (protocol-level), so this test
        // documents that patch/replace tools are excluded from `activeDefs` sent to the model —
        // verified via the request payload rather than by blocking execution client-side.
        const { transport, seenRequests } = scriptedTransport([
            [{ type: 'text', content: '只读模式下我不能修改工作流' }, { type: 'done' }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({ aiPermissions: { canEdit: false } }), testStores);
        await runner.send('帮我改一下');

        const toolNames = seenRequests[0].tools.map(t => t.function.name);
        expect(toolNames).not.toContain('replace_workflow');
        expect(toolNames).not.toContain('patch_workflow');
    });

    it('excludes propose_repair when aiPermissions.canRepair=false', async () => {
        const { transport, seenRequests } = scriptedTransport([
            [{ type: 'text', content: 'ok' }, { type: 'done' }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({ aiPermissions: { canRepair: false } }), testStores);
        await runner.send('诊断一下');

        const toolNames = seenRequests[0].tools.map(t => t.function.name);
        expect(toolNames).not.toContain('propose_repair');
    });

    it('recovers gracefully from a thrown error mid-stream and offers retry', async () => {
        const stream = async function* (): AsyncGenerator<StreamEvent> {
            throw new Error('HTTP 500');
        };
        useAiStore.getState().setConfig({ apiKey: '', transport: { type: 'custom', stream } });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('hi');

        const last = fromEnd(useAiStore.getState().messages);
        expect(last?.content).toContain('暂时不可用');
        expect(useAiStore.getState().retryInput).toBe('hi');
        expect(useAiStore.getState().isStreaming).toBe(false);
    });

    it('marks the message as aborted when the request is cancelled mid-flight', async () => {
        const stream = async function* (_req: AgentRequest, signal: AbortSignal): AsyncGenerator<StreamEvent> {
            await new Promise(resolve => setTimeout(resolve, 20));
            if (signal.aborted) {
                throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
            }
            yield { type: 'text', content: 'too late' };
            yield { type: 'done' };
        };
        useAiStore.getState().setConfig({ apiKey: '', transport: { type: 'custom', stream } });

        const runner = new AgentRunner(() => ({}), testStores);
        const promise = runner.send('hi');
        await new Promise(resolve => setTimeout(resolve, 5));
        runner.abort();
        await promise;

        expect(fromEnd(useAiStore.getState().messages)?.content).toBe('（已中止）');
        expect(useAiStore.getState().isStreaming).toBe(false);
    });

    it('injects the pending proposal JSON into the system prompt so the model can iterate on it', async () => {
        useAiStore.getState().setProposal({
            proposedDef: { name: 'draft_wf', tasks: [{ name: 'a', taskReferenceName: 'a', type: 'SIMPLE' }] } as any,
            diff: { added: ['a'], modified: [], removed: [], propsChanged: false },
            messageId: 'm1',
        });
        const { transport, seenRequests } = scriptedTransport([[{ type: 'text', content: 'ok' }, { type: 'done' }]]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('再加一个审批步骤');

        const systemMsg = seenRequests[0].messages.find(m => m.role === 'system');
        expect(systemMsg?.content).toContain('draft_wf');
        expect(systemMsg?.content).toContain('待确认的变更方案');
    });

    it('accumulates token usage reported by the provider into aiStore metrics', async () => {
        const { transport } = scriptedTransport([
            [
                { type: 'usage', promptTokens: 100, completionTokens: 20 },
                { type: 'text', content: 'hi' },
                { type: 'done' },
            ],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const before = useAiStore.getState().getMetrics();
        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('hello');

        const after = useAiStore.getState().getMetrics();
        expect(after.totalPromptTokens).toBe(before.totalPromptTokens + 100);
        expect(after.totalCompletionTokens).toBe(before.totalCompletionTokens + 20);
    });

    it('executes the 4-phase progressive workflow synthesis pipeline end-to-end', async () => {
        const { transport, callCount } = scriptedTransport([
            // Step 1: Phase 1 — init_workflow_blueprint
            [{
                type: 'tool_call',
                id: 'tc_bp',
                name: 'init_workflow_blueprint',
                args: {
                    name: 'payment_audit_flow',
                    description: '支付与风控审批流',
                    inputParameters: ['orderId'],
                    outputParameters: { status: '${charge_api_ref.output.response.body.status}' },
                },
            }],
            // Step 2: Phase 2 — scaffold_workflow_topology
            [{
                type: 'tool_call',
                id: 'tc_topo',
                name: 'scaffold_workflow_topology',
                args: {
                    tasks: [
                        { name: 'charge_api', taskReferenceName: 'charge_api_ref', type: 'HTTP' },
                        { name: 'notify_user', taskReferenceName: 'notify_user_ref', type: 'SIMPLE' },
                    ],
                },
            }],
            // Step 3: Phase 3 — configure_workflow_tasks
            [{
                type: 'tool_call',
                id: 'tc_cfg',
                name: 'configure_workflow_tasks',
                args: {
                    configurations: [
                        {
                            taskReferenceName: 'charge_api_ref',
                            httpRequest: {
                                uri: 'https://pay.internal/charge/${workflow.input.orderId}',
                                method: 'POST',
                            },
                        },
                        {
                            taskReferenceName: 'notify_user_ref',
                            inputParameters: {
                                chargeResult: '${charge_api_ref.output.response.body.status}',
                            },
                        },
                    ],
                },
            }],
            // Step 4: Phase 4 — commit_workflow_proposal
            [
                { type: 'text', content: '已完成四阶段构建与校验。' },
                { type: 'tool_call', id: 'tc_commit', name: 'commit_workflow_proposal', args: { summary: '四阶段完成' } },
            ],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('帮我创建一个支付与风控审批流');

        expect(callCount()).toBe(4);
        const proposal = useAiStore.getState().pendingProposal;
        expect(proposal).not.toBeNull();
        expect(proposal?.proposedDef.name).toBe('payment_audit_flow');
        expect(proposal?.proposedDef.tasks).toHaveLength(2);
        expect(proposal?.verification?.isValid).toBe(true);
        expect(proposal?.verification?.dataFlowLinks).toBeGreaterThanOrEqual(2);
    });

    it('auto-commits a workingDraft via safety net if the model finishes speaking without calling commit_workflow_proposal', async () => {
        const { transport } = scriptedTransport([
            [{
                type: 'tool_call',
                id: 'tc_bp',
                name: 'init_workflow_blueprint',
                args: { name: 'auto_commit_wf', inputParameters: ['userId'] },
            }],
            [{
                type: 'tool_call',
                id: 'tc_topo',
                name: 'scaffold_workflow_topology',
                args: {
                    tasks: [
                        {
                            name: 'fetch_profile',
                            taskReferenceName: 'fetch_profile_ref',
                            type: 'HTTP',
                            httpRequest: { uri: 'https://api.internal/users/${workflow.input.userId}', method: 'GET' },
                        },
                    ],
                },
            }],
            // Model finishes speaking without calling commit_workflow_proposal
            [{ type: 'text', content: '工作流已为您准备好！' }, { type: 'done' }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('创建用户信息查询流程');

        const proposal = useAiStore.getState().pendingProposal;
        expect(proposal).not.toBeNull();
        expect(proposal?.proposedDef.name).toBe('auto_commit_wf');
        expect(proposal?.verification?.isValid).toBe(true);
    });

    it('supports PI durable checkpointing and commitDraftNow / resume after interruption', async () => {
        // Simulate a mid-synthesis failure on step 2 after step 1 succeeded
        let call = 0;
        const stream = async function* (): AsyncGenerator<StreamEvent> {
            call++;
            if (call === 1) {
                yield {
                    type: 'tool_call',
                    id: 'tc_1',
                    name: 'scaffold_workflow_topology',
                    args: {
                        tasks: [
                            { name: 'task_a', taskReferenceName: 'task_a_ref', type: 'SIMPLE' },
                        ],
                    },
                };
                return;
            }
            if (call === 2) {
                throw new Error('503 Service Unavailable');
            }
            yield {
                type: 'tool_call',
                id: 'tc_2',
                name: 'commit_workflow_proposal',
                args: {},
            };
        };
        useAiStore.getState().setConfig({ apiKey: '', transport: { type: 'custom', stream } });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('构建多阶段任务流');

        // After step 2 throws, a durableCheckpoint in 'failed' state with the partial workingDraft is saved
        const cp = useAiStore.getState().durableCheckpoint;
        expect(cp).not.toBeNull();
        expect(cp?.status).toBe('failed');
        expect(cp?.phase).toBe('topology');
        expect(cp?.workingDraft?.tasks).toHaveLength(1);

        // User resumes from the checkpoint — call 3 runs commit_workflow_proposal and succeeds!
        await runner.resume();
        expect(useAiStore.getState().pendingProposal).not.toBeNull();
        expect(useAiStore.getState().pendingProposal?.proposedDef.tasks).toHaveLength(1);
    });
});

