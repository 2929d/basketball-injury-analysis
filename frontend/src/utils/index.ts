import type { RiskLevel } from '../types'

/** 风险等级对应颜色 */
export const RISK_COLORS: Record<string, string> = {
  低风险: '#06d6a0',
  中风险: '#ffd166',
  高风险: '#ef476f',
}

/** 评分(0-100)对应颜色，分数越高越危险 */
export function scoreColor(score: number): string {
  if (score >= 67) return '#ef476f'
  if (score >= 34) return '#ffd166'
  return '#06d6a0'
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
