import { describe, it, expect } from 'vitest';
import type { WorkflowInstance } from '../../types/conductor';
import { scanWorkflowDef } from './rules';
import { analyzeTasksForPruning, applyTaskPruning } from './prune';
import { extractTemplateFromInstance } from './anonymize';
import { executeLocalSandboxDryRun } from '../../utils/localSandboxEngine';

describe('生产实例一键脱敏提炼工具测试 (Sanitizer & Extractor)', () => {
  const mockInstance: WorkflowInstance = {
    workflowId: 'wf-prod-execution-88992',
    workflowName: 'prod_ecs_real_deployment',
    status: 'COMPLETED',
    createTime: Date.now() - 5000,
    startTime: Date.now() - 4000,
    endTime: Date.now(),
    workflowDefinition: {
      name: 'prod_ecs_real_deployment',
      tasks: [
        {
          name: 'create_node',
          taskReferenceName: 'create_node_ref',
          type: 'HTTP',
          inputParameters: {
            _actionId: 'ecs.create_instance',
            instanceName: 'prod-api-cluster-01',
            secret_token: 'secret_live_key_9948281093847192',
            internal_ip: '10.120.44.12',
            admin_phone: '13912345678',
            admin_email: 'zhangsan@corp.company.com',
            instanceId: 'i-bp1983020199a',
          },
        },
        {
          name: 'debug_dump_environment',
          taskReferenceName: 'temp_debug_step',
          type: 'SIMPLE',
          inputParameters: {
            dumpAll: true,
          },
        },
        {
          name: 'send_notice',
          taskReferenceName: 'notice_step',
          type: 'EVENT',
          inputParameters: {
            _actionId: 'notify.send_message',
            title: '【生产通知】服务已上线',
            webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=secret_abc123',
          },
        },
      ],
    },
    tasks: [
      {
        taskId: 't-1',
        taskType: 'HTTP',
        referenceTaskName: 'create_node_ref',
        status: 'COMPLETED',
        outputData: {
          instanceId: 'i-bp1983020199a',
          privateIp: '10.120.44.12',
          secretKey: 'live_secret_4499',
        },
      },
      {
        taskId: 't-2',
        taskType: 'SIMPLE',
        referenceTaskName: 'temp_debug_step',
        status: 'COMPLETED',
        outputData: { debugDone: true },
      },
      {
        taskId: 't-3',
        taskType: 'EVENT',
        referenceTaskName: 'notice_step',
        status: 'COMPLETED',
        outputData: { sent: true },
      },
    ],
  };

  it('规则库准确识别凭据、内网IP、手机号与资源ID', () => {
    const findings = scanWorkflowDef(mockInstance.workflowDefinition);

    // 凭据识别
    const tokenFinding = findings.find((f) => f.keyName === 'secret_token');
    expect(tokenFinding).toBeDefined();
    expect(tokenFinding?.kind).toBe('credential');
    expect(tokenFinding?.action).toBe('variable');

    // 内网 IP 识别
    const ipFinding = findings.find((f) => f.keyName === 'internal_ip');
    expect(ipFinding).toBeDefined();
    expect(ipFinding?.kind).toBe('network');
    expect(ipFinding?.maskedValue).toBe('172.16.0.42');

    // 手机号识别
    const phoneFinding = findings.find((f) => f.keyName === 'admin_phone');
    expect(phoneFinding).toBeDefined();
    expect(phoneFinding?.kind).toBe('pii');
    expect(phoneFinding?.maskedValue).toBe('13800138000');

    // 邮箱识别
    const emailFinding = findings.find((f) => f.keyName === 'admin_email');
    expect(emailFinding).toBeDefined();
    expect(emailFinding?.kind).toBe('pii');
    expect(emailFinding?.maskedValue).toBe('ops-notify@example.com');

    // 真实云资源 ID 识别
    const idFinding = findings.find((f) => f.keyName === 'instanceId');
    expect(idFinding).toBeDefined();
    expect(idFinding?.kind).toBe('resourceId');
  });

  it('智能剪枝算法准确发现并建议移除临时调试与日志节点', () => {
    const recommendations = analyzeTasksForPruning(mockInstance.workflowDefinition, mockInstance);
    expect(recommendations.length).toBe(1);
    expect(recommendations[0].taskReferenceName).toBe('temp_debug_step');
    expect(recommendations[0].selected).toBe(true);

    const pruned = applyTaskPruning(mockInstance.workflowDefinition, new Set(['temp_debug_step']));
    expect(pruned.tasks.length).toBe(2);
    expect(pruned.tasks.some((t) => t.taskReferenceName === 'temp_debug_step')).toBe(false);
  });

  it('一键从真实实例萃取出符合标准的标准化模板，且沙盒可安全试跑', () => {
    const extraction = extractTemplateFromInstance({
      instance: mockInstance,
      title: '从真实交付实例萃取的模板',
      category: 'compute',
      valueProposition: '自动化剔除调试节点并对敏感凭据完成匿名脱敏。',
    });

    const { template, report } = extraction;
    expect(template.id).toMatch(/^tpl_extracted_/);
    expect(template.title).toBe('从真实交付实例萃取的模板');
    expect(template.category).toBe('compute');

    // 凭据项与敏感 ID 已转换为向导变量
    expect(template.variables.length).toBeGreaterThanOrEqual(1);

    // 调试节点已被剔除
    expect(template.definition.tasks.some((t) => t.taskReferenceName === 'temp_debug_step')).toBe(false);

    // 审计报告数量正确
    expect(report.totalTasksScanned).toBe(3);
    expect(report.credentialsRedactedCount).toBeGreaterThanOrEqual(1);

    // 验证由该实例生成的保真 Mock 数据集可在沙盒中直接试跑
    const scenario = template.mockDataset.scenarios[0];
    const dryRunResult = executeLocalSandboxDryRun(template.definition, {
      workflowInput: scenario.workflowInput,
      taskMocks: scenario.taskOutputs,
    });

    expect(dryRunResult.status).toBe('COMPLETED');
    expect(dryRunResult.tasks.length).toBe(template.definition.tasks.length);
  });
});
