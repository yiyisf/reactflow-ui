import {
    Activity,
    Globe,
    Terminal,
    GitBranch,
    GitMerge,
    Repeat,
    Shuffle,
    StopCircle,
    Clock,
    MessageSquare,
    Database,
    Zap,
    Code2,
    Play,
    User,
    Minus
} from 'lucide-react';
import { ViewMode } from '../types/workflow';

export type TaskCategory = 'CORE' | 'SYSTEM' | 'FLOW';

/** 视图模式下的可见分类 */
export type ViewCategory = 'business' | 'control' | 'data';

export interface TaskTypeConfig {
    type: string;
    label: string;
    description: string;
    category: TaskCategory;
    icon: any;
    hidden?: boolean;
    /** 视图模式分类：business=核心业务节点，control=控制流节点，data=数据转换节点 */
    viewCategory: ViewCategory;
}

/** 各视图模式下可见的 viewCategory 列表 */
export const CATEGORY_VISIBILITY: Record<ViewMode, ViewCategory[]> = {
    business: ['business'],
    standard: ['business', 'control'],
    developer: ['business', 'control', 'data'],
};

export const TASK_TYPES: TaskTypeConfig[] = [
    // Core/Custom Tasks
    {
        type: 'SIMPLE',
        label: '任务节点 (Worker)',
        description: '在远程 Worker 上执行的任务',
        category: 'CORE',
        icon: Activity,
        viewCategory: 'business',
    },
    {
        type: 'SUB_WORKFLOW',
        label: '子工作流 (Sub Workflow)',
        description: '调用并执行另一个工作流',
        category: 'CORE',
        icon: GitMerge,
        viewCategory: 'business',
    },
    {
        type: 'START_WORKFLOW',
        label: '启动工作流 (Start Workflow)',
        description: '启动另一个工作流（不等待结果）',
        category: 'SYSTEM',
        icon: Play,
        viewCategory: 'business',
    },

    // System Tasks
    {
        type: 'HTTP',
        label: 'HTTP 请求',
        description: '发起 REST/HTTP 调用',
        category: 'SYSTEM',
        icon: Globe,
        viewCategory: 'business',
    },
    {
        type: 'INLINE',
        label: '内联脚本 (Inline)',
        description: '执行内联脚本（JS/Python/GraalJS）',
        category: 'SYSTEM',
        icon: Code2,
        viewCategory: 'data',
    },
    {
        type: 'JSON_JQ_TRANSFORM',
        label: 'JSON 转换 (JQ)',
        description: '使用 JQ 表达式转换 JSON 数据',
        category: 'SYSTEM',
        icon: Terminal,
        viewCategory: 'data',
    },
    {
        type: 'KAFKA_PUBLISH',
        label: 'Kafka 推送',
        description: '向 Kafka 主题推送消息',
        category: 'SYSTEM',
        icon: MessageSquare,
        viewCategory: 'data',
    },
    {
        type: 'EVENT',
        label: '事件 (Event)',
        description: '向外部队列系统发布事件',
        category: 'SYSTEM',
        icon: Zap,
        viewCategory: 'data',
    },
    {
        type: 'WAIT',
        label: '等待 (Wait)',
        description: '暂停流程，直到特定时间或时长',
        category: 'SYSTEM',
        icon: Clock,
        viewCategory: 'control',
    },
    {
        type: 'SET_VARIABLE',
        label: '设置变量 (Set Variable)',
        description: '设置工作流上下文变量',
        category: 'SYSTEM',
        icon: Database,
        viewCategory: 'data',
    },
    {
        type: 'TERMINATE',
        label: '终止 (Terminate)',
        description: '提前结束工作流执行',
        category: 'SYSTEM',
        icon: StopCircle,
        viewCategory: 'control',
    },
    {
        type: 'HUMAN',
        label: '人工审批 (Human)',
        description: '等待人工审核或表单提交',
        category: 'SYSTEM',
        icon: User,
        viewCategory: 'business',
    },
    {
        type: 'DYNAMIC',
        label: '动态任务 (Dynamic)',
        description: '运行时动态决定任务类型',
        category: 'SYSTEM',
        icon: Shuffle,
        viewCategory: 'data',
    },
    {
        type: 'NOOP',
        label: '空操作 (Noop)',
        description: '占位符任务，无实际操作',
        category: 'SYSTEM',
        icon: Minus,
        viewCategory: 'data',
    },
    // LAMBDA 保留但隐藏，兼容旧数据
    {
        type: 'LAMBDA',
        label: 'Lambda 脚本 (旧)',
        description: '已被 INLINE 取代',
        category: 'SYSTEM',
        icon: Code2,
        hidden: true,
        viewCategory: 'data',
    },

    // Flow Control
    {
        type: 'SWITCH',
        label: '条件分支 (Switch)',
        description: '基于条件的逻辑分支 (Switch/Case)',
        category: 'FLOW',
        icon: Shuffle,
        viewCategory: 'control',
    },
    {
        type: 'DECISION',
        label: '判断 (Decision，旧)',
        description: '基于条件的逻辑分支（旧版，推荐改用 Switch）',
        category: 'FLOW',
        icon: Shuffle,
        hidden: true,
        viewCategory: 'control',
    },
    {
        type: 'FORK_JOIN',
        label: '静态并行 (Fork)',
        description: '并行执行多个预定义任务分支',
        category: 'FLOW',
        icon: GitBranch,
        viewCategory: 'control',
    },
    {
        type: 'FORK_JOIN_DYNAMIC',
        label: '动态并行 (Dynamic Fork)',
        description: '运行时动态生成并行分支',
        category: 'FLOW',
        icon: GitBranch,
        viewCategory: 'control',
    },
    {
        type: 'DO_WHILE',
        label: '循环 (Do-While)',
        description: '循环执行直到满足条件',
        category: 'FLOW',
        icon: Repeat,
        viewCategory: 'control',
    },
    {
        type: 'JOIN',
        label: '汇聚 (Join)',
        description: '等待所有并行分支执行完成',
        category: 'FLOW',
        icon: GitMerge,
        viewCategory: 'control',
    }
];

export const TASK_CATEGORIES: { key: TaskCategory; label: string }[] = [
    { key: 'CORE', label: '基础任务' },
    { key: 'FLOW', label: '逻辑控制' },
    { key: 'SYSTEM', label: '系统集成' },
];
