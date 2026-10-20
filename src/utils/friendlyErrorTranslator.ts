/**
 * 生活化错误诊断结构
 */
export interface FriendlyErrorDiagnosis {
  /** 错误分类类型 */
  type: 'auth' | 'timeout' | 'missing_data' | 'quota' | 'script_fail' | 'network' | 'unknown';
  /** 大白话标题 */
  title: string;
  /** 通俗易懂的业务原因解释（普通人能看懂） */
  explanation: string;
  /** 系统给出的可行动建议方案 */
  suggestion: string;
  /** 一键快捷恢复动作文案（可选） */
  actionLabel?: string;
  /** 快捷动作标识（可选） */
  actionKey?: 'reauth' | 'retry' | 'inspect_upstream' | 'change_spec' | 'contact_admin';
}

/**
 * 将技术错误日志、HTTP 状态码或调用栈翻译为普通业务人员可理解的生活化诊断
 *
 * @param errorMessage 底层技术报错信息或异常原因 (reasonForIncompletion)
 * @param statusCode HTTP 响应状态码 (可选)
 * @param taskName 任务名称 (可选)
 * @returns 业务化诊断卡片数据
 */
export function translateTechnicalError(
  errorMessage?: string,
  statusCode?: number,
  taskName?: string
): FriendlyErrorDiagnosis {
  const msg = (errorMessage || '').toLowerCase();

  // 1. 认证鉴权失效或拒绝访问 (HTTP 401 / 403 / Token / Unauthorized)
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('token expired') ||
    msg.includes('invalid api key') ||
    msg.includes('signature does not match')
  ) {
    return {
      type: 'auth',
      title: '云平台账号授权已失效或权限受限',
      explanation: `在调用【${taskName || '云服务'}】时未通过安全身份核验。通常是因为配置的账号密钥 (AccessKey/Token) 已过期失效，或该账号缺乏对应资源的操作授权。`,
      suggestion: '建议检查账号授权状态，重新填入有效密钥或联系企业管理员为该账号分配权限。',
      actionLabel: '重新授权密钥',
      actionKey: 'reauth',
    };
  }

  // 2. 超时未响应 (Timeout / ETIMEDOUT / 504 / DeadlineExceeded)
  if (
    statusCode === 504 ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('etimedout') ||
    msg.includes('deadline') ||
    msg.includes('connection refused')
  ) {
    return {
      type: 'timeout',
      title: '目标云主机响应超时',
      explanation: `向【${taskName || '主机'}】发送指令后，在约定的时间内未收到回应。可能是云主机刚开机系统服务尚未就绪，或所在子网的安全组策略拦截了通信端口。`,
      suggestion: '云服务正在进行底层引导，通常稍等片刻自动重试即可恢复。',
      actionLabel: '稍后自动重试',
      actionKey: 'retry',
    };
  }

  // 3. 远程脚本执行非零退出码 (Shell / Script exit code)
  if (msg.includes('exit code') || msg.includes('command failed') || msg.includes('command not found') || msg.includes('syntax error')) {
    return {
      type: 'script_fail',
      title: '主机内部脚本执行异常退出',
      explanation: `下发到云主机内部的 Shell/Python 脚本在运行过程中遇到错误并提前中断。通常是因为目标环境中缺少前置依赖库，或指定的文件路径不存在。`,
      suggestion: '可展开下方查看脚本的标准输出日志排查具体报错，修正脚本后重新执行。',
      actionLabel: '查看脚本输出日志',
      actionKey: 'inspect_upstream',
    };
  }

  // 4. 上游字段缺失或空指针 (NullPointer / undefined / missing field)
  if (
    msg.includes('nullpointer') ||
    msg.includes('cannot read property') ||
    msg.includes('undefined') ||
    msg.includes('field not found') ||
    msg.includes('parameter not found') ||
    msg.includes('missing required parameter')
  ) {
    return {
      type: 'missing_data',
      title: '缺少必要的上游输入数据',
      explanation: `本步骤引用的上游步骤没有返回预期的数据内容（例如没有获取到有效的「主机实例ID」或「内网IP」），导致后续步骤无法继续执行。`,
      suggestion: '请点击检查上游步骤的输出结果，确认上游任务是否正常产生了所需的数据胶囊。',
      actionLabel: '查看上游步骤数据',
      actionKey: 'inspect_upstream',
    };
  }

  // 4. 配额不足或欠费限额 (Quota / Balance / LimitExceeded)
  if (
    msg.includes('quota') ||
    msg.includes('limit exceeded') ||
    msg.includes('insufficient') ||
    msg.includes('out of stock') ||
    msg.includes('balance')
  ) {
    return {
      type: 'quota',
      title: '可用区资源库存不足或配额受限',
      explanation: `当前所选可用区该型号的云主机规格暂时售罄，或云平台租户的配额上限已满。`,
      suggestion: '建议在流程中更换目标规格（如选择通用型或计算型同等配置），或申请提升账号配额。',
      actionLabel: '更换规格/可用区',
      actionKey: 'change_spec',
    };
  }

  // 6. 网络连接失败 (Network / DNS / unreachable)
  if (msg.includes('network') || msg.includes('dns') || msg.includes('unreachable') || msg.includes('failed to fetch')) {
    return {
      type: 'network',
      title: '网络通信中断或无法解析',
      explanation: '调度服务与目标云服务之间的网络连接不稳定，或专有网络 VPC 路由未打通。',
      suggestion: '请检查网络连通性配置，或联系网络运维人员协助排查。',
      actionLabel: '重新尝试连接',
      actionKey: 'retry',
    };
  }

  // 7. 通用兜底
  return {
    type: 'unknown',
    title: '步骤执行未达预期',
    explanation: errorMessage || '执行过程中底层服务报告了非成功状态，请查阅详细日志。',
    suggestion: '可点击重试此步骤，或将此诊断报告反馈给技术支持排查。',
    actionLabel: '重试此任务',
    actionKey: 'retry',
  };
}
