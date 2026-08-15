import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActions, getGuide, uploadAnalysis } from '../services/api'
import type { ActionOption, GuideItem } from '../types'
import './Upload.css'

export default function Upload() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [actions, setActions] = useState<ActionOption[]>([])
  const [guides, setGuides] = useState<GuideItem[]>([])
  const [actionType, setActionType] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [metaLoadError, setMetaLoadError] = useState('')

  useEffect(() => {
    getActions()
      .then((d) => {
        setActions(d)
        if (d.length) setActionType(d[0].value)
      })
      .catch((e) => setMetaLoadError('动作列表加载失败：' + (e.message || '网络错误')))
    getGuide()
      .then(setGuides)
      .catch(() => {
        /* 指导为可选，失败时使用兜底 */
      })
  }, [])

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
      const res = await uploadAnalysis(file, athleteInfo, actionType)
      navigate(`/analysis/${res.task_id}`)
    } catch (e: any) {
      setError('上传失败：' + (e?.message || '请检查后端是否已启动'))
    } finally {
      setLoading(false)
    }
  }

  const selectedAction = actions.find((a) => a.value === actionType)

  return (
    <div className="page">
      <div className="page-header">
        <h1>上传动作视频</h1>
        <p>选择动作类型并上传视频，系统将自动进行姿态识别与风险分析</p>
      </div>

      {metaLoadError && <div className="alert alert-err">{metaLoadError}</div>}

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
                {actions.map((a) => (
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
                  正在上传并启动分析…
                </>
              ) : (
                '开始分析'
              )}
            </button>
          </div>
        </div>

        {/* 拍摄指导 */}
        <aside className="card upload-guide">
          <div className="section-title">拍摄指导</div>
          {guides.length === 0 ? (
            <div className="guide-fallback">
              <p>· 相机固定，画面稳定不晃动</p>
              <p>· 拍摄角度与运动方向垂直（侧拍）</p>
              <p>· 确保全身入镜，关节不被遮挡</p>
              <p>· 光线充足，避免强逆光</p>
              <p>· 背景简洁，减少干扰元素</p>
            </div>
          ) : (
            <ul className="guide-list">
              {guides.map((g, i) => (
                <li key={i}>
                  <div className="guide-num">{i + 1}</div>
                  <div>
                    <strong>{g.title}</strong>
                    <p>{g.content}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
