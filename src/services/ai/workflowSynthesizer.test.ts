import { describe, it, expect } from 'vitest';
import {
    applyBlueprint,
    applyTopologyScaffold,
    applyTaskConfigurations,
    verifyWorkflowSemantics,
    normalizeWorkflowDef,
    collectAllTasksInOrder,
} from './workflowSynthesizer';

describe('workflowSynthesizer — 4-Phase Progressive Synthesis & Semantic Verifier', () => {
    it('progressively synthesizes a workflow across Phase 1 -> Phase 2 -> Phase 3 -> Phase 4', () => {
        // Phase 1: Blueprint
        const bpDraft = applyBlueprint(null, {
            name: 'order_fulfillment_flow',
            description: '电商订单履约与风控审批流',
            inputParameters: ['orderId', 'amount'],
            outputParameters: {
                finalStatus: '${notify_customer_ref.output.response.body.status}',
            },
        });

        expect(bpDraft.name).toBe('order_fulfillment_flow');
        expect(bpDraft.version).toBe(1);
        expect(bpDraft.inputParameters).toEqual(['orderId', 'amount']);

        // Phase 2: Topology Scaffold (with SWITCH and FORK_JOIN)
        const { workflow: topoDraft, autoFixed } = applyTopologyScaffold(bpDraft, {
            tasks: [
                {
                    name: 'verify_payment',
                    taskReferenceName: 'verify_payment_ref',
                    type: 'HTTP',
                    description: '校验支付状态',
                },
                {
                    name: 'amount_switch',
                    taskReferenceName: 'amount_switch_ref',
                    type: 'SWITCH',
                    caseValueParam: 'tier',
                    decisionCases: {
                        HIGH: [
                            {
                                name: 'manual_audit',
                                taskReferenceName: 'manual_audit_ref',
                                type: 'HUMAN',
                            },
                        ],
                    },
                    defaultCase: [
                        {
                            name: 'auto_approve',
                            taskReferenceName: 'auto_approve_ref',
                            type: 'SIMPLE',
                        },
                    ],
                },
                {
                    name: 'parallel_dispatch',
                    taskReferenceName: 'parallel_dispatch_ref',
                    type: 'FORK_JOIN',
                    forkTasks: [
                        [
                            {
                                name: 'reserve_stock',
                                taskReferenceName: 'reserve_stock_ref',
                                type: 'HTTP',
                            },
                        ],
                        [
                            {
                                name: 'notify_customer',
                                taskReferenceName: 'notify_customer_ref',
                                type: 'HTTP',
                            },
                        ],
                    ],
                },
            ],
        });

        // Notice FORK_JOIN auto-paired a JOIN task!
        expect(topoDraft.tasks.some(t => t.type === 'JOIN')).toBe(true);
        const joinTask = topoDraft.tasks.find(t => t.type === 'JOIN');
        expect(joinTask?.joinOn).toEqual(['reserve_stock_ref', 'notify_customer_ref']);
        expect(collectAllTasksInOrder(topoDraft.tasks)).toHaveLength(8);
        expect(autoFixed.length).toBeGreaterThan(0);

        // Phase 3: Configure individual tasks & wire data-flow
        const { workflow: cfgDraft, configuredRefs, missingRefs } = applyTaskConfigurations(topoDraft, {
            configurations: [
                {
                    ref: 'verify_payment_ref',
                    httpRequest: {
                        uri: 'https://pay.internal/orders/${workflow.input.orderId}',
                        method: 'GET',
                    },
                    retryCount: 3,
                },
                {
                    ref: 'amount_switch_ref',
                    inputParameters: {
                        tier: '${verify_payment_ref.output.response.body.riskTier}',
                    },
                },
                {
                    ref: 'reserve_stock_ref',
                    httpRequest: {
                        uri: 'https://wms.internal/reserve',
                        method: 'POST',
                        body: {
                            orderId: '${workflow.input.orderId}',
                            txId: '${verify_payment_ref.output.response.body.txId}',
                        },
                    },
                },
                {
                    ref: 'notify_customer_ref',
                    httpRequest: {
                        uri: 'https://msg.internal/send',
                        method: 'POST',
                        body: {
                            userId: '${workflow.input.userId}',
                        },
                    },
                },
            ],
        });

        expect(configuredRefs).toHaveLength(4);
        expect(missingRefs).toHaveLength(0);
        // Auto-collected ${workflow.input.userId} into workflow.inputParameters!
        expect(cfgDraft.inputParameters).toContain('userId');

        // Phase 4: Holistic Semantic & Data-Flow Verification
        const verification = verifyWorkflowSemantics(cfgDraft);
        expect(verification.isValid).toBe(true);
        expect(verification.errors).toHaveLength(0);
        expect(verification.dataFlowLinks).toBeGreaterThanOrEqual(3);
    });

    it('detects broken task references, self-references, and illegal downstream forward references', () => {
        const { workflow } = normalizeWorkflowDef({
            name: 'broken_dataflow_test',
            version: 1,
            tasks: [
                {
                    name: 'step_one',
                    taskReferenceName: 'step_one_ref',
                    type: 'SIMPLE',
                    inputParameters: {
                        // Forward reference to step_two_ref (not executed yet!)
                        prematureData: '${step_two_ref.output.result}',
                        // Non-existent reference
                        ghostData: '${non_existent_ref.output.value}',
                    },
                },
                {
                    name: 'step_two',
                    taskReferenceName: 'step_two_ref',
                    type: 'SIMPLE',
                    inputParameters: {
                        // Self-reference
                        loopback: '${step_two_ref.output.self}',
                    },
                },
            ],
        });

        const verification = verifyWorkflowSemantics(workflow);
        expect(verification.isValid).toBe(false);
        expect(verification.errors.some(e => e.message.includes('下游尚未执行的任务 "step_two_ref"'))).toBe(true);
        expect(verification.errors.some(e => e.message.includes('不存在的任务 "non_existent_ref"'))).toBe(true);
        expect(verification.errors.some(e => e.message.includes('不能自引用自身输出'))).toBe(true);
    });
});

describe('E25: AI 规范化把 SWITCH 迁移到 evaluatorType + expression', () => {
    const sw = (extra: Record<string, unknown>) => ({
        name: 'wf', version: 1,
        tasks: [{ name: 'route', taskReferenceName: 'route', type: 'SWITCH', inputParameters: { tier: '${workflow.input.tier}' }, decisionCases: { HIGH: [] }, ...extra }],
    }) as any;

    it('[E25-03] caseValueParam → value-param + expression', () => {
        const { workflow, autoFixed } = normalizeWorkflowDef(sw({ caseValueParam: 'tier' }));
        const t = workflow.tasks[0] as any;
        expect(t).toMatchObject({ evaluatorType: 'value-param', expression: 'tier' });
        expect(t.caseValueParam).toBeUndefined();
        expect(autoFixed.some(m => m.includes('route') && m.includes('expression'))).toBe(true);
        expect(verifyWorkflowSemantics(workflow).errors.filter((e: any) => String(e.message ?? e).includes('caseValueParam'))).toEqual([]);
    });

    it('[E25-04] caseExpression → javascript + expression；已有 expression 时不动', () => {
        const migrated = normalizeWorkflowDef(sw({ caseExpression: '$.tier > 3 ? "HIGH" : "LOW"' })).workflow.tasks[0] as any;
        expect(migrated).toMatchObject({ evaluatorType: 'javascript', expression: '$.tier > 3 ? "HIGH" : "LOW"' });
        expect(migrated.caseExpression).toBeUndefined();
        const kept = normalizeWorkflowDef(sw({ evaluatorType: 'graaljs', expression: '"HIGH"' })).workflow.tasks[0] as any;
        expect(kept).toMatchObject({ evaluatorType: 'graaljs', expression: '"HIGH"' });
    });

    it('[E25-05] DECISION 保持 caseValueParam', () => {
        const d = normalizeWorkflowDef({ name: 'wf', version: 1, tasks: [{ name: 'd', taskReferenceName: 'd', type: 'DECISION', caseValueParam: 'tier', inputParameters: { tier: 'x' }, decisionCases: { a: [] } }] } as any).workflow.tasks[0] as any;
        expect(d.caseValueParam).toBe('tier');
        expect(d.expression).toBeUndefined();
    });
});
