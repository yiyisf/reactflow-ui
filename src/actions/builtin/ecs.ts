import type { ActionDefinition } from '../types';
import { toNumberField } from './coerce';

export const ecsCreateInstanceAction: ActionDefinition = {
  id: 'ecs.create_instance',
  name: '创建云主机',
  category: 'compute',
  icon: 'server',
  description: '在指定可用区根据镜像与规格创建并初始化一台新的云主机实例',
  connector: 'cloud_host',
  riskLevel: 'safe',
  fields: [
    {
      key: 'regionId',
      label: '所属地域',
      type: 'select',
      required: true,
      defaultValue: 'cn-hangzhou',
      options: [
        { label: '华东 1 (杭州)', value: 'cn-hangzhou' },
        { label: '华北 2 (北京)', value: 'cn-beijing' },
        { label: '华南 1 (深圳)', value: 'cn-shenzhen' },
        { label: '亚太东南 1 (新加坡)', value: 'ap-southeast-1' },
      ],
      acceptsPills: true,
    },
    {
      key: 'instanceType',
      label: '计算规格',
      type: 'select',
      required: true,
      defaultValue: 'ecs.c7.xlarge',
      options: [
        { label: '通用型 2C4G (ecs.g7.large)', value: 'ecs.g7.large' },
        { label: '计算型 4C8G (ecs.c7.xlarge)', value: 'ecs.c7.xlarge' },
        { label: '内存型 4C16G (ecs.r7.xlarge)', value: 'ecs.r7.xlarge' },
        { label: '高性能 8C32G (ecs.c7.2xlarge)', value: 'ecs.c7.2xlarge' },
      ],
      acceptsPills: true,
    },
    {
      key: 'imageId',
      label: '操作系统镜像',
      type: 'select',
      required: true,
      defaultValue: 'image-alilinux-3',
      options: [
        { label: 'Alibaba Cloud Linux 3.2104 LTS 64位', value: 'image-alilinux-3' },
        { label: 'Ubuntu 22.04 LTS 64位', value: 'image-ubuntu-22' },
        { label: 'CentOS 7.9 64位', value: 'image-centos-7' },
        { label: 'Debian 12 64位', value: 'image-debian-12' },
      ],
      acceptsPills: true,
    },
    {
      key: 'instanceName',
      label: '主机名称',
      type: 'text',
      placeholder: '例如: web-prod-01',
      required: true,
      defaultValue: 'app-server-node',
      acceptsPills: true,
    },
    {
      key: 'systemDiskSize',
      label: '系统盘容量 (GB)',
      type: 'number',
      defaultValue: 100,
      required: true,
      acceptsPills: true,
    },
  ],
  outputs: [
    { key: 'instanceId', label: '实例ID', type: 'string', example: 'i-bp18a9z3j42m09a' },
    { key: 'instanceName', label: '主机名称', type: 'string', example: 'app-server-node' },
    { key: 'privateIp', label: '内网IP', type: 'string', example: '172.16.0.42' },
    { key: 'status', label: '实例状态', type: 'string', example: 'RUNNING' },
    { key: 'createdAt', label: '创建时间', type: 'string', example: '2026-10-20T14:00:00Z' },
  ],
  compile: (values, ctx) => ({
    name: 'ecs_create_instance',
    taskReferenceName: ctx.taskReferenceName,
    type: 'HTTP',
    description: `创建云主机: ${values.instanceName || ctx.taskReferenceName}`,
    inputParameters: {
      _actionId: 'ecs.create_instance',
      actionName: '创建云主机',
      regionId: values.regionId ?? 'cn-hangzhou',
      instanceType: values.instanceType ?? 'ecs.c7.xlarge',
      imageId: values.imageId ?? 'image-alilinux-3',
      instanceName: values.instanceName ?? 'app-node',
      systemDiskSize: toNumberField(values.systemDiskSize, 100),
      http_request: {
        uri: 'https://ecs.internal.cloud/api/v2/instances',
        method: 'POST',
        body: {
          regionId: values.regionId,
          instanceType: values.instanceType,
          imageId: values.imageId,
          instanceName: values.instanceName,
          systemDiskSize: toNumberField(values.systemDiskSize, 100),
        },
      },
    },
  }),
  decompile: (task) => {
    if (task.inputParameters?._actionId === 'ecs.create_instance') {
      const p = task.inputParameters;
      return {
        regionId: p.regionId ?? 'cn-hangzhou',
        instanceType: p.instanceType ?? 'ecs.c7.xlarge',
        imageId: p.imageId ?? 'image-alilinux-3',
        instanceName: p.instanceName ?? task.taskReferenceName,
        systemDiskSize: p.systemDiskSize ?? 100,
      };
    }
    return null;
  },
  mockOutput: (values) => ({
    instanceId: `i-bp1${Math.random().toString(36).substring(2, 9)}`,
    instanceName: values.instanceName || 'app-server-node',
    privateIp: '172.16.0.' + Math.floor(10 + Math.random() * 200),
    status: 'RUNNING',
    regionId: values.regionId || 'cn-hangzhou',
    instanceType: values.instanceType || 'ecs.c7.xlarge',
    createdAt: new Date().toISOString(),
  }),
};

export const ecsQueryInstanceAction: ActionDefinition = {
  id: 'ecs.query_instance',
  name: '查询云主机详情',
  category: 'compute',
  icon: 'search',
  description: '根据主机实例 ID 查询其实时运行状态、配置规格与网络 IP',
  connector: 'cloud_host',
  riskLevel: 'safe',
  fields: [
    {
      key: 'instanceId',
      label: '云主机实例 ID',
      type: 'text',
      placeholder: '例如: i-bp18a9z3j42m09a 或绑定上游胶囊',
      required: true,
      acceptsPills: true,
    },
  ],
  outputs: [
    { key: 'instanceId', label: '实例ID', type: 'string', example: 'i-bp18a9z3j42m09a' },
    { key: 'status', label: '运行状态', type: 'string', example: 'RUNNING' },
    { key: 'cpu', label: 'CPU核心数', type: 'number', example: 4 },
    { key: 'memoryGb', label: '内存(GB)', type: 'number', example: 8 },
    { key: 'privateIp', label: '内网IP', type: 'string', example: '172.16.0.42' },
    { key: 'publicIp', label: '公网IP', type: 'string', example: '47.98.112.23' },
    { key: 'osName', label: '操作系统', type: 'string', example: 'Alibaba Cloud Linux 3' },
  ],
  compile: (values, ctx) => ({
    name: 'ecs_query_instance',
    taskReferenceName: ctx.taskReferenceName,
    type: 'HTTP',
    description: `查询云主机状态: ${values.instanceId || ''}`,
    inputParameters: {
      _actionId: 'ecs.query_instance',
      actionName: '查询云主机详情',
      instanceId: values.instanceId,
      http_request: {
        uri: `https://ecs.internal.cloud/api/v2/instances/${values.instanceId || ''}`,
        method: 'GET',
      },
    },
  }),
  decompile: (task) => {
    if (task.inputParameters?._actionId === 'ecs.query_instance') {
      return { instanceId: task.inputParameters.instanceId ?? '' };
    }
    return null;
  },
  mockOutput: (values) => ({
    instanceId: values.instanceId || 'i-bp18a9z3j42m09a',
    status: 'RUNNING',
    cpu: 4,
    memoryGb: 8,
    privateIp: '172.16.0.42',
    publicIp: '47.98.112.23',
    osName: 'Alibaba Cloud Linux 3.2104',
    uptimeHours: 360,
  }),
};

export const ecsStartInstanceAction: ActionDefinition = {
  id: 'ecs.start_instance',
  name: '启动云主机',
  category: 'compute',
  icon: 'play',
  description: '将处于关机/停止状态的云主机实例开机启动',
  connector: 'cloud_host',
  riskLevel: 'safe',
  fields: [
    {
      key: 'instanceId',
      label: '云主机实例 ID',
      type: 'text',
      placeholder: '选择或填入要开机的主机 ID',
      required: true,
      acceptsPills: true,
    },
  ],
  outputs: [
    { key: 'instanceId', label: '实例ID', type: 'string', example: 'i-bp18a9z3j42m09a' },
    { key: 'previousStatus', label: '变更前状态', type: 'string', example: 'STOPPED' },
    { key: 'currentStatus', label: '当前状态', type: 'string', example: 'STARTING' },
    { key: 'startedAt', label: '开机时间', type: 'string', example: '2026-10-20T14:15:00Z' },
  ],
  compile: (values, ctx) => ({
    name: 'ecs_start_instance',
    taskReferenceName: ctx.taskReferenceName,
    type: 'HTTP',
    description: `开机启动云主机: ${values.instanceId || ''}`,
    inputParameters: {
      _actionId: 'ecs.start_instance',
      actionName: '启动云主机',
      instanceId: values.instanceId,
      http_request: {
        uri: `https://ecs.internal.cloud/api/v2/instances/${values.instanceId || ''}/start`,
        method: 'POST',
      },
    },
  }),
  decompile: (task) => {
    if (task.inputParameters?._actionId === 'ecs.start_instance') {
      return { instanceId: task.inputParameters.instanceId ?? '' };
    }
    return null;
  },
  mockOutput: (values) => ({
    instanceId: values.instanceId || 'i-bp18a9z3j42m09a',
    previousStatus: 'STOPPED',
    currentStatus: 'RUNNING',
    startedAt: new Date().toISOString(),
  }),
};

export const ecsStopInstanceAction: ActionDefinition = {
  id: 'ecs.stop_instance',
  name: '停止云主机',
  category: 'compute',
  icon: 'stop',
  description: '安全关机或强制关机运行中的云主机实例',
  connector: 'cloud_host',
  riskLevel: 'sensitive',
  fields: [
    {
      key: 'instanceId',
      label: '云主机实例 ID',
      type: 'text',
      placeholder: '选择或填入要关机的主机 ID',
      required: true,
      acceptsPills: true,
    },
    {
      key: 'forceStop',
      label: '是否强制关机',
      type: 'boolean',
      defaultValue: false,
      help: '默认安全优雅关机，开启后若超时将直接切断电源',
    },
  ],
  outputs: [
    { key: 'instanceId', label: '实例ID', type: 'string', example: 'i-bp18a9z3j42m09a' },
    { key: 'status', label: '当前状态', type: 'string', example: 'STOPPED' },
    { key: 'stoppedAt', label: '关机完成时间', type: 'string', example: '2026-10-20T14:20:00Z' },
  ],
  compile: (values, ctx) => ({
    name: 'ecs_stop_instance',
    taskReferenceName: ctx.taskReferenceName,
    type: 'HTTP',
    description: `停止云主机: ${values.instanceId || ''}`,
    inputParameters: {
      _actionId: 'ecs.stop_instance',
      actionName: '停止云主机',
      instanceId: values.instanceId,
      forceStop: Boolean(values.forceStop),
      http_request: {
        uri: `https://ecs.internal.cloud/api/v2/instances/${values.instanceId || ''}/stop`,
        method: 'POST',
        body: { forceStop: values.forceStop },
      },
    },
  }),
  decompile: (task) => {
    if (task.inputParameters?._actionId === 'ecs.stop_instance') {
      return {
        instanceId: task.inputParameters.instanceId ?? '',
        forceStop: Boolean(task.inputParameters.forceStop),
      };
    }
    return null;
  },
  mockOutput: (values) => ({
    instanceId: values.instanceId || 'i-bp18a9z3j42m09a',
    status: 'STOPPED',
    forceStop: Boolean(values.forceStop),
    stoppedAt: new Date().toISOString(),
  }),
};

export const ecsRestartInstanceAction: ActionDefinition = {
  id: 'ecs.restart_instance',
  name: '重启云主机',
  category: 'compute',
  icon: 'refresh',
  description: '重新启动运行中的云主机（支持软重启与强制硬重启）',
  connector: 'cloud_host',
  riskLevel: 'sensitive',
  fields: [
    {
      key: 'instanceId',
      label: '云主机实例 ID',
      type: 'text',
      placeholder: '例如: i-bp18a9z3j42m09a',
      required: true,
      acceptsPills: true,
    },
    {
      key: 'forceRestart',
      label: '强制重启 (硬重启)',
      type: 'boolean',
      defaultValue: false,
    },
  ],
  outputs: [
    { key: 'instanceId', label: '实例ID', type: 'string', example: 'i-bp18a9z3j42m09a' },
    { key: 'status', label: '状态', type: 'string', example: 'REBOOTING' },
    { key: 'restartedAt', label: '重启时间', type: 'string', example: '2026-10-20T14:22:00Z' },
  ],
  compile: (values, ctx) => ({
    name: 'ecs_restart_instance',
    taskReferenceName: ctx.taskReferenceName,
    type: 'HTTP',
    description: `重启云主机: ${values.instanceId || ''}`,
    inputParameters: {
      _actionId: 'ecs.restart_instance',
      actionName: '重启云主机',
      instanceId: values.instanceId,
      forceRestart: Boolean(values.forceRestart),
      http_request: {
        uri: `https://ecs.internal.cloud/api/v2/instances/${values.instanceId || ''}/restart`,
        method: 'POST',
        body: { forceRestart: Boolean(values.forceRestart) },
      },
    },
  }),
  decompile: (task) => {
    if (task.inputParameters?._actionId === 'ecs.restart_instance') {
      return {
        instanceId: task.inputParameters.instanceId ?? '',
        forceRestart: Boolean(task.inputParameters.forceRestart),
      };
    }
    return null;
  },
  mockOutput: (values) => ({
    instanceId: values.instanceId || 'i-bp18a9z3j42m09a',
    status: 'RUNNING',
    restartedAt: new Date().toISOString(),
  }),
};

export const ecsModifySpecAction: ActionDefinition = {
  id: 'ecs.modify_spec',
  name: '变更实例规格 (升降配)',
  category: 'compute',
  icon: 'zap',
  description: '在线或离线升级/降低云主机 CPU 与内存硬件配置',
  connector: 'cloud_host',
  riskLevel: 'sensitive',
  fields: [
    {
      key: 'instanceId',
      label: '云主机实例 ID',
      type: 'text',
      required: true,
      acceptsPills: true,
    },
    {
      key: 'targetSpec',
      label: '目标规格配置',
      type: 'select',
      required: true,
      defaultValue: 'ecs.c7.2xlarge',
      options: [
        { label: '提升至 计算型 8C16G (ecs.c7.2xlarge)', value: 'ecs.c7.2xlarge' },
        { label: '提升至 内存型 8C32G (ecs.r7.2xlarge)', value: 'ecs.r7.2xlarge' },
        { label: '降低至 通用型 2C4G (ecs.g7.large)', value: 'ecs.g7.large' },
      ],
      acceptsPills: true,
    },
  ],
  outputs: [
    { key: 'instanceId', label: '实例ID', type: 'string', example: 'i-bp18a9z3j42m09a' },
    { key: 'oldSpec', label: '变更前规格', type: 'string', example: 'ecs.c7.xlarge' },
    { key: 'newSpec', label: '新规格', type: 'string', example: 'ecs.c7.2xlarge' },
    { key: 'status', label: '变配状态', type: 'string', example: 'SUCCESS' },
  ],
  compile: (values, ctx) => ({
    name: 'ecs_modify_spec',
    taskReferenceName: ctx.taskReferenceName,
    type: 'HTTP',
    description: `云主机变配为 ${values.targetSpec || ''}`,
    inputParameters: {
      _actionId: 'ecs.modify_spec',
      actionName: '变更实例规格',
      instanceId: values.instanceId,
      targetSpec: values.targetSpec,
      http_request: {
        uri: `https://ecs.internal.cloud/api/v2/instances/${values.instanceId || ''}/spec`,
        method: 'PUT',
        body: { instanceType: values.targetSpec },
      },
    },
  }),
  decompile: (task) => {
    if (task.inputParameters?._actionId === 'ecs.modify_spec') {
      return {
        instanceId: task.inputParameters.instanceId ?? '',
        targetSpec: task.inputParameters.targetSpec ?? 'ecs.c7.2xlarge',
      };
    }
    return null;
  },
  mockOutput: (values) => ({
    instanceId: values.instanceId || 'i-bp18a9z3j42m09a',
    oldSpec: 'ecs.c7.xlarge',
    newSpec: values.targetSpec || 'ecs.c7.2xlarge',
    status: 'SUCCESS',
    effectiveImmediately: true,
  }),
};

export const ecsCreateSnapshotAction: ActionDefinition = {
  id: 'ecs.create_snapshot',
  name: '创建云盘快照',
  category: 'storage',
  icon: 'save',
  description: '为云主机的系统盘或数据盘创建实时快照，用于容灾备份或回滚',
  connector: 'cloud_host',
  riskLevel: 'safe',
  fields: [
    {
      key: 'instanceId',
      label: '云主机实例 ID',
      type: 'text',
      required: true,
      acceptsPills: true,
    },
    {
      key: 'snapshotName',
      label: '快照名称/备注',
      type: 'text',
      defaultValue: 'backup-auto-snapshot',
      acceptsPills: true,
    },
    {
      key: 'retentionDays',
      label: '自动保留天数',
      type: 'number',
      defaultValue: 7,
      help: '过期后自动清理释放，0 为永久保留',
    },
  ],
  outputs: [
    { key: 'snapshotId', label: '快照ID', type: 'string', example: 's-bp14209938' },
    { key: 'snapshotName', label: '快照名称', type: 'string', example: 'backup-auto-snapshot' },
    { key: 'progress', label: '创建进度', type: 'string', example: '100%' },
    { key: 'status', label: '状态', type: 'string', example: 'ACCOMPLISHED' },
  ],
  compile: (values, ctx) => ({
    name: 'ecs_create_snapshot',
    taskReferenceName: ctx.taskReferenceName,
    type: 'HTTP',
    description: `创建快照: ${values.snapshotName || ctx.taskReferenceName}`,
    inputParameters: {
      _actionId: 'ecs.create_snapshot',
      actionName: '创建云盘快照',
      instanceId: values.instanceId,
      snapshotName: values.snapshotName,
      retentionDays: toNumberField(values.retentionDays, 7),
      http_request: {
        uri: `https://ecs.internal.cloud/api/v2/instances/${values.instanceId || ''}/snapshots`,
        method: 'POST',
        body: { snapshotName: values.snapshotName, retentionDays: toNumberField(values.retentionDays, 7) },
      },
    },
  }),
  decompile: (task) => {
    if (task.inputParameters?._actionId === 'ecs.create_snapshot') {
      return {
        instanceId: task.inputParameters.instanceId ?? '',
        snapshotName: task.inputParameters.snapshotName ?? 'backup-auto-snapshot',
        retentionDays: task.inputParameters.retentionDays ?? 7,
      };
    }
    return null;
  },
  mockOutput: (values) => ({
    snapshotId: `s-bp1${Math.random().toString(36).substring(2, 8)}`,
    snapshotName: values.snapshotName || 'backup-auto-snapshot',
    progress: '100%',
    status: 'ACCOMPLISHED',
    sizeGb: 100,
  }),
};

export const ecsRunCommandAction: ActionDefinition = {
  id: 'ecs.run_command',
  name: '执行远程运维脚本',
  category: 'compute',
  icon: 'terminal',
  description: '免登录直接在云主机内部运行 Shell/Python 脚本并捕获返回日志',
  connector: 'cloud_host',
  riskLevel: 'sensitive',
  fields: [
    {
      key: 'instanceId',
      label: '云主机实例 ID',
      type: 'text',
      required: true,
      acceptsPills: true,
    },
    {
      key: 'commandType',
      label: '脚本语言',
      type: 'select',
      defaultValue: 'RunShellScript',
      options: [
        { label: 'Shell 脚本 (Linux)', value: 'RunShellScript' },
        { label: 'Python 脚本', value: 'RunPythonScript' },
      ],
    },
    {
      key: 'commandContent',
      label: '执行脚本命令',
      type: 'textarea',
      placeholder: '例如: df -h && free -m && systemctl status nginx',
      defaultValue: 'uptime && free -m',
      required: true,
      acceptsPills: true,
    },
    {
      key: 'timeoutSeconds',
      label: '超时时间 (秒)',
      type: 'number',
      defaultValue: 60,
    },
  ],
  outputs: [
    { key: 'commandId', label: '调用批次ID', type: 'string', example: 'cmd-0992384' },
    { key: 'exitCode', label: '进程退出码', type: 'number', example: 0 },
    { key: 'output', label: '标准输出日志', type: 'string', example: 'Linux 5.10.134-13.al8.x86_64' },
    { key: 'status', label: '执行状态', type: 'string', example: 'SUCCESS' },
  ],
  compile: (values, ctx) => ({
    name: 'ecs_run_command',
    taskReferenceName: ctx.taskReferenceName,
    type: 'HTTP',
    description: `主机下发命令: ${ctx.taskReferenceName}`,
    inputParameters: {
      _actionId: 'ecs.run_command',
      actionName: '执行远程运维脚本',
      instanceId: values.instanceId,
      commandType: values.commandType ?? 'RunShellScript',
      commandContent: values.commandContent,
      timeoutSeconds: toNumberField(values.timeoutSeconds, 60),
      http_request: {
        uri: `https://ecs.internal.cloud/api/v2/instances/${values.instanceId || ''}/commands`,
        method: 'POST',
        body: {
          commandType: values.commandType ?? 'RunShellScript',
          commandContent: values.commandContent,
          timeoutSeconds: toNumberField(values.timeoutSeconds, 60),
        },
      },
    },
  }),
  decompile: (task) => {
    if (task.inputParameters?._actionId === 'ecs.run_command') {
      return {
        instanceId: task.inputParameters.instanceId ?? '',
        commandType: task.inputParameters.commandType ?? 'RunShellScript',
        commandContent: task.inputParameters.commandContent ?? '',
        timeoutSeconds: task.inputParameters.timeoutSeconds ?? 60,
      };
    }
    return null;
  },
  mockOutput: (values) => ({
    commandId: `cmd-${Date.now().toString(36)}`,
    exitCode: 0,
    output: `[2026-10-20 22:30:00 UTC] Command executed on ${values.instanceId || 'i-bp18a9z3j42m09a'}\nTotal Memory: 8192 MB, Free: 5410 MB\nLoad Average: 0.12, 0.08, 0.05\nResult: OK`,
    status: 'SUCCESS',
  }),
};

export const ecsGetMonitorMetricsAction: ActionDefinition = {
  id: 'ecs.get_monitor_metrics',
  name: '获取运行监控指标',
  category: 'monitor',
  icon: 'chart',
  description: '采集云主机的实时 CPU 利用率、内存消耗与磁盘使用率',
  connector: 'cloud_host',
  riskLevel: 'safe',
  fields: [
    {
      key: 'instanceId',
      label: '云主机实例 ID',
      type: 'text',
      required: true,
      acceptsPills: true,
    },
    {
      key: 'periodSeconds',
      label: '聚合统计周期',
      type: 'select',
      defaultValue: 60,
      options: [
        { label: '最近 1 分钟平均', value: 60 },
        { label: '最近 5 分钟平均', value: 300 },
        { label: '最近 15 分钟平均', value: 900 },
      ],
    },
  ],
  outputs: [
    { key: 'instanceId', label: '实例ID', type: 'string', example: 'i-bp18a9z3j42m09a' },
    { key: 'cpuUsagePercent', label: 'CPU使用率(%)', type: 'number', example: 45.2 },
    { key: 'memoryUsagePercent', label: '内存使用率(%)', type: 'number', example: 62.8 },
    { key: 'diskUsagePercent', label: '磁盘使用率(%)', type: 'number', example: 38.5 },
    { key: 'isOverloaded', label: '是否高负载告警', type: 'boolean', example: false },
  ],
  compile: (values, ctx) => ({
    name: 'ecs_get_monitor_metrics',
    taskReferenceName: ctx.taskReferenceName,
    type: 'HTTP',
    description: `采集监控指标: ${values.instanceId || ctx.taskReferenceName}`,
    inputParameters: {
      _actionId: 'ecs.get_monitor_metrics',
      actionName: '获取运行监控指标',
      instanceId: values.instanceId,
      periodSeconds: toNumberField(values.periodSeconds, 60),
      http_request: {
        uri: `https://ecs.internal.cloud/api/v2/instances/${values.instanceId || ''}/metrics?period=${toNumberField(values.periodSeconds, 60)}`,
        method: 'GET',
      },
    },
  }),
  decompile: (task) => {
    if (task.inputParameters?._actionId === 'ecs.get_monitor_metrics') {
      return {
        instanceId: task.inputParameters.instanceId ?? '',
        periodSeconds: task.inputParameters.periodSeconds ?? 60,
      };
    }
    return null;
  },
  mockOutput: (values) => {
    const cpu = 32.4 + Math.round(Math.random() * 40 * 10) / 10;
    return {
      instanceId: values.instanceId || 'i-bp18a9z3j42m09a',
      cpuUsagePercent: cpu,
      memoryUsagePercent: 58.6,
      diskUsagePercent: 42.1,
      isOverloaded: cpu > 80,
      collectedAt: new Date().toISOString(),
    };
  },
};

export const ecsReleaseInstanceAction: ActionDefinition = {
  id: 'ecs.release_instance',
  name: '释放下线云主机',
  category: 'compute',
  icon: 'trash',
  description: '彻底销毁并下线按量付费云主机，不可恢复',
  connector: 'cloud_host',
  riskLevel: 'sensitive',
  fields: [
    {
      key: 'instanceId',
      label: '云主机实例 ID',
      type: 'text',
      required: true,
      acceptsPills: true,
    },
    {
      key: 'forceRelease',
      label: '是否强制释放 (即刻关机并清理)',
      type: 'boolean',
      defaultValue: false,
    },
  ],
  outputs: [
    { key: 'instanceId', label: '实例ID', type: 'string', example: 'i-bp18a9z3j42m09a' },
    { key: 'status', label: '最终状态', type: 'string', example: 'RELEASED' },
    { key: 'releasedAt', label: '释放时间', type: 'string', example: '2026-10-20T14:30:00Z' },
  ],
  compile: (values, ctx) => ({
    name: 'ecs_release_instance',
    taskReferenceName: ctx.taskReferenceName,
    type: 'HTTP',
    description: `释放云主机: ${values.instanceId || ''}`,
    inputParameters: {
      _actionId: 'ecs.release_instance',
      actionName: '释放下线云主机',
      instanceId: values.instanceId,
      forceRelease: Boolean(values.forceRelease),
      http_request: {
        uri: `https://ecs.internal.cloud/api/v2/instances/${values.instanceId || ''}${values.forceRelease ? '?force=true' : ''}`,
        method: 'DELETE',
      },
    },
  }),
  decompile: (task) => {
    if (task.inputParameters?._actionId === 'ecs.release_instance') {
      return {
        instanceId: task.inputParameters.instanceId ?? '',
        forceRelease: Boolean(task.inputParameters.forceRelease),
      };
    }
    return null;
  },
  mockOutput: (values) => ({
    instanceId: values.instanceId || 'i-bp18a9z3j42m09a',
    status: 'RELEASED',
    releasedAt: new Date().toISOString(),
  }),
};

export const BUILTIN_ECS_ACTIONS: ActionDefinition[] = [
  ecsCreateInstanceAction,
  ecsQueryInstanceAction,
  ecsStartInstanceAction,
  ecsStopInstanceAction,
  ecsRestartInstanceAction,
  ecsModifySpecAction,
  ecsCreateSnapshotAction,
  ecsRunCommandAction,
  ecsGetMonitorMetricsAction,
  ecsReleaseInstanceAction,
];
