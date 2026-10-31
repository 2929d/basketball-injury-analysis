import type { RiskLevel } from '../types'

/** 风险等级对应颜色（低饱和度、柔和版，降低刺眼对比度） */
export const RISK_COLORS: Record<string, string> = {
  低风险: '#8fd19e',
  中风险: '#f0c975',
  高风险: '#e07a8a',
}

/** 评分(0-100)对应颜色，分数越高越危险（柔和版） */
export function scoreColor(score: number): string {
  if (score >= 67) return '#e07a8a'
  if (score >= 34) return '#f0c975'
  return '#8fd19e'
}

/** 评分对应等级文本 */
export function scoreLevel(score: number): RiskLevel {
  if (score >= 67) return '高风险'
  if (score >= 34) return '中风险'
  return '低风险'
}

/** 分析状态映射中文文案 */
export const STATUS_TEXT: Record<string, string> = {
  queued: '排队等待中',
  quality_checking: '视频质量检测中',
  posing: '姿态识别中',
  extracting: '特征提取中',
  scoring: '风险评分中',
  done: '分析完成',
  error: '分析出错',
}

/** 格式化数字，保留指定小数位 */
export function fmtNum(n: number | undefined | null, digits = 1): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '--'
  return Number(n).toFixed(digits)
}

/**
 * 判断运动员自填文本是否表示"确实存在"（疼痛/伤病）。
 * 表单提示用户填"无"表示没有，但空串/无/没有/none/no/false/否 等都应视为"不存在"，
 * 避免把"无"当作 truthy 而误报"存在疼痛/伤病史"。
 */
export function isPresent(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return false
  // 以否定词开头或整体为否定词 → 视为不存在
  if (
    s.startsWith('无') ||
    s.startsWith('没有') ||
    s.startsWith('none') ||
    s.startsWith('no') ||
    s === 'false' ||
    s === 'n/a' ||
    s === 'na' ||
    s === '否' ||
    s === '正常' ||
    s === '健康'
  ) {
    return false
  }
  return true
}
