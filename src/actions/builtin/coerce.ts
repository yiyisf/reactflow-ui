/** 值中含 `${...}` 引用（数据胶囊 / 表达式）时视为运行时取值，编译时原样保留 */
export const isExpressionValue = (v: unknown): boolean => typeof v === 'string' && v.includes('${');

/**
 * 数字字段编译：
 * - 空值（未填 / 清空）回落到默认值，而不是 0（例如保留天数 0 表示"永久保留"，不能因清空而误设）
 * - 含 `${...}` 的数据胶囊原样保留（Number('${...}') 会得到 NaN，序列化后变成 null）
 * - 可解析的数字文本转为数字；无法解析的文本原样保留，交给运行时 / 校验提示
 */
export function toNumberField(v: unknown, fallback: number): number | string {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'string') {
    if (isExpressionValue(v)) return v;
    const n = Number(v.trim());
    return v.trim() !== '' && Number.isFinite(n) ? n : v;
  }
  return fallback;
}
