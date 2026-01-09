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
    Zap
} from 'lucide-react';

export type TaskCategory = 'CORE' | 'SYSTEM' | 'FLOW';

export interface TaskTypeConfig {
    type: string;
    label: string;
    description: string;
    category: TaskCategory;
    icon: any;
    defaultData?: any;
}

export const TASK_TYPES: TaskTypeConfig[] = [
    // Core/Custom Tasks
    {
        type: 'SIMPLE',
        label: '任务节点 (Worker)',
        description: '在远程 Worker 上执行的任务',
        category: 'CORE',
        icon: Activity
    },
    {
        type: 'SUB_WORKFLOW',
        label: '子工作流 (Sub Workflow)',
        description: '调用并执行另一个工作流',
        category: 'CORE',
        icon: GitMerge
    },

    // System Tasks
    {
        type: 'HTTP',
        label: 'HTTP 请求',
        description: '发起 REST/HTTP 调用',
        category: 'SYSTEM',
        icon: Globe
    },
    {
        type: 'JSON_JQ_TRANSFORM',
        label: 'JSON 转换 (JQ)',
        description: '使用 JQ 表达式转换 JSON 数据',
        category: 'SYSTEM',
        icon: Terminal
    },
    {
        type: 'KAFKA_PUBLISH',
        label: 'Kafka 推送',
        description: '向 Kafka 主题推送消息',
        category: 'SYSTEM',
        icon: MessageSquare
    },
    {
        type: 'EVENT',
        label: '事件 (Event)',
        description: '向外部队列系统发布事件',
        category: 'SYSTEM',
        icon: Zap
    },
    {
        type: 'WAIT',
        label: '等待 (Wait)',
        description: '暂停流程，直到特定时间或时长',
        category: 'SYSTEM',
        icon: Clock
    },
    {
        type: 'SET_VARIABLE',
        label: '设置变量 (Set Variable)',
        description: '设置工作流上下文变量',
        category: 'SYSTEM',
        icon: Database
    },
    {
        type: 'TERMINATE',
        label: '终止 (Terminate)',
        description: '提前结束工作流执行',
        category: 'SYSTEM',
        icon: StopCircle
    },

    // Flow Control
    {
        type: 'DECISION',
        label: '判断 (Switch)',
        description: '基于条件的逻辑分支 (Switch/Case)',
        category: 'FLOW',
        icon: Shuffle
    },
    {
        type: 'FORK_JOIN',
        label: '并行分支 (Fork)',
        description: '并行执行多个任务分支',
        category: 'FLOW',
        icon: GitBranch
    },
    {
        type: 'DO_WHILE',
        label: '循环 (Do-While)',
        description: '循环执行直到满足条件',
        category: 'FLOW',
        icon: Repeat
    },
    {
        type: 'JOIN',
        label: '汇聚 (Join)',
        description: '等待并行分支执行完成',
        category: 'FLOW',
        icon: GitMerge
    }
];

export const TASK_CATEGORIES: { key: TaskCategory; label: string }[] = [
    { key: 'CORE', label: '基础任务' },
    { key: 'FLOW', label: '逻辑控制' },
    { key: 'SYSTEM', label: '系统集成' },
];
