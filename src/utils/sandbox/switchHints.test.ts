import { describe, it, expect } from 'vitest';
import { getSwitchRoutingHint } from './switchHints';
import type { TaskDef } from '../../types/conductor';

const cases = { vip: [], normal: [] };

describe('S14: 配置台识别 SWITCH 的判断依据', () => {
    it('[S14-01] 1.3.1 写法：value-param + expression 是参数名', () => {
        const hint = getSwitchRoutingHint({
            name: 'route', taskReferenceName: 'route', type: 'SWITCH', evaluatorType: 'value-param', expression: 'level',
            inputParameters: { level: '${workflow.input.customerLevel}' }, decisionCases: cases,
        } as TaskDef);
        expect(hint).toMatchObject({ inputField: 'customerLevel', evaluator: 'value-param', cases: ['vip', 'normal'] });
    });

    it('[S14-02] 旧写法 caseValueParam 与 DECISION 仍识别', () => {
        expect(getSwitchRoutingHint({
            name: 's', taskReferenceName: 's', type: 'SWITCH', caseValueParam: 'ch', inputParameters: { ch: '${workflow.input.channel}' }, decisionCases: cases,
        } as TaskDef)?.inputField).toBe('channel');
        expect(getSwitchRoutingHint({
            name: 'd', taskReferenceName: 'd', type: 'DECISION', caseValueParam: 'ch', inputParameters: { ch: '${workflow.input.channel}' }, decisionCases: cases,
        } as TaskDef)?.inputField).toBe('channel');
    });

    it('[S14-03] javascript 判断只提供强制分支；取值不是直接引用入参时也不给入参切换', () => {
        expect(getSwitchRoutingHint({
            name: 'j', taskReferenceName: 'j', type: 'SWITCH', evaluatorType: 'javascript', expression: '$.x > 1 ? "vip" : "normal"',
            inputParameters: { x: '${workflow.input.x}' }, decisionCases: cases,
        } as TaskDef)).toMatchObject({ inputField: null, evaluator: 'javascript' });
        expect(getSwitchRoutingHint({
            name: 'u', taskReferenceName: 'u', type: 'SWITCH', evaluatorType: 'value-param', expression: 'level',
            inputParameters: { level: '${lookup.output.level}' }, decisionCases: cases,
        } as TaskDef)).toMatchObject({ inputField: null, evaluator: 'value-param' });
    });

    it('没有分支或不是条件任务时不提示', () => {
        expect(getSwitchRoutingHint({ name: 'n', taskReferenceName: 'n', type: 'NOOP' } as TaskDef)).toBeNull();
        expect(getSwitchRoutingHint({ name: 's', taskReferenceName: 's', type: 'SWITCH', decisionCases: {} } as TaskDef)).toBeNull();
    });
});
