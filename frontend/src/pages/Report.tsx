import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { getResult, getAnnotatedVideoUrl, getProblemMomentVideoUrl, getPdfUrl, getTimeline, type FrameFeature } from '../services/api'
import type { AnalysisResult } from '../types'
import { RISK_COLORS, fmtNum } from '../utils'
import './Report.css'

// 6 个风险维度到雷达图标签的映射
const DIM_MAP: Record<string, string> = {
  膝关节: '膝关节',
  knee: '膝关节',
  踝关节: '踝关节',
  ankle: '踝关节',
  髋关节: '髋关节',
  hip: '髋关节',
  躯干: '躯干控制',
  trunk: '躯干控制',
  不对称: '左右不对称',
  asymmetry: '左右不对称',
  稳定性: '动作稳定性',
  stability: '动作稳定性',
}

export default function Report() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [timeline, setTimeline] = useState<FrameFeature[]>([])
  const [curFrame, setCurFrame] = useState<FrameFeature | null>(null)

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const t = e.currentTarget.currentTime
    if (timeline.length) {
      const f = timeline.reduce((p, c) => (Math.abs(c.time - t) < Math.abs(p.time - t) ? c : p))
      setCurFrame(f)
    }
  }

  const exportPDF = async () => {
    if (!taskId || exporting) return
    setExporting(true)
    try {
      const res = await fetch(getPdfUrl(taskId))
      if (!res.ok) throw new Error('导出失败')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `篮球分析报告_${taskId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    if (!taskId) return
    getResult(taskId)
      .then((d) => {
        setResult(d)
        setLoading(false)
      })
      .catch((e) => {
        setError('加载报告失败：' + (e?.message || '请确认后端服务已启动'))
        setLoading(false)
      })
  }, [taskId])

  useEffect(() => {
    if (!taskId) return
    getTimeline(taskId).then(setTimeline).catch(() => {})
  }, [taskId])

  const radarData = useMemo(() => {
    if (!result?.risk?.items) return []
    const dims = [
      '膝关节',
      '踝关节',
      '髋关节',
      '躯干控制',
      '左右不对称',
      '动作稳定性',
    ]
    const scoreMap: Record<string, number> = {}
    result.risk.items.forEach((it) => {
      const key = DIM_MAP[it.category] || it.category
      scoreMap[key] = it.score
    })
    return dims.map((d) => ({ dim: d, score: scoreMap[d] ?? 0 }))
  }, [result])

  if (loading) {
    return (
      <div className="page report-loading">
        <div className="loading-box">
          <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
          <p>正在加载分析报告…</p>
        </div>
      </div>
    )
  }

  if (error || !result) {
    return (
      <div className="page">
        <div className="alert alert-err">{error || '未获取到报告数据'}</div>
        <div style={{ marginTop: 16 }}>
          <Link to="/upload" className="btn btn-outline">
            返回上传
          </Link>
        </div>
      </div>
    )
  }

  const risk = result.risk
  const features = result.features
  const overallColor = risk ? RISK_COLORS[risk.overall_level] : '#999'

  return (
    <div className="page report" ref={reportRef}>
      {/* 报告头部 */}
      <div className="report-head">
        <div>
          <div className="page-header" style={{ marginBottom: 0 }}>
            <h1>分析报告</h1>
            <p>动作类型：{result.action_type} · 生成时间：{result.created_at?.slice(0, 19).replace('T', ' ')}</p>
          </div>
        </div>
        <div className="report-head-actions">
          <button className="btn btn-outline" onClick={() => navigate('/upload')}>
            重新测试
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/history')}>
            前后对比
          </button>
          <button className="btn btn-outline no-print" onClick={exportPDF} disabled={exporting}>
            {exporting ? '导出中...' : '导出PDF'}
          </button>
        </div>
      </div>

      {/* 顶部综合评分区 */}
      {risk && (
        <div className="card overview-card">
          <div className="overview-ring" style={{ '--ring-color': overallColor } as React.CSSProperties}>
            <svg viewBox="0 0 120 120" className="overview-ring-svg">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#eef2f7" strokeWidth="10" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke={overallColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(risk.overall_score / 100) * 2 * Math.PI * 52} 9999`}
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dasharray 1s ease' }}
              />
            </svg>
            <div className="overview-ring-center">
              <strong style={{ color: overallColor }}>{risk.overall_score}</strong>
              <span>风险评分</span>
            </div>
          </div>
          <div className="overview-meta">
            <div className="overview-level">
              <span className="level-label">综合风险等级</span>
              <span
                className="level-tag"
                style={{ background: `${overallColor}22`, color: overallColor }}
              >
                {risk.overall_level}
              </span>
            </div>
            <div className="overview-prob">
              <div className="prob-label">
                高风险动作模式概率
                <strong>{(risk.high_risk_action_probability * 100).toFixed(1)}%</strong>
              </div>
              <div className="prob-bar">
                <div
                  className="prob-fill"
                  style={{
                    width: `${risk.high_risk_action_probability * 100}%`,
                    background: overallColor,
                  }}
                />
              </div>
            </div>
            <p className="overview-summary">{risk.summary}</p>
          </div>
        </div>
      )}

      {/* 雷达图 + 视频 */}
      <div className="grid grid-2 report-main-grid">
        <div className="card">
          <div className="section-title">风险分项雷达</div>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="#e5e9f0" />
                <PolarAngleAxis dataKey="dim" tick={{ fill: '#6b7280', fontSize: 13 }} />
                <PolarRadiusAxis
                  domain={[0, 100]}
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  angle={90}
                />
                <Radar
                  name="风险评分"
                  dataKey="score"
                  stroke="#00b4d8"
                  strokeWidth={2}
                  fill="#00b4d8"
                  fillOpacity={0.35}
                />
                <Tooltip
                  formatter={(v: number) => [`${v} 分`, '风险']}
                  contentStyle={{
                    borderRadius: 10,
                    border: '1px solid #e5e9f0',
                    fontSize: 13,
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">暂无风险分项数据</div>
          )}
        </div>

        <div className="card">
          <div className="section-title">骨骼叠加分析视频（逐帧分析）</div>
          <div className="video-wrap">
            <video
              src={getAnnotatedVideoUrl(taskId!)}
              controls
              playsInline
              onTimeUpdate={handleTimeUpdate}
            />
            <p className="video-tip">拖动进度条或暂停，下方实时显示当前帧的生物力学特征值</p>
          </div>
          {curFrame && (
            <div className="frame-info">
              <div className="frame-info-time">⏱ {curFrame.time.toFixed(2)}s · 第{curFrame.frame}帧</div>
              <div className="frame-info-grid">
                <div className="frame-metric">
                  <span className="fm-label">膝屈曲</span>
                  <span className="fm-value">{curFrame.knee_flexion}°</span>
                </div>
                <div className="frame-metric">
                  <span className="fm-label">膝外翻</span>
                  <span className="fm-value" style={{ color: curFrame.knee_valgus > 10 ? '#e24b4a' : '#374151' }}>{curFrame.knee_valgus}°</span>
                </div>
                <div className="frame-metric">
                  <span className="fm-label">躯干前倾</span>
                  <span className="fm-value" style={{ color: curFrame.trunk_lean > 38 ? '#e24b4a' : '#374151' }}>{curFrame.trunk_lean}°</span>
                </div>
                <div className="frame-metric">
                  <span className="fm-label">躯干侧倾</span>
                  <span className="fm-value" style={{ color: Math.abs(curFrame.trunk_lateral) > 8 ? '#e24b4a' : '#374151' }}>{curFrame.trunk_lateral}°</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 大白话总结 */}
      {risk?.plain_summary && (
        <div className="card plain-summary-card">
          <div className="plain-summary-title">📋 分析总结（大白话版）</div>
          <div className="plain-summary-body">
            {risk.plain_summary.split('\n\n').map((para, i) => {
              const m = para.match(/^【(.+?)】\n?([\s\S]*)$/)
              if (m) {
                return (
                  <div className="plain-para" key={i}>
                    <strong className="plain-para-head">{m[1]}</strong>
                    <span>{m[2]}</span>
                  </div>
                )
              }
              return <p className="plain-para" key={i}>{para}</p>
            })}
          </div>
        </div>
      )}

      {/* 动作要领大白话 */}
      {risk?.action_guide && (
        <div className="card action-guide-card">
          <div className="action-guide-title">🦵 动作要领（大白话版）</div>
          <div className="action-guide-body">
            {risk.action_guide.split('\n\n').map((para, i) => {
              const m = para.match(/^【(.+?)】\n?([\s\S]*)$/)
              if (m) {
                return (
                  <div className="guide-para" key={i}>
                    <strong className="guide-para-head">{m[1]}</strong>
                    <span>{m[2]}</span>
                  </div>
                )
              }
              return <p className="guide-para" key={i}>{para}</p>
            })}
          </div>
        </div>
      )}

      {/* 数据可信度说明 */}
      {risk && (
        <div className="card credibility-card">
          <div className="credibility-title">数据可信度说明</div>
          <div className="credibility-body">
            <span>• 分析引擎：Google MediaPipe Pose 姿态识别（33个身体关键点）</span>
            <span>• 评估模型：基于运动生物力学的6维度规则评估系统（阈值采用学术界标准）</span>
            <span>• 局限性：基于2D单视角分析，部分3D指标（如膝内扣、躯干侧倾）为估算值</span>
            <span>• 本报告仅供参考，专业诊断请咨询运动医学医生</span>
          </div>
        </div>
      )}

      {/* 学术依据（提升可信度） */}
      <div className="card evidence-card">
        <div className="evidence-title">📚 学术依据与参考文献</div>
        <div className="evidence-sub">本系统的评估阈值基于以下学术研究，每个指标都有学界公认的标准</div>
        <table className="evidence-table">
          <thead>
            <tr>
              <th>评估指标</th>
              <th>学界标准</th>
              <th>参考文献</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>膝外翻（valgus）</td><td>&gt;10° 显著内扣，ACL损伤风险↑约5倍</td><td>Hewett TE et al. (2005) AJSM</td></tr>
            <tr><td>膝屈曲（落地缓冲）</td><td>30-50° 标准缓冲范围</td><td>Podraza &amp; White (2016)</td></tr>
            <tr><td>躯干前倾</td><td>&lt;30° 标准姿势，减少膝/腰负荷</td><td>Blackburn &amp; Padua (2008)</td></tr>
            <tr><td>躯干侧倾</td><td>&lt;8° 左右对称，避免单侧负荷</td><td>Hewett TE et al. (2005)</td></tr>
            <tr><td>膝角速度</td><td>&gt;500°/s 高速冲击，提示缓冲不足</td><td>Dempsey AR et al. (2009)</td></tr>
            <tr><td>落地缓冲时间</td><td>&gt;150ms 充分缓冲</td><td>Zhang SN et al. (2008) J Appl Biomech</td></tr>
            <tr><td>左右不对称</td><td>&gt;10% 双侧负荷不对称</td><td>Zifchock RA et al. (2008)</td></tr>
          </tbody>
        </table>

        <div className="evidence-disclaimer">
          ⚠️ <strong>诚实声明：</strong>本系统采用<strong>规则评估（启发式阈值）</strong>，
          <strong>未使用</strong> XGBoost/LightGBM/SHAP 等 ML 模型。下方论文仅作为方法论参考与阈值依据，
          非系统实际加载的模型。如需真正的 ML 预测，需额外收集体测数据并训练模型。
        </div>

        <div className="evidence-refs-title">📖 方法论参考论文</div>
        <div className="evidence-refs">
          <div className="ref-item">
            <span className="ref-num">[1]</span>
            <span className="ref-text"><strong>Zhang S, Li M, Shen J, Wang X, Chen Z.</strong> Using Interpretable Machine Learning to Predict Injury Risk Among Collegiate Male Basketball Players. <em>Medicine &amp; Science in Sports &amp; Exercise</em>, 2024. — 提出 LightGBM + SHAP 可解释ML + 专家知识指标的框架</span>
          </div>
          <div className="ref-item">
            <span className="ref-num">[2]</span>
            <span className="ref-text"><strong>Val Desrosiers K, et al.</strong> Comparing a Novel Smartphone Application vs The Kinect V2 for Assessing ACL Injury Risk, 2024. — 验证了便捷方案评估ACL损伤风险的可行性</span>
          </div>
          <div className="ref-item">
            <span className="ref-num">[3]</span>
            <span className="ref-text"><strong>Yoke JP, DiDomenico A, Sennett S, Simpson K</strong> (Temple University). The Effects of Anterior-to-flight Perturbation on Lower Extremity Biomechanics During Drop Landing, 2024. — 落地生物力学扰动研究</span>
          </div>
        </div>
      </div>

      {/* 运动员档案 + 个体因素影响 */}
      {result.athlete_info && risk && (
        <div className="report-block">
          <div className="section-title" style={{ fontSize: 18 }}>
            运动员档案 & 个体因素影响
          </div>
          <div className="grid grid-2">
            <div className="card athlete-profile-card">
              <div className="gear-card-title">👤 运动员档案</div>
              <div className="profile-grid">
                <div className="profile-item"><span>年龄</span><strong>{result.athlete_info.age}岁</strong></div>
                <div className="profile-item"><span>性别</span><strong>{result.athlete_info.gender}</strong></div>
                <div className="profile-item"><span>BMI</span><strong>{(result.athlete_info.weight_kg / Math.pow(result.athlete_info.height_cm / 100, 2)).toFixed(1)}</strong></div>
                <div className="profile-item"><span>运动水平</span><strong>{result.athlete_info.level}</strong></div>
                <div className="profile-item"><span>惯用腿</span><strong>{result.athlete_info.dominant_leg}</strong></div>
                <div className="profile-item"><span>训练频率</span><strong>{result.athlete_info.weekly_training_freq}次/周</strong></div>
                <div className="profile-item"><span>疲劳程度</span><strong>{result.athlete_info.fatigue_level}/10</strong></div>
                <div className="profile-item"><span>既往伤病</span><strong>{result.athlete_info.injury_history || '无'}</strong></div>
                <div className="profile-item"><span>当前疼痛</span><strong>{result.athlete_info.current_pain || '无'}</strong></div>
              </div>
            </div>
            <div className="card athlete-profile-card">
              <div className="gear-card-title">📊 个体因素对评分的影响</div>
              {(() => {
                const items = risk.items.filter(it => it.athlete_adjustments && it.athlete_adjustments.length > 0)
                if (items.length === 0) return <p className="no-adj">本次分析未受个体因素额外影响</p>
                return items.map((it, i) => (
                  <div className="adj-category" key={i}>
                    <div className="adj-cat-head">
                      <strong>{it.category}</strong>
                      <span className="adj-score-change">{it.base_score?.toFixed(1)} → {it.score.toFixed(1)}</span>
                    </div>
                    {it.athlete_adjustments!.map((a, j) => (
                      <div className="adj-item" key={j}>
                        <span className="adj-factor">{a.factor}</span>
                        <span className={a.delta > 0 ? 'adj-delta adj-up' : 'adj-delta adj-down'}>
                          {a.delta > 0 ? '+' : ''}{a.delta}
                        </span>
                        <span className="adj-reason">{a.reason}</span>
                      </div>
                    ))}
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 动作有效性提示(防止走路误识别为落地) */}
      {result.action_validity && result.action_validity.score < 0.7 && (
        <div className="report-block">
          <div className="section-title" style={{ fontSize: 18 }}>
            ⚠️ 动作有效性提示
          </div>
          <div className="action-validity-card">
            <div className="validity-header">
              <span className="validity-score">
                有效性评分: {(result.action_validity.score * 100).toFixed(0)}%
              </span>
              <span className={result.action_validity.is_valid ? 'validity-ok' : 'validity-warn'}>
                {result.action_validity.is_valid ? '✅ 动作有效' : '⚠️ 动作可能不准确'}
              </span>
            </div>
            {result.action_validity.messages.map((msg: string, i: number) => (
              <div key={i} className="validity-msg">{msg}</div>
            ))}
            <div className="validity-tip">
              💡 请确认视频是否包含完整的跳跃落地动作。如果只是走路/站立,分析结果可能不准确。
            </div>
          </div>
        </div>
      )}

      {/* 问题动作回放 */}
      {result.problem_moments && result.problem_moments.length > 0 && (
        <div className="report-block">
          <div className="section-title" style={{ fontSize: 18 }}>
            ⚠️ 问题动作回放（截取自原视频）
          </div>
          <p className="block-subtitle">
            以下是分析识别出的高风险动作时刻，截取自你的原始视频，可直观看到问题动作
          </p>
          <div className="grid grid-2">
            {result.problem_moments.map((m, i) => (
              <div className="card problem-clip-card" key={i}>
                <div className="problem-clip-head">
                  <span className="problem-issue-tag">{m.issue}</span>
                  <span className="problem-time">@ {m.timestamp.toFixed(1)}s</span>
                </div>
                <video
                  src={getProblemMomentVideoUrl(taskId!, m.clip_index)}
                  controls
                  playsInline
                  loop
                />
                <p className="problem-desc">💡 {m.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 风险详情卡片 */}
      {risk && risk.items.length > 0 && (
        <div className="report-block">
          <div className="section-title" style={{ fontSize: 18 }}>
            风险详情
          </div>
          <div className="grid grid-2">
            {risk.items.map((it, i) => {
              const c = RISK_COLORS[it.level] || '#999'
              return (
                <div className="card risk-item" key={i}>
                  <div className="risk-item-head">
                    <span className="risk-cat">{it.category}</span>
                    <span
                      className="tag"
                      style={{ background: `${c}22`, color: c }}
                    >
                      {it.level}
                    </span>
                  </div>
                  <div className="risk-score-bar">
                    <div className="risk-score-num" style={{ color: c }}>
                      {it.score}
                      <small>/100</small>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${it.score}%`, background: c }}
                      />
                    </div>
                  </div>
                  <div className="risk-cols">
                    <div className="risk-col">
                      <h5>主要原因</h5>
                      <ul>
                        {it.main_causes.map((c, j) => (
                          <li key={j}>{c}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="risk-col">
                      <h5>改进建议</h5>
                      <ul>
                        {it.recommendations.map((c, j) => (
                          <li key={j}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {it.exercises && it.exercises.length > 0 && (
                    <div className="risk-exercises">
                      <h5>推荐训练动作（含演示视频）</h5>
                      <div className="ex-list">
                        {it.exercises.map((ex, k) => (
                          <div className="ex-card" key={k}>
                            <div className="ex-head">
                              <strong>{ex.name}</strong>
                              <span className="ex-dose">{ex.dose}</span>
                            </div>
                            <p className="ex-steps">{ex.steps}</p>
                            <a
                              className="ex-video"
                              href={`https://search.bilibili.com/all?keyword=${encodeURIComponent(ex.video)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              ▶ 观看演示视频
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 护具与球鞋推荐 */}
      {risk?.gear_recommendations &&
        (risk.gear_recommendations.protectors.length > 0 ||
          risk.gear_recommendations.shoes.length > 0) && (
          <div className="report-block">
            <div className="section-title" style={{ fontSize: 18 }}>
              装备推荐（护具 & 球鞋）
            </div>
            <div className="grid grid-2">
              {risk.gear_recommendations.protectors.length > 0 && (
                <div className="card gear-card">
                  <div className="gear-card-title">🛡️ 推荐护具</div>
                  <div className="gear-list">
                    {risk.gear_recommendations.protectors.map((p, i) => (
                      <div className="gear-item" key={i}>
                        <div className="gear-item-head">
                          <strong>{p.name}</strong>
                          <span className="gear-scene">{p.scene}</span>
                        </div>
                        <p className="gear-desc">{p.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {risk.gear_recommendations.shoes.length > 0 && (
                <div className="card gear-card">
                  <div className="gear-card-title">👟 推荐球鞋特性</div>
                  <div className="gear-list">
                    {risk.gear_recommendations.shoes.map((s, i) => (
                      <div className="gear-item" key={i}>
                        <div className="gear-item-head">
                          <strong>{s.feature}</strong>
                        </div>
                        <p className="gear-desc">{s.desc}</p>
                        <p className="gear-reason">适用：{s.reason}</p>
                        {s.models && s.models.length > 0 && (
                          <div className="shoe-models">
                            <div className="shoe-models-title">推荐款式</div>
                            {s.models.map((m, j) => (
                              <div className="shoe-model" key={j}>
                                <span className="shoe-brand">{m.brand}</span>
                                <span className="shoe-name">{m.name}</span>
                                <span className="shoe-highlight">{m.highlight}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {/* 生物力学特征 */}
      {features && (
        <div className="report-block">
          <div className="section-title" style={{ fontSize: 18 }}>
            生物力学特征
          </div>
          <div className="grid grid-4">
            <FeatureCard
              title="膝关节"
              color="#00b4d8"
              metrics={[
                { k: '触地屈曲', v: `${fmtNum(features.knee.initial_contact_flexion_deg)}°` },
                { k: '最大屈曲', v: `${fmtNum(features.knee.max_flexion_deg)}°` },
                { k: '外翻角度', v: `${fmtNum(features.knee.valgus_deg)}°` },
                { k: '左右差', v: `${fmtNum(features.knee.left_right_diff_deg)}°` },
                { k: '膝趾对线', v: `${fmtNum(features.knee.knee_toe_alignment_deg)}°` },
              ]}
            />
            <FeatureCard
              title="髋关节"
              color="#06d6a0"
              metrics={[
                { k: '屈曲角度', v: `${fmtNum(features.hip.flexion_deg)}°` },
                { k: '内收角度', v: `${fmtNum(features.hip.adduction_deg)}°` },
                { k: '骨盆倾斜', v: `${fmtNum(features.hip.pelvic_tilt_deg)}°` },
                { k: '左右高差', v: `${fmtNum(features.hip.left_right_height_diff)} cm` },
                { k: '稳定性', v: `${fmtNum(features.hip.stability)}` },
              ]}
            />
            <FeatureCard
              title="踝关节"
              color="#ff6b35"
              metrics={[
                { k: '背屈角度', v: `${fmtNum(features.ankle.dorsiflexion_deg)}°` },
                { k: '足部朝向', v: `${fmtNum(features.ankle.foot_landing_direction_deg)}°` },
                { k: '触地时差', v: `${fmtNum(features.ankle.left_right_contact_time_diff_ms)} ms` },
                { k: '踝摇摆', v: `${fmtNum(features.ankle.ankle_sway_deg)}°` },
                { k: '稳定时间', v: `${fmtNum(features.ankle.stabilization_time_ms)} ms` },
              ]}
            />
            <FeatureCard
              title="躯干控制"
              color="#7c5cff"
              metrics={[
                { k: '前倾', v: `${fmtNum(features.trunk.forward_lean_deg)}°` },
                { k: '侧倾', v: `${fmtNum(features.trunk.lateral_lean_deg)}°` },
                { k: '肩髋偏移', v: `${fmtNum(features.trunk.shoulder_hip_axis_deviation_deg)}°` },
                { k: '质心侧移', v: `${fmtNum(features.trunk.com_lateral_displacement)} cm` },
                { k: '上躯旋转', v: `${fmtNum(features.trunk.upper_rotation_deg)}°` },
              ]}
            />
          </div>
          <div className="card overall-features" style={{ marginTop: 20 }}>
            <div className="section-title" style={{ fontSize: 15, marginBottom: 14 }}>
              整体动作指标
            </div>
            <div className="overall-metrics">
              <OverallMetric label="落地缓冲" value={`${fmtNum(features.overall.landing_buffer_time_ms)} ms`} />
              <OverallMetric label="质心下落" value={`${fmtNum(features.overall.com_drop_distance)} cm`} />
              <OverallMetric label="动作时长" value={`${fmtNum(features.overall.action_duration_ms)} ms`} />
              <OverallMetric label="双侧不对称" value={fmtNum(features.overall.bilateral_asymmetry, 2)} />
              <OverallMetric label="稳定时间" value={`${fmtNum(features.overall.stabilization_time_ms)} ms`} />
              <OverallMetric label="动作一致性" value={fmtNum(features.overall.consistency, 2)} />
              <OverallMetric label="疲劳变化" value={fmtNum(features.overall.fatigue_change, 2)} />
            </div>
          </div>
        </div>
      )}

      {/* 动作阶段时间轴 */}
      {result.phases.length > 0 && (
        <div className="report-block">
          <div className="section-title" style={{ fontSize: 18 }}>
            动作阶段时间轴
          </div>
          <div className="card">
            <PhaseTimeline phases={result.phases} />
          </div>
        </div>
      )}

      {/* 个性化训练计划 */}
      {risk?.training_plan && risk.training_plan.length > 0 && (
        <div className="report-block">
          <div className="section-title" style={{ fontSize: 18 }}>
            📅 个性化训练计划（本周）
          </div>
          <div className="training-plan-grid">
            {risk.training_plan.map((d) => (
              <div className="training-day-card" key={d.day}>
                <div className="training-day-head">
                  <strong>{d.day}</strong>
                  <span className="training-focus">{d.focus}</span>
                </div>
                <div className="training-exercises">
                  {d.exercises.map((ex, j) => (
                    <div className="training-ex" key={j}>
                      <div className="ex-name">{ex.name} <span className="ex-dose">{ex.dose}</span></div>
                      <div className="ex-purpose">{ex.purpose}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 底部操作 */}
      <div className="report-foot">
        <button className="btn btn-primary btn-lg" onClick={() => navigate('/upload')}>
          重新测试
        </button>
        <button className="btn btn-outline btn-lg" onClick={() => navigate('/history')}>
          前后对比
        </button>
      </div>
    </div>
  )
}

/* ===== 子组件 ===== */
// 生物力学指标的通俗解释(让普通人看懂)
const METRIC_EXPLAINS: Record<string, Record<string, string>> = {
  膝关节: {
    触地屈曲: "落地瞬间膝盖弯曲程度，越大缓冲越好",
    最大屈曲: "落地过程膝盖最大弯曲，反映缓冲能力",
    外翻角度: "膝盖内扣程度，越小越好",
    左右差: "左右膝动作差异，越小越对称",
    膝趾对线: "膝盖与脚尖方向对齐度，越小越好",
  },
  髋关节: {
    屈曲角度: "落地时髋部弯曲，帮助分散冲击",
    内收角度: "髋部左右偏移，越小越稳",
    骨盆倾斜: "骨盆左右高低差，越小越稳",
    左右高差: "左右髋高度差，越小越对称",
    稳定性: "重心横向稳定度，越高越好",
  },
  踝关节: {
    背屈角度: "脚尖上勾程度，影响落地缓冲",
    足部朝向: "落地脚尖方向，应与膝盖一致",
    触地时差: "左右脚触地时间差，越小越对称",
    踝摇摆: "踝关节晃动程度，越小越稳",
    稳定时间: "落地后稳定所需时间，越短越好",
  },
  躯干控制: {
    前倾: "身体前倾程度，过大重心不稳",
    侧倾: "身体左右倾斜，越小越稳",
    肩髋偏移: "肩与髋轴线偏差，越小越好",
    质心侧移: "重心横向偏移，越小越好",
    上躯旋转: "上身扭转程度，越小越好",
  },
}

function FeatureCard({
  title,
  color,
  metrics,
}: {
  title: string
  color: string
  metrics: { k: string; v: string }[]
}) {
  const explains = METRIC_EXPLAINS[title] || {}
  return (
    <div className="card feature-metric-card">
      <div className="fmc-head" style={{ color }}>
        {title}
      </div>
      <ul className="fmc-list">
        {metrics.map((m) => (
          <li key={m.k}>
            <div className="fmc-row">
              <span className="fmc-k">{m.k}</span>
              <strong className="fmc-v">{m.v}</strong>
            </div>
            {explains[m.k] && <div className="fmc-tip">💡 {explains[m.k]}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function OverallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="overall-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PhaseTimeline({
  phases,
}: {
  phases: AnalysisResult['phases']
}) {
  const total = phases[phases.length - 1]?.end_time_ms || 1
  const colors = ['#00b4d8', '#06d6a0', '#ff6b35', '#7c5cff', '#ffd166']
  return (
    <div className="phase-tl">
      <div className="phase-track">
        {phases.map((p, i) => {
          const left = (p.start_time_ms / total) * 100
          const width = ((p.end_time_ms - p.start_time_ms) / total) * 100
          return (
            <div
              key={i}
              className="phase-seg"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: colors[i % colors.length],
              }}
              title={`${p.phase_type} (${p.start_time_ms}-${p.end_time_ms}ms)`}
            />
          )
        })}
      </div>
      <div className="phase-labels">
        {phases.map((p, i) => (
          <div className="phase-label" key={i}>
            <span
              className="phase-dot"
              style={{ background: colors[i % colors.length] }}
            />
            <div>
              <strong>{p.phase_type}</strong>
              <small>
                {p.start_time_ms} - {p.end_time_ms} ms
              </small>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
