/**
 * AI Intent Classifier — 本地规则快速分类用户意图
 *
 * 不消耗 AI token，通过关键词匹配快速判断用户输入的意图类型，
 * 用于动态调整上下文注入粒度和 prompt 模板。
 */

export type Intent =
    | 'CREATE'    // 从零创建工作流
    | 'ADD'       // 新增节点
    | 'MODIFY'    // 修改属性
    | 'DELETE'    // 删除节点
    | 'REFACTOR'  // 重构拓扑
    | 'EXPLAIN'   // 解释说明
    | 'DEBUG'     // 调试/诊断
    | 'OPTIMIZE'  // 优化建议
    | 'GENERAL'   // 通用/兜底
    | 'VAGUE';    // 意图模糊，需要澄清

interface IntentRule {
    intent: Intent;
    keywords: string[];
    patterns?: RegExp[];
}

const RULES: IntentRule[] = [
    {
        intent: 'CREATE',
        keywords: ['创建', '新建', '生成', '设计', '搭建', '构建'],
        patterns: [/创建.*流程/, /生成.*工作流/, /设计.*workflow/, /从零/],
    },
    {
        intent: 'ADD',
        keywords: ['添加', '加一个', '新增', '插入', '追加'],
        patterns: [/加.*任务/, /添加.*节点/, /插入.*后面/, /增加/],
    },
    {
        intent: 'DELETE',
        keywords: ['删除', '移除', '去掉', '删掉', '干掉'],
        patterns: [/删[除掉]/, /移除/, /去掉/],
    },
    {
        intent: 'MODIFY',
        keywords: ['修改', '更改', '设置', '把…改', '调整', '配置', '设为', '改为', '改成'],
        patterns: [/[改设].*为/, /[改设].*成/, /修改/, /超时/, /重试/],
    },
    {
        intent: 'REFACTOR',
        keywords: ['重构', '并行', '串行', '拆分', '合并', '改成并行', '改成串行'],
        patterns: [/改成并行/, /改成串行/, /拆分/, /合并/, /重构/],
    },
    {
        intent: 'EXPLAIN',
        keywords: ['解释', '说明', '什么意思', '怎么理解', '是什么', '做什么', '介绍', '讲解', '分析', '描述', '详细', '字段', '作用', '干嘛', '有哪些', '告诉我'],
        patterns: [/解释/, /什么意思/, /干什么/, /是什么/, /怎么[理解工作]/, /介绍.*[流程任务]/, /详细.*[介绍说明参数]/, /[参数字段].*[是什么有哪些]/, /这个.*[是干做]/, /有什么[参数字段属性]/],
    },
    {
        intent: 'DEBUG',
        keywords: ['失败', '错误', '为什么', '报错', '异常', '不工作', '问题'],
        patterns: [/为什么.*失败/, /出[了]?错/, /报错/, /不[工作|运行]/, /怎么回事/],
    },
    {
        intent: 'OPTIMIZE',
        keywords: ['优化', '改进', '提升', '性能', '最佳实践', '建议'],
        patterns: [/优化/, /改进/, /有什么建议/, /最佳实践/],
    },
];

const VAGUE_PREFIXES = ['帮我', '做一个', '来个', '弄个', '需要一个'];
const VAGUE_GENERIC_NOUNS = ['流程', '工作流', '自动化'];

/**
 * 对用户输入进行意图分类
 */
export function classifyIntent(input: string): Intent {
    const normalized = input.toLowerCase().trim();

    // 先检查正则模式（更精准）
    for (const rule of RULES) {
        if (rule.patterns) {
            for (const pattern of rule.patterns) {
                if (pattern.test(normalized)) return rule.intent;
            }
        }
    }

    // 再检查关键词（更宽泛）
    for (const rule of RULES) {
        for (const kw of rule.keywords) {
            if (normalized.includes(kw)) return rule.intent;
        }
    }

    // 意图模糊检测（在 GENERAL 兜底之前）

    // 短输入（< 12 字符）且未匹配任何明确意图
    if (normalized.length < 12) return 'VAGUE';

    // 含模糊前缀但没有清晰的领域上下文
    const hasVaguePrefix = VAGUE_PREFIXES.some(p => normalized.includes(p));
    if (hasVaguePrefix) {
        const withoutPrefix = VAGUE_PREFIXES.reduce((s, p) => s.replace(p, ''), normalized).trim();
        const onlyGenericNouns = VAGUE_GENERIC_NOUNS.some(n => withoutPrefix === n || withoutPrefix === n + '。' || withoutPrefix === n + '?');
        if (onlyGenericNouns || withoutPrefix.length <= 4) return 'VAGUE';
    }

    // 仅含通用名词，无主语/场景
    const isOnlyGenericNoun = VAGUE_GENERIC_NOUNS.some(n =>
        normalized === n || normalized === `一个${n}` || normalized === `个${n}`
    );
    if (isOnlyGenericNoun) return 'VAGUE';

    return 'GENERAL';
}

/**
 * 根据意图决定上下文注入粒度
 */
export function getContextOptions(intent: Intent): { includeFull: boolean } {
    switch (intent) {
        case 'CREATE':
            return { includeFull: false };   // 创建无需上下文
        case 'REFACTOR':
        case 'OPTIMIZE':
        case 'DEBUG':
            return { includeFull: true };    // 需要全量上下文
        case 'VAGUE':
            return { includeFull: false };   // 意图模糊，精简上下文即可
        default:
            return { includeFull: false };   // 精简上下文即可
    }
}
