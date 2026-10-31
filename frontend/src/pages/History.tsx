import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearLocalResults, loadLocalResults } from '../analysis/pipeline'
import './History.css'

interface HistoryRecord {
  task_id: string
  created_at: string
  action_type: string
  athlete_name: string
  overall_score: number
  overall_level: string
}

export default function History() {
  const navigate = useNavigate()
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 从 localStorage 读取本地分析历史
    const results = loadLocalResults()
    setRecords(
      results.map((r) => ({
        task_id: r.task_id,
        created_at: r.created_at,
        action_type: r.action_type,
        athlete_name: `${r.athlete_info?.sport || ''}·${r.athlete_info?.level || ''}`,
        overall_score: r.risk?.overall_score ?? 0,
        overall_level: r.risk?.overall_level ?? '低风险',
      })),
    )
    setLoading(false)
  }, [])

  const levelColor = (level: string) => {
    if (level === '高风险') return '#e24b4a'
    if (level === '中风险') return '#ef9f27'
    return '#1d9e75'
  }

  const handleClear = () => {
    if (window.confirm('确定要清除全部历史记录吗？清除后无法恢复。')) {
      clearLocalResults()
      setRecords([])
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>历史记录</h1>
        <p>查看所有分析记录，追踪动作改善趋势</p>
        {records.length > 0 && (
          <button className="btn-history-clear" onClick={handleClear}>
            清除历史
          </button>
        )}
      </div>

      {loading ? (
        <div className="card">加载中...</div>
      ) : records.length === 0 ? (
        <div className="card empty-state">
          <p>暂无历史记录</p>
          <button className="btn btn-primary" onClick={() => navigate('/athlete')}>
            开始分析
          </button>
        </div>
      ) : (
        <>
          {records.length >= 2 && (
            <div className="card history-trend">
              <div className="section-title">评分趋势</div>
              <div className="trend-chart">
                {records.slice(0, 12).reverse().map((r) => (
                  <div className="trend-bar" key={r.task_id} title={`${r.overall_score} ${r.overall_level}`}>
                    <div
                      className="trend-bar-fill"
                      style={{ height: `${Math.max(r.overall_score, 5)}%`, background: levelColor(r.overall_level) }}
                    />
                    <span className="trend-score">{r.overall_score}</span>
                  </div>
                ))}
              </div>
              <p className="trend-tip">柱状图从左到右按时间排列，高度越低越好（风险越低）</p>
            </div>
          )}

          <div className="card history-list">
            {records.map((r) => (
              <div
                className="history-item"
                key={r.task_id}
                onClick={() => navigate(`/report/${r.task_id}`)}
              >
                <div className="history-item-info">
                  <strong>{r.action_type}</strong>
                  <span className="history-meta">
                    {r.athlete_name} · {r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : ''}
                  </span>
                </div>
                <div className="history-item-score">
                  <span className="score-num" style={{ color: levelColor(r.overall_level) }}>
                    {r.overall_score}
                  </span>
                  <span className="score-level" style={{ background: levelColor(r.overall_level) }}>
                    {r.overall_level}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
