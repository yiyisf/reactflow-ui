import { describe, it, expect } from 'vitest';
import { translateTechnicalError } from './friendlyErrorTranslator';

describe('生活化错误诊断翻译器单元测试 (friendlyErrorTranslator)', () => {
  it('准确翻译 HTTP 401 与 Token 过期报错', () => {
    const res1 = translateTechnicalError('Invalid signature: token expired', 401, '创建云主机');
    expect(res1.type).toBe('auth');
    expect(res1.title).toBe('云平台账号授权已失效或权限受限');
    expect(res1.actionKey).toBe('reauth');
    expect(res1.explanation).toContain('创建云主机');

    const res2 = translateTechnicalError('Access denied: Unauthorized access to cloud API', 403);
    expect(res2.type).toBe('auth');
  });

  it('准确翻译超时与网络阻断错误', () => {
    const res1 = translateTechnicalError('Connection timed out after 30000ms', 504, '下发命令');
    expect(res1.type).toBe('timeout');
    expect(res1.title).toBe('目标云主机响应超时');
    expect(res1.actionKey).toBe('retry');

    const res2 = translateTechnicalError('Failed to fetch from host: DNS unreachable');
    expect(res2.type).toBe('network');
    expect(res2.title).toBe('网络通信中断或无法解析');
  });

  it('准确翻译上游数据缺失与空引用', () => {
    const res = translateTechnicalError('NullPointerException: Cannot read field "instanceId" of null');
    expect(res.type).toBe('missing_data');
    expect(res.title).toBe('缺少必要的上游输入数据');
    expect(res.actionKey).toBe('inspect_upstream');
  });

  it('准确翻译配额与库存售罄错误', () => {
    const res = translateTechnicalError('ResourceQuotaExceeded: The requested instance type is out of stock in this zone');
    expect(res.type).toBe('quota');
    expect(res.title).toBe('可用区资源库存不足或配额受限');
    expect(res.actionKey).toBe('change_spec');
  });

  it('准确翻译脚本非零退出码异常', () => {
    const res = translateTechnicalError('Command failed with exit code 127: docker: command not found');
    expect(res.type).toBe('script_fail');
    expect(res.title).toBe('主机内部脚本执行异常退出');
    expect(res.actionKey).toBe('inspect_upstream');
  });

  it('未知错误兜底处理', () => {
    const res = translateTechnicalError('Some unexpected internal edge case');
    expect(res.type).toBe('unknown');
    expect(res.title).toBe('步骤执行未达预期');
  });
});
