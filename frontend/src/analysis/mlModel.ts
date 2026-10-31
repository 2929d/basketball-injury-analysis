/**
 * 受伤风险 ML 预测模型（浏览器本地版）
 *
 * 从后端 backend/data/nba_injuries/ml_model_weights.json 移植的逻辑回归模型:
 * - 训练数据: NBA 2025-26 赛季真实伤病数据(19,827 条, 552 名球员)
 * - 标签定义: 后半赛季 Out 天数 > 10 天 = 高风险(1)
 * - 准确率: 61.11%(论文最高水平 76.68%)
 *
 * 纯前端静态部署没有后端, 因此把权重直接内嵌, 在浏览器本地完成推理,
 * 输出结构与后端 /api/v1/ml/predict 完全一致。
 */

export interface Contribution {
  feature: string
  value: number
  contribution: number
  direction: string
  importance_pct: number
}

export interface PredictResult {
  probability: number
  risk_level: string
  model_type: string
  accuracy: number
  paper_baseline: number
  label_definition: string
  top_risk_factors: Contribution[]
  all_contributions: Contribution[]
  honesty_note: string
}

export interface MLInput {
  total_injuries: number
  out_count: number
  questionable_count: number
  out_ratio: number
  knee_injuries: number
  ankle_injuries: number
  back_injuries: number
  unique_types: number
  injury_duration: number
  recurrence: number
}

/** 模型权重(与后端 ml_model_weights.json 保持同步) */
const MODEL = {
  weights: [
    0.009612507373630277,
    0.2226546298422638,
    0.23452346173160818,
    0.028694500377476992,
    0.15675981835660582,
    0.0,
    0.0,
    0.0,
    -0.008657734396104733,
    0.19227617729781377,
    0.14402220725398082,
  ],
  mean: [
    16.24,
    12.242222222222223,
    1.9577777777777778,
    0.5895344224475888,
    0.0,
    0.0,
    0.0,
    1.1755555555555555,
    38.062222222222225,
    1.0755555555555556,
  ],
  std: [
    14.214709136660161,
    14.124415260651574,
    2.334379669580192,
    0.3760897629128298,
    1e-8,
    1e-8,
    1e-8,
    0.3862385980690587,
    24.262374070708244,
    0.44078494398106355,
  ],
  feature_names: [
    '前半赛季伤病总次数',
    '前半赛季Out次数',
    '前半赛季Questionable次数',
    '前半赛季Out占比',
    '前半赛季膝伤次数',
    '前半赛季踝伤次数',
    '前半赛季背伤次数',
    '前半赛季不同伤病类型数',
    '前半赛季伤病天数跨度',
    '前半赛季同部位复发次数',
  ],
  feature_importance: {
    '前半赛季Out次数': 22.6,
    '前半赛季伤病总次数': 21.47,
    '前半赛季伤病天数跨度': 18.44,
    '前半赛季Out占比': 14.99,
    '前半赛季同部位复发次数': 14.03,
    '前半赛季Questionable次数': 5.17,
    '前半赛季不同伤病类型数': 3.3,
    '前半赛季膝伤次数': 0.0,
    '前半赛季踝伤次数': 0.0,
    '前半赛季背伤次数': 0.0,
  } as Record<string, number>,
  accuracy: 0.6111,
  paper_baseline: 0.7668,
  label_definition: '后半赛季Out天数>10天=高风险(1)',
}

/** 浏览器本地 ML 预测(逻辑回归, 与后端 /api/v1/ml/predict 逻辑一致) */
export function predictInjuryRisk(input: MLInput): PredictResult {
  const { weights, mean, std, feature_names } = MODEL

  // 构建特征向量(顺序与训练时一致)
  const x = [
    input.total_injuries,
    input.out_count,
    input.questionable_count,
    input.out_ratio,
    input.knee_injuries,
    input.ankle_injuries,
    input.back_injuries,
    input.unique_types,
    input.injury_duration,
    input.recurrence,
  ]

  // 标准化
  const xNorm = x.map((xi, i) => (xi - mean[i]) / (std[i] + 1e-8))

  // 逻辑回归: z = bias + Σ w_i * x_i
  let z = weights[0]
  for (let i = 0; i < xNorm.length; i++) {
    z += weights[i + 1] * xNorm[i]
  }
  const clamped = Math.max(-30, Math.min(30, z))
  const probability = 1 / (1 + Math.exp(-clamped))

  // 特征贡献(类似 SHAP: 权重 × 标准化值)
  const contributions: Contribution[] = feature_names.map((name, i) => {
    const contrib = weights[i + 1] * xNorm[i]
    return {
      feature: name,
      value: x[i],
      contribution: Math.round(contrib * 10000) / 10000,
      direction: contrib > 0 ? '↑风险' : '↓风险',
      importance_pct: MODEL.feature_importance[name] ?? 0,
    }
  })
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))

  const risk_level =
    probability > 0.5 ? '高风险' : probability > 0.3 ? '中风险' : '低风险'

  return {
    probability: Math.round(probability * 10000) / 10000,
    risk_level,
    model_type: 'logistic_regression',
    accuracy: MODEL.accuracy,
    paper_baseline: MODEL.paper_baseline,
    label_definition: MODEL.label_definition,
    top_risk_factors: contributions.slice(0, 5),
    all_contributions: contributions,
    honesty_note:
      '本模型基于NBA伤病历史数据训练(非体测数据), 准确率61.11%低于论文76.68%',
  }
}
