import type { WorkflowTemplate } from '../types';

/**
 * 模板 1: 云主机自动化交付与环境配置
 */
export const templateEcsAutoProvision: WorkflowTemplate = {
  id: 'tpl_ecs_auto_provision',
  version: '1.0.0',
  title: '云主机自动化交付与环境配置',
  category: 'compute',
  icon: 'rocket',
  valueProposition: '一键完成主机创建、运行时环境自动化部署、基线快照与交付群通知，单次节省 35 分钟手工操作。',
  description: '面向新业务系统上线场景，自动根据指定规格在云平台创建云主机，通过远程免密脚本自动安装 Docker 与运行时依赖，并在验证就绪后自动归档基线快照向运维协同群发送交付卡片。',
  connectors: ['cloud_host', 'dingtalk'],
  roi: {
    minutesSavedPerRun: 35,
    typicalRunsPerWeek: 12,
  },
  difficulty: 'starter',
  variables: [
    {
      key: 'instanceName',
      label: '新主机名称',
      type: 'text',
      defaultValue: 'app-service-prod',
      required: true,
      placeholder: '例如: app-service-prod',
      bindings: ['tasks[0].inputParameters.instanceName'],
    },
    {
      key: 'regionId',
      label: '目标地域',
      type: 'select',
      defaultValue: 'cn-hangzhou',
      required: true,
      options: [
        { label: '华东 1 (杭州)', value: 'cn-hangzhou' },
        { label: '华北 2 (北京)', value: 'cn-beijing' },
        { label: '华南 1 (深圳)', value: 'cn-shenzhen' },
      ],
      bindings: ['tasks[0].inputParameters.regionId'],
    },
    {
      key: 'notifyChannel',
      label: '交付通知渠道',
      type: 'select',
      defaultValue: 'webhook_dingtalk',
      required: true,
      options: [
        { label: '钉钉运维机器人 (DingTalk)', value: 'webhook_dingtalk' },
        { label: '企业微信机器人 (WeCom)', value: 'webhook_wecom' },
        { label: '飞书群机器人 (Feishu/Lark)', value: 'webhook_feishu' },
      ],
      bindings: ['tasks[4].inputParameters.channel'],
    },
  ],
  definition: {
    name: 'ecs_auto_provision_flow',
    description: '云主机全自动交付与运行时环境部署',
    version: 1,
    tasks: [
      {
        name: 'ecs_create_instance',
        taskReferenceName: 'create_node',
        type: 'HTTP',
        description: '创建计算型云主机',
        inputParameters: {
          _actionId: 'ecs.create_instance',
          instanceName: 'app-service-prod',
          regionId: 'cn-hangzhou',
          instanceType: 'ecs.c7.xlarge',
          imageId: 'image-alilinux-3',
          systemDiskSize: 120,
        },
      },
      {
        name: 'wait_for_network',
        taskReferenceName: 'wait_network_ready',
        type: 'WAIT',
        description: '等待网络与底层系统完成自检',
        inputParameters: {
          _actionId: 'control.wait',
          duration: '10s',
        },
      },
      {
        name: 'ecs_run_command',
        taskReferenceName: 'install_runtime',
        type: 'HTTP',
        description: '免密下发初始化命令: 安装 Docker 与守护进程',
        inputParameters: {
          _actionId: 'ecs.run_command',
          instanceId: '${create_node.output.instanceId}',
          commandContent: 'yum update -y && systemctl start docker && docker info',
          commandType: 'RunShellScript',
          timeoutSeconds: 60,
        },
      },
      {
        name: 'ecs_create_snapshot',
        taskReferenceName: 'create_baseline_snap',
        type: 'HTTP',
        description: '创建系统盘基线快照',
        inputParameters: {
          _actionId: 'ecs.create_snapshot',
          instanceId: '${create_node.output.instanceId}',
          snapshotName: 'baseline-init-snapshot',
          retentionDays: 30,
        },
      },
      {
        name: 'send_operation_notification',
        taskReferenceName: 'notify_devops',
        type: 'EVENT',
        sink: 'conductor',
        description: '向运维协同群发送交付卡片',
        inputParameters: {
          _actionId: 'notify.send_message',
          channel: 'webhook_dingtalk',
          title: '【交付就绪】新云主机已部署完成',
          content: '云主机 ${create_node.output.instanceId} 已创建并完成 Docker 运行时初始化与安全基线快照，内网IP: ${create_node.output.privateIp}。',
        },
      },
    ],
  },
  mockDataset: {
    scenarios: [
      {
        name: '标准交付场景',
        description: '模拟一次完整的 4C8G 主机自动交付与脚本安装过程',
        workflowInput: {},
        taskOutputs: {
          create_node: {
            instanceId: 'i-bp18a9z3j42m09a',
            instanceName: 'app-service-prod',
            privateIp: '172.16.0.42',
            status: 'RUNNING',
            createdAt: '2026-10-20T14:00:00Z',
          },
          wait_network_ready: { waited: true, duration: '10s' },
          install_runtime: { exitCode: 0, status: 'SUCCESS', output: 'Docker version 24.0.5 installed and running' },
          create_baseline_snap: { snapshotId: 's-bp199042', status: 'ACCOMPLISHED' },
          notify_devops: { messageId: 'msg-9921', sentStatus: 'DELIVERED' },
        },
      },
    ],
  },
};

/**
 * 模板 2: 核心云主机每日定时快照备份
 */
export const templateEcsDailySnapshotBackup: WorkflowTemplate = {
  id: 'tpl_ecs_daily_snapshot_backup',
  version: '1.0.0',
  title: '核心云主机每日定时快照备份',
  category: 'security',
  icon: 'save',
  valueProposition: '每日自动化创建增量快照并自动清理超期备份，防勒索防误删，单次节省 15 分钟人工检查。',
  description: '自动对生产数据库或核心应用所在的云主机创建带时间戳的增量快照，保留 14 天自动循环轮转，并在完成备份后发送健康汇报。',
  connectors: ['cloud_host', 'dingtalk'],
  roi: {
    minutesSavedPerRun: 15,
    typicalRunsPerWeek: 7,
  },
  difficulty: 'starter',
  variables: [
    {
      key: 'instanceId',
      label: '目标云主机 ID',
      type: 'text',
      defaultValue: 'i-bp18a9z3j42m09a',
      required: true,
      placeholder: '例如: i-bp18a9z3j42m09a',
      bindings: [
        'tasks[0].inputParameters.instanceId',
        'tasks[1].inputParameters.instanceId',
      ],
    },
    {
      key: 'retentionDays',
      label: '快照保留天数',
      type: 'number',
      defaultValue: 14,
      required: true,
      bindings: ['tasks[1].inputParameters.retentionDays'],
    },
  ],
  definition: {
    name: 'ecs_daily_snapshot_backup_flow',
    description: '核心云主机每日定时增量备份',
    version: 1,
    tasks: [
      {
        name: 'ecs_query_instance',
        taskReferenceName: 'check_host',
        type: 'HTTP',
        description: '检查主机运行健康状态',
        inputParameters: {
          _actionId: 'ecs.query_instance',
          instanceId: 'i-bp18a9z3j42m09a',
        },
      },
      {
        name: 'ecs_create_snapshot',
        taskReferenceName: 'create_daily_snap',
        type: 'HTTP',
        description: '执行云盘增量备份快照',
        inputParameters: {
          _actionId: 'ecs.create_snapshot',
          instanceId: 'i-bp18a9z3j42m09a',
          snapshotName: 'auto-daily-backup',
          retentionDays: 14,
        },
      },
      {
        name: 'send_operation_notification',
        taskReferenceName: 'notify_result',
        type: 'EVENT',
        sink: 'conductor',
        description: '发送备份执行简报',
        inputParameters: {
          _actionId: 'notify.send_message',
          channel: 'webhook_dingtalk',
          title: '【快照备份成功】每日例行备份完成',
          content: '云主机 ${check_host.output.instanceId} (${check_host.output.status}) 增量快照已生成，快照ID: ${create_daily_snap.output.snapshotId}。',
        },
      },
    ],
  },
  mockDataset: {
    scenarios: [
      {
        name: '定时备份成功场景',
        workflowInput: {},
        taskOutputs: {
          check_host: { instanceId: 'i-bp18a9z3j42m09a', status: 'RUNNING', osName: 'Alibaba Cloud Linux 3' },
          create_daily_snap: { snapshotId: 's-bp188201', snapshotName: 'auto-daily-backup', status: 'ACCOMPLISHED' },
          notify_result: { sentStatus: 'DELIVERED' },
        },
      },
    ],
  },
};

/**
 * 模板 3: 主机高负载告警与在线自动升配
 */
export const templateEcsHighLoadAutoscale: WorkflowTemplate = {
  id: 'tpl_ecs_high_load_autoscale',
  version: '1.0.0',
  title: '主机高负载告警与在线自动升配',
  category: 'ops',
  icon: 'zap',
  valueProposition: '检测到 CPU 利用率超标时自动发起升配流程，内置人工审批安全网，秒级在线完成 4C8G -> 8C16G 弹性扩容。',
  description: '自动轮询主机性能指标，一旦触发瓶颈阈值，系统即刻生成规格变更提案并向架构师推送一键审批卡片，审批后自动在线变配，保障大促不卡顿。',
  connectors: ['cloud_host', 'dingtalk', 'approval'],
  roi: {
    minutesSavedPerRun: 40,
    typicalRunsPerWeek: 5,
  },
  difficulty: 'intermediate',
  variables: [
    {
      key: 'instanceId',
      label: '监控主机 ID',
      type: 'text',
      defaultValue: 'i-bp18a9z3j42m09a',
      required: true,
      bindings: [
        'tasks[0].inputParameters.instanceId',
        'tasks[2].inputParameters.instanceId',
      ],
    },
    {
      key: 'targetSpec',
      label: '目标扩容规格',
      type: 'select',
      defaultValue: 'ecs.c7.2xlarge',
      required: true,
      options: [
        { label: '提升至 计算型 8C16G (ecs.c7.2xlarge)', value: 'ecs.c7.2xlarge' },
        { label: '提升至 内存型 8C32G (ecs.r7.2xlarge)', value: 'ecs.r7.2xlarge' },
      ],
      bindings: ['tasks[2].inputParameters.targetSpec'],
    },
  ],
  definition: {
    name: 'ecs_high_load_autoscale_flow',
    description: '云主机高负载自动熔断与在线变配',
    version: 1,
    tasks: [
      {
        name: 'ecs_get_monitor_metrics',
        taskReferenceName: 'fetch_metrics',
        type: 'HTTP',
        description: '采集 CPU 与内存利用率',
        inputParameters: {
          _actionId: 'ecs.get_monitor_metrics',
          instanceId: 'i-bp18a9z3j42m09a',
          periodSeconds: 60,
        },
      },
      {
        name: 'human_operation_approval',
        taskReferenceName: 'approve_spec_upgrade',
        type: 'HUMAN',
        description: '高危硬件配置变更审批',
        inputParameters: {
          _actionId: 'human.approval',
          assigneeRole: 'architect',
          promptMessage: '云主机 ${fetch_metrics.output.instanceId} 当前 CPU 利用率达到 ${fetch_metrics.output.cpuUsagePercent}%，申请在线升配。',
          timeoutMinutes: 30,
        },
      },
      {
        name: 'ecs_modify_spec',
        taskReferenceName: 'apply_spec_change',
        type: 'HTTP',
        description: '执行在线规格扩容变更',
        inputParameters: {
          _actionId: 'ecs.modify_spec',
          instanceId: 'i-bp18a9z3j42m09a',
          targetSpec: 'ecs.c7.2xlarge',
        },
      },
      {
        name: 'send_operation_notification',
        taskReferenceName: 'notify_upgrade_done',
        type: 'EVENT',
        sink: 'conductor',
        description: '发送变配完成汇报',
        inputParameters: {
          _actionId: 'notify.send_message',
          channel: 'webhook_dingtalk',
          title: '【升配成功】云主机硬件规格已在线提升',
          content: '云主机 ${fetch_metrics.output.instanceId} 已成功从 ${apply_spec_change.output.oldSpec} 变更为 ${apply_spec_change.output.newSpec}。',
        },
      },
    ],
  },
  mockDataset: {
    scenarios: [
      {
        name: '高负载升配成功场景',
        workflowInput: {},
        taskOutputs: {
          fetch_metrics: { instanceId: 'i-bp18a9z3j42m09a', cpuUsagePercent: 88.5, isOverloaded: true },
          approve_spec_upgrade: { approved: true, reviewer: 'architect@internal.cloud' },
          apply_spec_change: { oldSpec: 'ecs.c7.xlarge', newSpec: 'ecs.c7.2xlarge', status: 'SUCCESS' },
          notify_upgrade_done: { sentStatus: 'DELIVERED' },
        },
      },
    ],
  },
};

/**
 * 模板 4: 生产主机一键漏洞巡检与修复
 */
export const templateEcsVulnerabilityPatch: WorkflowTemplate = {
  id: 'tpl_ecs_vulnerability_patch',
  version: '1.0.0',
  title: '生产主机一键漏洞巡检与修复',
  category: 'security',
  icon: 'shield',
  valueProposition: '修补前自动创建保护快照，免密下发 OS 补丁脚本，带审批确认软重启，消除系统 CVE 高危隐患。',
  description: '解决企业 Linux 主机补丁升级流程繁琐、缺少回滚预案的问题。流程自动先对磁盘建立防护快照，执行补丁更新后通知责任人确认软重启。',
  connectors: ['cloud_host', 'dingtalk', 'approval'],
  roi: {
    minutesSavedPerRun: 45,
    typicalRunsPerWeek: 4,
  },
  difficulty: 'intermediate',
  variables: [
    {
      key: 'instanceId',
      label: '目标主机 ID',
      type: 'text',
      defaultValue: 'i-bp18a9z3j42m09a',
      required: true,
      bindings: [
        'tasks[0].inputParameters.instanceId',
        'tasks[1].inputParameters.instanceId',
        'tasks[3].inputParameters.instanceId',
      ],
    },
  ],
  definition: {
    name: 'ecs_vulnerability_patch_flow',
    description: '带快照防护的操作系统漏洞巡检与修复流程',
    version: 1,
    tasks: [
      {
        name: 'ecs_create_snapshot',
        taskReferenceName: 'patch_safeguard_snap',
        type: 'HTTP',
        description: '建立补丁前安全还原快照',
        inputParameters: {
          _actionId: 'ecs.create_snapshot',
          instanceId: 'i-bp18a9z3j42m09a',
          snapshotName: 'pre-patch-safeguard',
          retentionDays: 7,
        },
      },
      {
        name: 'ecs_run_command',
        taskReferenceName: 'apply_cve_patches',
        type: 'HTTP',
        description: '下发漏洞热补丁脚本',
        inputParameters: {
          _actionId: 'ecs.run_command',
          instanceId: 'i-bp18a9z3j42m09a',
          commandContent: 'yum update-minimal --security -y',
          commandType: 'RunShellScript',
          timeoutSeconds: 120,
        },
      },
      {
        name: 'human_operation_approval',
        taskReferenceName: 'confirm_soft_reboot',
        type: 'HUMAN',
        description: '责任人确认重启',
        inputParameters: {
          _actionId: 'human.approval',
          assigneeRole: 'devops_lead',
          promptMessage: '补丁更新已完成，请确认是否即刻安排主机软重启以使内核生效。',
          timeoutMinutes: 60,
        },
      },
      {
        name: 'ecs_restart_instance',
        taskReferenceName: 'reboot_host',
        type: 'HTTP',
        description: '软重启生效补丁',
        inputParameters: {
          _actionId: 'ecs.restart_instance',
          instanceId: 'i-bp18a9z3j42m09a',
          forceRestart: false,
        },
      },
      {
        name: 'send_operation_notification',
        taskReferenceName: 'report_patch_result',
        type: 'EVENT',
        sink: 'conductor',
        description: '发送合规汇报',
        inputParameters: {
          _actionId: 'notify.send_message',
          channel: 'webhook_dingtalk',
          title: '【补丁更新成功】系统漏洞修复完成',
          content: '云主机 ${patch_safeguard_snap.output.instanceId} 补丁更新完成，主机已完成重启并恢复在线。',
        },
      },
    ],
  },
  mockDataset: {
    scenarios: [
      {
        name: '补丁升级全流程演示',
        workflowInput: {},
        taskOutputs: {
          patch_safeguard_snap: { snapshotId: 's-bp1904', status: 'ACCOMPLISHED' },
          apply_cve_patches: { exitCode: 0, output: '3 security packages updated', status: 'SUCCESS' },
          confirm_soft_reboot: { approved: true, reviewer: 'devops_lead@internal.cloud' },
          reboot_host: { status: 'RUNNING' },
          report_patch_result: { sentStatus: 'DELIVERED' },
        },
      },
    ],
  },
};

/**
 * 模板 5: 非生产环境夜间定时关机降本
 */
export const templateEcsNightIdleShutdown: WorkflowTemplate = {
  id: 'tpl_ecs_night_idle_shutdown',
  version: '1.0.0',
  title: '非生产环境夜间定时关机降本',
  category: 'cost',
  icon: 'moon',
  valueProposition: '工作日 21:00 自动停止闲置研发测试主机，次日晨自动开机，降低约 65% 计算资源账单。',
  description: '自动在夜间巡检开发测试集群，若无活跃计算任务，则下发优雅安全关机指令，并在协同群汇报当晚关机台数与预计节约的算力金额。',
  connectors: ['cloud_host', 'dingtalk'],
  roi: {
    minutesSavedPerRun: 20,
    typicalRunsPerWeek: 5,
  },
  difficulty: 'starter',
  variables: [
    {
      key: 'instanceId',
      label: '测试环境主机 ID',
      type: 'text',
      defaultValue: 'i-bp18a9z3j42m09a',
      required: true,
      bindings: [
        'tasks[0].inputParameters.instanceId',
        'tasks[1].inputParameters.instanceId',
      ],
    },
    {
      key: 'forceStop',
      label: '超时是否强制关机',
      type: 'boolean',
      defaultValue: false,
      bindings: ['tasks[1].inputParameters.forceStop'],
    },
  ],
  definition: {
    name: 'ecs_night_idle_shutdown_flow',
    description: '测试环境夜间自动关机降本',
    version: 1,
    tasks: [
      {
        name: 'ecs_get_monitor_metrics',
        taskReferenceName: 'check_idle_state',
        type: 'HTTP',
        description: '核实主机是否处于闲置低负载',
        inputParameters: {
          _actionId: 'ecs.get_monitor_metrics',
          instanceId: 'i-bp18a9z3j42m09a',
          periodSeconds: 300,
        },
      },
      {
        name: 'ecs_stop_instance',
        taskReferenceName: 'shutdown_host',
        type: 'HTTP',
        description: '执行优雅关机',
        inputParameters: {
          _actionId: 'ecs.stop_instance',
          instanceId: 'i-bp18a9z3j42m09a',
          forceStop: false,
        },
      },
      {
        name: 'send_operation_notification',
        taskReferenceName: 'notify_cost_saving',
        type: 'EVENT',
        sink: 'conductor',
        description: '发送夜间节能降本简报',
        inputParameters: {
          _actionId: 'notify.send_message',
          channel: 'webhook_dingtalk',
          title: '【夜间节能】测试主机已自动进入休眠',
          content: '测试主机 ${check_idle_state.output.instanceId} (CPU ${check_idle_state.output.cpuUsagePercent}%) 已于 21:00 完成关机，预计今夜节约 11 小时按量费用。',
        },
      },
    ],
  },
  mockDataset: {
    scenarios: [
      {
        name: '闲置关机场景',
        workflowInput: {},
        taskOutputs: {
          check_idle_state: { instanceId: 'i-bp18a9z3j42m09a', cpuUsagePercent: 2.1, isOverloaded: false },
          shutdown_host: { status: 'STOPPED' },
          notify_cost_saving: { sentStatus: 'DELIVERED' },
        },
      },
    ],
  },
};

/**
 * 模板 6: 测试环境工作日早晨定时自动开机
 */
export const templateEcsMorningBoot: WorkflowTemplate = {
  id: 'tpl_ecs_morning_boot',
  version: '1.0.0',
  title: '测试环境工作日早晨定时自动开机',
  category: 'cost',
  icon: 'sunrise',
  valueProposition: '工作日 08:30 自动唤醒测试主机，自检网络并广播就绪通知，研发开工即可联调无需等待。',
  description: '与夜间关机模板形成完整的节能闭环，在工作日上班前 30 分钟定时批量启动主机，校验网络联通性后发送早报。',
  connectors: ['cloud_host', 'dingtalk'],
  roi: {
    minutesSavedPerRun: 15,
    typicalRunsPerWeek: 5,
  },
  difficulty: 'starter',
  variables: [
    {
      key: 'instanceId',
      label: '测试环境主机 ID',
      type: 'text',
      defaultValue: 'i-bp18a9z3j42m09a',
      required: true,
      bindings: [
        'tasks[0].inputParameters.instanceId',
        'tasks[2].inputParameters.instanceId',
      ],
    },
  ],
  definition: {
    name: 'ecs_morning_boot_flow',
    description: '测试环境早间自动唤醒开机',
    version: 1,
    tasks: [
      {
        name: 'ecs_start_instance',
        taskReferenceName: 'boot_host',
        type: 'HTTP',
        description: '执行主机开机启动',
        inputParameters: {
          _actionId: 'ecs.start_instance',
          instanceId: 'i-bp18a9z3j42m09a',
        },
      },
      {
        name: 'wait_boot_ready',
        taskReferenceName: 'wait_boot',
        type: 'WAIT',
        description: '等待操作系统内核引导就绪',
        inputParameters: {
          _actionId: 'control.wait',
          duration: '10s',
        },
      },
      {
        name: 'ecs_query_instance',
        taskReferenceName: 'verify_network',
        type: 'HTTP',
        description: '核实网络与运行状态',
        inputParameters: {
          _actionId: 'ecs.query_instance',
          instanceId: 'i-bp18a9z3j42m09a',
        },
      },
      {
        name: 'send_operation_notification',
        taskReferenceName: 'notify_team_ready',
        type: 'EVENT',
        sink: 'conductor',
        description: '向研发测试群发送环境就绪广播',
        inputParameters: {
          _actionId: 'notify.send_message',
          channel: 'webhook_dingtalk',
          title: '【环境就绪】测试云主机已唤醒开机',
          content: '测试主机 ${verify_network.output.instanceId} 已启动 (${verify_network.output.status})，内网IP: ${verify_network.output.privateIp}，开发人员可正常开始联调。',
        },
      },
    ],
  },
  mockDataset: {
    scenarios: [
      {
        name: '晨间开机唤醒演示',
        workflowInput: {},
        taskOutputs: {
          boot_host: { instanceId: 'i-bp18a9z3j42m09a', currentStatus: 'STARTING' },
          wait_boot: { waited: true },
          verify_network: { instanceId: 'i-bp18a9z3j42m09a', status: 'RUNNING', privateIp: '172.16.0.42' },
          notify_team_ready: { sentStatus: 'DELIVERED' },
        },
      },
    ],
  },
};

/**
 * 模板 7: 磁盘容量告警与在线自动扩容
 */
export const templateEcsDiskExpansion: WorkflowTemplate = {
  id: 'tpl_ecs_disk_expansion',
  version: '1.0.0',
  title: '磁盘容量告警与在线自动扩容',
  category: 'ops',
  icon: 'hard-drive',
  valueProposition: '磁盘利用率超 85% 自动快照并在线扩充云盘容量，免停机扩展文件系统，杜绝业务写爆宕机。',
  description: '自动对磁盘快满的主机执行保护性快照，随后免停机远程下发 growpart 与 resize2fs 脚本刷新空间，最后在运维群反馈扩容结果。',
  connectors: ['cloud_host', 'dingtalk'],
  roi: {
    minutesSavedPerRun: 30,
    typicalRunsPerWeek: 6,
  },
  difficulty: 'intermediate',
  variables: [
    {
      key: 'instanceId',
      label: '目标主机 ID',
      type: 'text',
      defaultValue: 'i-bp18a9z3j42m09a',
      required: true,
      bindings: [
        'tasks[0].inputParameters.instanceId',
        'tasks[1].inputParameters.instanceId',
        'tasks[2].inputParameters.instanceId',
      ],
    },
  ],
  definition: {
    name: 'ecs_disk_expansion_flow',
    description: '云主机磁盘在线自动扩容与自愈',
    version: 1,
    tasks: [
      {
        name: 'ecs_get_monitor_metrics',
        taskReferenceName: 'check_disk_usage',
        type: 'HTTP',
        description: '检测磁盘利用率',
        inputParameters: {
          _actionId: 'ecs.get_monitor_metrics',
          instanceId: 'i-bp18a9z3j42m09a',
          periodSeconds: 60,
        },
      },
      {
        name: 'ecs_create_snapshot',
        taskReferenceName: 'pre_expand_snap',
        type: 'HTTP',
        description: '扩容前创建磁盘保护快照',
        inputParameters: {
          _actionId: 'ecs.create_snapshot',
          instanceId: 'i-bp18a9z3j42m09a',
          snapshotName: 'pre-disk-expansion',
          retentionDays: 7,
        },
      },
      {
        name: 'ecs_run_command',
        taskReferenceName: 'grow_filesystem',
        type: 'HTTP',
        description: '在线扩展分区与文件系统',
        inputParameters: {
          _actionId: 'ecs.run_command',
          instanceId: 'i-bp18a9z3j42m09a',
          commandContent: 'growpart /dev/vda 1 && resize2fs /dev/vda1 && df -h',
          commandType: 'RunShellScript',
          timeoutSeconds: 60,
        },
      },
      {
        name: 'send_operation_notification',
        taskReferenceName: 'notify_expand_done',
        type: 'EVENT',
        sink: 'conductor',
        description: '发送扩容完成通知',
        inputParameters: {
          _actionId: 'notify.send_message',
          channel: 'webhook_dingtalk',
          title: '【自愈成功】云盘空间已在线扩容',
          content: '云主机 ${check_disk_usage.output.instanceId} 磁盘扩容完毕，当前文件系统状态正常。',
        },
      },
    ],
  },
  mockDataset: {
    scenarios: [
      {
        name: '磁盘扩容自愈演示',
        workflowInput: {},
        taskOutputs: {
          check_disk_usage: { instanceId: 'i-bp18a9z3j42m09a', diskUsagePercent: 89.2 },
          pre_expand_snap: { snapshotId: 's-bp1449', status: 'ACCOMPLISHED' },
          grow_filesystem: { exitCode: 0, output: 'CHANGED: partition=1, size expanded to 200GB' },
          notify_expand_done: { sentStatus: 'DELIVERED' },
        },
      },
    ],
  },
};

/**
 * 模板 8: 突发入侵应急响应与快照取证
 */
export const templateEcsEmergencyIsolation: WorkflowTemplate = {
  id: 'tpl_ecs_emergency_isolation',
  version: '1.0.0',
  title: '突发入侵应急响应与快照取证',
  category: 'security',
  icon: 'bell-ring',
  valueProposition: '发生高危网络入侵威胁时，秒级冻结证据快照并强制关机隔离，将安全暴露面降至最低。',
  description: '面对勒索病毒、WebShell 或异常爆破入侵时，自动对受害主机创建取证快照保存现场内存与日志，随后强制关机切断危害，并向 SecOps 安全小组发送紧急红色通知。',
  connectors: ['cloud_host', 'dingtalk'],
  roi: {
    minutesSavedPerRun: 60,
    typicalRunsPerWeek: 1,
  },
  difficulty: 'advanced',
  variables: [
    {
      key: 'instanceId',
      label: '受害云主机 ID',
      type: 'text',
      defaultValue: 'i-bp18a9z3j42m09a',
      required: true,
      bindings: [
        'tasks[0].inputParameters.instanceId',
        'tasks[1].inputParameters.instanceId',
      ],
    },
  ],
  definition: {
    name: 'ecs_emergency_isolation_flow',
    description: '安全事件突发应急取证与快速隔离',
    version: 1,
    tasks: [
      {
        name: 'ecs_create_snapshot',
        taskReferenceName: 'forensics_snapshot',
        type: 'HTTP',
        description: '紧急创建现场取证快照',
        inputParameters: {
          _actionId: 'ecs.create_snapshot',
          instanceId: 'i-bp18a9z3j42m09a',
          snapshotName: 'security-forensics-evidence',
          retentionDays: 90,
        },
      },
      {
        name: 'ecs_stop_instance',
        taskReferenceName: 'isolate_victim_node',
        type: 'HTTP',
        description: '强制切断关机隔离',
        inputParameters: {
          _actionId: 'ecs.stop_instance',
          instanceId: 'i-bp18a9z3j42m09a',
          forceStop: true,
        },
      },
      {
        name: 'send_operation_notification',
        taskReferenceName: 'alert_secops_incident',
        type: 'EVENT',
        sink: 'conductor',
        description: '发送安全应急处置最高级别预警',
        inputParameters: {
          _actionId: 'notify.send_message',
          channel: 'webhook_dingtalk',
          title: '【紧急安全通报】入侵主机已隔离取证',
          content: '受害主机 ${forensics_snapshot.output.instanceId} 已完成现场留证快照 (${forensics_snapshot.output.snapshotId}) 并被强制关机隔离，请 SecOps 立即启动应急调查。',
        },
      },
    ],
  },
  mockDataset: {
    scenarios: [
      {
        name: '应急阻断演示',
        workflowInput: {},
        taskOutputs: {
          forensics_snapshot: { snapshotId: 's-forensics-911', status: 'ACCOMPLISHED' },
          isolate_victim_node: { status: 'STOPPED', forceStop: true },
          alert_secops_incident: { sentStatus: 'DELIVERED' },
        },
      },
    ],
  },
};

/**
 * 8 个官方场景化黄金模板清单
 */
export const BUILTIN_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  templateEcsAutoProvision,
  templateEcsDailySnapshotBackup,
  templateEcsHighLoadAutoscale,
  templateEcsVulnerabilityPatch,
  templateEcsNightIdleShutdown,
  templateEcsMorningBoot,
  templateEcsDiskExpansion,
  templateEcsEmergencyIsolation,
];
