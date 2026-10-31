import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getLocalTaskState } from '../analysis/manager'
import { getLocalResult } from '../analysis/pipeline'
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
  const previewRef = useRef<HTMLCanvasElement>(null)
  const lastCopyRef = useRef(0)
  const [hasPreview, setHasPreview] = useState(false)

  useEffect(() => {
    if (!taskId) return
    let stopped = false

    const poll = () => {
      const state = getLocalTaskState(taskId)
      if (stopped) return

      // 内存中找不到任务: 可能页面刷新/重开后内存态丢失。
      // 若该任务已完成并持久化到 localStorage, 直接跳转到报告页(修复"重新打开就报错")
      if (!state) {
        const saved = taskId ? getLocalResult(taskId) : null
        if (saved) {
          navigate(`/report/${taskId}`, { replace: true })
          return
        }
        setError('找不到该分析任务（页面刷新会中断进行中的分析，请重新上传）')
        if (timer.current) clearInterval(timer.current)
        return
      }

      setProgress(state.progress ?? 0)
      setStatus(state.status)
      setMessage(state.message || STATUS_TEXT[state.status] || '分析中…')

      // 实时骨骼预览: 把分析引擎画布内容拷贝到页面画布(节流 120ms, 与引擎重绘频率匹配)
      if (state.previewCanvas) {
        const target = previewRef.current
        const now = performance.now()
        if (target && now - lastCopyRef.current >= 120) {
          lastCopyRef.current = now
          const src = state.previewCanvas
          if (target.width !== src.width || target.height !== src.height) {
            target.width = src.width
            target.height = src.height
          }
          const ctx = target.getContext('2d')
          if (ctx) {
            ctx.drawImage(src, 0, 0)
            setHasPreview(true)
          }
        }
      }

      if (state.status === 'done') {
        if (timer.current) clearInterval(timer.current)
        setTimeout(() => navigate(`/report/${taskId}`), 500)
      } else if (state.status === 'error') {
        if (timer.current) clearInterval(timer.current)
        setError(state.error || state.message || '分析过程中出现错误')
      }
    }

    poll()
    timer.current = setInterval(poll, 120)
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
                  <stop offset="0" stopColor="#12b3d6" />
                  <stop offset="1" stopColor="#8be04b" />
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

        {!isError && hasPreview && (
          <div className="analysis-preview">
            <div className="preview-title">📹 骨骼识别实时预览</div>
            <canvas ref={previewRef} className="preview-canvas" />
          </div>
        )}

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
