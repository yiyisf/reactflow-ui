import { describe, it, expect } from 'vitest';
import { executeLocalSandboxDryRun } from './localSandboxEngine';
import type { WorkflowDef } from '../types/workflow';

describe('In-Browser Deterministic Dry-Run Sandbox Engine', () => {
  it('evaluates expressions, SET_VARIABLE, SWITCH branches, and DO_WHILE iterations in-browser', () => {
    const wf: WorkflowDef = {
      name: 'sandbox_test_wf',
      version: 1,
      inputParameters: ['orderId', 'channel'],
      tasks: [
        {
          name: 'set_env',
          taskReferenceName: 'set_env_ref',
          type: 'SET_VARIABLE',
          inputParameters: {
            region: 'cn-shanghai',
          },
        },
        {
          name: 'fetch_detail',
          taskReferenceName: 'fetch_detail_ref',
          type: 'HTTP',
          inputParameters: {
            http_request: {
              uri: 'https://api.internal/orders/${workflow.input.orderId}',
              method: 'GET',
            },
          },
        },
        {
          name: 'route_channel',
          taskReferenceName: 'route_channel_ref',
          type: 'SWITCH',
          caseValueParam: 'ch',
          inputParameters: {
            ch: '${workflow.input.channel}',
          },
          decisionCases: {
            MOBILE: [
              {
                name: 'mobile_push',
                taskReferenceName: 'mobile_push_ref',
                type: 'SIMPLE',
                inputParameters: {
                  region: '${workflow.variables.region}',
                  httpCode: '${fetch_detail_ref.output.response.statusCode}',
                },
              },
            ],
            WEB: [
              {
                name: 'web_notify',
                taskReferenceName: 'web_notify_ref',
                type: 'SIMPLE',
                inputParameters: {},
              },
            ],
          },
        },
        {
          name: 'batch_loop',
          taskReferenceName: 'batch_loop_ref',
          type: 'DO_WHILE',
          loopCondition: '$.batch_loop_ref.iteration < 2',
          loopOver: [
            {
              name: 'loop_worker',
              taskReferenceName: 'loop_worker_ref',
              type: 'SIMPLE',
              inputParameters: {
                orderId: '${workflow.input.orderId}',
              },
            },
          ],
        },
      ],
      outputParameters: {
        finalStatus: '${fetch_detail_ref.output.response.statusCode}',
        regionUsed: '${workflow.variables.region}',
      },
    };

    const instance = executeLocalSandboxDryRun(wf, {
      workflowInput: {
        orderId: 'ORD-777',
        channel: 'MOBILE',
      },
      maxLoopIterations: 2,
    });

    expect(instance.status).toBe('COMPLETED');
    expect(instance.output?.finalStatus).toBe(200);
    expect(instance.output?.regionUsed).toBe('cn-shanghai');

    // Should have executed MOBILE branch and skipped WEB branch
    const executedRefs = instance.tasks.map((t) => t.referenceTaskName);
    expect(executedRefs).toContain('mobile_push_ref');
    expect(executedRefs).not.toContain('web_notify_ref');

    // Mobile push task should have resolved ${workflow.variables.region} and ${fetch_detail_ref.output.response.statusCode}
    const mobileTask = instance.tasks.find((t) => t.referenceTaskName === 'mobile_push_ref');
    expect(mobileTask?.inputData?.region).toBe('cn-shanghai');
    expect(mobileTask?.inputData?.httpCode).toBe(200);

    // DO_WHILE loop should have executed 2 iterations: loop_worker_ref and loop_worker_ref__2
    expect(executedRefs).toContain('loop_worker_ref');
    expect(executedRefs).toContain('loop_worker_ref__2');
  });
});
