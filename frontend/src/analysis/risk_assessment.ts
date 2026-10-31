/**
 * 风险评估引擎（从后端 core/risk_assessment.py 迁移）
 *
 * 基于生物力学特征, 用启发式阈值规则计算各部位风险评分(0-100)。
 * 评分代表动作中潜在高风险特征的程度, 不等同于医学伤病诊断。
 */
import type {
  AthleteInfo,
  BiomechanicsFeatures,
  RiskItem,
  RiskLevel,
  RiskResult,
  TrainingDay,
  TrainingExercise,
} from './types'
import { getGearRecommendations, getRecommendations } from './intervention'
import { isPresent } from '../utils'

const RISK_LOW_THRESHOLD = 35
const RISK_HIGH_THRESHOLD = 65

function level(score: number): RiskLevel {
  if (score < RISK_LOW_THRESHOLD) return '低风险'
  if (score < RISK_HIGH_THRESHOLD) return '中风险'
  return '高风险'
}

function clipScore(x: number): number {
  return Math.max(0, Math.min(100, x))
}

/** 数值是否可信: 必须是有限数, 且落在人体生理可能的区间内 */
function usable(v: number | null | undefined, min: number, max: number): boolean {
  return typeof v === 'number' && isFinite(v) && v >= min && v <= max
}

/**
 * 平滑风险映射（替代旧的硬截断 linear）
 *
 * 旧实现的问题: value 一旦超过 high 就直接 clip 成 100 分,
 * 于是"稍有风险就满分", 且特征检测失败时(值为 0)同样被算成 100 分。
 *
 * 新实现:
 * - value <= low              → 0 分
 * - value 在 [low, high] 内    → smoothstep S 曲线映射到 [0, softMax], 中段区分度更高
 * - value > high(超标)         → 继续增长但饱和趋近 99, 保留"较重/极重"的区分
 */
function ramp(value: number, low: number, high: number, softMax = 92): number {
  if (high <= low) return 0
  const t = (value - low) / (high - low)
  if (!isFinite(t)) return 0
  if (t <= 0) return 0
  // 超标: 继续增长但饱和趋近 99, 保留"较重/极重"的区分（旧版此处直接 clip 成 100）
  if (t >= 1) return softMax + Math.min(t - 1, 1) * (99 - softMax)
  // 线性映射: 中段保持线性, 保证分数对风险程度敏感（不用 smoothstep, 否则中段被过度压低）
  return t * softMax
}

/** 单个风险维度的评估产出 */
interface CatAssessment {
  score: number
  codes: string[]
  /** 该维度的数据可信度 0-1（可信指标权重 / 全部指标权重） */
  confidence: number
  /** 因超出人体生理范围被剔除的指标说明 */
  issues: string[]
}

/**
 * 指标收集器: 自动统计"可信指标占比", 把检测失败的指标剔除而非计为满分。
 */
function makeTracker() {
  const metrics: Array<{ score: number; weight: number }> = []
  const issues: string[] = []
  let totalW = 0
  let usedW = 0
  return {
    add(ok: boolean, weight: number, score: () => number, issue?: string) {
      totalW += weight
      if (ok) {
        metrics.push({ score: score(), weight })
        usedW += weight
      } else if (issue) {
        issues.push(issue)
      }
    },
    result(codes: string[]): CatAssessment {
      return {
        score: combineMetrics(metrics),
        codes,
        confidence: totalW > 0 ? usedW / totalW : 0,
        issues,
      }
    },
  }
}

/**
 * 多指标"软聚合": 最严重的指标主导, 其余指标小幅贡献。
 * 旧实现直接取 max —— 任意一个指标异常就能把整个维度顶到 100 分。
 */
function combineMetrics(metrics: Array<{ score: number; weight: number }>): number {
  if (!metrics.length) return 0
  let maxS = -1
  let maxW = 0
  let sum = 0
  let wsum = 0
  for (const m of metrics) {
    sum += m.score * m.weight
    wsum += m.weight
    if (m.score > maxS) {
      maxS = m.score
      maxW = m.weight
    }
  }
  const restW = wsum - maxW
  const restAvg = restW > 0 ? (sum - maxS * maxW) / restW : sum / (wsum || 1)
  // 主指标 72%, 其余指标平均 28%
  return clipScore(maxS * 0.72 + restAvg * 0.28)
}

function assessKnee(f: BiomechanicsFeatures): CatAssessment {
  const t = makeTracker()
  const codes: string[] = []

  // 膝内扣(膝外翻): 0-45° 之外视为检测失败, 剔除而非计满分
  const valgusOk = usable(f.knee.valgus_deg, 0, 45)
  t.add(valgusOk, 1.0, () => ramp(f.knee.valgus_deg, 4, 22), '膝内扣角度检测异常')
  if (valgusOk && f.knee.valgus_deg > 12) codes.push('valgus')

  // 初次触地屈曲不足
  const icOk = usable(f.knee.initial_contact_flexion_deg, 0, 90)
  t.add(icOk, 1.0, () => ramp(25 - f.knee.initial_contact_flexion_deg, 2, 18), '触地屈曲角度检测异常')
  if (icOk && f.knee.initial_contact_flexion_deg < 20) codes.push('flexion_insufficient')

  // 左右差异
  const asymOk = usable(f.knee.left_right_diff_deg, 0, 60)
  t.add(asymOk, 0.8, () => ramp(f.knee.left_right_diff_deg, 5, 25), '左右膝角差异检测异常')
  if (asymOk && f.knee.left_right_diff_deg > 15) codes.push('asymmetry')

  // 角速度过大
  const avOk = usable(f.knee.angular_velocity, 0, 3000)
  t.add(avOk, 0.6, () => ramp(f.knee.angular_velocity, 150, 450), '膝角速度检测异常')
  if (avOk && f.knee.angular_velocity > 300) codes.push('angular_velocity')

  if (!codes.length) codes.push('valgus')
  return t.result(codes)
}

function assessAnkle(f: BiomechanicsFeatures): CatAssessment {
  const t = makeTracker()
  const codes: string[] = []

  const dfOk = usable(f.ankle.dorsiflexion_deg, -30, 60)
  t.add(dfOk, 1.0, () => ramp(20 - f.ankle.dorsiflexion_deg, 1, 11), '踝背屈角度检测异常')
  if (dfOk && f.ankle.dorsiflexion_deg < 15) codes.push('dorsiflexion')

  const swayOk = usable(f.ankle.ankle_sway_deg, 0, 30)
  t.add(swayOk, 1.0, () => ramp(f.ankle.ankle_sway_deg, 0.3, 1.5), '踝晃动幅度检测异常')
  if (swayOk && f.ankle.ankle_sway_deg > 0.6) codes.push('instability')

  const ctOk = usable(f.ankle.left_right_contact_time_diff_ms, -2000, 2000)
  t.add(ctOk, 0.7, () => ramp(Math.abs(f.ankle.left_right_contact_time_diff_ms), 20, 100), '左右触地时间差检测异常')
  if (ctOk && Math.abs(f.ankle.left_right_contact_time_diff_ms) > 50) codes.push('asymmetry')

  if (!codes.length) codes.push('instability')
  return t.result(codes)
}

function assessHip(f: BiomechanicsFeatures): CatAssessment {
  const t = makeTracker()
  const codes: string[] = []

  // 髋屈曲现为落地阶段最大值, 正常30-60°, <20°为风险
  const flexOk = usable(f.hip.flexion_deg, 0, 120)
  t.add(flexOk, 1.0, () => ramp(25 - f.hip.flexion_deg, 2, 18), '髋屈曲角度检测异常')
  if (flexOk && f.hip.flexion_deg < 20) codes.push('flexion')

  const pelvicOk = usable(f.hip.pelvic_tilt_deg, 0, 60)
  t.add(pelvicOk, 0.9, () => ramp(f.hip.pelvic_tilt_deg, 4, 18), '骨盆倾斜检测异常')
  if (pelvicOk && f.hip.pelvic_tilt_deg > 10) codes.push('pelvic')

  const stabOk = usable(f.hip.stability, 0, 1)
  t.add(stabOk, 0.9, () => ramp(0.6 - f.hip.stability, 0.02, 0.3), '髋稳定性检测异常')
  if (stabOk && f.hip.stability < 0.45) codes.push('stability')

  if (!codes.length) codes.push('stability')
  return t.result(codes)
}

function assessTrunk(f: BiomechanicsFeatures): CatAssessment {
  const t = makeTracker()
  const codes: string[] = []

  const latOk = usable(f.trunk.lateral_lean_deg, 0, 90)
  t.add(latOk, 1.0, () => ramp(f.trunk.lateral_lean_deg, 6, 28), '躯干侧倾检测异常')
  if (latOk && f.trunk.lateral_lean_deg > 15) codes.push('lateral_lean')

  const fwdOk = usable(f.trunk.forward_lean_deg, 0, 90)
  t.add(fwdOk, 1.0, () => ramp(f.trunk.forward_lean_deg, 25, 48), '躯干前倾检测异常')
  if (fwdOk && f.trunk.forward_lean_deg > 38) codes.push('forward_lean')

  const comOk = usable(f.trunk.com_lateral_displacement, 0, 1)
  t.add(comOk, 0.8, () => ramp(f.trunk.com_lateral_displacement, 0.02, 0.11), '重心偏移检测异常')
  if (comOk && f.trunk.com_lateral_displacement > 0.05) codes.push('com')

  if (!codes.length) codes.push('com')
  return t.result(codes)
}

function assessAsymmetry(f: BiomechanicsFeatures): CatAssessment {
  const t = makeTracker()
  const ok = usable(f.overall.bilateral_asymmetry, 0, 1)
  t.add(ok, 1.0, () => ramp(f.overall.bilateral_asymmetry, 0.2, 0.65), '左右不对称度检测异常')
  return t.result(['general'])
}

function assessStability(f: BiomechanicsFeatures): CatAssessment {
  const t = makeTracker()
  const codes: string[] = []

  // 缓冲时间过短才判风险(过长可能是阶段划分误差,不判)
  const bufOk = usable(f.overall.landing_buffer_time_ms, 0, 3000)
  t.add(bufOk, 1.0, () => ramp(200 - f.overall.landing_buffer_time_ms, 10, 130), '落地缓冲时间检测异常')
  if (bufOk && f.overall.landing_buffer_time_ms < 150) codes.push('buffer')

  const stabOk = usable(f.overall.stabilization_time_ms, 0, 10000)
  t.add(stabOk, 0.8, () => ramp(f.overall.stabilization_time_ms, 500, 1800), '落地稳定时间检测异常')
  if (stabOk && f.overall.stabilization_time_ms > 1000) codes.push('stabilization')

  if (!codes.length) codes.push('buffer')
  return t.result(codes)
}

// 分项权重(综合评分用)
const WEIGHTS: Record<string, number> = {
  膝关节: 0.28,
  踝关节: 0.18,
  髋关节: 0.15,
  躯干控制: 0.15,
  左右不对称: 0.12,
  动作稳定性: 0.12,
}

function num(v: number | ''): number {
  return typeof v === 'number' && !isNaN(v) ? v : 0
}

/** 根据运动员信息对各风险维度做针对性调整(原地修改 items 的 score/level) */
function applyAthleteFactors(items: RiskItem[], athlete: AthleteInfo): void {
  const heightM = num(athlete.height_cm) / 100
  const bmi = heightM > 0 ? num(athlete.weight_kg) / (heightM * heightM) : 22
  const gender = String(athlete.gender || '').toLowerCase()
  const injury = String(athlete.injury_history || '').toLowerCase().trim()

  // 伤病史关键词 -> 对应风险部位
  const injuryCats = new Set<string>()
  const kwMap: Array<[string, string]> = [
    ['膝', '膝关节'], ['半月板', '膝关节'], ['十字', '膝关节'], ['acl', '膝关节'],
    ['踝', '踝关节'], ['扭脚', '踝关节'],
    ['髋', '髋关节'], ['腰', '躯干控制'], ['背', '躯干控制'],
  ]
  for (const [kw, cat] of kwMap) {
    if (injury.includes(kw)) injuryCats.add(cat)
  }

  for (const it of items) {
    let adj = 0
    const adjs: Array<{ factor: string; delta: number; reason: string }> = []
    // BMI 偏高 → 膝/踝关节负荷加重
    if (bmi > 26 && (it.category === '膝关节' || it.category === '踝关节')) {
      const d = Math.round(Math.min((bmi - 26) * 2.5, 10) * 10) / 10
      adj += d
      adjs.push({ factor: `BMI ${bmi.toFixed(1)}`, delta: d, reason: 'BMI偏高，下肢关节负荷加重' })
    }
    // 女性 → 膝关节 ACL 损伤高发
    if (gender === 'female' && it.category === '膝关节') {
      adj += 5
      adjs.push({ factor: '女性', delta: 5, reason: '女性ACL损伤风险显著高于男性' })
    }
    // 年龄: >30 整体退化风险; <16 发育期膝风险
    const age = num(athlete.age)
    if (age > 30) {
      const d = Math.round(Math.min((age - 30) * 0.8, 8) * 10) / 10
      adj += d
      adjs.push({ factor: `年龄${age}岁`, delta: d, reason: '30岁以上组织弹性下降，恢复变慢' })
    } else if (age < 16 && it.category === '膝关节') {
      adj += 3
      adjs.push({ factor: `年龄${age}岁`, delta: 3, reason: '发育期膝关节生长板未闭合，损伤风险高' })
    }
    // 训练频率: 低频动作不熟练; 高频疲劳积累
    const freq = num(athlete.weekly_training_freq)
    if (freq < 2) {
      adj += 5
      adjs.push({ factor: `训练${freq}次/周`, delta: 5, reason: '训练频率低，动作模式不熟练' })
    } else if (freq > 8 && (it.category === '动作稳定性' || it.category === '左右不对称')) {
      adj += 5
      adjs.push({ factor: `训练${freq}次/周`, delta: 5, reason: '训练频率高，疲劳积累影响稳定性' })
    }
    // 惯用腿: 单侧惯用产生生理性不对称, 降低左右不对称风险判定
    if (it.category === '左右不对称' && (athlete.dominant_leg === '右腿' || athlete.dominant_leg === '左腿')) {
      adj -= 6
      adjs.push({ factor: `惯用${athlete.dominant_leg}`, delta: -6, reason: '单侧惯用腿产生生理性不对称，属正常现象' })
    }
    // 既往伤病: 匹配部位加权
    if (injury && injuryCats.has(it.category)) {
      adj += 8
      adjs.push({ factor: '既往伤病', delta: 8, reason: `伤病史涉及${it.category}，再损伤风险高` })
    }
    // 当前疼痛: 整体轻度加, 伤病史同部位额外加(用户填"无/没有"等否定词不视为有疼痛)
    if (isPresent(athlete.current_pain)) {
      adj += 3
      adjs.push({ factor: '当前疼痛', delta: 3, reason: '存在疼痛症状，组织可能处于应激状态' })
      if (injuryCats.has(it.category)) {
        adj += 4
        adjs.push({ factor: '疼痛+伤病同部位', delta: 4, reason: '疼痛部位与伤病史一致，风险显著升高' })
      }
    }
    // 高疲劳: 影响稳定性与对称性
    const fatigue = num(athlete.fatigue_level)
    if (fatigue >= 7 && (it.category === '动作稳定性' || it.category === '左右不对称')) {
      const d = Math.round(Math.min((fatigue - 6) * 2, 8) * 10) / 10
      adj += d
      adjs.push({ factor: `疲劳${fatigue}/10`, delta: d, reason: '疲劳程度高，神经肌肉控制下降' })
    }

    if (adj !== 0) {
      it.score = Math.round(clipScore(it.score + adj) * 10) / 10
      it.level = level(it.score)
    }
    it.athlete_adjustments = adjs
  }
}

/** 主入口: 计算综合风险评分与各分项 */
export function assess(features: BiomechanicsFeatures, athlete?: AthleteInfo | null): RiskResult {
  const assessors: Array<[string, (f: BiomechanicsFeatures) => CatAssessment]> = [
    ['膝关节', assessKnee],
    ['踝关节', assessAnkle],
    ['髋关节', assessHip],
    ['躯干控制', assessTrunk],
    ['左右不对称', assessAsymmetry],
    ['动作稳定性', assessStability],
  ]

  const items: RiskItem[] = []
  for (const [cat, fn] of assessors) {
    const a = fn(features)
    const rec = getRecommendations(cat, a.codes)
    items.push({
      category: cat,
      score: Math.round(a.score * 10) / 10,
      level: level(a.score),
      main_causes: rec.causes,
      recommendations: rec.tips,
      exercises: rec.exercises,
      cause_codes: a.codes,
      athlete_adjustments: [],
      base_score: Math.round(a.score * 10) / 10,
      confidence: Math.round(a.confidence * 100) / 100,
      data_issues: a.issues,
    })
  }

  /**
   * 综合分 = 70% 可信度加权平均 + 30% 最严重维度。
   * - 可信度加权: 检测失败(超出人体生理范围)的维度权重被压低, 异常值不会把总分顶到 100
   * - 叠加最严重维度: 安全导向, 单一部位严重异常不被其他正常部位稀释掉
   */
  const recomputeOverall = (): number => {
    let wsum = 0
    let csum = 0
    let worst = 0
    for (const it of items) {
      const conf = it.confidence ?? 1
      const w = WEIGHTS[it.category] * conf
      wsum += it.score * w
      csum += w
      // 有效分 = 分数 × 可信度: 数据不可信的维度不参与"最严重"计算
      worst = Math.max(worst, it.score * conf)
    }
    if (csum <= 0) return 0
    return clipScore((wsum / csum) * 0.7 + worst * 0.3)
  }

  // 运动员信息对各风险维度做针对性调整
  if (athlete) applyAthleteFactors(items, athlete)

  const overall = recomputeOverall()

  /**
   * 检测"几乎没识别出有效动作": 多个核心运动学指标同时为 0。
   * 这通常是姿态识别失败(人物未完整入镜 / 严重遮挡), 而不是真的直腿落地,
   * 此时评分不应被当成真实的高风险结论。
   */
  const coreSignals = [
    features.knee.initial_contact_flexion_deg,
    features.knee.max_flexion_deg,
    features.knee.valgus_deg,
    features.ankle.dorsiflexion_deg,
    features.trunk.forward_lean_deg,
    features.overall.landing_buffer_time_ms,
  ]
  const zeroCount = coreSignals.filter((v) => typeof v !== 'number' || Math.abs(v) < 1e-6).length
  const noSignal = zeroCount >= 4

  // 整体数据完整度(各维度可信度按权重加权)
  let tw = 0
  let cw = 0
  for (const it of items) {
    tw += WEIGHTS[it.category]
    cw += WEIGHTS[it.category] * (it.confidence ?? 1)
  }
  const rawConfidence = tw > 0 ? cw / tw : 0
  // 未识别出有效动作时, 数据完整度强制压低, 触发明确提示
  const dataConfidence = Math.round((noSignal ? Math.min(rawConfidence, 0.25) : rawConfidence) * 100) / 100

  // 高风险动作模式概率 = 综合分/100
  const prob = Math.round((overall / 100) * 100) / 100
  const lvl = level(overall)

  // 汇总摘要
  const highCats = items.filter((it) => it.level === '高风险').map((it) => it.category)
  let summary: string
  if (highCats.length) {
    summary = `本次动作在高风险动作模式上得分偏高, 主要风险集中在${highCats.join('、')}。建议优先针对性训练。`
  } else if (overall >= RISK_LOW_THRESHOLD) {
    summary = '本次动作存在一定风险特征, 建议关注评分较高的部位并做预防性训练。'
  } else {
    summary = '本次动作整体风险较低, 动作模式较为合理, 建议保持。'
  }

  // 运动员因素提示
  if (athlete) {
    const factors: string[] = []
    const fatigue = num(athlete.fatigue_level)
    if (fatigue >= 7) factors.push(`疲劳程度较高(${fatigue}/10),动作稳定性下降`)
    if (isPresent(athlete.current_pain)) factors.push('存在疼痛症状,建议降低训练强度')
    const inj = String(athlete.injury_history || '').toLowerCase().trim()
    if (isPresent(inj)) {
      const icats = new Set<string>()
      for (const [kw, cat] of [['膝', '膝关节'], ['踝', '踝关节'], ['髋', '髋关节'], ['腰', '躯干控制']] as Array<[string, string]>) {
        if (inj.includes(kw)) icats.add(cat)
      }
      if (icats.size) factors.push(`既往伤病部位(${[...icats].join('、')})已加权评估`)
    }
    const heightM = num(athlete.height_cm) / 100
    const bmi = heightM > 0 ? num(athlete.weight_kg) / (heightM * heightM) : 22
    if (bmi > 26) factors.push(`BMI偏高(${bmi.toFixed(1)})增加下肢关节负荷`)
    const freq = num(athlete.weekly_training_freq)
    if (freq < 2) factors.push('训练频率偏低,动作可能不熟练')
    if (freq > 8) factors.push('训练频率偏高,注意疲劳积累')
    if (factors.length) summary += ` 个体因素提示: ${factors.join('; ')}。`
  }

  if (noSignal) {
    summary =
      '未在视频中稳定识别出完整的人体动作（多个核心动作指标为 0，通常是人物未完整入镜或严重遮挡）。本次评分可信度很低，仅供参考。建议重新拍摄：全身入镜、光线充足、镜头固定、完整录下起跳到落地的过程。'
  } else if (dataConfidence < 0.7) {
    summary += ` 注意: 本次有部分动作指标未能可靠识别(数据完整度 ${Math.round(dataConfidence * 100)}%), 综合评分已按可识别部分计算, 建议补拍更清晰、全身入镜的视频后重新分析。`
  }

  // 护具与球鞋推荐
  const gear = getGearRecommendations(items, athlete)

  // 大白话总结
  const plain = buildPlainSummary(overall, lvl, items, athlete, gear)
  // 动作要领大白话
  const guide = buildActionGuide(features)
  // 个性化训练计划
  const plan = buildTrainingPlan(items)

  return {
    overall_score: Math.round(overall * 10) / 10,
    overall_level: lvl,
    high_risk_action_probability: prob,
    data_confidence: dataConfidence,
    items,
    summary,
    plain_summary: plain,
    action_guide: guide,
    training_plan: plan,
    gear_recommendations: gear,
  }
}

/** 生成面向普通人的大白话总结 */
function buildPlainSummary(
  overall: number,
  lvl: RiskLevel,
  items: RiskItem[],
  athlete?: AthleteInfo | null,
  gear?: { protectors: Array<{ name: string }>; shoes?: unknown[] },
): string {
  const parts: string[] = []

  // 1. 整体评价
  const levelText: Record<string, string> = {
    高风险: '高风险，需要重点关注',
    中风险: '中等风险，有一些可以改进',
    低风险: '低风险，动作整体不错',
  }
  parts.push(`【整体评价】\n你这次动作的综合风险评分是 ${overall.toFixed(1)} 分（满分100），属于${levelText[lvl] || lvl}。`)

  // 2. 主要问题
  const high = items.filter((it) => it.level === '高风险')
  const mid = items.filter((it) => it.level === '中风险')
  const catMap: Record<string, string> = {
    膝关节: '落地时膝盖表现异常（如内扣、弯曲不够）',
    踝关节: '落地时脚踝不够稳，有晃动',
    髋关节: '髋部稳定性不足，重心控制差',
    躯干控制: '身体躯干控制不够好，有侧倾或前倾',
    左右不对称: '左右两侧动作不对称，一侧承重更多',
    动作稳定性: '落地后动作不够稳定，需要更长时间平衡',
  }
  if (high.length) {
    const lines = ['【主要问题】', `这次动作中，你的${high.map((it) => it.category).join('、')}存在较高风险：`]
    for (const it of high) {
      lines.push(`  • ${it.category}：${catMap[it.category] || '存在风险'}`)
    }
    parts.push(lines.join('\n'))
  } else if (mid.length) {
    parts.push(`【主要问题】\n这次动作没有特别严重的风险，但${mid.map((it) => it.category).join('、')}有中等风险，可以留意改进。`)
  }

  // 3. 个体因素
  if (athlete) {
    const factors: string[] = []
    const fatigue = num(athlete.fatigue_level)
    if (fatigue >= 7) factors.push(`疲劳程度较高（${fatigue}/10），会影响动作稳定性`)
    if (isPresent(athlete.current_pain)) factors.push('存在疼痛症状，身体可能处于应激状态')
    const inj = String(athlete.injury_history || '').trim()
    if (isPresent(inj)) factors.push(`有既往伤病史（${inj}），相关部位需要额外保护`)
    const heightM = num(athlete.height_cm) / 100
    const bmi = heightM > 0 ? num(athlete.weight_kg) / (heightM * heightM) : 22
    if (bmi > 26) factors.push(`BMI偏高（${bmi.toFixed(1)}），增加了下肢关节负担`)
    const freq = num(athlete.weekly_training_freq)
    if (freq > 8) factors.push('训练频率较高，注意疲劳积累')
    else if (freq < 2) factors.push('训练频率较低，动作可能不够熟练')
    if (factors.length) parts.push(`【你的个体情况】\n${factors.join('；')}。这些因素已纳入风险评估。`)
  }

  // 4. 建议
  const recs: string[] = []
  const protectors = gear?.protectors || []
  if (protectors.length) {
    recs.push('佩戴护具：' + protectors.slice(0, 2).map((p) => p.name).join('、'))
  }
  if (high.length) {
    const tips = high[0].recommendations.slice(0, 2)
    if (tips.length) recs.push('训练重点：' + tips.join('；'))
  }
  recs.push('建议多次分析对比，观察动作改善趋势')
  if (recs.length) {
    parts.push('【建议】\n' + recs.map((r) => `  • ${r}`).join('\n'))
  }

  return parts.join('\n\n')
}

/** 生成动作要领大白话指导(老百姓能看懂: 腿怎么弯、弯多少) */
function buildActionGuide(features: BiomechanicsFeatures): string {
  const parts: string[] = []
  const f = features

  // 膝盖弯曲
  const kf = f.knee.initial_contact_flexion_deg
  let kneeMsg: string
  if (kf < 30) {
    kneeMsg = `你落地时膝盖只弯了${kf.toFixed(0)}°，太直了！要弯到30-50°，就像往后坐椅子的感觉，这样才能缓冲。别直挺挺地戳下去！`
  } else if (kf > 55) {
    kneeMsg = `你落地时膝盖弯了${kf.toFixed(0)}°，弯得有点多，30-50°就够了，弯太多膝盖压力大。`
  } else {
    kneeMsg = `你落地时膝盖弯了${kf.toFixed(0)}°，这个弯曲度不错，继续保持'往后坐椅子'的感觉。`
  }
  parts.push(`【膝盖要弯多少度】\n${kneeMsg}`)

  // 膝盖内扣
  const val = f.knee.valgus_deg
  let valMsg: string
  if (val > 10) {
    valMsg = `你的膝盖往里扣了${val.toFixed(0)}°，这个很危险！膝盖要和脚尖一个方向，不能往里撇。想象膝盖中间夹着个球，别把它夹扁了。`
  } else if (val > 5) {
    valMsg = `你的膝盖有点往里扣(${val.toFixed(0)}°)，注意要对准脚尖方向，别往里撇。`
  } else {
    valMsg = `你的膝盖内扣${val.toFixed(0)}°，基本正常。记住落地时膝盖对准脚尖，别往里撇。`
  }
  parts.push(`【膝盖不能往里扣】\n${valMsg}`)

  // 身体前倾
  const lean = f.trunk.forward_lean_deg
  let leanMsg: string
  if (lean > 35) {
    leanMsg = `你身体前倾了${lean.toFixed(0)}°，太往前了！落地时身体要尽量直，别像鞠躬一样往前栽，不然膝盖和腰都受罪。`
  } else if (lean > 25) {
    leanMsg = `你身体前倾${lean.toFixed(0)}°，稍微有点多，尽量保持直立，前倾不超过30°。`
  } else {
    leanMsg = `你身体前倾${lean.toFixed(0)}°，姿势不错。记住落地时身体要直，别往前栽。`
  }
  parts.push(`【身体别往前栽】\n${leanMsg}`)

  // 身体侧倾
  const lat = f.trunk.lateral_lean_deg
  let latMsg: string
  if (Math.abs(lat) > 8) {
    latMsg = `你身体往一侧歪了${Math.abs(lat).toFixed(0)}°，要注意！左右要对称，别往一边倒，容易崴脚。`
  } else {
    latMsg = `你身体左右倾斜${Math.abs(lat).toFixed(0)}°，基本正常。`
  }
  parts.push(`【身体别往一边歪】\n${latMsg}`)

  // 缓冲
  const buf = f.overall.landing_buffer_time_ms
  let bufMsg: string
  if (buf < 100) {
    bufMsg = `你落地缓冲只有${buf.toFixed(0)}毫秒，太快了！就像石头砸地上。要'软着陆'，前脚掌先着地慢慢过渡到全脚掌，别硬邦邦地砸下去。`
  } else {
    bufMsg = `你落地缓冲${buf.toFixed(0)}毫秒，还不错。记住要'软着陆'，别硬砸。`
  }
  parts.push(`【怎么落地才安全】\n${bufMsg}`)

  return parts.join('\n\n')
}

/** 根据风险结果生成个性化7天训练计划 */
function buildTrainingPlan(items: RiskItem[]): TrainingDay[] {
  const lib: Record<string, TrainingExercise[]> = {
    膝关节: [
      { name: '靠墙静蹲', dose: '3组×45秒', purpose: '增强股四头肌，稳定膝关节' },
      { name: '臀桥', dose: '3组×15次', purpose: '激活臀大肌，改善下肢力线' },
      { name: '侧向蟹步走', dose: '3组×12步', purpose: '强化臀中肌，防止膝盖内扣' },
    ],
    踝关节: [
      { name: '单脚站立平衡', dose: '3组×30秒', purpose: '提高踝关节本体感觉' },
      { name: '提踵', dose: '3组×20次', purpose: '增强小腿肌肉，稳定踝关节' },
    ],
    髋关节: [
      { name: '蚌式开合', dose: '3组×15次', purpose: '强化髋外展肌群' },
      { name: '髋关节灵活性绕环', dose: '3组×10次', purpose: '改善髋关节活动度' },
    ],
    躯干控制: [
      { name: '平板支撑', dose: '3组×30秒', purpose: '强化核心稳定性' },
      { name: '死虫式', dose: '3组×10次', purpose: '训练核心抗伸展能力' },
      { name: '鸟狗式', dose: '3组×12次', purpose: '提升核心抗旋转能力' },
    ],
    左右不对称: [
      { name: '单腿深蹲', dose: '3组×8次/侧', purpose: '纠正左右力量差异' },
      { name: '分腿蹲', dose: '3组×10次/侧', purpose: '平衡双侧发力' },
    ],
    动作稳定性: [
      { name: '落地稳定练习', dose: '3组×10次', purpose: '训练落地缓冲控制' },
      { name: '单脚跳定住', dose: '3组×8次/侧', purpose: '提升动态稳定性' },
    ],
  }
  const highCats = items.filter((it) => it.level === '高风险').map((it) => it.category)
  const midCats = items.filter((it) => it.level === '中风险').map((it) => it.category)

  const pick = (cats: string[], n: number): TrainingExercise[] => {
    const out: TrainingExercise[] = []
    for (const c of cats) {
      out.push(...(lib[c] || []).slice(0, n))
    }
    return out
  }

  const primary = highCats.length ? pick(highCats, 3) : pick(midCats.slice(0, 2), 2)
  const secondary = pick(midCats, 2)
  const core = (lib['躯干控制'] || []).slice(0, 2)
  const land = (lib['动作稳定性'] || []).slice(0, 2)

  return [
    { day: '周一', focus: '力量强化', exercises: (primary.length ? primary : core).slice(0, 3) },
    { day: '周二', focus: '核心稳定', exercises: core },
    { day: '周三', focus: '力量强化', exercises: (primary.length ? primary : core).slice(0, 3) },
    {
      day: '周四', focus: '灵活性恢复', exercises: [
        { name: '泡沫轴放松', dose: '15分钟', purpose: '促进肌肉恢复' },
        { name: '静态拉伸', dose: '10分钟', purpose: '改善柔韧性' },
      ],
    },
    { day: '周五', focus: '弱点补强', exercises: (secondary.length ? secondary : core).slice(0, 3) },
    {
      day: '周六', focus: '动作模拟', exercises: land.concat([
        { name: '跳跃落地练习', dose: '3组×8次', purpose: '强化落地技术' },
      ]),
    },
    {
      day: '周日', focus: '休息恢复', exercises: [
        { name: '完全休息或轻度活动', dose: '散步/游泳20分钟', purpose: '主动恢复' },
      ],
    },
  ]
}
