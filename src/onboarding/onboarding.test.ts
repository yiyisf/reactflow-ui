import { describe, it, expect } from 'vitest';
import {
  buildWorkflowName,
  suggestFuncSlug,
  buildSkeletonWorkflow,
  promotionTargetName,
  isPromotableName,
  validateNameParts,
} from './naming';
import {
  nextPollDelay,
  isTerminalPromotionState,
  buildPromotionTimeline,
  pollPromotion,
} from './poll';
import {
  createInitialDraft,
  validateProductName,
  productStepError,
  namingStepErrors,
  canAdvance,
  nextStep,
  prevStep,
  availableSources,
  draftToNameParts,
} from './wizardState';
import { parseWorkflowName } from '../library/naming';
import type { PromotionStatus, ProductInfo } from '../providers/types';

const ecs: ProductInfo = { name: 'ecs', domain: '云资源', status: 'ACTIVE', role: 'OWNER' };

describe('buildWorkflowName', () => {
  it('拼出五段名称，且能被 parseWorkflowName 还原', () => {
    const name = buildWorkflowName({ type: 'tmp', level: 'L2', domain: '云资源', product: 'ecs', func: 'create_vm' });
    expect(name).toBe('tmp-L2-云资源-ecs-create_vm');
    const p = parseWorkflowName(name)!;
    expect(p.type).toBe('tmp');
    expect(p.product).toBe('ecs');
    expect(p.func).toBe('create_vm');
  });

  it('业务域 / 产品段去掉 -，功能段保留 - 并去首尾空白', () => {
    const name = buildWorkflowName({ type: 'custom', level: 'L1', domain: '云-资源', product: ' e-cs ', func: ' a-b ' });
    expect(name).toBe('custom-L1-云资源-ecs-a-b');
  });

  it('空段会触发校验错误', () => {
    const errs = validateNameParts({ type: 'tmp', level: 'L1', domain: '云资源', product: '', func: '' });
    expect(errs.length).toBeGreaterThan(0);
  });
});

describe('suggestFuncSlug', () => {
  it('ASCII 转小写 snake_case', () => {
    expect(suggestFuncSlug('Create VM')).toBe('create_vm');
    expect(suggestFuncSlug('createVmFast')).toBe('create_vm_fast');
    expect(suggestFuncSlug('create-vm--now!')).toBe('create_vm_now');
    expect(suggestFuncSlug('  ')).toBe('');
  });

  it('含中文时保持原样，仅去掉 -', () => {
    expect(suggestFuncSlug('创建-云主机')).toBe('创建云主机');
    expect(suggestFuncSlug('创建 云主机')).toBe('创建_云主机');
  });
});

describe('buildSkeletonWorkflow', () => {
  it('生成骨架定义', () => {
    const def = buildSkeletonWorkflow({ name: 'tmp-L1-云资源-ecs-x', description: ' 说明 ' });
    expect(def).toEqual({
      name: 'tmp-L1-云资源-ecs-x',
      description: '说明',
      version: 1,
      schemaVersion: 2,
      tasks: [],
      inputParameters: [],
      outputParameters: {},
    });
  });

  it('有 ownerEmail 才写入', () => {
    expect(buildSkeletonWorkflow({ name: 'a', ownerEmail: 'a@b.c' }).ownerEmail).toBe('a@b.c');
    expect('ownerEmail' in buildSkeletonWorkflow({ name: 'a' })).toBe(false);
  });
});

describe('promotionTargetName / isPromotableName', () => {
  it('替换类型段', () => {
    expect(promotionTargetName('tmp-L2-云资源-ecs-create-vm', 'custom')).toBe('custom-L2-云资源-ecs-create-vm');
    expect(promotionTargetName('tmp-L2-云资源-ecs-x', 'std')).toBe('std-L2-云资源-ecs-x');
  });

  it('名称不合法返回 null', () => {
    expect(promotionTargetName('bad', 'std')).toBeNull();
    expect(promotionTargetName('xx-L1-a-b-c', 'std')).toBeNull();
  });

  it('只有 tmp 类型可申请上线', () => {
    expect(isPromotableName('tmp-L1-a-b-c')).toBe(true);
    expect(isPromotableName('custom-L1-a-b-c')).toBe(false);
    expect(isPromotableName('whatever')).toBe(false);
    expect(isPromotableName(undefined)).toBe(false);
  });
});

describe('nextPollDelay', () => {
  it('指数退避 2s → 30s 封顶', () => {
    expect([0, 1, 2, 3, 4, 5].map(nextPollDelay)).toEqual([2000, 4000, 8000, 16000, 30000, 30000]);
    expect(nextPollDelay(1000)).toBe(30000);
    expect(nextPollDelay(-3)).toBe(2000);
    expect(nextPollDelay(NaN)).toBe(2000);
  });
});

describe('promotion 状态与时间线', () => {
  it('终态判断', () => {
    expect(isTerminalPromotionState('SUBMITTED')).toBe(false);
    expect(isTerminalPromotionState('REVIEWING')).toBe(false);
    expect(isTerminalPromotionState('APPROVED')).toBe(false);
    expect(isTerminalPromotionState('REJECTED')).toBe(true);
    expect(isTerminalPromotionState('SYNCED')).toBe(true);
  });

  it('审批中：已提交完成、审批中进行、其余未到', () => {
    expect(buildPromotionTimeline('REVIEWING').map((t) => t.status)).toEqual(['done', 'current', 'pending', 'pending']);
    expect(buildPromotionTimeline(null).map((t) => t.status)).toEqual(['pending', 'pending', 'pending', 'pending']);
  });

  it('驳回：第三项为 failed，且没有「已同步」', () => {
    const t = buildPromotionTimeline('REJECTED');
    expect(t.map((x) => x.status)).toEqual(['done', 'done', 'failed']);
    expect(t.map((x) => x.state)).toEqual(['SUBMITTED', 'REVIEWING', 'REJECTED']);
  });

  it('审批通过：等待同步（第三项完成、第四项进行中）', () => {
    expect(buildPromotionTimeline('APPROVED').map((t) => t.status)).toEqual(['done', 'done', 'done', 'current']);
  });

  it('已同步：全部完成', () => {
    expect(buildPromotionTimeline('SYNCED').map((t) => t.status)).toEqual(['done', 'done', 'done', 'done']);
  });
});

describe('pollPromotion', () => {
  function seqProvider(states: PromotionStatus['state'][]) {
    let i = 0;
    return {
      calls: 0,
      async getPromotion(requestId: string): Promise<PromotionStatus> {
        this.calls += 1;
        const state = states[Math.min(i, states.length - 1)];
        i += 1;
        return { requestId, state, updatedAt: 'x' };
      },
    };
  }

  it('按退避间隔轮询到终态，并回调每次状态（APPROVED 之后继续到 SYNCED）', async () => {
    const provider = seqProvider(['SUBMITTED', 'REVIEWING', 'APPROVED', 'SYNCED']);
    const delays: number[] = [];
    const seen: string[] = [];
    const final = await pollPromotion({
      provider,
      requestId: 'r1',
      onUpdate: (s) => seen.push(s.state),
      sleep: async (ms) => { delays.push(ms); },
    });
    expect(final.state).toBe('SYNCED');
    expect(seen).toEqual(['SUBMITTED', 'REVIEWING', 'APPROVED', 'SYNCED']);
    expect(delays).toEqual([2000, 4000, 8000]);
    expect(provider.calls).toBe(4);
  });

  it('REJECTED 是终态', async () => {
    const provider = seqProvider(['SUBMITTED', 'REJECTED', 'SYNCED']);
    const final = await pollPromotion({ provider, requestId: 'r', sleep: async () => {} });
    expect(final.state).toBe('REJECTED');
    expect(provider.calls).toBe(2);
  });

  it('请求失败时抛出', async () => {
    const provider = { async getPromotion(): Promise<PromotionStatus> { throw new Error('boom'); } };
    let msg = '';
    try {
      await pollPromotion({ provider, requestId: 'r', sleep: async () => {} });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe('boom');
  });

  it('signal 中止后不再请求并抛 AbortError', async () => {
    const provider = seqProvider(['SUBMITTED']);
    const ac = new AbortController();
    let name = '';
    try {
      await pollPromotion({
        provider,
        requestId: 'r',
        signal: ac.signal,
        sleep: async () => { ac.abort(); },
      });
    } catch (e) {
      name = (e as Error).name;
    }
    expect(name).toBe('AbortError');
    expect(provider.calls).toBe(1);
  });
});

describe('wizardState', () => {
  it('初始草稿：有产品选已有；无产品进入登记；试用 tmp / 生产 custom', () => {
    const a = createInitialDraft({ trial: true, products: [ecs] });
    expect(a.productMode).toBe('existing');
    expect(a.productName).toBe('ecs');
    expect(a.domain).toBe('云资源');
    expect(a.type).toBe('tmp');
    const b = createInitialDraft({ trial: true, products: [] });
    expect(b.productMode).toBe('new');
    const c = createInitialDraft({ trial: false, products: [ecs] }, 'L1');
    expect(c.type).toBe('custom');
    expect(c.level).toBe('L1');
  });

  it('产品名校验', () => {
    expect(validateProductName('')).not.toBeNull();
    expect(validateProductName('a-b')).not.toBeNull();
    expect(validateProductName('a b')).not.toBeNull();
    expect(validateProductName('cmdb')).toBeNull();
  });

  it('第 1 步校验：已有产品 / 新产品 / 生产不可登记', () => {
    const ctx = { trial: true, products: [ecs] };
    const domains = ['云资源', '配置管理'];
    const d = createInitialDraft(ctx);
    expect(productStepError(d, ctx, domains)).toBeNull();
    expect(productStepError({ ...d, productName: 'nope' }, ctx, domains)).not.toBeNull();
    const n = { ...d, productMode: 'new' as const, productName: 'cmdb', domain: '配置管理' };
    expect(productStepError(n, ctx, domains)).toBeNull();
    expect(productStepError({ ...n, domain: '' }, ctx, domains)).not.toBeNull();
    expect(productStepError({ ...n, domain: '不存在' }, ctx, domains)).not.toBeNull();
    expect(productStepError(n, { trial: false, products: [ecs] }, domains)).not.toBeNull();
  });

  it('第 2 步校验：功能为空报错，填写后通过；试用环境类型强制 tmp', () => {
    const ctx = { trial: true, products: [ecs] };
    const domains = ['云资源'];
    const d = createInitialDraft(ctx);
    expect(namingStepErrors(d, true, domains).length).toBeGreaterThan(0);
    expect(canAdvance('naming', d, ctx, domains)).toBe(false);
    const ok = { ...d, func: 'create_vm', type: 'std' as const };
    expect(draftToNameParts(ok, true).type).toBe('tmp');
    expect(namingStepErrors(ok, true, domains)).toEqual([]);
    expect(canAdvance('naming', ok, ctx, domains)).toBe(true);
    // 业务域不在列表中
    expect(namingStepErrors({ ...ok, domain: '别的' }, true, domains).length).toBeGreaterThan(0);
  });

  it('步骤前进后退不越界；起点选项随回调出现', () => {
    expect(nextStep('product')).toBe('naming');
    expect(nextStep('start')).toBe('start');
    expect(prevStep('naming')).toBe('product');
    expect(prevStep('product')).toBe('product');
    expect(availableSources({ hasTemplate: false, hasImport: false })).toEqual(['blank']);
    expect(availableSources({ hasTemplate: true, hasImport: true })).toEqual(['blank', 'template', 'import']);
  });
});
