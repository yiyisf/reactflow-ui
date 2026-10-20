import { describe, it, expect } from 'vitest';
import { defaultTemplateStore } from './templateStore';
import { applyTemplateVariables } from './applyTemplate';
import { executeLocalSandboxDryRun } from '../utils/localSandboxEngine';

describe('场景化模板中心与启用向导单元测试', () => {
  it('正确加载并注册 8 个官方场景化黄金模板', () => {
    const all = defaultTemplateStore.getAllTemplates();
    expect(all.length).toBe(8);

    const computeTemplates = defaultTemplateStore.search('', 'compute');
    expect(computeTemplates.length).toBeGreaterThanOrEqual(1);

    const securityTemplates = defaultTemplateStore.search('', 'security');
    expect(securityTemplates.length).toBeGreaterThanOrEqual(3);

    const costTemplates = defaultTemplateStore.search('', 'cost');
    expect(costTemplates.length).toBeGreaterThanOrEqual(2);
  });

  it('正确根据关键词检索模板', () => {
    const results = defaultTemplateStore.search('快照');
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.some((r) => r.id === 'tpl_ecs_daily_snapshot_backup')).toBe(true);
  });

  it('成功将向导填写的变量注入到工作流骨架中', () => {
    const tpl = defaultTemplateStore.getTemplateById('tpl_ecs_daily_snapshot_backup');
    expect(tpl).toBeDefined();

    const customValues = {
      instanceId: 'i-test-custom-9988',
      retentionDays: 45,
    };

    const customizedDef = applyTemplateVariables(tpl!, customValues);
    expect(customizedDef.tasks[0].inputParameters?.instanceId).toBe('i-test-custom-9988');
    expect(customizedDef.tasks[1].inputParameters?.instanceId).toBe('i-test-custom-9988');
    expect(customizedDef.tasks[1].inputParameters?.retentionDays).toBe(45);
  });

  it('8 个模板均可在浏览器端确定性沙盒中 100% 成功试跑通过', () => {
    const all = defaultTemplateStore.getAllTemplates();

    for (const tpl of all) {
      const scenario = tpl.mockDataset.scenarios[0];
      const instance = executeLocalSandboxDryRun(tpl.definition, {
        workflowInput: scenario?.workflowInput || {},
        taskMocks: scenario?.taskOutputs || {},
      });

      expect(instance.status).toBe('COMPLETED');
      expect(instance.tasks.length).toBe(tpl.definition.tasks.length);
    }
  });
});
