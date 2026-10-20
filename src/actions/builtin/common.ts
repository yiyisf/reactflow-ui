import type { ActionDefinition } from '../types';

export const notifySendMessageAction: ActionDefinition = {
  id: 'notify.send_message',
  name: '发送运维通知',
  category: 'notify',
  icon: '📢',
  description: '向指定运维协同群（钉钉/企微/飞书）或负责人发送通知卡片',
  riskLevel: 'safe',
  fields: [
    {
      key: 'channel',
      label: '通知渠道',
      type: 'select',
      required: true,
      defaultValue: 'webhook_dingtalk',
      options: [
        { label: '钉钉运维机器人 (DingTalk)', value: 'webhook_dingtalk' },
        { label: '企业微信机器人 (WeCom)', value: 'webhook_wecom' },
        { label: '飞书群机器人 (Lark/Feishu)', value: 'webhook_feishu' },
        { label: '运维邮件 (Email)', value: 'email' },
      ],
    },
    {
      key: 'title',
      label: '通知标题',
      type: 'text',
      placeholder: '例如: 【生产告警】云主机 CPU 负载过高',
      defaultValue: '【云平台通知】运维自动化工作流执行汇报',
      required: true,
      acceptsPills: true,
    },
    {
      key: 'content',
      label: '消息正文内容',
      type: 'textarea',
      placeholder: '支持输入文字，或键入 @ 插入上游实例 ID / IP 等数据胶囊',
      defaultValue: '主机实例已成功处理完成，请相关人员知悉。',
      required: true,
      acceptsPills: true,
    },
  ],
  outputs: [
    { key: 'messageId', label: '消息追踪ID', type: 'string', example: 'msg_994200' },
    { key: 'sentStatus', label: '发送状态', type: 'string', example: 'DELIVERED' },
    { key: 'sentAt', label: '送达时间', type: 'string', example: '2026-10-20T14:35:00Z' },
  ],
  compile: (values, ctx) => ({
    name: 'send_operation_notification',
    taskReferenceName: ctx.taskReferenceName,
    type: 'EVENT',
    description: `发送通知: ${values.title || ctx.taskReferenceName}`,
    inputParameters: {
      _actionId: 'notify.send_message',
      actionName: '发送运维通知',
      channel: values.channel ?? 'webhook_dingtalk',
      title: values.title,
      content: values.content,
    },
  }),
  decompile: (task) => {
    if (task.inputParameters?._actionId === 'notify.send_message') {
      return {
        channel: task.inputParameters.channel ?? 'webhook_dingtalk',
        title: task.inputParameters.title ?? '',
        content: task.inputParameters.content ?? '',
      };
    }
    return null;
  },
  mockOutput: (values) => ({
    messageId: `msg-${Date.now().toString(36)}`,
    channel: values.channel,
    sentStatus: 'DELIVERED',
    sentAt: new Date().toISOString(),
  }),
};

export const humanApprovalAction: ActionDefinition = {
  id: 'human.approval',
  name: '人工确认 / 审批',
  category: 'human',
  icon: '👤',
  description: '在执行高危变动或财务扣费前，暂停流程并等待指定责任人点击确认',
  riskLevel: 'safe',
  fields: [
    {
      key: 'assigneeRole',
      label: '审批责任角色',
      type: 'select',
      required: true,
      defaultValue: 'devops_lead',
      options: [
        { label: '运维负责人 (DevOps Lead)', value: 'devops_lead' },
        { label: '架构师 (Architect)', value: 'architect' },
        { label: '安全管理员 (SecOps)', value: 'secops' },
        { label: '项目经理 (PM)', value: 'pm' },
      ],
    },
    {
      key: 'promptMessage',
      label: '审批确认说明',
      type: 'textarea',
      placeholder: '请输入需要审批人重点核对的信息（支持 @ 插入参数）',
      defaultValue: '请核实即将执行的高危变更操作，确认无误后点击批准。',
      required: true,
      acceptsPills: true,
    },
    {
      key: 'timeoutMinutes',
      label: '超时自动处理',
      type: 'select',
      defaultValue: 60,
      options: [
        { label: '30 分钟无响应自动拒绝', value: 30 },
        { label: '60 分钟无响应自动拒绝', value: 60 },
        { label: '24 小时等待', value: 1440 },
      ],
    },
  ],
  outputs: [
    { key: 'approved', label: '审批结果', type: 'boolean', example: true },
    { key: 'reviewer', label: '审批人', type: 'string', example: 'zhangsan@cloud.com' },
    { key: 'comment', label: '审批意见', type: 'string', example: '已核实变更方案，同意执行' },
    { key: 'decisionTime', label: '审批时间', type: 'string', example: '2026-10-20T14:40:00Z' },
  ],
  compile: (values, ctx) => ({
    name: 'human_operation_approval',
    taskReferenceName: ctx.taskReferenceName,
    type: 'HUMAN',
    description: `人工审批: ${values.promptMessage || ctx.taskReferenceName}`,
    inputParameters: {
      _actionId: 'human.approval',
      actionName: '人工确认 / 审批',
      assigneeRole: values.assigneeRole ?? 'devops_lead',
      promptMessage: values.promptMessage,
      timeoutMinutes: Number(values.timeoutMinutes ?? 60),
    },
  }),
  decompile: (task) => {
    if (task.inputParameters?._actionId === 'human.approval') {
      return {
        assigneeRole: task.inputParameters.assigneeRole ?? 'devops_lead',
        promptMessage: task.inputParameters.promptMessage ?? '',
        timeoutMinutes: task.inputParameters.timeoutMinutes ?? 60,
      };
    }
    return null;
  },
  mockOutput: (_values) => ({
    approved: true,
    reviewer: 'devops_lead@internal.cloud',
    comment: '沙盒模拟快速通过',
    decisionTime: new Date().toISOString(),
  }),
};

export const controlWaitAction: ActionDefinition = {
  id: 'control.wait',
  name: '等待缓冲',
  category: 'logic',
  icon: '⏳',
  description: '在两个步骤之间暂停等待一段时间（等待系统自检、镜像就绪等）',
  riskLevel: 'safe',
  fields: [
    {
      key: 'duration',
      label: '等待时长',
      type: 'select',
      required: true,
      defaultValue: '10s',
      options: [
        { label: '等待 5 秒 (5s)', value: '5s' },
        { label: '等待 10 秒 (10s)', value: '10s' },
        { label: '等待 30 秒 (30s)', value: '30s' },
        { label: '等待 1 分钟 (1m)', value: '1m' },
        { label: '等待 5 分钟 (5m)', value: '5m' },
      ],
    },
  ],
  outputs: [
    { key: 'waited', label: '是否已就绪', type: 'boolean', example: true },
    { key: 'duration', label: '实际等待时长', type: 'string', example: '10s' },
  ],
  compile: (values, ctx) => ({
    name: 'wait_step',
    taskReferenceName: ctx.taskReferenceName,
    type: 'WAIT',
    description: `等待 ${values.duration || '10s'}`,
    inputParameters: {
      _actionId: 'control.wait',
      actionName: '等待缓冲',
      duration: values.duration ?? '10s',
    },
  }),
  decompile: (task) => {
    if (task.inputParameters?._actionId === 'control.wait') {
      return { duration: task.inputParameters.duration ?? '10s' };
    }
    if (task.type === 'WAIT') {
      return { duration: task.inputParameters?.duration ?? '10s' };
    }
    return null;
  },
  mockOutput: (values) => ({
    waited: true,
    duration: values.duration || '10s',
  }),
};

export const controlDecisionAction: ActionDefinition = {
  id: 'control.decision',
  name: '条件分支',
  category: 'logic',
  icon: '🔀',
  description: '根据输入参数或上下文表达式，精准分流执行不同业务分支',
  riskLevel: 'safe',
  fields: [
    {
      key: 'caseParam',
      label: '分支判断参数',
      type: 'text',
      required: true,
      defaultValue: 'status',
      placeholder: '例如 status 或 userType',
      acceptsPills: true,
    },
  ],
  outputs: [
    { key: 'selectedCase', label: '命中的分支名称', type: 'string', example: 'premium' },
  ],
  compile: (values, ctx) => ({
    name: 'decision_router',
    taskReferenceName: ctx.taskReferenceName,
    type: 'DECISION',
    caseValueParam: values.caseParam || 'status',
    decisionCases: {},
    defaultCase: [],
    inputParameters: {
      _actionId: 'control.decision',
      actionName: '条件分支',
      [values.caseParam || 'status']: values[values.caseParam || 'status'] ?? '${workflow.input.status}',
    },
  }),
  decompile: (task) => {
    if (task.type === 'DECISION' || task.type === 'SWITCH') {
      return { caseParam: task.caseValueParam || 'status' };
    }
    return null;
  },
  mockOutput: () => ({
    selectedCase: 'SUCCESS',
  }),
};

export const controlForkAction: ActionDefinition = {
  id: 'control.fork',
  name: '并行并发组',
  category: 'logic',
  icon: '⚡',
  description: '同时并发执行多条独立业务泳道，并在全部完成后汇聚向下流转',
  riskLevel: 'safe',
  fields: [],
  outputs: [
    { key: 'lanesCompleted', label: '已完成泳道数', type: 'number', example: 2 },
  ],
  compile: (_values, ctx) => ({
    name: 'fork_parallel',
    taskReferenceName: ctx.taskReferenceName,
    type: 'FORK_JOIN',
    forkTasks: [],
    inputParameters: {
      _actionId: 'control.fork',
      actionName: '并行并发组',
    },
  }),
  decompile: (task) => {
    if (task.type === 'FORK_JOIN' || task.type === 'FORK_JOIN_DYNAMIC') {
      return {};
    }
    return null;
  },
  mockOutput: () => ({
    lanesCompleted: 2,
  }),
};

export const controlLoopAction: ActionDefinition = {
  id: 'control.loop',
  name: '循环迭代',
  category: 'logic',
  icon: '🔁',
  description: '重复循环执行内部步骤，直到满足退出条件或达到最大轮次',
  riskLevel: 'safe',
  fields: [
    {
      key: 'loopCondition',
      label: '循环继续条件表达式',
      type: 'text',
      required: true,
      defaultValue: '$.status == "PENDING"',
      placeholder: '例如 $.status == "PENDING"',
      acceptsPills: true,
    },
  ],
  outputs: [
    { key: 'iterationCount', label: '实际迭代轮次', type: 'number', example: 3 },
  ],
  compile: (values, ctx) => ({
    name: 'do_while_loop',
    taskReferenceName: ctx.taskReferenceName,
    type: 'DO_WHILE',
    loopCondition: values.loopCondition || 'false',
    loopOver: [],
    inputParameters: {
      _actionId: 'control.loop',
      actionName: '循环迭代',
      loopCondition: values.loopCondition || 'false',
    },
  }),
  decompile: (task) => {
    if (task.type === 'DO_WHILE') {
      return { loopCondition: task.loopCondition || '' };
    }
    return null;
  },
  mockOutput: () => ({
    iterationCount: 3,
  }),
};

export const BUILTIN_COMMON_ACTIONS: ActionDefinition[] = [
  notifySendMessageAction,
  humanApprovalAction,
  controlWaitAction,
  controlDecisionAction,
  controlForkAction,
  controlLoopAction,
];
