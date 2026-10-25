import { describe, it, expect } from 'vitest';
import {
  getUpstreamAncestors,
  inferTaskOutputSchema,
  getCompletionItems,
  buildDataFlowGraph,
  refactorTaskReferenceName,
} from './workflowLsp';
import type { WorkflowDef } from '../../types/conductor';

const sampleWorkflow: WorkflowDef = {
  name: 'order_fulfillment_wf',
  version: 1,
  inputParameters: ['orderId', 'customerTier'],
  tasks: [
    {
      name: 'init_vars',
      taskReferenceName: 'init_vars_ref',
      type: 'SET_VARIABLE',
      inputParameters: {
        region: 'ap-east-1',
        maxRetry: 3,
      },
    },
    {
      name: 'fetch_order',
      taskReferenceName: 'fetch_order_ref',
      type: 'HTTP',
      inputParameters: {
        http_request: {
          uri: 'https://api.example.com/orders/${workflow.input.orderId}',
          method: 'GET',
        },
      },
    },
    {
      name: 'route_tier',
      taskReferenceName: 'route_tier_ref',
      type: 'SWITCH',
      caseValueParam: 'tier',
      inputParameters: {
        tier: '${workflow.input.customerTier}',
      },
      decisionCases: {
        VIP: [
          {
            name: 'vip_discount',
            taskReferenceName: 'vip_discount_ref',
            type: 'SIMPLE',
            inputParameters: {
              orderData: '${fetch_order_ref.output.response.body}',
            },
          },
        ],
        STANDARD: [
          {
            name: 'std_process',
            taskReferenceName: 'std_process_ref',
            type: 'SIMPLE',
            inputParameters: {},
          },
        ],
      },
    },
    {
      name: 'finalize_order',
      taskReferenceName: 'finalize_order_ref',
      type: 'JSON_JQ_TRANSFORM',
      inputParameters: {
        rawBody: '${fetch_order_ref.output.response.body}',
        vipResult: '${vip_discount_ref.output.result}',
        queryExpression: '.rawBody',
      },
    },
  ],
};

describe('Workflow Language Server (W-LSP)', () => {
  it('resolves DAG-aware upstream ancestors accurately for branch and post-branch tasks', () => {
    // Inside VIP branch: should see init_vars_ref, fetch_order_ref, route_tier_ref, but NOT std_process_ref
    const vipUpstreams = getUpstreamAncestors(sampleWorkflow, 'vip_discount_ref').map(
      (t) => t.taskReferenceName
    );
    expect(vipUpstreams).toContain('init_vars_ref');
    expect(vipUpstreams).toContain('fetch_order_ref');
    expect(vipUpstreams).toContain('route_tier_ref');
    expect(vipUpstreams).not.toContain('std_process_ref');
    expect(vipUpstreams).not.toContain('finalize_order_ref');

    // At finalize_order_ref: should see tasks before SWITCH and branch tasks inside SWITCH
    const finalUpstreams = getUpstreamAncestors(sampleWorkflow, 'finalize_order_ref').map(
      (t) => t.taskReferenceName
    );
    expect(finalUpstreams).toContain('fetch_order_ref');
    expect(finalUpstreams).toContain('vip_discount_ref');
    expect(finalUpstreams).toContain('std_process_ref');
  });

  it('infers output schema from task contract and runtime execution data', () => {
    const httpTask = sampleWorkflow.tasks[1];
    const contractFields = inferTaskOutputSchema(httpTask, null);
    expect(contractFields.some((f) => f.path === 'response.statusCode')).toBe(true);
    expect(contractFields.some((f) => f.path === 'response.body')).toBe(true);

    // With runtime execution sample, infers concrete nested properties
    const runtimeFields = inferTaskOutputSchema(httpTask, {
      fetch_order_ref: {
        taskReferenceName: 'fetch_order_ref',
        status: 'COMPLETED',
        attempts: [],
        output: {
          response: {
            statusCode: 200,
            body: {
              invoiceNo: 'INV-998',
              totalAmount: 1280,
            },
          },
        },
      },
    });
    expect(runtimeFields.some((f) => f.path === 'response.body.invoiceNo')).toBe(true);
    expect(runtimeFields.some((f) => f.path === 'response.body.totalAmount')).toBe(true);
  });

  it('provides zero-latency completion items including workflow inputs, variables, and upstream outputs', () => {
    const items = getCompletionItems(sampleWorkflow as any, 'finalize_order_ref');
    const exprs = items.map((i) => i.value);
    expect(exprs).toContain('${workflow.input.orderId}');
    expect(exprs).toContain('${workflow.variables.region}');
    expect(exprs).toContain('${fetch_order_ref.output.response.body}');
    expect(exprs).toContain('${vip_discount_ref.output.result}');
  });

  it('builds Data Flow Graph (DFG) lineage edges across the workflow', () => {
    const dfg = buildDataFlowGraph(sampleWorkflow as any);
    expect(
      dfg.edges.some(
        (e) =>
          e.sourceRef === 'fetch_order_ref' &&
          e.targetRef === 'vip_discount_ref' &&
          e.fieldPath === 'response.body'
      )
    ).toBe(true);
    expect(
      dfg.edges.some(
        (e) =>
          e.sourceRef === 'vip_discount_ref' &&
          e.targetRef === 'finalize_order_ref' &&
          e.fieldPath === 'result'
      )
    ).toBe(true);
  });

  it('cascades taskReferenceName rename across all downstream expressions and joinOn arrays', () => {
    const res = refactorTaskReferenceName(
      sampleWorkflow as any,
      'fetch_order_ref',
      'query_order_v2_ref'
    );
    expect(res.replacedCount).toBe(2);
    expect(res.affectedTaskRefs).toContain('vip_discount_ref');
    expect(res.affectedTaskRefs).toContain('finalize_order_ref');

    const renamedTask = res.updatedDef.tasks[1];
    expect(renamedTask.taskReferenceName).toBe('query_order_v2_ref');

    const finalizeTask = res.updatedDef.tasks[3];
    expect(finalizeTask.inputParameters?.rawBody).toBe(
      '${query_order_v2_ref.output.response.body}'
    );
  });
});

describe('W-LSP · v1.3.1', () => {
  it('offers subWorkflowId (Conductor SUB_WORKFLOW output) instead of workflowId / result', () => {
    const fields = inferTaskOutputSchema({ name: 'child', taskReferenceName: 'child', type: 'SUB_WORKFLOW', subWorkflowParam: { name: 'c' } });
    expect(fields.map(f => f.path)).toEqual(['subWorkflowId']);
    expect(fields[0].expression).toBe('${child.output.subWorkflowId}');
  });

  it('refactors SWITCH caseExpression references too', () => {
    const def: WorkflowDef = {
      name: 'wf',
      tasks: [
        { name: 'a', taskReferenceName: 'a', type: 'SIMPLE' },
        { name: 'd', taskReferenceName: 'd', type: 'DECISION', caseExpression: '$.a.output.ok ? "y" : "n"', decisionCases: {} },
      ],
    };
    const { updatedDef } = refactorTaskReferenceName(def, 'a', 'a2');
    expect(updatedDef.tasks[1].caseExpression).toBe('$.a2.output.ok ? "y" : "n"');
  });

  it('reads structured input params from inputSchema for completions', () => {
    const def: WorkflowDef = {
      name: 'wf',
      inputParameters: ['n'],
      inputSchema: { name: 'wf_input', type: 'JSON', data: { properties: { n: { type: 'number', description: '数量' } } } },
      tasks: [{ name: 'a', taskReferenceName: 'a', type: 'SIMPLE' }],
    };
    const item = getCompletionItems(def, 'a').find(i => i.label === 'workflow.input.n')!;
    expect(item.valueType).toBe('number');
    expect(item.description).toBe('数量');
  });
});
