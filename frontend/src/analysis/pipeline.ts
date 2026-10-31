/**
 * 分析编排管线（从后端 core/pipeline.py 迁移，纯前端版）
 *
 * 串联: 视频基础质量 → 姿态识别 → 轨迹提取 → 动作阶段 → 生物力学特征 → 风险评估
 * 全程在浏览器本地运行，不依赖任何后端 API；结果持久化到 localStorage。
 */
import type { AnalysisResult, AthleteInfo, PoseFrame, ProblemMoment, ProgressCallback } from './types'
import { checkBasicQuality, finalizeQuality } from './video_quality'
import { drawSkeleton, extractPoseFromVideo } from './pose_estimation'
import { buildTrajectories } from './trajectory'
import { analyzeActionValidity, detectPhases } from './phase_detection'
import { extractFeatures, getFrameTimeline, identifyProblemMoments } from './biomechanics'
import { assess } from './risk_assessment'

// ============ localStorage 历史记录 ============

const HISTORY_KEY = 'basketball_injury_analysis_history'

/** 均匀降采样姿态帧, 控制单条分析结果体积不超过 localStorage 配额
 *  (1500 帧 ≈ 1.5MB, 仍可放内存缓存, 但超过则降采样避免长视频报告页空帧) */
const MAX_POSE_FRAMES_IN_MEMORY = 1500
function downsamplePoseFrames(frames: PoseFrame[], maxFrames: number = MAX_POSE_FRAMES_IN_MEMORY): PoseFrame[] {
  if (!frames.length || frames.length <= maxFrames) return frames
  const out: PoseFrame[] = []
  const step = frames.length / maxFrames
  for (let i = 0; i < maxFrames; i++) {
    const idx = Math.min(frames.length - 1, Math.round(i * step))
    out.push(frames[idx])
  }
  return out
}

/**
 * 完整结果(含骨骼叠加所需的 pose_frames)的内存缓存。
 * localStorage 配额仅 5MB, 单次分析结果的 pose_frames 就可能近 1MB,
 * 因此持久化时剥离 pose_frames, 仅在本次会话内存中保留完整数据。
 */
const fullResultCache = new Map<string, AnalysisResult>()

function readHistory(): AnalysisResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function saveLocalResult(result: AnalysisResult): void {
  const list = readHistory().filter((r) => r.task_id !== result.task_id)
  list.unshift(result)
  // 完整结果留内存缓存(供本次会话使用)
  fullResultCache.set(result.task_id, result)
  // 持久化时剥离体积最大的两类逐帧数据, 避免撑爆 localStorage 配额(仅 5MB):
  // - pose_frames: 骨骼叠加回放用, 但跨会话无视频无法回放, 且报告页未使用
  // - trajectories: 逐帧关节轨迹(~13关节×230帧×9数值≈700KB), 报告页未渲染此数据
  // 保留 risk/features/problem_moments/phases/timeline/action_validity 等报告展示所需的小体量字段
  const light = list.map((r) => ({
    ...r,
    pose_frames: [] as AnalysisResult['pose_frames'],
    trajectories: [] as AnalysisResult['trajectories'],
  }))
  // 最多保留 20 条
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(light.slice(0, 20)))
  } catch {
    // 存储空间不足时丢弃最旧记录
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(light.slice(0, 5)))
    } catch {
      // ignore
    }
  }
}

/**
 * 读取分析结果: 优先内存中的完整结果(含 pose_frames), 其次 localStorage(已剥离 pose_frames)。
 * 解决"重新打开网站后历史记录提示不存在"的问题——之前因 pose_frames 过大导致写入静默失败。
 */
export function getAnalysisResult(taskId: string): AnalysisResult | null {
  return fullResultCache.get(taskId) || getLocalResult(taskId)
}

export function loadLocalResults(): AnalysisResult[] {
  return readHistory()
}

export function getLocalResult(taskId: string): AnalysisResult | null {
  return readHistory().find((r) => r.task_id === taskId) || null
}

export function deleteLocalResult(taskId: string): void {
  const list = readHistory().filter((r) => r.task_id !== taskId)
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
}

/** 清空全部历史记录（换人使用/保护隐私时用） */
export function clearLocalResults(): void {
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    // ignore
  }
}

// ============ 主分析管线 ============

/** 构造一个失败/空结果 */
function makeEmptyResult(
  taskId: string,
  athlete: AthleteInfo,
  actionType: string,
  vq: ReturnType<typeof finalizeQuality>,
): AnalysisResult {
  return {
    task_id: taskId,
    athlete_info: athlete,
    action_type: actionType,
    video_quality: vq,
    pose: null,
    trajectories: [],
    phases: [],
    features: null,
    risk: null,
    problem_moments: [],
    pose_frames: [],
    timeline: [],
    action_validity: { score: 0, is_valid: false, com_height_range: 0, messages: [] },
    created_at: new Date().toISOString(),
  }
}

/**
 * 在浏览器本地运行完整分析。
 * @param taskId 任务 ID(由调用方生成, 用于路由与持久化关联)
 * @param file 上传的视频文件
 * @param athlete 运动员信息
 * @param actionType 动作类型
 * @param onProgress 进度回调
 * @param onDrawFrame 可选: 每帧骨骼绘制回调(用于实时预览)
 */
export async function runLocalAnalysis(
  taskId: string,
  file: File,
  athlete: AthleteInfo,
  actionType: string,
  onProgress: ProgressCallback,
  onDrawFrame?: (frameIndex: number, canvas: HTMLCanvasElement, width: number, height: number) => void,
): Promise<AnalysisResult> {

  // ---------- 1. 基础质量检测 ----------
  onProgress({ status: 'quality_checking', progress: 5, message: '正在读取视频信息...' })
  const { video, basic } = await checkBasicQuality(file)

  const hasBasicError = basic.issues.some((i) => i.severity === 'error')
  if (hasBasicError) {
    // 基础错误(过短/无法读取等)直接失败, 无需跑姿态
    const emptyPose = {
      frames: [],
      fps: basic.fps,
      total_frames: 0,
      skeleton_connections: [],
    }
    const vq = finalizeQuality(basic, emptyPose)
    const result = makeEmptyResult(taskId, athlete, actionType, vq)
    saveLocalResult(result)
    onProgress({
      status: 'error',
      progress: 100,
      message: `视频质量不合格: ${vq.issues.map((i) => i.message).join('; ')}`,
    })
    URL.revokeObjectURL(video.src)
    return result
  }

  // ---------- 2. 姿态识别 ----------
  onProgress({ status: 'posing', progress: 12, message: '正在加载人体姿态模型...' })

  // 骨骼实时预览画布(与视频等宽高)
  const previewCanvas = document.createElement('canvas')
  previewCanvas.width = basic.width
  previewCanvas.height = basic.height

  // 预览节流: 每 120ms 重绘一次预览画布(约 8fps, 明显降低实时骨骼预览的滞后感)
  let lastPreviewDraw = 0

  const pose = await extractPoseFromVideo(video, {
    fps: basic.fps,
    onProgress: (done, total) => {
      onProgress({
        status: 'posing',
        progress: 12 + Math.round((done / total) * 38),
        message: `正在识别人体骨骼关键点... ${done}/${total} 帧`,
      })
    },
    onFrame: (frameIndex, landmarks) => {
      if (!onDrawFrame) return
      const now = performance.now()
      if (now - lastPreviewDraw < 120) return
      lastPreviewDraw = now
      const ctx = previewCanvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
      // 先画当前视频帧, 再叠加骨骼, 形成"骨骼叠加"实时预览
      try {
        ctx.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height)
      } catch {
        // ignore
      }
      if (landmarks) {
        drawSkeleton(ctx, landmarks, basic.width, basic.height)
      }
      onDrawFrame(frameIndex, previewCanvas, basic.width, basic.height)
    },
  })

  URL.revokeObjectURL(video.src)

  // ---------- 3. 特征提取 ----------
  onProgress({ status: 'extracting', progress: 52, message: '正在提取运动轨迹与生物力学特征...' })

  const vq = finalizeQuality(basic, pose)
  if (!vq.passed) {
    const result = makeEmptyResult(taskId, athlete, actionType, vq)
    saveLocalResult(result)
    onProgress({
      status: 'error',
      progress: 100,
      message: `视频质量不合格: ${vq.issues.map((i) => i.message).join('; ')}`,
    })
    return result
  }

  const trajectories = buildTrajectories(pose)
  const phases = detectPhases(pose, actionType)
  const validity = analyzeActionValidity(pose, phases)
  const features = extractFeatures(pose, trajectories, phases, actionType)

  // 逐帧特征时间线(报告页"骨骼叠加分析视频"联动显示用)
  const timeline = getFrameTimeline(pose)

  // 姿态帧(报告页骨骼叠加回放用); 帧数过多时均匀降采样到 600 帧, 而不是直接丢弃,
  // 避免长视频报告页完全没有骨骼可回放。
  const poseFrames = downsamplePoseFrames(pose.frames, 600)

  // ---------- 4. 风险评估 ----------
  onProgress({ status: 'scoring', progress: 78, message: '正在计算运动损伤风险评分...' })
  const risk = assess(features, athlete)

  // ---------- 5. 问题时刻 ----------
  onProgress({ status: 'scoring', progress: 92, message: '正在识别问题动作时刻...' })
  const problemMoments: ProblemMoment[] = identifyProblemMoments(pose, pose.fps).map((m, i) => ({
    frame: m.frame,
    timestamp: m.timestamp,
    issue: m.issue,
    value: m.value,
    description: m.desc,
    clip_index: i,
  }))

  const result: AnalysisResult = {
    task_id: taskId,
    athlete_info: athlete,
    action_type: actionType,
    video_quality: vq,
    pose: {
      fps: pose.fps,
      total_frames: pose.total_frames,
      skeleton_connections: pose.skeleton_connections,
      annotated_video_path: '', // 浏览器端不生成标注视频文件
    },
    trajectories,
    phases,
    features,
    risk,
    problem_moments: problemMoments,
    pose_frames: poseFrames,
    timeline,
    // 分析目标诊断: 供报告页提示"骨骼是否锁在运动员身上"
    analysis_target: pose.target,
    action_validity: validity,
    created_at: new Date().toISOString(),
  }

  // 目标判别不可靠时在进度信息里明确告知(避免用户误以为骨骼一定在运动员身上)
  if (pose.target && !pose.target.motion) {
    onProgress({
      status: 'scoring',
      progress: 98,
      message:
        '提示: 画面里的主要人形目标几乎静止，可能是墙上海报/大屏画面；若报告中的骨骼不在运动员身上，可在报告页点选运动员重新锁定。',
    })
  }

  saveLocalResult(result)
  onProgress({ status: 'done', progress: 100, message: '分析完成' })
  return result
}
