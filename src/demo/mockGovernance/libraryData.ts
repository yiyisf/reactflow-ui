import type { SchemaDef, TaskDef, WorkflowDef } from '../../types/conductor';
import type { WorkflowLevel } from '../../types/workflowLibrary';
import type { LibraryExtension, LibraryTaskRecord, LibraryWorkflowRecord } from '../../library/types';

/**
 * 演示用的「编排治理服务」流程库数据（仅 Demo 使用，不从包入口导出）。
 *
 * 全部为合成数据：流程名遵循 `类型-层级-业务域-产品-功能` 命名规范，
 * 定义是 Conductor OSS 标准的 WorkflowDef（inputSchema / outputSchema 为内联 JSON Schema），
 * 补充字段（层级 / 业务域 / 分类 / 图标 / 展示名 / 标签）放在 extension 中，与真实治理服务的返回结构一致。
 */

/** 业务域全局列表（真实环境由服务端维护且可调整，SDK 不写死；这里仅供演示） */
export const DEMO_DOMAINS: readonly string[] = [
  '云资源',
  '配置管理',
  '监控运维',
  '数据服务',
  '通知协助',
  '安全服务',
  '服务管理',
  '运维操作',
  '系统工具',
  '应用管理',
];

/** 版本在治理服务中的状态：PUBLISHED / DEPRECATED 可被获取；WITHDRAWN（已撤回）一律按「不存在」处理 */
export type MockVersionStatus = 'PUBLISHED' | 'DEPRECATED' | 'WITHDRAWN';

export interface MockWorkflowVersion {
  status: MockVersionStatus;
  record: LibraryWorkflowRecord;
}

export interface MockWorkflowEntry {
  name: string;
  /** 按 version 升序 */
  versions: MockWorkflowVersion[];
}

// ── 构造辅助 ────────────────────────────────────────────────────────────────

const OWNER = 'platform-governance@example.com';

interface Prop {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  title: string;
  description: string;
  enum?: string[];
  default?: unknown;
  examples?: unknown[];
}

const str = (title: string, description: string, examples: string[], extra: Partial<Prop> = {}): Prop => ({
  type: 'string',
  title,
  description,
  examples,
  ...extra,
});
const num = (title: string, description: string, examples: number[], extra: Partial<Prop> = {}): Prop => ({
  type: 'integer',
  title,
  description,
  examples,
  ...extra,
});
const bool = (title: string, description: string, def: boolean): Prop => ({
  type: 'boolean',
  title,
  description,
  default: def,
  examples: [def],
});
const arr = (title: string, description: string, examples: unknown[]): Prop => ({
  type: 'array',
  title,
  description,
  examples,
});

function schema(name: string, properties: Record<string, Prop>, required: string[] = []): SchemaDef {
  return {
    name,
    version: 1,
    type: 'JSON',
    data: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties,
      required,
    },
  };
}

interface WorkflowSpec {
  name: string;
  version: number;
  description: string;
  inputs: Record<string, Prop>;
  required?: string[];
  outputs: Record<string, Prop>;
  /** 叶子能力（L1）：用一个 HTTP 任务调用后端接口 */
  http?: { uri: string; method?: 'GET' | 'POST' };
  /** 组合能力（L2 / L3）：依次调用下层能力（固定到当时的版本） */
  subs?: { name: string; version: number }[];
}

function toWorkflowDef(spec: WorkflowSpec): WorkflowDef {
  const inputKeys = Object.keys(spec.inputs);
  const passThrough: Record<string, string> = {};
  for (const k of inputKeys) passThrough[k] = `\${workflow.input.${k}}`;

  let tasks: TaskDef[];
  let outputParameters: Record<string, string>;
  if (spec.subs && spec.subs.length > 0) {
    tasks = spec.subs.map((s, i) => ({
      name: s.name,
      taskReferenceName: `step_${i + 1}`,
      type: 'SUB_WORKFLOW',
      inputParameters: passThrough,
      subWorkflowParam: { name: s.name, version: s.version },
    }));
    const last = tasks[tasks.length - 1].taskReferenceName;
    outputParameters = Object.fromEntries(Object.keys(spec.outputs).map((k) => [k, `\${${last}.output.${k}}`]));
  } else {
    tasks = [
      {
        name: 'http_call',
        taskReferenceName: 'call_api',
        type: 'HTTP',
        inputParameters: {
          http_request: {
            uri: spec.http?.uri ?? 'http://mock-gateway.internal/api/noop',
            method: spec.http?.method ?? 'POST',
            body: passThrough,
            connectionTimeOut: 3000,
            readTimeOut: 10000,
          },
        },
      },
    ];
    outputParameters = Object.fromEntries(
      Object.keys(spec.outputs).map((k) => [k, `\${call_api.output.response.body.${k}}`]),
    );
  }

  return {
    name: spec.name,
    description: spec.description,
    version: spec.version,
    schemaVersion: 2,
    ownerEmail: OWNER,
    restartable: true,
    inputParameters: inputKeys,
    inputSchema: schema(`${spec.name}_input`, spec.inputs, spec.required ?? []),
    outputSchema: schema(`${spec.name}_output`, spec.outputs),
    outputParameters,
    tasks,
  };
}

function version(
  spec: WorkflowSpec,
  ext: Omit<LibraryExtension, 'level' | 'domain'> & { level: WorkflowLevel; domain: string },
  status: MockVersionStatus = 'PUBLISHED',
  versionLabel?: string,
): MockWorkflowVersion {
  const deprecated = status === 'DEPRECATED';
  return {
    status,
    record: {
      def: toWorkflowDef(spec),
      extension: { ...ext, ...(deprecated ? { deprecated: true } : {}) },
      ...(versionLabel ? { versionLabel } : {}),
      ...(deprecated ? { deprecated: true } : {}),
    },
  };
}

// ── 能力定义 ────────────────────────────────────────────────────────────────

const SMS = 'std-L1-通知协助-msg-send_sms';
const CARD = 'std-L1-通知协助-im-send_card';
const ECS_CREATE = 'proxy-L1-云资源-ecs-create_instance';
const ECS_SNAPSHOT = 'std-L1-云资源-ecs-snapshot';
const METRIC = 'std-L1-监控运维-metric-query';
const AUTO_SCALE = 'std-L2-监控运维-alarm-auto_scale';
const QUERY_CI = 'std-L1-配置管理-cmdb-query_ci';
const VULN_FIX = 'std-L2-运维操作-patch-vuln_fix';
const FULL_DEPLOY = 'std-L3-应用管理-release-full_deploy';
const GRANT_TEMP = 'std-L1-安全服务-iam-grant_temp';
const REPORT_EXPORT = 'std-L1-数据服务-report-export';
const SFTP_UPLOAD = 'std-L1-系统工具-sftp-upload_file';

/** 示例流程（public/sample-workflows）与测试共用的名称常量 */
export const DEMO_WORKFLOW_NAMES = {
  SMS,
  CARD,
  ECS_CREATE,
  ECS_SNAPSHOT,
  METRIC,
  AUTO_SCALE,
  QUERY_CI,
  VULN_FIX,
  FULL_DEPLOY,
  GRANT_TEMP,
  REPORT_EXPORT,
  SFTP_UPLOAD,
} as const;

const phoneProp = str('手机号', '接收短信的手机号（11 位，仅示例号段）', ['13800000001']);
const regionProp = str('地域', '资源所在地域', ['cn-east-1'], { enum: ['cn-east-1', 'cn-north-1', 'cn-south-1'] });

const WORKFLOW_ENTRIES: MockWorkflowEntry[] = [
  // ── 通知协助 ──
  {
    name: SMS,
    versions: [
      version(
        {
          name: SMS,
          version: 1,
          description: '向指定手机号发送短信通知',
          inputs: {
            phone: phoneProp,
            content: str('短信内容', '短信正文，不超过 200 字', ['【运维通知】生产环境变更已完成']),
          },
          required: ['phone', 'content'],
          outputs: {
            messageId: str('消息编号', '短信网关返回的消息编号', ['SMS20261020000123']),
            status: str('发送状态', '提交结果', ['SENT'], { enum: ['SENT', 'FAILED'] }),
          },
          http: { uri: 'http://mock-gateway.internal/api/msg/sms/send' },
        },
        { level: 'L1', domain: '通知协助', category: 'notify', icon: '📱', displayName: '发送短信', tags: ['短信', '通知'] },
        'PUBLISHED',
        '1.0.0',
      ),
      // v2：新增可选入参「签名」，无破坏性变化
      version(
        {
          name: SMS,
          version: 2,
          description: '向指定手机号发送短信通知（支持自定义签名）',
          inputs: {
            phone: phoneProp,
            content: str('短信内容', '短信正文，不超过 200 字', ['【运维通知】生产环境变更已完成']),
            signature: str('短信签名', '短信签名，缺省使用平台默认签名', ['运维中心']),
          },
          required: ['phone', 'content'],
          outputs: {
            messageId: str('消息编号', '短信网关返回的消息编号', ['SMS20261020000123']),
            status: str('发送状态', '提交结果', ['SENT'], { enum: ['SENT', 'FAILED'] }),
          },
          http: { uri: 'http://mock-gateway.internal/api/msg/sms/send' },
        },
        { level: 'L1', domain: '通知协助', category: 'notify', icon: '📱', displayName: '发送短信', tags: ['短信', '通知'] },
        'PUBLISHED',
        '1.1.0',
      ),
    ],
  },
  {
    name: CARD,
    versions: [
      version(
        {
          name: CARD,
          version: 1,
          description: '向即时通讯群发送消息卡片，可附带操作按钮',
          inputs: {
            chatId: str('群编号', '接收卡片的群编号', ['oc_demo_ops_group']),
            title: str('卡片标题', '卡片顶部标题', ['发布完成通知']),
            content: str('卡片内容', '支持简单的 Markdown', ['**应用 order-service** 已发布到生产环境']),
            level: str('提醒级别', '决定卡片颜色', ['info'], { enum: ['info', 'warning', 'critical'], default: 'info' }),
          },
          required: ['chatId', 'title', 'content'],
          outputs: {
            messageId: str('消息编号', '即时通讯返回的消息编号', ['om_demo_000456']),
          },
          http: { uri: 'http://mock-gateway.internal/api/im/card/send' },
        },
        { level: 'L1', domain: '通知协助', category: 'notify', icon: '💬', displayName: '发送群消息卡片', tags: ['即时通讯', '通知'] },
        'PUBLISHED',
        '1.0.0',
      ),
    ],
  },

  // ── 云资源 ──
  {
    name: ECS_CREATE,
    versions: [
      version(
        {
          name: ECS_CREATE,
          version: 1,
          description: '代理云平台创建云主机实例（proxy 类，转发到云平台接口）',
          inputs: {
            regionId: regionProp,
            instanceType: str('规格', '云主机规格', ['ecs.c7.large'], {
              enum: ['ecs.c7.large', 'ecs.c7.xlarge', 'ecs.g7.2xlarge'],
            }),
            imageId: str('镜像', '系统镜像编号', ['image-linux-3']),
            instanceName: str('实例名称', '实例显示名称', ['demo-app-node-01']),
            systemDiskSize: num('系统盘大小（GB）', '系统盘容量，范围 40–500', [100], { default: 100 }),
          },
          required: ['regionId', 'instanceType', 'imageId', 'instanceName'],
          outputs: {
            instanceId: str('实例编号', '创建成功的实例编号', ['i-demo0001']),
            privateIp: str('内网 IP', '实例内网地址', ['10.20.30.41']),
          },
          http: { uri: 'http://mock-gateway.internal/api/proxy/ecs/create' },
        },
        { level: 'L1', domain: '云资源', category: 'compute', icon: '🖥️', displayName: '创建云主机', tags: ['云主机', '计算'] },
        'PUBLISHED',
        '1.0.0',
      ),
    ],
  },
  {
    name: ECS_SNAPSHOT,
    versions: [
      // v1：已被治理服务撤回（发现缺陷），get 返回 404；演示「固定版本不可用」
      version(
        {
          name: ECS_SNAPSHOT,
          version: 1,
          description: '为云主机系统盘创建快照',
          inputs: {
            instanceId: str('实例编号', '要做快照的云主机实例编号', ['i-demo0001']),
          },
          required: ['instanceId'],
          outputs: {
            snapshotId: str('快照编号', '创建成功的快照编号', ['snap-demo0001']),
          },
          http: { uri: 'http://mock-gateway.internal/api/ecs/snapshot' },
        },
        { level: 'L1', domain: '云资源', category: 'storage', icon: '📸', displayName: '云主机快照', tags: ['快照', '备份'] },
        'WITHDRAWN',
        '1.0.0',
      ),
      version(
        {
          name: ECS_SNAPSHOT,
          version: 2,
          description: '为云主机的系统盘与数据盘创建快照，可设置保留天数',
          inputs: {
            instanceId: str('实例编号', '要做快照的云主机实例编号', ['i-demo0001']),
            includeDataDisk: bool('包含数据盘', '是否同时为数据盘创建快照', false),
            retentionDays: num('保留天数', '快照保留天数，超期自动清理', [7], { default: 7 }),
          },
          required: ['instanceId'],
          outputs: {
            snapshotId: str('快照编号', '创建成功的快照编号', ['snap-demo0002']),
            sizeGb: num('快照大小（GB）', '快照占用的存储容量', [120]),
          },
          http: { uri: 'http://mock-gateway.internal/api/ecs/snapshot' },
        },
        { level: 'L1', domain: '云资源', category: 'storage', icon: '📸', displayName: '云主机快照', tags: ['快照', '备份'] },
        'PUBLISHED',
        '2.0.0',
      ),
    ],
  },

  // ── 监控运维 ──
  {
    name: METRIC,
    versions: [
      version(
        {
          name: METRIC,
          version: 1,
          description: '查询监控指标在最近一段时间内的统计值',
          inputs: {
            resourceId: str('资源编号', '被监控的资源编号', ['i-demo0001']),
            metric: str('指标', '监控指标名称', ['cpu_usage'], { enum: ['cpu_usage', 'mem_usage', 'disk_usage', 'net_in'] }),
            minutes: num('统计时长（分钟）', '向前统计多少分钟', [15], { default: 15 }),
          },
          required: ['resourceId', 'metric'],
          outputs: {
            avg: num('平均值', '统计时段内平均值（百分比或速率）', [63]),
            max: num('最大值', '统计时段内最大值', [91]),
          },
          http: { uri: 'http://mock-gateway.internal/api/monitor/metric/query', method: 'GET' },
        },
        { level: 'L1', domain: '监控运维', category: 'monitor', icon: '📈', displayName: '查询监控指标', tags: ['监控', '指标'] },
        'PUBLISHED',
        '1.0.0',
      ),
    ],
  },
  {
    name: AUTO_SCALE,
    versions: [
      version(
        {
          name: AUTO_SCALE,
          version: 1,
          description: '告警触发后检查资源负载，必要时自动扩容并通知值班人',
          inputs: {
            resourceId: str('资源编号', '触发告警的资源编号', ['i-demo0001']),
            metric: str('指标', '监控指标名称', ['cpu_usage'], { enum: ['cpu_usage', 'mem_usage', 'disk_usage', 'net_in'] }),
            minutes: num('统计时长（分钟）', '向前统计多少分钟', [15], { default: 15 }),
            regionId: regionProp,
            instanceType: str('规格', '扩容时使用的云主机规格', ['ecs.c7.large'], { enum: ['ecs.c7.large', 'ecs.c7.xlarge', 'ecs.g7.2xlarge'] }),
            imageId: str('镜像', '系统镜像编号', ['image-linux-3']),
            instanceName: str('实例名称', '新增实例名称', ['demo-app-node-02']),
          },
          required: ['resourceId', 'metric', 'regionId', 'instanceType', 'imageId', 'instanceName'],
          outputs: {
            instanceId: str('新增实例编号', '扩容新增的实例编号，未扩容时为空', ['i-demo0002']),
          },
          subs: [
            { name: METRIC, version: 1 },
            { name: ECS_CREATE, version: 1 },
          ],
        },
        { level: 'L2', domain: '监控运维', category: 'monitor', icon: '⚖️', displayName: '告警自动扩容', tags: ['告警', '扩容'] },
        'PUBLISHED',
        '1.0.0',
      ),
    ],
  },

  // ── 配置管理（v2 新增必填入参、删除出参，用于演示升级差异） ──
  {
    name: QUERY_CI,
    versions: [
      version(
        {
          name: QUERY_CI,
          version: 1,
          description: '按类型与关键字查询配置项（CI）',
          inputs: {
            ciType: str('配置项类型', '要查询的配置项类型', ['服务器'], { enum: ['服务器', '数据库', '中间件', '网络设备'] }),
            keyword: str('关键字', '按名称或 IP 模糊匹配', ['order']),
            pageSize: num('返回条数', '最多返回的配置项数量', [20], { default: 20 }),
          },
          required: ['ciType'],
          outputs: {
            ciList: arr('配置项列表', '匹配到的配置项', [[{ ciId: 'ci-0001', name: 'order-db-01' }]]),
            total: num('总数', '匹配的配置项总数', [1]),
            costMs: num('耗时（毫秒）', '查询耗时，仅供调试', [38]),
          },
          http: { uri: 'http://mock-gateway.internal/api/cmdb/ci/query' },
        },
        { level: 'L1', domain: '配置管理', category: 'custom', icon: '🗂️', displayName: '查询配置项', tags: ['CMDB', '查询'] },
        'PUBLISHED',
        '1.0.0',
      ),
      version(
        {
          name: QUERY_CI,
          version: 2,
          description: '按租户、类型与关键字查询配置项（CI），支持容器类型',
          inputs: {
            tenantId: str('租户编号', '配置项所属租户，用于数据隔离', ['tenant-demo-01']),
            ciType: str('配置项类型', '要查询的配置项类型', ['服务器'], {
              enum: ['服务器', '数据库', '中间件', '网络设备', '容器'],
            }),
            keyword: str('关键字', '按名称或 IP 模糊匹配', ['order']),
            pageSize: num('返回条数', '最多返回的配置项数量', [20], { default: 20 }),
          },
          required: ['tenantId', 'ciType'],
          outputs: {
            ciList: arr('配置项列表', '匹配到的配置项', [[{ ciId: 'ci-0001', name: 'order-db-01' }]]),
            total: num('总数', '匹配的配置项总数', [1]),
          },
          http: { uri: 'http://mock-gateway.internal/api/cmdb/ci/query' },
        },
        { level: 'L1', domain: '配置管理', category: 'custom', icon: '🗂️', displayName: '查询配置项', tags: ['CMDB', '查询'] },
        'PUBLISHED',
        '2.0.0',
      ),
    ],
  },

  // ── 运维操作 ──
  {
    name: VULN_FIX,
    versions: [
      version(
        {
          name: VULN_FIX,
          version: 1,
          description: '对目标云主机先做快照再修复漏洞，完成后通知责任人',
          inputs: {
            instanceId: str('实例编号', '待修复的云主机实例编号', ['i-demo0001']),
            includeDataDisk: bool('包含数据盘', '快照是否包含数据盘', false),
            retentionDays: num('快照保留天数', '修复前快照的保留天数', [7], { default: 7 }),
            vulnId: str('漏洞编号', '需要修复的漏洞编号', ['CVE-2026-0001']),
            phone: phoneProp,
            content: str('短信内容', '修复完成后通知责任人的短信正文', ['【运维通知】漏洞修复已完成']),
          },
          required: ['instanceId', 'vulnId'],
          outputs: {
            messageId: str('消息编号', '通知短信的消息编号', ['SMS20261020000124']),
          },
          subs: [
            { name: ECS_SNAPSHOT, version: 2 },
            { name: SMS, version: 2 },
          ],
        },
        { level: 'L2', domain: '运维操作', category: 'custom', icon: '🛡️', displayName: '漏洞修复', tags: ['漏洞', '补丁'] },
        'PUBLISHED',
        '1.0.0',
      ),
    ],
  },

  // ── 应用管理 ──
  {
    name: FULL_DEPLOY,
    versions: [
      version(
        {
          name: FULL_DEPLOY,
          version: 1,
          description: '应用全量发布：发布前快照、漏洞检查修复、发布后通知群',
          inputs: {
            appName: str('应用名称', '待发布的应用', ['order-service']),
            releaseVersion: str('发布版本', '本次发布的版本号', ['2026.10.2']),
            instanceId: str('实例编号', '应用所在云主机实例编号', ['i-demo0001']),
            vulnId: str('漏洞编号', '发布前需要处理的漏洞编号', ['CVE-2026-0001']),
            chatId: str('群编号', '接收发布通知的群编号', ['oc_demo_ops_group']),
            title: str('卡片标题', '发布通知卡片标题', ['发布完成通知']),
            content: str('卡片内容', '发布通知卡片正文', ['order-service 2026.10.2 已发布']),
          },
          required: ['appName', 'releaseVersion', 'instanceId'],
          outputs: {
            messageId: str('通知编号', '发布通知的消息编号', ['om_demo_000457']),
          },
          subs: [
            { name: ECS_SNAPSHOT, version: 2 },
            { name: VULN_FIX, version: 1 },
            { name: CARD, version: 1 },
          ],
        },
        { level: 'L3', domain: '应用管理', category: 'logic', icon: '🚀', displayName: '应用全量发布', tags: ['发布', '端到端'] },
        'PUBLISHED',
        '1.0.0',
      ),
    ],
  },

  // ── 安全服务 ──
  {
    name: GRANT_TEMP,
    versions: [
      version(
        {
          name: GRANT_TEMP,
          version: 1,
          description: '为用户临时授予资源访问权限，到期自动回收',
          inputs: {
            userAccount: str('用户账号', '被授权的用户账号', ['zhangsan']),
            resourceId: str('资源编号', '被访问的资源编号', ['i-demo0001']),
            role: str('权限角色', '授予的角色', ['readonly'], { enum: ['readonly', 'operator', 'admin'] }),
            hours: num('有效时长（小时）', '到期后自动回收，最长 72 小时', [4], { default: 4 }),
          },
          required: ['userAccount', 'resourceId', 'role'],
          outputs: {
            grantId: str('授权编号', '授权记录编号', ['grant-demo-0001']),
            expireAt: str('到期时间', '权限回收时间（ISO 8601）', ['2026-10-23T18:00:00+08:00']),
          },
          http: { uri: 'http://mock-gateway.internal/api/iam/grant/temp' },
        },
        { level: 'L1', domain: '安全服务', category: 'human', icon: '🔑', displayName: '临时授权', tags: ['权限', '授权'] },
        'PUBLISHED',
        '1.0.0',
      ),
    ],
  },

  // ── 数据服务 ──
  {
    name: REPORT_EXPORT,
    versions: [
      version(
        {
          name: REPORT_EXPORT,
          version: 1,
          description: '按报表模板与统计周期导出报表文件',
          inputs: {
            reportCode: str('报表编码', '报表模板编码', ['RPT_RESOURCE_MONTHLY']),
            period: str('统计周期', '统计的月份，格式 yyyy-MM', ['2026-09']),
            format: str('导出格式', '导出文件格式', ['xlsx'], { enum: ['xlsx', 'csv', 'pdf'], default: 'xlsx' }),
          },
          required: ['reportCode', 'period'],
          outputs: {
            fileUrl: str('文件地址', '导出文件的下载地址（有效期 24 小时）', ['http://mock-gateway.internal/files/rpt-demo.xlsx']),
            rows: num('行数', '报表数据行数', [1280]),
          },
          http: { uri: 'http://mock-gateway.internal/api/data/report/export' },
        },
        { level: 'L1', domain: '数据服务', category: 'storage', icon: '📊', displayName: '导出报表', tags: ['报表', '导出'] },
        'PUBLISHED',
        '1.0.0',
      ),
    ],
  },

  // ── 系统工具（整项能力已下线） ──
  {
    name: SFTP_UPLOAD,
    versions: [
      version(
        {
          name: SFTP_UPLOAD,
          version: 1,
          description: '通过 SFTP 上传文件到目标主机（已下线，请改用对象存储方式）',
          inputs: {
            host: str('目标主机', '目标主机地址', ['10.20.30.41']),
            remotePath: str('远程路径', '文件上传到的目录', ['/data/upload']),
            fileUrl: str('文件地址', '待上传文件的下载地址', ['http://mock-gateway.internal/files/demo.tar.gz']),
          },
          required: ['host', 'remotePath', 'fileUrl'],
          outputs: {
            uploaded: bool('上传成功', '是否上传成功', true),
          },
          http: { uri: 'http://mock-gateway.internal/api/tools/sftp/upload' },
        },
        { level: 'L1', domain: '系统工具', category: 'network', icon: '📤', displayName: 'SFTP 上传文件', tags: ['文件', '上传'] },
        'DEPRECATED',
        '1.0.0',
      ),
    ],
  },
];

// ── 原子任务（TaskDef） ─────────────────────────────────────────────────────

const TASK_RECORDS: LibraryTaskRecord[] = [
  {
    def: {
      name: 'demo_calc_checksum',
      description: '计算文本内容的摘要值，用于数据一致性校验',
      ownerEmail: OWNER,
      inputSchema: schema('demo_calc_checksum_input', {
        content: str('文本内容', '需要计算摘要的文本', ['order-service-2026.10.2']),
        algorithm: str('算法', '摘要算法', ['SHA-256'], { enum: ['MD5', 'SHA-256'], default: 'SHA-256' }),
      }, ['content']),
      outputSchema: schema('demo_calc_checksum_output', {
        checksum: str('摘要值', '十六进制摘要', ['9f86d081884c7d659a2feaa0c55ad015']),
      }),
    },
    extension: { domain: '系统工具', category: 'custom', icon: '🔢', displayName: '计算摘要', tags: ['校验'] },
  },
  {
    def: {
      name: 'demo_wait_approval',
      description: '创建审批单并等待审批结果',
      ownerEmail: OWNER,
      inputSchema: schema('demo_wait_approval_input', {
        applicant: str('申请人', '发起审批的账号', ['zhangsan']),
        reason: str('申请理由', '审批单上展示的理由', ['生产变更发布']),
      }, ['applicant', 'reason']),
      outputSchema: schema('demo_wait_approval_output', {
        approved: bool('是否通过', '审批是否通过', true),
        approver: str('审批人', '最终审批人账号', ['lisi']),
      }),
    },
    extension: { domain: '服务管理', category: 'human', icon: '✅', displayName: '等待审批', tags: ['审批'] },
  },
];

// ── 对外 ────────────────────────────────────────────────────────────────────

/** 返回演示数据的深拷贝（调用方可随意修改而不影响其他 Provider 实例） */
export function createDemoLibraryData(): { workflows: MockWorkflowEntry[]; tasks: LibraryTaskRecord[] } {
  return {
    workflows: structuredClone(WORKFLOW_ENTRIES),
    tasks: structuredClone(TASK_RECORDS),
  };
}
