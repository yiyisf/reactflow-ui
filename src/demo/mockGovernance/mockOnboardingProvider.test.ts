import { describe, it, expect } from 'vitest';
import { createMockOnboardingProvider } from './mockOnboardingProvider';
import { createMockProviders } from '../mockProviders';
import { DEMO_DOMAINS } from './libraryData';
import { pollPromotion } from '../../onboarding/poll';

const fast = (o: Parameters<typeof createMockOnboardingProvider>[0] = {}) =>
  createMockOnboardingProvider({ latencyMs: 0, ...o });

async function rejects(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error('期望 Promise 被拒绝，但它成功了');
}

const noSleep = async () => {};

describe('mockOnboardingProvider 基础数据', () => {
  it('上下文：TEST 开放试用，PROD 不开放', async () => {
    const t = await fast().getContext();
    expect(t.env).toBe('TEST');
    expect(t.trialEnabled).toBe(true);
    const p = await fast({ env: 'PROD' }).getContext();
    expect(p.env).toBe('PROD');
    expect(p.trialEnabled).toBe(false);
  });

  it('业务域取自演示流程库；产品默认含 ecs；返回拷贝', async () => {
    const o = fast();
    expect(await o.listDomains()).toEqual([...DEMO_DOMAINS]);
    const ps = await o.listMyProducts();
    expect(ps.map((p) => p.name)).toEqual(['ecs']);
    ps[0].name = 'changed';
    expect((await o.listMyProducts())[0].name).toBe('ecs');
  });

  it('createMockProviders 包含 onboarding', () => {
    expect(createMockProviders().onboarding).toBeDefined();
  });
});

describe('startTrial', () => {
  it('新产品登记成功并出现在「我的产品」中', async () => {
    const o = fast();
    const r = await o.startTrial({ productName: 'monitor', domain: '监控运维' });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.product.role).toBe('OWNER');
      expect(r.product.status).toBe('ACTIVE');
    }
    expect((await o.listMyProducts()).map((p) => p.name)).toEqual(['ecs', 'monitor']);
  });

  it('自己已有的产品重复登记：幂等返回 ok，不重复添加', async () => {
    const o = fast();
    const r = await o.startTrial({ productName: 'ecs', domain: '云资源' });
    expect(r.status).toBe('ok');
    expect((await o.listMyProducts()).length).toBe(1);
  });

  it('他人名下的产品（cmdb）→ conflict 并列出负责人', async () => {
    const o = fast();
    const r = await o.startTrial({ productName: 'cmdb', domain: '配置管理' });
    expect(r.status).toBe('conflict');
    if (r.status === 'conflict') expect(r.owners.length).toBeGreaterThan(0);
    expect((await o.listMyProducts()).map((p) => p.name)).toEqual(['ecs']);
  });

  it('PROD 环境不允许登记；非法名称被拒绝', async () => {
    expect((await rejects(fast({ env: 'PROD' }).startTrial({ productName: 'x', domain: '云资源' }))).message).toContain('不开放');
    expect((await rejects(fast().startTrial({ productName: 'a-b', domain: '云资源' }))).message).toContain('不合法');
  });

  it('resetProducts 清空产品', async () => {
    const o = fast();
    o.resetProducts();
    expect(await o.listMyProducts()).toEqual([]);
    expect(o.products).toEqual([]);
  });
});

describe('失败注入与取消', () => {
  it('failNext：恰好失败 N 次后恢复', async () => {
    const o = fast();
    o.failNext(2);
    await rejects(o.listDomains());
    await rejects(o.listMyProducts());
    expect((await o.listDomains()).length).toBeGreaterThan(0);
  });

  it('setFailing：持续失败直到关闭；所有接口均受影响', async () => {
    const o = fast();
    o.setFailing(true);
    await rejects(o.getContext());
    await rejects(o.startTrial({ productName: 'x', domain: '云资源' }));
    await rejects(o.requestPromotion({ workflowName: 'tmp-L1-云资源-ecs-x', version: 1, targetType: 'custom' }));
    await rejects(o.getPromotion('promo-1'));
    o.setFailing(false);
    expect((await o.getContext()).env).toBe('TEST');
  });

  it('已取消的 signal 立即拒绝（AbortError），且不计入请求数', async () => {
    const o = fast();
    const ac = new AbortController();
    ac.abort();
    const e = await rejects(o.listDomains(ac.signal));
    expect(e.name).toBe('AbortError');
    expect(o.requestCount).toBe(0);
  });

  it('延迟期间取消 → AbortError', async () => {
    const o = createMockOnboardingProvider({ latencyMs: 200 });
    const ac = new AbortController();
    const p = o.listDomains(ac.signal);
    ac.abort();
    expect((await rejects(p)).name).toBe('AbortError');
  });
});

describe('上线申请', () => {
  const NAME = 'tmp-L2-云资源-ecs-create_vm';

  it('依次推进 SUBMITTED → REVIEWING → APPROVED → SYNCED，并带正式名称', async () => {
    const o = fast();
    const { requestId } = await o.requestPromotion({ workflowName: NAME, version: 1, targetType: 'std' });
    const states: string[] = [];
    for (let i = 0; i < 5; i++) states.push((await o.getPromotion(requestId)).state);
    expect(states).toEqual(['SUBMITTED', 'REVIEWING', 'APPROVED', 'SYNCED', 'SYNCED']);
    const last = await o.getPromotion(requestId);
    expect(last.targetName).toBe('std-L2-云资源-ecs-create_vm');
    expect(last.requestId).toBe(requestId);
  });

  it('pollPromotion 对接：轮询到 SYNCED 停止并带 targetName', async () => {
    const o = fast();
    const { requestId } = await o.requestPromotion({ workflowName: NAME, version: 1, targetType: 'custom' });
    const final = await pollPromotion({ provider: o, requestId, sleep: noSleep });
    expect(final.state).toBe('SYNCED');
    expect(final.targetName).toBe('custom-L2-云资源-ecs-create_vm');
  });

  it('驳回：REVIEWING 后进入 REJECTED 并带意见，不带 targetName', async () => {
    const o = fast({ rejectPromotions: true });
    const { requestId } = await o.requestPromotion({ workflowName: NAME, version: 1, targetType: 'custom' });
    const final = await pollPromotion({ provider: o, requestId, sleep: noSleep });
    expect(final.state).toBe('REJECTED');
    expect((final.comment ?? '').length).toBeGreaterThan(0);
    expect(final.targetName).toBeUndefined();
    // 终态保持
    expect((await o.getPromotion(requestId)).state).toBe('REJECTED');
  });

  it('setRejectPromotions 只影响之后提交的申请', async () => {
    const o = fast();
    const a = await o.requestPromotion({ workflowName: NAME, version: 1, targetType: 'custom' });
    o.setRejectPromotions(true);
    const b = await o.requestPromotion({ workflowName: NAME, version: 1, targetType: 'custom' });
    const fa = await pollPromotion({ provider: o, requestId: a.requestId, sleep: noSleep });
    const fb = await pollPromotion({ provider: o, requestId: b.requestId, sleep: noSleep });
    expect(fa.state).toBe('SYNCED');
    expect(fb.state).toBe('REJECTED');
  });

  it('非 tmp 流程 / 不合法名称 / 未知申请号 → 拒绝', async () => {
    const o = fast();
    await rejects(o.requestPromotion({ workflowName: 'custom-L1-云资源-ecs-x', version: 1, targetType: 'std' }));
    await rejects(o.requestPromotion({ workflowName: 'oops', version: 1, targetType: 'std' }));
    expect((await rejects(o.getPromotion('nope'))).message).toContain('不存在');
  });

  it('轮询中途取消：停止请求', async () => {
    const o = fast();
    const { requestId } = await o.requestPromotion({ workflowName: NAME, version: 1, targetType: 'custom' });
    const ac = new AbortController();
    const before = o.requestCount;
    const e = await rejects(pollPromotion({
      provider: o,
      requestId,
      signal: ac.signal,
      sleep: async () => { ac.abort(); },
    }));
    expect(e.name).toBe('AbortError');
    expect(o.requestCount - before).toBe(1);
  });
});
