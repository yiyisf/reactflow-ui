import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRunner, formatPlanForModel, formatClarificationAnswer } from './agentRunner';
import type { AgentRunnerStores } from './agentRunner';
import useAiStore from '../../store/aiStore';
import useWorkflowStore from '../../store/workflowStore';
import useLibraryStore from '../../store/libraryStore';
import { LibraryCatalog } from '../../library/catalog';
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
        // propose_repair 只在运行态提供（A17 起列表外的调用会被拒绝）
        useWorkflowStore.getState().setMode('run');
        const { transport } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'propose_repair', args: { diagnosis: '任务超时', actions: [{ id: 'a1', label: '重跑', type: 'rerun_from', taskRef: 'x' }] } }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('为什么失败了');

        const repair = useAiStore.getState().pendingRepair;
        expect(repair?.diagnosis).toBe('任务超时');
        useWorkflowStore.getState().setMode('edit');
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
        // patch/replace tools are excluded from `activeDefs` sent to the model; calls outside that
        // list are additionally rejected client-side (A17, see the tests below).
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

    describe('A17: 执行前按本轮可用工具白名单校验', () => {
        const validWorkflow = { name: 'hijacked', tasks: [{ name: 'x', taskReferenceName: 'x', type: 'SIMPLE' }], version: 1 };
        const toolMsgs = (req: AgentRequest) => req.messages.filter(m => m.role === 'tool');

        it('[A17-01] 只读权限下模型调用 replace_workflow 被拒绝：不生成方案，时间线记一条警告', async () => {
            const { transport, seenRequests } = scriptedTransport([
                [{ type: 'tool_call', id: 't1', name: 'replace_workflow', args: { workflow: validWorkflow } }],
                [{ type: 'text', content: '好的' }, { type: 'done' }],
            ]);
            useAiStore.getState().setConfig({ apiKey: '', transport });

            const runner = new AgentRunner(() => ({ aiPermissions: { canEdit: false } }), testStores);
            await runner.send('改成并行');

            expect(useAiStore.getState().pendingProposal).toBeNull();
            expect(useWorkflowStore.getState().workflowDef?.name).toBe('test_wf');
            const rejected = toolMsgs(seenRequests[1]).find(m => m.tool_call_id === 't1');
            expect(rejected?.content).toContain('调用被拒绝');
            expect(useAiStore.getState().timelineEntries.some(e => e.label.includes('已拒绝调用 replace_workflow'))).toBe(true);
        });

        it('[A17-02] 运行态下 patch_workflow 与草稿阶段工具都被拒绝，安全网也不自动提交方案', async () => {
            useWorkflowStore.getState().setMode('run');
            const { transport } = scriptedTransport([
                [
                    { type: 'tool_call', id: 't1', name: 'init_workflow_blueprint', args: { name: 'hijacked' } },
                    { type: 'tool_call', id: 't2', name: 'patch_workflow', args: { operations: [] } },
                ],
                [{ type: 'text', content: '完成' }, { type: 'done' }],
            ]);
            useAiStore.getState().setConfig({ apiKey: '', transport });

            const runner = new AgentRunner(() => ({}), testStores);
            await runner.send('顺便把流程改了');

            expect(useAiStore.getState().pendingProposal).toBeNull();
            const labels = useAiStore.getState().timelineEntries.map(e => e.label);
            expect(labels.some(l => l.includes('已拒绝调用 init_workflow_blueprint'))).toBe(true);
            expect(labels.some(l => l.includes('已拒绝调用 patch_workflow'))).toBe(true);
            useWorkflowStore.getState().setMode('edit');
        });

        it('[A17-03] 只读权限下自定义工具不会被执行', async () => {
            let executed = false;
            toolRegistry.setTools([{
                definition: { type: 'function', function: { name: 'delete_servers', description: '', parameters: {} } },
                execute: async () => { executed = true; return 'deleted'; },
            }]);
            const { transport, seenRequests } = scriptedTransport([
                [{ type: 'tool_call', id: 't1', name: 'delete_servers', args: {} }],
                [{ type: 'text', content: '好的' }, { type: 'done' }],
            ]);
            useAiStore.getState().setConfig({ apiKey: '', transport });

            const runner = new AgentRunner(() => ({ aiPermissions: { canEdit: false } }), testStores);
            await runner.send('清理服务器');

            expect(executed).toBe(false);
            expect(toolMsgs(seenRequests[1]).find(m => m.tool_call_id === 't1')?.content).toContain('调用被拒绝');
        });

        it('[A17-04] 编辑态下本轮提供的工具照常执行', async () => {
            const { transport } = scriptedTransport([
                [{ type: 'tool_call', id: 't1', name: 'get_workflow_state', args: {} }],
                [{ type: 'text', content: 'ok' }, { type: 'done' }],
            ]);
            useAiStore.getState().setConfig({ apiKey: '', transport });
            const runner = new AgentRunner(() => ({}), testStores);
            await runner.send('看看');
            expect(useAiStore.getState().timelineEntries.some(e => e.label.includes('已拒绝'))).toBe(false);
        });

        it('[A17-05] 会话中途切到运行态：已发出的编辑工具调用被拒绝，下一步不再提供编辑工具', async () => {
            const seenRequests: AgentRequest[] = [];
            let call = 0;
            const stream = async function* (req: AgentRequest): AsyncGenerator<StreamEvent> {
                seenRequests.push(req);
                if (call++ === 0) {
                    // 模型输出期间用户发起了执行验证
                    useWorkflowStore.getState().setMode('run');
                    yield { type: 'tool_call', id: 't1', name: 'patch_workflow', args: { operations: [] } };
                    return;
                }
                yield { type: 'text', content: '好的' };
                yield { type: 'done' };
            };
            useAiStore.getState().setConfig({ apiKey: '', transport: { type: 'custom', stream } });

            try {
                const runner = new AgentRunner(() => ({}), testStores);
                await runner.send('把重试次数改成 3');

                expect(seenRequests[0].tools.map(t => t.function.name)).toContain('patch_workflow');
                expect(toolMsgs(seenRequests[1]).find(m => m.tool_call_id === 't1')?.content).toContain('运行态只能查看和诊断');
                expect(seenRequests[1].tools.map(t => t.function.name)).not.toContain('patch_workflow');
            } finally {
                useWorkflowStore.getState().setMode('edit');
            }
        });

        it('[A17-06] 草稿已开始后切到运行态：安全网不自动提交方案', async () => {
            let call = 0;
            const stream = async function* (): AsyncGenerator<StreamEvent> {
                const step = call++;
                if (step === 0) {
                    yield { type: 'tool_call', id: 'tc_bp', name: 'init_workflow_blueprint', args: { name: 'draft_wf', inputParameters: ['userId'] } };
                    return;
                }
                if (step === 1) {
                    yield {
                        type: 'tool_call', id: 'tc_topo', name: 'scaffold_workflow_topology',
                        args: { tasks: [{ name: 'fetch_profile', taskReferenceName: 'fetch_profile_ref', type: 'HTTP', httpRequest: { uri: 'https://api.internal/users/${workflow.input.userId}', method: 'GET' } }] },
                    };
                    return;
                }
                // 草稿已经动过；模型结束前用户进入了运行态
                useWorkflowStore.getState().setMode('run');
                yield { type: 'text', content: '完成' };
                yield { type: 'done' };
            };
            useAiStore.getState().setConfig({ apiKey: '', transport: { type: 'custom', stream } });

            try {
                const runner = new AgentRunner(() => ({}), testStores);
                await runner.send('创建一个流程');
                expect(useAiStore.getState().pendingProposal).toBeNull();
            } finally {
                useWorkflowStore.getState().setMode('edit');
            }
        });
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

    it('keeps the text streamed so far when the user stops generation', async () => {
        const stream = async function* (_req: AgentRequest, signal: AbortSignal): AsyncGenerator<StreamEvent> {
            yield { type: 'text', content: '先说一半的分析' };
            await new Promise(resolve => setTimeout(resolve, 20));
            if (signal.aborted) throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
            yield { type: 'text', content: '……后半段' };
            yield { type: 'done' };
        };
        useAiStore.getState().setConfig({ apiKey: '', transport: { type: 'custom', stream } });

        const runner = new AgentRunner(() => ({}), testStores);
        const promise = runner.send('分析一下');
        await new Promise(resolve => setTimeout(resolve, 5));
        runner.abort();
        await promise;

        const content = fromEnd(useAiStore.getState().messages)?.content ?? '';
        expect(content).toContain('先说一半的分析');
        expect(content).toContain('（已中止）');
    });

    it('reset() during a run (清空对话) does not bring a paused checkpoint back afterwards', async () => {
        const stream = async function* (_req: AgentRequest, signal: AbortSignal): AsyncGenerator<StreamEvent> {
            if (!signal.aborted) {
                yield { type: 'tool_call', id: `t_${Math.random()}`, name: 'scaffold_workflow_topology', args: { tasks: [{ name: 'a', taskReferenceName: 'a', type: 'SIMPLE' }] } };
            }
            await new Promise(resolve => setTimeout(resolve, 20));
            if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        };
        useAiStore.getState().setConfig({ apiKey: '', transport: { type: 'custom', stream } });

        const runner = new AgentRunner(() => ({}), testStores);
        const promise = runner.send('构建流程');
        await new Promise(resolve => setTimeout(resolve, 30));
        runner.reset();
        useAiStore.getState().clearMessages();
        await promise;

        expect(useAiStore.getState().durableCheckpoint).toBeNull();
        expect(useAiStore.getState().messages).toHaveLength(1); // welcome only
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
    // ─── v1.3.1 regressions ──────────────────────────────────────────────────

    it('A1: a follow-up while a proposal is pending patches the proposal, not the canvas', async () => {
        useWorkflowStore.getState().setWorkflow({ name: 'test_wf', version: 1, tasks: [{ name: 'a', taskReferenceName: 'a', type: 'SIMPLE' }] } as any);
        useAiStore.getState().setProposal({
            proposedDef: { name: 'test_wf', version: 1, tasks: [
                { name: 'a', taskReferenceName: 'a', type: 'SIMPLE' },
                { name: 'approve', taskReferenceName: 'approve', type: 'HUMAN' },
            ] } as any,
            diff: { added: ['approve'], modified: [], removed: [], propsChanged: false },
            messageId: 'm_prev',
        });
        const { transport } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'patch_workflow', args: { ops: [{ op: 'add_task', afterRef: 'approve', task: { name: 'notify', taskReferenceName: 'notify', type: 'SIMPLE' } }] } }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('审批后再发个通知');

        const proposal = useAiStore.getState().pendingProposal;
        expect(proposal?.proposedDef.tasks.map((t: any) => t.taskReferenceName)).toEqual(['a', 'approve', 'notify']);
        // diff stays relative to the canvas, so the earlier change is still listed
        expect(proposal?.diff.added).toEqual(['approve', 'notify']);
    });

    it('A2: an HTTP error event (401) is a failure — retry offered, no auto-commit, no completed checkpoint', async () => {
        const { transport } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'scaffold_workflow_topology', args: { tasks: [{ name: 'a', taskReferenceName: 'a', type: 'SIMPLE' }] } }],
            [{ type: 'error', message: 'HTTP 401: invalid x-api-key' }, { type: 'done' }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('构建流程');

        expect(useAiStore.getState().pendingProposal).toBeNull();
        const cp = useAiStore.getState().durableCheckpoint;
        expect(cp?.status).toBe('failed');
        expect(cp?.workingDraft?.tasks).toHaveLength(1);
        expect(fromEnd(useAiStore.getState().messages)?.content).toContain('出错了');
    });

    it('A2: an error event on the first step offers retry instead of finishing the turn', async () => {
        const { transport } = scriptedTransport([[{ type: 'error', message: 'HTTP 429' }, { type: 'done' }]]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('你好');

        expect(useAiStore.getState().retryInput).toBe('你好');
        expect(fromEnd(useAiStore.getState().messages)?.content).toContain('频繁');
    });

    it('A9: no safety-net auto-commit while a clarification is pending for this message', async () => {
        const { transport } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'scaffold_workflow_topology', args: { tasks: [{ name: 'a', taskReferenceName: 'a', type: 'SIMPLE' }] } }],
            [{ type: 'tool_call', id: 't2', name: 'ask_clarification', args: { question: '审批几级？', options: [{ id: '1', label: '一级', description: '' }, { id: '2', label: '两级', description: '' }] } }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('做个审批流程');

        expect(useAiStore.getState().pendingClarification?.question).toBe('审批几级？');
        expect(useAiStore.getState().pendingProposal).toBeNull();
    });

    it('A10: self-heal ignores validation errors the canvas already had', async () => {
        // The canvas already has a duplicate-ref error; the model's proposal keeps it and adds a task.
        useWorkflowStore.getState().setWorkflow({ name: 'test_wf', version: 1, tasks: [
            { name: 'x', taskReferenceName: 'dup', type: 'SIMPLE' },
            { name: 'y', taskReferenceName: 'dup', type: 'SIMPLE' },
        ] } as any);
        const { transport, callCount } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'patch_workflow', args: { ops: [{ op: 'add_task', task: { name: 'z', taskReferenceName: 'z', type: 'SIMPLE' } }] } }],
            [{ type: 'text', content: 'should not be needed' }, { type: 'done' }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('加一个任务');

        expect(callCount()).toBe(1);
        expect(useAiStore.getState().pendingProposal?.proposedDef.tasks).toHaveLength(3);
    });

    it('excludes propose_repair from the tools offered in edit mode', async () => {
        const { transport, seenRequests } = scriptedTransport([[{ type: 'text', content: 'ok' }, { type: 'done' }]]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('看看');

        const toolNames = seenRequests[0].tools.map(t => t.function.name);
        expect(toolNames).not.toContain('propose_repair');
        expect(toolNames).toContain('load_library_workflow');
    });

    it('says it stopped at the step limit (and saves a resumable checkpoint) instead of "收到，已处理。"', async () => {
        const infiniteSteps = Array.from({ length: 10 }, (_, i) => (
            [{ type: 'tool_call' as const, id: `t${i}`, name: 'get_workflow_state', args: {} }]
        ));
        const { transport } = scriptedTransport(infiniteSteps);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('一直问');

        const content = fromEnd(useAiStore.getState().messages)?.content ?? '';
        expect(content).toContain('上限');
        expect(content).not.toContain('收到，已处理');
        expect(useAiStore.getState().durableCheckpoint?.status).toBe('paused');
    });

    it('send(text, { modelText }) shows the short text but gives the model the full context', async () => {
        const { transport, seenRequests } = scriptedTransport([[{ type: 'text', content: 'ok' }, { type: 'done' }]]);
        useAiStore.getState().setConfig({ apiKey: '', transport });
        const modelText = formatPlanForModel({ title: '串行改并行', steps: [{ step: 1, action: '把 a 和 b 放进 FORK_JOIN', tool: 'patch_workflow' }] });

        const runner = new AgentRunner(() => ({}), testStores);
        await runner.send('执行方案', { modelText });

        expect(fromEnd(useAiStore.getState().messages, 2)?.content).toBe('执行方案');
        const lastUser = fromEnd(seenRequests[0].messages.filter(m => m.role === 'user'));
        expect(lastUser?.content).toContain('把 a 和 b 放进 FORK_JOIN');
    });

    it('formatClarificationAnswer carries the original question with the chosen option', () => {
        const text = formatClarificationAnswer({ question: '审批几级？' }, { label: '两级', description: '主管 + HR' });
        expect(text).toContain('审批几级？');
        expect(text).toContain('两级');
        expect(text).toContain('主管 + HR');
    });

    it('A12: load_library_workflow (mode=reference) adds a pinned SUB_WORKFLOW step as a proposal', async () => {
        const catalog = new LibraryCatalog(undefined, {
            staticItems: [{ workflowName: 'create_vm', workflowLevel: 'L1', version: '3', description: '创建虚机', tags: [] }],
        });
        useLibraryStore.getState().setLibrary([{ workflowName: 'create_vm', workflowLevel: 'L1', version: '3', description: '创建虚机', tags: [] }]);
        const { transport } = scriptedTransport([
            [{ type: 'tool_call', id: 't1', name: 'load_library_workflow', args: { name: 'create_vm', mode: 'reference' } }],
        ]);
        useAiStore.getState().setConfig({ apiKey: '', transport });

        const runner = new AgentRunner(() => ({}), { ...testStores, libraryCatalog: catalog });
        await runner.send('直接用 create_vm');

        const tasks = useAiStore.getState().pendingProposal?.proposedDef.tasks ?? [];
        const sub = tasks.find((t: any) => t.type === 'SUB_WORKFLOW');
        expect(sub?.subWorkflowParam).toEqual({ name: 'create_vm', version: 3 });
    });

    it('A12: useLibraryWorkflow() turns a recommendation into a proposal without calling the model', async () => {
        const { transport, callCount } = scriptedTransport([[{ type: 'text', content: 'unused' }, { type: 'done' }]]);
        useAiStore.getState().setConfig({ apiKey: '', transport });
        useLibraryStore.getState().setLibrary([{ workflowName: 'notify', workflowLevel: 'L1', version: '2', description: '发送通知', tags: [] }]);

        const runner = new AgentRunner(() => ({}), testStores);
        const ok = await runner.useLibraryWorkflow('notify');

        expect(ok).toBe(true);
        expect(callCount()).toBe(0);
        const proposal = useAiStore.getState().pendingProposal;
        expect(proposal?.proposedDef.tasks.some((t: any) => t.subWorkflowParam?.name === 'notify')).toBe(true);
    });
});
