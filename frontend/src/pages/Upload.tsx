import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ACTION_TYPES } from '../analysis/types'
import { startLocalAnalysis } from '../analysis/manager'
import type { ActionOption, GuideItem } from '../types'
import './Upload.css'

// 动作说明(本地兜底, 无需后端)
const ACTION_DESC: Record<string, string> = {
  双脚垂直跳跃落地: '原地起跳后双脚落地，重点评估落地缓冲与膝关节控制',
  单脚跳跃落地: '单脚起跳后单脚落地，重点评估踝关节稳定与动态控制',
  侧向移动后急停: '侧向移动后急停制动，重点评估侧向稳定与膝关节剪切负荷',
  快速变向动作: '全速奔跑中快速变向，重点评估膝关节扭转负荷与躯干控制',
  深蹲起跳与落地: '深蹲起跳后落地，重点评估髋膝踝协同发力与落地缓冲',
}

const ACTIONS: ActionOption[] = ACTION_TYPES.map((v) => ({
  value: v,
  label: v,
  desc: ACTION_DESC[v] || '',
}))

const GUIDE_FALLBACK: GuideItem[] = [
  { title: '相机固定', content: '相机固定在三脚架或稳定平面，画面全程不晃动' },
  { title: '侧面拍摄', content: '拍摄角度与运动方向垂直（侧拍），保证全身入镜' },
  { title: '光线充足', content: '避免强逆光与阴影遮挡，确保关节轮廓清晰可见' },
  { title: '背景简洁', content: '减少画面中的干扰元素，让人体成为画面主体' },
  { title: '着装建议', content: '建议穿短裤短袖，关节部位不被衣物遮挡' },
]

export default function Upload() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [actionType, setActionType] = useState(ACTIONS[0]?.value || '')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setPreviewUrl('')
  }, [file])

  const pickFile = (f: File | null) => {
    setError('')
    if (!f) return
    if (!f.type.startsWith('video/')) {
      setError('请上传视频文件（mp4 / mov / webm 等）')
      return
    }
    if (f.size > 200 * 1024 * 1024) {
      setError('视频不能超过 200MB')
      return
    }
    setFile(f)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    pickFile(e.dataTransfer.files?.[0] ?? null)
  }

  const handleSubmit = async () => {
    setError('')
    const athleteRaw = sessionStorage.getItem('athlete_info')
    if (!athleteRaw) {
      setError('请先填写运动员信息')
      return
    }
    if (!file) {
      setError('请选择待分析的视频')
      return
    }
    if (!actionType) {
      setError('请选择动作类型')
      return
    }
    setLoading(true)
    try {
      const athleteInfo = JSON.parse(athleteRaw)
      // 本地分析: 启动后台任务并跳转到进度页
      const taskId = startLocalAnalysis(file, athleteInfo, actionType)
      navigate(`/analysis/${taskId}`)
    } catch (e: any) {
      setError('启动分析失败：' + (e?.message || '请重试'))
      setLoading(false)
    }
  }

  const selectedAction = ACTIONS.find((a) => a.value === actionType)

  return (
    <div className="page">
      <div className="page-header">
        <h1>上传动作视频</h1>
        <p>选择动作类型并上传视频，系统将自动进行姿态识别与风险分析</p>
      </div>

      <div className="upload-layout">
        <div className="upload-main">
          {/* 动作选择 */}
          <div className="card upload-section">
            <div className="section-title">动作类型</div>
            <div className="field" style={{ marginBottom: 0 }}>
              <select
                className="select"
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
              >
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              {selectedAction?.desc && (
                <div className="action-desc">{selectedAction.desc}</div>
              )}
            </div>
          </div>

          {/* 视频上传 */}
          <div className="card upload-section">
            <div className="section-title">动作视频</div>
            <div
              className={`dropzone ${dragging ? 'drag' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              {previewUrl ? (
                <div className="preview-wrap">
                  <video src={previewUrl} controls muted />
                  <div className="preview-info">
                    <strong>{file?.name}</strong>
                    <span>{((file?.size ?? 0) / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                  <button
                    className="btn-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFile(null)
                    }}
                  >
                    重新选择
                  </button>
                </div>
              ) : (
                <div className="drop-empty">
                  <div className="drop-icon">
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="drop-title">拖拽视频到此处，或点击选择</div>
                  <div className="drop-sub">支持 mp4 / mov / webm，建议 ≤ 200MB</div>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                style={{ display: 'none' }}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {error && <div className="alert alert-err">{error}</div>}

          <div className="upload-actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={handleSubmit}
              disabled={loading || !file}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  正在启动本地分析…
                </>
              ) : (
                '开始分析'
              )}
            </button>
            <p className="upload-privacy">
              🔒 全程在浏览器本地运行：视频与数据不会上传到任何服务器
            </p>
          </div>
        </div>

        {/* 拍摄指导 */}
        <aside className="card upload-guide">
          <div className="section-title">拍摄指导</div>
          <ul className="guide-list">
            {GUIDE_FALLBACK.map((g, i) => (
              <li key={i}>
                <div className="guide-num">{i + 1}</div>
                <div>
                  <strong>{g.title}</strong>
                  <p>{g.content}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
