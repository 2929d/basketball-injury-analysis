import { useState } from 'react'
import axios from 'axios'
import './MLPredict.css'

interface Contribution {
  feature: string
  value: number
  contribution: number
  direction: string
  importance_pct: number
}

interface PredictResult {
  probability: number
  risk_level: string
  model_type: string
  accuracy: number
  paper_baseline: number
  label_definition: string
  top_risk_factors: Contribution[]
  honesty_note: string
}

// 大白话字段配置
const FIELDS = [
  { key: 'total_injuries', label: '这半个赛季一共伤了几次？', hint: '比如扭脚、拉伤、生病都算，总共几次', example: '5' },
  { key: 'out_count', label: '因为伤病缺阵了几场？', hint: '就是彻底打不了的那种', example: '3' },
  { key: 'questionable_count', label: '带伤硬打了几场？', hint: '就是"可能上不了但最后还是上了"的那种', example: '2' },
  { key: 'out_ratio', label: '缺阵占伤病总数的比例', hint: '缺阵次数 ÷ 伤病总次数，如3÷5=0.6', example: '0.6' },
  { key: 'knee_injuries', label: '膝盖受过几次伤？', hint: '膝盖扭伤、半月板等都算', example: '1' },
  { key: 'ankle_injuries', label: '脚踝受过几次伤？', hint: '崴脚、踝关节扭伤等', example: '0' },
  { key: 'back_injuries', label: '腰/背受过几次伤？', hint: '腰肌劳损、背痛等', example: '0' },
  { key: 'unique_types', label: '一共伤过几个不同部位？', hint: '如膝+踝=2个部位', example: '2' },
  { key: 'injury_duration', label: '从第一次到最后一次受伤，隔了多少天？', hint: '比如10月伤一次，12月又伤，隔了60天', example: '45' },
  { key: 'recurrence', label: '同一个地方反复受伤几次？', hint: '比如左膝伤了3次=复发2次', example: '1' },
] as const

// 大白话特征名映射
const FEATURE_PLAIN: Record<string, string> = {
  '前半赛季伤病总次数': '伤病总次数',
  '前半赛季Out次数': '缺阵次数',
  '前半赛季Questionable次数': '带伤硬打次数',
  '前半赛季Out占比': '缺阵占比',
  '前半赛季膝伤次数': '膝盖受伤次数',
  '前半赛季踝伤次数': '脚踝受伤次数',
  '前半赛季背伤次数': '腰背受伤次数',
  '前半赛季不同伤病类型数': '受伤部位种类',
  '前半赛季伤病天数跨度': '伤病持续时间',
  '前半赛季同部位复发次数': '同部位反复受伤',
}

// 大白话解释
const FEATURE_EXPLAIN: Record<string, string> = {
  '前半赛季同部位复发次数': '同一个地方反复受伤，说明上次没养好就复出，隐患大',
  '前半赛季伤病天数跨度': '伤病拖得越久，恢复越不彻底，后面越容易再伤',
  '前半赛季伤病总次数': '伤得越频繁，身体状态越差',
  '前半赛季Out次数': '缺阵越多，伤得越重',
  '前半赛季Out占比': '缺阵占比高=伤情严重',
}

const PRESETS = {
  high: { total_injuries: 10, out_count: 7, questionable_count: 3, out_ratio: 0.7, knee_injuries: 2, ankle_injuries: 1, back_injuries: 0, unique_types: 3, injury_duration: 60, recurrence: 2 },
  low: { total_injuries: 2, out_count: 0, questionable_count: 1, out_ratio: 0.0, knee_injuries: 0, ankle_injuries: 1, back_injuries: 0, unique_types: 1, injury_duration: 10, recurrence: 0 },
  mid: { total_injuries: 5, out_count: 3, questionable_count: 2, out_ratio: 0.6, knee_injuries: 1, ankle_injuries: 0, back_injuries: 0, unique_types: 2, injury_duration: 45, recurrence: 1 },
}

type InputKey = keyof typeof PRESETS.high

export default function MLPredict() {
  const [input, setInput] = useState({ ...PRESETS.mid })
  const [result, setResult] = useState<PredictResult | null>(null)
  const [loading, setLoading] = useState(false)

  const predict = async (data: typeof input) => {
    setLoading(true)
    try {
      const res = await axios.post('/api/v1/ml/predict', data)
      setResult(res.data)
    } catch {
      alert('预测失败，请确认后端已启动')
    } finally {
      setLoading(false)
    }
  }

  const riskColor = result
    ? result.probability > 0.5 ? '#dc2626' : result.probability > 0.3 ? '#f59e0b' : '#059669'
    : '#999'

  const riskPlain = result
    ? result.probability > 0.5
      ? '⚠️ 高风险——后半赛季很可能严重受伤，建议重点防护'
      : result.probability > 0.3
        ? '🟡 中风险——有一定受伤可能，注意观察'
        : '✅ 低风险——后半赛季受伤可能性较小'
    : ''

  return (
    <div className="page ml-predict-page">
      <h1 className="ml-title">🤖 受伤风险预测（AI预测）</h1>
      <p className="ml-intro">
        这个AI用了<strong>NBA真实伤病数据</strong>（19,827条）训练出来的。
        你输入一个球员前半个赛季的伤病情况，AI预测他后半个赛季<strong>会不会严重受伤</strong>。
        <br />
        <span className="ml-acc-badge">准确率61%</span>
        <span className="ml-acc-note">（论文最高水平77%，我们还在进步中）</span>
      </p>

      {/* 快速选择 */}
      <div className="ml-presets">
        <span className="ml-presets-label">快速试试：</span>
        <button className="btn btn-outline ml-preset-btn" onClick={() => setInput({ ...PRESETS.high })}>
          🔴 典型高风险球员
        </button>
        <button className="btn btn-outline ml-preset-btn" onClick={() => setInput({ ...PRESETS.mid })}>
          🟡 一般球员
        </button>
        <button className="btn btn-outline ml-preset-btn" onClick={() => setInput({ ...PRESETS.low })}>
          🟢 典型低风险球员
        </button>
      </div>

      <div className="ml-layout">
        {/* 输入区 */}
        <div className="card ml-input-card">
          <h2>📝 填写球员伤病情况</h2>
          <div className="ml-fields">
            {FIELDS.map((f) => (
              <div className="ml-field" key={f.key}>
                <label>{f.label}</label>
                <div className="ml-input-row">
                  <input
                    type="number"
                    step={f.key === 'out_ratio' ? '0.1' : '1'}
                    value={input[f.key as InputKey]}
                    onChange={(e) => setInput({ ...input, [f.key]: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="ml-example">如：{f.example}</span>
                </div>
                <span className="ml-hint">{f.hint}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-lg ml-predict-btn" onClick={() => predict(input)} disabled={loading}>
            {loading ? 'AI预测中...' : '🔮 让AI预测一下'}
          </button>
        </div>

        {/* 结果区 */}
        <div className="ml-result-area">
          {result ? (
            <>
              <div className="card ml-result-card" style={{ borderLeft: `4px solid ${riskColor}` }}>
                <div className="ml-prob-display">
                  <span className="ml-prob-label">AI预测：后半赛季严重受伤的可能性</span>
                  <span className="ml-prob-value" style={{ color: riskColor }}>
                    {(result.probability * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="ml-risk-plain" style={{ color: riskColor }}>
                  {riskPlain}
                </div>
                <div className="ml-model-meta">
                  <span>模型准确率: {(result.accuracy * 100).toFixed(0)}%</span>
                  <span>论文最高水平: {(result.paper_baseline * 100).toFixed(0)}%</span>
                  <span>训练数据: 19,827条NBA真实伤病</span>
                </div>
              </div>

              <div className="card ml-contrib-card">
                <h2>🔍 AI为什么这么判断？</h2>
                <p className="ml-contrib-intro">
                  下面是影响AI判断的主要原因，<span style={{color:'#dc2626'}}>红色</span>是增加受伤风险的因素：
                </p>
                {result.top_risk_factors.map((c, i) => {
                  const plainName = FEATURE_PLAIN[c.feature] || c.feature
                  const explain = FEATURE_EXPLAIN[c.feature] || ''
                  return (
                    <div className="ml-contrib-item" key={i}>
                      <div className="ml-contrib-head">
                        <span className="ml-contrib-name">
                          {i + 1}. {plainName}
                          {c.direction === '↑风险' ? ' ↑' : ' ↓'}
                        </span>
                        <span className={`ml-contrib-dir ${c.contribution > 0 ? 'up' : 'down'}`}>
                          {c.contribution > 0 ? '增加风险' : '降低风险'}
                        </span>
                      </div>
                      <div className="ml-contrib-bar-wrap">
                        <div
                          className="ml-contrib-bar"
                          style={{
                            width: `${Math.min(Math.abs(c.contribution) * 50, 100)}%`,
                            background: c.contribution > 0 ? '#dc2626' : '#059669',
                          }}
                        />
                      </div>
                      {explain && <div className="ml-contrib-explain">💡 {explain}</div>}
                      <div className="ml-contrib-meta">该球员此项数值: {c.value}</div>
                    </div>
                  )
                })}
              </div>

              <div className="ml-honesty-note">
                ⚠️ 这个AI是用NBA球员的伤病历史训练的（不是体测数据），准确率61%。
                只能当参考，不能代替医生诊断。
              </div>
            </>
          ) : (
            <div className="card ml-placeholder">
              <p>👈 填好左边的伤病情况，点"让AI预测一下"</p>
              <p className="ml-placeholder-hint">或者点上面的"典型高风险球员"快速试试</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
