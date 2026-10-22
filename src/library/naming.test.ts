import { describe, it, expect } from 'vitest';
import { parseWorkflowName, validateWorkflowName } from './naming';

describe('parseWorkflowName', () => {
  it('合法名称切分为 5 个部分', () => {
    expect(parseWorkflowName('std-L1-通知协助-企业微信-发送消息')).toEqual({
      type: 'std',
      level: 'L1',
      domain: '通知协助',
      product: '企业微信',
      func: '发送消息',
    });
  });

  it('四种类型都能解析', () => {
    for (const t of ['std', 'proxy', 'tmp', 'custom']) {
      expect(parseWorkflowName(`${t}-L2-云资源-ECS-创建`)?.type).toBe(t);
    }
  });

  it('功能部分自身含 - 时按第 4 个 - 之后整体还原', () => {
    const p = parseWorkflowName('custom-L3-云资源-ECS-创建-并-开机');
    expect(p?.product).toBe('ECS');
    expect(p?.func).toBe('创建-并-开机');
  });

  it('段数不足 5 返回 null', () => {
    expect(parseWorkflowName('std-L1-云资源-ECS')).toBeNull();
    expect(parseWorkflowName('create_vm')).toBeNull();
    expect(parseWorkflowName('')).toBeNull();
  });

  it('类型不合法返回 null（大小写敏感）', () => {
    expect(parseWorkflowName('foo-L1-云资源-ECS-创建')).toBeNull();
    expect(parseWorkflowName('STD-L1-云资源-ECS-创建')).toBeNull();
  });

  it('层级不合法返回 null', () => {
    expect(parseWorkflowName('std-L4-云资源-ECS-创建')).toBeNull();
    expect(parseWorkflowName('std-l1-云资源-ECS-创建')).toBeNull();
  });
});

describe('validateWorkflowName', () => {
  it('合法名称无错误；未提供 allowedDomains 时不校验业务域', () => {
    expect(validateWorkflowName('std-L1-任意新业务域-ECS-创建')).toEqual([]);
  });

  it('空名称', () => {
    expect(validateWorkflowName('')).toHaveLength(1);
  });

  it('段数不足给出中文提示', () => {
    const errs = validateWorkflowName('std-L1-云资源');
    expect(errs.some((e) => e.includes('5 段'))).toBe(true);
  });

  it('类型与层级不合法分别报错', () => {
    const errs = validateWorkflowName('foo-L9-云资源-ECS-创建');
    expect(errs.some((e) => e.includes('类型「foo」'))).toBe(true);
    expect(errs.some((e) => e.includes('层级「L9」'))).toBe(true);
  });

  it('业务域不在允许列表内报错，在列表内通过', () => {
    const allowed = ['云资源', '通知协助'];
    expect(validateWorkflowName('std-L1-通知协助-企微-发送', allowed)).toEqual([]);
    const errs = validateWorkflowName('std-L1-未知域-企微-发送', allowed);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('未知域');
  });

  it('业务域 / 产品 / 功能为空报错', () => {
    expect(validateWorkflowName('std-L1--ECS-创建').some((e) => e.includes('业务域不能为空'))).toBe(true);
    expect(validateWorkflowName('std-L1-云资源--创建').some((e) => e.includes('产品不能为空'))).toBe(true);
    expect(validateWorkflowName('std-L1-云资源-ECS-').some((e) => e.includes('功能不能为空'))).toBe(true);
  });

  it('功能含 - 合法', () => {
    expect(validateWorkflowName('tmp-L2-云资源-ECS-a-b-c')).toEqual([]);
  });
});
