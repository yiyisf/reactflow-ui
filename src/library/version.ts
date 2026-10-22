/**
 * 版本号规范化：统一为整数（Conductor 的版本就是整数）。
 *
 * | 输入 | 结果 |
 * |---|---|
 * | 整数 | 原样 |
 * | 静态 "3" | 3，label "3" |
 * | 静态 "1.2.0" 等 | 取 parseInt 主版本号，label 保留原串，warn = true |
 */
export interface NormalizedVersion {
  version: number;
  /** 原始可读版本串（仅当输入是字符串，或无法原样用作整数时保留） */
  label?: string;
  /** 是否发生了有损转换（调用方据此告警一次） */
  lossy: boolean;
}

export function normalizeVersion(input: number | string | undefined | null): NormalizedVersion {
  if (input === undefined || input === null || input === '') {
    // Conductor 缺省版本为 1
    return { version: 1, lossy: false };
  }
  if (typeof input === 'number') {
    if (Number.isInteger(input)) return { version: input, lossy: false };
    const v = Math.floor(input);
    return { version: Number.isFinite(v) && v > 0 ? v : 1, label: String(input), lossy: true };
  }
  const raw = String(input).trim();
  if (/^\d+$/.test(raw)) {
    return { version: parseInt(raw, 10), label: raw, lossy: false };
  }
  // "v3" / "1.2.0" 等：取第一段连续数字作为主版本号
  const m = raw.match(/\d+/);
  const major = m ? parseInt(m[0], 10) : NaN;
  return { version: Number.isNaN(major) ? 1 : major, label: raw, lossy: true };
}
