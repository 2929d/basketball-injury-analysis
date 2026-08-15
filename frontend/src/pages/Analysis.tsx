import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getProgress } from '../services/api'
import type { AnalysisStatus } from '../types'
import { STATUS_TEXT } from '../utils'
import './Analysis.css'

const STAGES: { status: AnalysisStatus; label: string }[] = [
  { status: 'quality_checking', label: '视频质量检测' },
  { status: 'posing', label: '姿态识别' },
  { status: 'extracting', label: '特征提取' },
  { status: 'scoring', label: '风险评分' },
]

export default function Analysis() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<AnalysisStatus>('queued')
  const [message, setMessage] = useState('正在等待分析任务启动…')
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!taskId) return
    let stopped = false

    const poll = async () => {
      try {
        const d = await getProgress(taskId)
        if (stopped) return
        setProgress(d.progress ?? 0)
        setStatus(d.status)
        setMessage(d.message || STATUS_TEXT[d.status] || '分析中…')
        if (d.status === 'done') {
          if (timer.current) clearInterval(timer.current)
          setTimeout(() => navigate(`/report/${taskId}`), 600)
        } else if (d.status === 'error') {
          if (timer.current) clearInterval(timer.current)
          setError(d.message || '分析过程中出现错误')
        }
      } catch (e: any) {
        if (!stopped)
          setError('无法连接分析服务：' + (e?.message || '请确认后端已启动'))
      }
    }
    poll()
    timer.current = setInterval(poll, 1500)
    return () => {
      stopped = true
      if (timer.current) clearInterval(timer.current)
    }
  }, [taskId, navigate])

  const currentStageIdx = STAGES.findIndex((s) => s.status === status)
  const isError = status === 'error' || !!error

  return (
    <div className="page analysis-page">
      <div className="analysis-card">
        <div className="analysis-visual">
          <div className="ring-track">
            <svg viewBox="0 0 120 120" className="ring-svg">
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="#e9eef5"
                strokeWidth="10"
              />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="url(#ringg)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(progress / 100) * 2 * Math.PI * 52} 9999`}
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dasharray 0.5s ease' }}
              />
              <defs>
                <linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#00b4d8" />
                  <stop offset="1" stopColor="#06d6a0" />
                </linearGradient>
              </defs>
            </svg>
            <div className="ring-center">
              <strong>{progress}%</strong>
              <span>{isError ? '出错' : STATUS_TEXT[status]}</span>
            </div>
          </div>
        </div>

        <div className="analysis-info">
          <h2>{isError ? '分析中断' : '正在分析动作视频'}</h2>
          <p className="analysis-msg">{message}</p>
          <div className="analysis-taskid">任务 ID：{taskId}</div>
        </div>

        {!isError ? (
          <div className="stages">
            {STAGES.map((s, i) => {
              const done = currentStageIdx > i
              const active = currentStageIdx === i
              return (
                <div
                  key={s.status}
                  className={`stage ${done ? 'done' : ''} ${active ? 'active' : ''}`}
                >
                  <div className="stage-dot">
                    {done ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 13l4 4L19 7"
                          stroke="#fff"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : active ? (
                      <span className="spinner" />
                    ) : (
                      <span className="stage-num">{i + 1}</span>
                    )}
                  </div>
                  <span>{s.label}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="analysis-err">
            <div className="err-icon">!</div>
            <div>
              <strong>分析过程中出现错误</strong>
              <p>{error}</p>
              <button
                className="btn btn-outline"
                onClick={() => navigate('/upload')}
              >
                返回重新上传
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
