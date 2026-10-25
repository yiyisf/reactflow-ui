import { describe, it, expect } from 'vitest';
import { classifyIntent, type Intent } from './intentClassifier';

/**
 * 内置快捷指令（AiCommandCenter 的欢迎 / 运行态 / 节点 chips 与场景模板）必须分到正确的意图，
 * 否则系统提示词给模型的策略提示是错的（如把"改成并行"当成修改字段）。
 */
describe('classifyIntent — 内置快捷指令', () => {
    const ref = 'check_stock';
    const cases: Array<[string, Intent]> = [
        // 欢迎 chips（空画布 / 已有流程）
        ['从零创建一个用户注册通知流程', 'CREATE'],
        ['设计一个 CI/CD 部署流水线', 'CREATE'],
        ['创建一个带人工审批的申请流程', 'CREATE'],
        ['帮我设计一个数据处理管道', 'CREATE'],
        ['帮我创建一个使用「创建虚机」的工作流', 'CREATE'],
        ['组合「审批」和审批步骤成一个完整流程', 'CREATE'],
        ['解读一下当前工作流的业务逻辑', 'EXPLAIN'],
        ['检查并修复当前工作流的问题', 'DEBUG'],
        ['为当前流程添加失败重试机制', 'MODIFY'],
        ['把当前流程改成并行执行', 'REFACTOR'],
        // 运行态 chips
        [`分析「${ref}」的失败原因`, 'DEBUG'],
        ['为所有失败的任务生成修复方案', 'DEBUG'],
        ['总结本次执行的完整过程', 'EXPLAIN'],
        ['生成「order_flow」本次执行的摘要报告', 'EXPLAIN'],
        ['对比工作流设计与实际执行路径', 'EXPLAIN'],
        ['有哪些任务耗时较长，如何优化？', 'OPTIMIZE'],
        [`解释「order_flow」当前的执行进度`, 'EXPLAIN'],
        // 节点 chips
        [`分析「${ref}」失败的根本原因`, 'DEBUG'],
        [`为「${ref}」的失败生成修复建议`, 'DEBUG'],
        [`修复「${ref}」的 2 个校验错误`, 'DEBUG'],
        [`解释「${ref}」节点的作用`, 'EXPLAIN'],
        [`查看「${ref}」的输入和输出数据`, 'EXPLAIN'],
        [`说明「${ref}」子工作流的输入输出`, 'EXPLAIN'],
        [`修改「${ref}」的请求参数和输出映射`, 'MODIFY'],
        [`调整「${ref}」的审批超时和通知方式`, 'MODIFY'],
        [`为「${ref}」增加一个分支条件`, 'ADD'],
        [`在「${ref}」的并行分支中添加新任务`, 'ADD'],
        [`在「${ref}」之后插入一个新任务`, 'ADD'],
        // 场景模板（含"并行""设为"等字眼，但都是新建）
        ['创建一个消息通知工作流：接收事件、处理数据、并行发送邮件和短信通知', 'CREATE'],
        ['创建一个CI/CD部署流水线：代码检出、构建镜像、单元测试、推送镜像、部署发布', 'CREATE'],
        ['创建一个AI辅助内容审核流程：提交内容、AI初审打分、条件分支（分数低则人工复核）、发布或拒绝', 'CREATE'],
        // 失败卡片
        [`「${ref}」执行失败，请诊断失败原因并生成修复方案`, 'DEBUG'],
    ];

    it.each(cases)('"%s" → %s', (input, expected) => {
        expect(classifyIntent(input)).toBe(expected);
    });
});
