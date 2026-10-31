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
import { getAnalysisResult } from '../analysis/pipeline'
import { getLocalVideoUrl } from '../analysis/manager'
import {
  drawSkeletonFromKeypoints,
  detectLiveTarget,
  preloadPoseDetector,
  resetPoseTargetTracks,
  seedPoseTargetFromKeypoints,
  lockPoseTargetAt,
  landmarksToKeypoints,
  blendKeypoints,
} from '../analysis/pose_estimation'
import type { AnalysisResult, FrameTimelinePoint, KP } from '../analysis/types'
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
  const [timeline, setTimeline] = useState<FrameTimelinePoint[]>([])
  const [curFrame, setCurFrame] = useState<FrameTimelinePoint | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  /** 目标锁定状态: locked=已锁定运动员 / searching=识别中 / idle=当前帧没有可用目标 */
  const [targetState, setTargetState] = useState<'locked' | 'searching' | 'idle'>('searching')
  /** 手动点选运动员模式 */
  const [picking, setPicking] = useState(false)

  // 原始视频 blob URL(仅当次会话有效; 刷新页面后为 undefined)
  const videoUrl = taskId ? getLocalVideoUrl(taskId) : undefined
  const lastFrameRef = useRef<number>(-1)
  const lastStateAtRef = useRef<number>(0)
  const rafRef = useRef<number>(0)
  /** 用户是否手动点选过运动员(手动选择优先于任何自动播种) */
  const manualLockRef = useRef(false)
  /** 手动锁定模式下, 上次实时跟随的时间戳(控制 250ms 间隔, 避免飘忽) */
  const lastLiveAtRef = useRef(0)
  /** 存储帧里的目标是否可信(motion=true 才是按运动能量判别出的运动员) */
  const trustStoredTargetRef = useRef(false)

  // useRef 保存最新数据, 避免事件监听闭包 stale
  const resultRef = useRef(result)
  const timelineRef = useRef(timeline)
  useEffect(() => {
    resultRef.current = result
    timelineRef.current = timeline
    trustStoredTargetRef.current = result?.analysis_target?.motion === true
  }, [result, timeline])

  /** 画布分辨率跟随显示尺寸(按 DPR 放大), 保证骨骼线在小尺寸显示时依然清晰 */
  useEffect(() => {
    const video = videoRef.current
    const canvas = overlayRef.current
    if (!video || !canvas) return
    const sync = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      dprRef.current = dpr
      const cw = video.clientWidth || canvas.clientWidth
      const ch = video.clientHeight || canvas.clientHeight
      if (!cw || !ch) return
      const w = Math.max(120, Math.round(cw * dpr))
      const h = Math.max(80, Math.round(ch * dpr))
      if (canvas.width === w && canvas.height === h) return
      canvas.width = w
      canvas.height = h
      const v = videoRef.current
      if (v) drawSkeletonAtTime(v.currentTime)
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(video)
    window.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
    }
    // 仅在加载完成后绑定一次(此时视频元素已挂载)
  }, [loading, videoUrl])

  /** 二分查找 t 落在的 timeline 区间 [prev, next](相邻两个采样帧) */
  const findSegment = (t: number): [FrameTimelinePoint, FrameTimelinePoint] | null => {
    const tl = timelineRef.current
    if (!tl.length) return null
    let lo = 0
    let hi = tl.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (tl[mid].time < t) lo = mid + 1
      else hi = mid
    }
    if (lo <= 0) return [tl[0], tl[0]]
    if (lo >= tl.length) return [tl[tl.length - 1], tl[tl.length - 1]]
    return [tl[lo - 1], tl[lo]]
  }

  /** 在相邻两个采样帧之间做关键点线性插值, 让骨骼随视频播放平滑移动(而非一帧一帧跳变) */
  const interpolateKeypoints = (
    ka: Record<string, KP> | undefined,
    kb: Record<string, KP> | undefined,
    alpha: number,
  ): Record<string, KP> | undefined => {
    if (!ka) return undefined
    if (!kb) return ka
    const out: Record<string, KP> = {}
    for (const name of Object.keys(ka)) {
      const a = ka[name]
      const b = kb[name]
      if (!a) continue
      if (!b) {
        out[name] = a
        continue
      }
      out[name] = {
        ...a,
        x: a.x + (b.x - a.x) * alpha,
        y: a.y + (b.y - a.y) * alpha,
        visibility: Math.min(a.visibility, b.visibility),
      }
    }
    return out
  }

  // ===== 实时骨骼叠加 =====
  // 直接对当前视频帧跑姿态识别, 骨骼与画面严格同步, 彻底消除稀疏采样插值带来的延迟。
  // 目标判定: 由 pose_target.ts 的跟踪器判别"运动员" —— 墙上海报/大屏画面里的
  // 人形干扰目标在整段视频里几乎静止(运动能量≈0), 会被排除, 骨骼只跟随运动员。
  const liveBusyRef = useRef(false)
  const liveFailCountRef = useRef(0)
  const liveDisabledRef = useRef(false)
  const liveOkRef = useRef(false)

  /** 当前 DPR, 用于 drawSkeleton 控制线宽(避免 Retina 屏线条过粗) */
  const dprRef = useRef(1)

  /** 当前显示的关键点(经 EMA 平滑后), rAF 每帧都据此绘制 */
  const displayKpsRef = useRef<Record<string, KP> | undefined>(undefined)
  /** 最近一次实时识别成功的关键点 */
  const liveKpsRef = useRef<Record<string, KP> | undefined>(undefined)
  /** 最近一次实时识别成功的时间戳 */
  const liveTsRef = useRef(0)
  /** 当前实际绘制来源: stored=仅存储帧插值 / live=实时识别(含平滑) */
  const trackingSourceRef = useRef<'stored' | 'live'>('stored')
  /** 向用户展示的数据来源状态 */
  const [trackingMode, setTrackingMode] = useState<'stored' | 'live' | 'none'>('none')
  const trackingModeRef = useRef<'stored' | 'live' | 'none'>('none')

  /**
   * 用存储帧里当前时刻的目标位置播种锁定 —— 让实时识别在任意拖动位置都能立刻
   * 跟住运动员, 而不是从零开始重新判别(否则拖动到动作中段时可能短暂跟错人)。
   */
  const seedLockAtTime = (t: number) => {
    // 用户手动点选过 → 以用户选择为准, 不再自动播种
    if (manualLockRef.current || !trustStoredTargetRef.current) return
    const pf = resultRef.current?.pose_frames
    if (!pf || !pf.length) return
    const seg = findSegment(t)
    if (!seg) return
    const [prev, next] = seg
    const span = next.time - prev.time
    const alpha = span > 0 ? Math.min(1, Math.max(0, (t - prev.time) / span)) : 0
    const kps = interpolateKeypoints(
      pf[prev.frame]?.keypoints,
      pf[next.frame]?.keypoints,
      alpha,
    )
    if (kps) seedPoseTargetFromKeypoints(kps)
  }

  const drawLiveSkeleton = async (video: HTMLVideoElement) => {
    if (liveBusyRef.current || liveDisabledRef.current) return
    if (video.readyState < 2) return
    liveBusyRef.current = true
    try {
      const target = await detectLiveTarget(video)
      if (target.landmarks) {
        liveFailCountRef.current = 0
        liveOkRef.current = true
        liveKpsRef.current = landmarksToKeypoints(target.landmarks)
        liveTsRef.current = performance.now()
        trackingSourceRef.current = 'live'
        setTargetState(target.locked ? 'locked' : 'searching')
      } else {
        // 未识别到人体/识别失败: 连续多次失败后回退到存储帧插值
        liveFailCountRef.current += 1
        if (liveFailCountRef.current > 60) liveDisabledRef.current = true
        if (liveFailCountRef.current > 3) {
          liveOkRef.current = false
          // 实时跟丢后, 若太久没有新数据, 绘制会自然回退到存储帧插值
        }
        setTargetState('idle')
      }
    } finally {
      liveBusyRef.current = false
    }
  }

  /**
   * 进入/退出"手动点选运动员"模式。
   * 自动判别在画面里有大型人形干扰目标(墙上海报/大屏画面)时可能仍会跟错人,
   * 这时让用户直接在画面上点一下运动员即可锁定。
   */
  const togglePicking = () => {
    const next = !picking
    setPicking(next)
    const v = videoRef.current
    if (next && v && !v.paused) v.pause()
  }

  /** 手动点选运动员: 以点击位置为准锁定, 后续实时识别只跟随该目标 */
  const handleOverlayClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!picking) return
    const canvas = overlayRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    lockPoseTargetAt(x, y)
    manualLockRef.current = true
    setPicking(false)
    const video = videoRef.current
    if (video) void drawLiveSkeleton(video)
  }

  /**
   * 根据给定时间更新指标面板 + 绘制骨骼叠加。
   * 绘制策略:
   *  - 基础层: 分析阶段存储帧插值(稳定, 覆盖整段视频)
   *  - 修正层: 对当前视频帧做实时识别, 若成功且可信, 通过 EMA 平滑
   *    把当前显示姿态过渡到实时结果, 消除稀疏采样带来的延迟感
   *  - 实时跟丢后自动回退到存储帧插值, 不会出现骨骼悬空
   */
  const drawSkeletonAtTime = (t: number) => {
    const canvas = overlayRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    // 1. 计算存储帧插值(保底数据)
    let storedKps: Record<string, KP> | undefined
    const seg = findSegment(t)
    let shown: FrameTimelinePoint | null = null
    if (seg) {
      const [prev, next] = seg
      const span = next.time - prev.time
      const alpha = span > 0 ? Math.min(1, Math.max(0, (t - prev.time) / span)) : 0
      const pf = resultRef.current?.pose_frames
      storedKps = interpolateKeypoints(pf?.[prev.frame]?.keypoints, pf?.[next.frame]?.keypoints, alpha)
      shown = alpha < 0.5 ? prev : next
    }

    // 2. 决定目标关键点: 实时数据新鲜则优先用实时, 否则回退存储帧
    const now = performance.now()
    const liveFresh = liveTsRef.current > 0 && now - liveTsRef.current < 220
    const targetKps = liveFresh && liveKpsRef.current ? liveKpsRef.current : storedKps
    const source: 'stored' | 'live' = liveFresh && liveKpsRef.current ? 'live' : 'stored'

    // 3. EMA 平滑: 每帧都把当前显示姿态向 targetKps 过渡, 避免硬切跳变
    if (targetKps && Object.keys(targetKps).length > 0) {
      const switching = trackingSourceRef.current !== source
      // live 时 alpha=0.85 紧跟实时(每 80ms 一次); stored 0.5 平滑跟随视频时间
      const alpha = switching ? 0.4 : source === 'live' ? 0.85 : 0.5
      displayKpsRef.current = blendKeypoints(displayKpsRef.current, targetKps, alpha)
      trackingSourceRef.current = source
    } else {
      displayKpsRef.current = undefined
    }

    // 4. 绘制
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (displayKpsRef.current && Object.keys(displayKpsRef.current).length > 0) {
      drawSkeletonFromKeypoints(ctx, displayKpsRef.current, canvas.width, canvas.height, null, dprRef.current)
    }

    // 5. 节流更新数据来源徽标
    const nextMode = displayKpsRef.current ? source : 'none'
    if (nextMode !== trackingModeRef.current) {
      trackingModeRef.current = nextMode
      // 仅在变化时调用 React setState, 不会高频触发重渲染
      setTrackingMode(nextMode)
    }

    // 6. 指标面板更新节流: 帧号变化 且 距上次 ≥120ms 才触发 React 重渲染
    if (shown && shown.frame !== lastFrameRef.current && now - lastStateAtRef.current >= 120) {
      lastFrameRef.current = shown.frame
      lastStateAtRef.current = now
      setCurFrame(shown)
    }
  }

  /** rAF 循环: 持续低频实时识别 + 播放时绘制骨骼叠加
   *  - 播放中: 逐显示帧绘制 + 每 120ms 一次实时识别修正
   *  - 暂停时: 也持续低频识别, 让暂停/Seek 后第一帧立即有骨骼叠加
   *    (避免「暂停后没骨骼、必须播放一次才出现」的体验问题)
   */
  const tick = () => {
    const video = videoRef.current
    if (!video) return
    // 不论播放/暂停, 都用 rAF 持续重绘骨骼叠加:
    //  - 播放时: video.currentTime 变化, 存储帧插值实时跟随
    //  - 暂停时: currentTime 不变, 但实时识别每 80ms 更新一次 liveKps, 重绘才会反映
    drawSkeletonAtTime(video.currentTime)
    const now = performance.now()
    // 实时识别间隔: 80ms ≈ 12Hz, 让 7-15fps 采样率补到 12Hz 实时跟随
    if (now - lastLiveAtRef.current >= 80) {
      lastLiveAtRef.current = now
      void drawLiveSkeleton(video)
    }
    rafRef.current = requestAnimationFrame(tick)
  }
  const startRafLoop = () => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }
  const stopRafLoopAndDraw = () => {
    // 不再取消 rAF: 实时识别循环继续运行, 暂停/Seek 后也能立刻显示骨骼
    const video = videoRef.current
    if (video) {
      // 暂停/Seek 时绕过节流, 指标面板立即刷新到当前时间
      lastStateAtRef.current = 0
      seedLockAtTime(video.currentTime)
      drawSkeletonAtTime(video.currentTime)
      // 不论是否手动锁定, 暂停/seek 后立即跑一次实时识别, 让首帧立即有骨骼叠加
      void drawLiveSkeleton(video)
    }
  }
  // 组件卸载时清理 rAF
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  /** timeUpdate 事件回调(暂停/Seek 兜底; 播放中由 rAF 循环接管) */
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget
    if (v.paused || v.ended) {
      drawSkeletonAtTime(v.currentTime)
      // 暂停/seek 时也跑一次实时识别, 让当前画面立即有骨骼叠加
      void drawLiveSkeleton(v)
    }
  }

  const exportPDF = async () => {
    if (exporting) return
    const el = reportRef.current
    if (!el) return
    setExporting(true)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      // 导出 PDF 时隐藏视频播放器、外链演示按钮等动态内容(视频链接不放进 PDF)
      const hideSel = '.no-pdf, .no-print'
      const hiddenEls = Array.from(el.querySelectorAll<HTMLElement>(hideSel))
      const prevDisplay = hiddenEls.map((h) => h.style.display)
      hiddenEls.forEach((h) => {
        h.style.display = 'none'
      })

      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: el.scrollWidth,
      })

      // 恢复被隐藏的元素
      hiddenEls.forEach((h, i) => {
        h.style.display = prevDisplay[i]
      })

      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW
      const imgH = (canvas.height * imgW) / canvas.width
      const imgData = canvas.toDataURL('image/jpeg', 0.92)

      let heightLeft = imgH
      let position = 0
      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH)
      heightLeft -= pageH
      while (heightLeft > 0) {
        position -= pageH
        pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH)
        heightLeft -= pageH
      }
      const an = result?.action_type || '运动员'
      const date = (result?.created_at || '').slice(0, 10)
      pdf.save(`篮球损伤风险分析报告_${an}_${date}.pdf`)
    } catch (e) {
      console.error(e)
      alert('PDF 导出失败：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    if (!taskId) return
    lastFrameRef.current = -1
    lastStateAtRef.current = 0
    cancelAnimationFrame(rafRef.current)
    // 切换报告: 清空上一次的时序轨迹、锁定状态与平滑缓存
    manualLockRef.current = false
    displayKpsRef.current = undefined
    liveKpsRef.current = undefined
    liveTsRef.current = 0
    liveFailCountRef.current = 0
    liveDisabledRef.current = false
    liveOkRef.current = false
    trackingSourceRef.current = 'stored'
    trackingModeRef.current = 'none'
    setTrackingMode('none')
    resetPoseTargetTracks(false)
    const d = getAnalysisResult(taskId)
    if (d) {
      setResult(d)
      setTimeline(d.timeline || [])
    } else {
      setError('未找到该分析报告（数据仅保存在本浏览器中，请从历史记录进入）')
    }
    setLoading(false)
  }, [taskId])

  // 报告加载后, 根据分析阶段的目标判别结论设置锁定徽标
  useEffect(() => {
    if (!result) return
    if (result.analysis_target?.motion === true) setTargetState('locked')
    else if (result.analysis_target?.motion === false) setTargetState('searching')
    else setTargetState('idle')
  }, [result])

  // 进入报告页即预加载姿态模型, 让实时骨骼叠加尽快就绪(分析页已加载过则秒回)
  useEffect(() => {
    if (!videoUrl) return
    void preloadPoseDetector().catch(() => {})
  }, [videoUrl])

  // 结果/视频就绪后, 如果视频已经具备元数据, 立即绘制首帧骨骼叠加并启动持续识别循环
  useEffect(() => {
    const video = videoRef.current
    if (!video || !result || !timeline.length) return
    if (video.readyState >= 1) {
      seedLockAtTime(video.currentTime)
      drawSkeletonAtTime(video.currentTime)
      // 进入报告页立即跑一次实时识别, 并启动持续识别循环, 让暂停状态下也有骨骼叠加
      void drawLiveSkeleton(video)
      startRafLoop()
    }
  }, [result, timeline, videoUrl])

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
    // 最低显示 6 分, 避免 0 分轴完全塌陷成"空白"
    return dims.map((d) => ({ dim: d, score: Math.max(6, scoreMap[d] ?? 0) }))
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
        <div className="report-head-actions no-print">
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
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="10" />
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
              {/* 数据完整度: 低于 70% 说明有指标未识别, 评分仅供参考 */}
              {risk.data_confidence !== undefined && (
                <span
                  className={risk.data_confidence < 0.7 ? 'confidence-chip warn' : 'confidence-chip'}
                  title="可识别的动作指标占比，越低说明越多指标未能可靠识别"
                >
                  {risk.data_confidence < 0.7 ? '⚠ ' : '✓ '}数据完整度{' '}
                  {Math.round(risk.data_confidence * 100)}%
                </span>
              )}
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
            {/* 主要风险部位: 把高/中风险部位铺成紧凑标签, 避免下方大片留白 */}
            {risk.items && risk.items.length > 0 && (
              <div className="overview-hotspots">
                {risk.items
                  .filter((it) => it.level === '高风险' || it.level === '中风险')
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 4)
                  .map((it) => (
                    <span
                      key={it.category}
                      className={`hotspot-chip ${it.level === '高风险' ? 'is-high' : 'is-mid'}`}
                      title={`${it.category} ${it.score} 分（${it.level}）`}
                    >
                      <span className="hotspot-dot" />
                      <span className="hotspot-name">{it.category}</span>
                      <span className="hotspot-score">{it.score}</span>
                    </span>
                  ))}
                {risk.items.every((it) => it.level === '低风险') && (
                  <span className="hotspot-chip is-low">
                    <span className="hotspot-dot" />
                    <span className="hotspot-name">各部位均在正常范围内</span>
                  </span>
                )}
              </div>
            )}
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
                  stroke="#12b3d6"
                  strokeWidth={2}
                  fill="#12b3d6"
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

        <div className="card no-pdf">
          <div className="section-title">骨骼叠加分析视频（逐帧分析）</div>
          {videoUrl ? (
            <>
              <div className="video-wrap overlay-wrap">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={startRafLoop}
                  onPause={stopRafLoopAndDraw}
                  onEnded={stopRafLoopAndDraw}
                  onSeeked={stopRafLoopAndDraw}
                  onLoadedData={stopRafLoopAndDraw}
                />
                <canvas
                  ref={overlayRef}
                  className={`skeleton-overlay${picking ? ' picking' : ''}`}
                  width={640}
                  height={360}
                  onClick={handleOverlayClick}
                />
              </div>
              <div className="video-tools">
                <span
                  className={`target-badge ${
                    targetState === 'locked'
                      ? 'is-locked'
                      : targetState === 'searching'
                        ? 'is-searching'
                        : 'is-idle'
                  }`}
                  title={trackingMode === 'live' ? '实时识别修正中，骨骼与当前画面同步' : '基于分析阶段采样帧插值回放'}
                >
                  {targetState === 'locked'
                    ? trackingMode === 'live'
                      ? '🎯 实时跟随 · 已锁定运动员'
                      : '🎯 分析采样回放 · 已锁定运动员'
                    : targetState === 'searching'
                      ? '正在识别运动员目标…'
                      : trackingMode === 'live'
                        ? '⏳ 实时识别中…'
                        : '当前帧未识别到目标'}
                </span>
                <button className="pick-btn" onClick={togglePicking}>
                  {picking ? '请在画面中点击运动员…' : '🎯 骨骼不在运动员身上？点此手动锁定'}
                </button>
              </div>
              {result.analysis_target?.motion === false && (
                <p className="video-warn">
                  ⚠️ 本次分析的画面里，主要人形目标几乎静止（很可能是墙上海报 / 大屏画面里的人像），
                  骨骼与评分可能来自该干扰目标而非运动员。建议重新上传分析，或用上方按钮在画面中
                  点选运动员锁定后再查看动作。
                </p>
              )}
              <p className="video-tip">拖动进度条或暂停，下方实时显示当前帧的生物力学特征值；绿色线条为骨骼叠加</p>
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
            </>
          ) : (
            <div className="empty">
              🔒 视频仅在分析当次会话中可回放。刷新页面后请通过「历史记录」查看完整报告，文字数据完整保留。
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
                <div className="profile-item"><span>BMI</span><strong>{(Number(result.athlete_info.weight_kg) / Math.pow(Number(result.athlete_info.height_cm) / 100, 2)).toFixed(1)}</strong></div>
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
                {videoUrl ? (
                  <video
                    className="no-pdf"
                    src={videoUrl}
                    controls
                    playsInline
                    loop
                    onLoadedMetadata={(e) => {
                      try {
                        // 自动定位到问题时刻(往前保留 0.5s 上下文便于观察)
                        e.currentTarget.currentTime = Math.max(0, m.timestamp - 0.5)
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                ) : (
                  <div className="problem-no-video no-pdf">
                    🔒 视频仅在当次会话可回放（问题时刻 @{m.timestamp.toFixed(1)}s）
                  </div>
                )}
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
                      {it.main_causes.length > 0 ? (
                        it.main_causes.map((c, j) => <li key={j}>{c}</li>)
                      ) : (
                        <li className="risk-col-empty">当前指标在正常范围内，无明显风险成因</li>
                      )}
                    </ul>
                  </div>
                  <div className="risk-col">
                    <h5>改进建议</h5>
                    <ul>
                      {it.recommendations.length > 0 ? (
                        it.recommendations.map((c, j) => <li key={j}>{c}</li>)
                      ) : (
                        <li className="risk-col-empty">保持当前动作模式，注意落地缓冲与关节对位</li>
                      )}
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
                              className="ex-video no-pdf"
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
              color="#12b3d6"
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
              color="#8be04b"
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
      <div className="report-foot no-print">
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
  const colors = ['#12b3d6', '#8be04b', '#ff6b35', '#7c5cff', '#ffd166']
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
