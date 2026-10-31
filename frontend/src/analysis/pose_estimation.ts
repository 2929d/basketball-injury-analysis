/**
 * 人体姿态识别模块（从后端 core/pose_estimation.py 迁移，浏览器版）
 *
 * 基于 @mediapipe/tasks-vision 的 PoseLandmarker(VIDEO 模式) 逐帧提取关键点。
 * 模型与 wasm 运行时均本地托管(public/ 下)，不依赖外网 CDN。
 *
 * 多目标处理: 检测阶段保留全部候选姿态(numPoses>1), 交由 pose_target.ts 的
 * 跟踪器判别"运动员"目标 —— 避免骨骼落到墙上海报/大屏画面里的人形干扰目标上。
 */
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { KP, PoseData, PoseFrame, PoseTargetInfo } from './types'
import {
  poseTargetTracker,
  toCandidates,
  candidateFromKeypoints,
  type Landmark,
  type PoseCandidate,
} from './pose_target'
import { seekTo } from './video_quality'

// MediaPipe Pose 33 关键点中我们关注的子集(索引 -> 名称)
export const POSE_KEYPOINTS: Record<number, string> = {
  0: 'nose',
  11: 'left_shoulder', 12: 'right_shoulder',
  13: 'left_elbow', 14: 'right_elbow',
  15: 'left_wrist', 16: 'right_wrist',
  23: 'left_hip', 24: 'right_hip',
  25: 'left_knee', 26: 'right_knee',
  27: 'left_ankle', 28: 'right_ankle',
  29: 'left_heel', 30: 'right_heel',
  31: 'left_foot_index', 32: 'right_foot_index',
}

// 骨骼连接(用于绘图与前端渲染)
export const SKELETON_CONNECTIONS: string[][] = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
  ['left_ankle', 'left_heel'], ['left_heel', 'left_foot_index'],
  ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
  ['right_ankle', 'right_heel'], ['right_heel', 'right_foot_index'],
]

const NAME_TO_IDX: Record<string, number> = Object.fromEntries(
  Object.entries(POSE_KEYPOINTS).map(([k, v]) => [v, Number(k)]),
)

export type MediaPipeLandmark = Landmark

export interface PoseExtractOptions {
  fps: number
  onProgress?: (done: number, total: number) => void
  /** 每帧回调, 用于绘制骨骼叠加(landmarks 为当前判定的分析目标) */
  onFrame?: (
    frameIndex: number,
    landmarks: MediaPipeLandmark[] | null,
    width: number,
    height: number,
  ) => void
}

/** 分析采样帧数上限: 超出后按步长跳帧采样, 控制分析总时长
 *  (1500 帧: 30fps 视频前 50 秒可满帧率分析, 70 秒视频仍有 15Hz,
 *   骨骼叠加回放插值间隔 ≤33ms, 明显降低动作快时骨骼跟不上画面的延迟感)
 *  ⚠️ 提高此值会拉长单次分析耗时(每帧 MediaPipe ≈ 30-80ms);
 *      71 秒 30fps 视频 2130 帧 ≈ 64-170 秒分析时长, 用户可接受 */
const MAX_ANALYSIS_FRAMES = 1500
/** 单帧 seek 超时(ms): 防止个别帧解码卡死导致整个分析挂起 */
const SEEK_TIMEOUT_MS = 3000
/** 每帧保留的候选姿态上限(多目标判别需要, 数量越多越慢) */
const MAX_POSES = 3
/** 关联插值匹配时允许的偏移门限(以候选身高归一化) */
const SERIES_GATE = 1.3

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 带超时保护的 seek: 超时后放弃等待该帧(返回后由 detect 判断画面是否可用) */
async function seekToSafe(video: HTMLVideoElement, t: number): Promise<void> {
  await Promise.race([seekTo(video, t), sleep(SEEK_TIMEOUT_MS)])
}

let detectorPromise: Promise<PoseLandmarker> | null = null
/** GPU 运行失败后置 true, 永久降级 CPU, 避免每帧重复尝试 */
let gpuFailed = false

/** 检测当前浏览器是否支持 WebGL(GPU 委托的前提) */
function gpuAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch {
    return false
  }
}

/** 部署基路径: 支持子目录部署(如 GitHub Pages 的 /basketball-injury-analysis/) */
const BASE_URL = import.meta.env.BASE_URL || '/'
/** 拼接基路径下的静态资源地址 */
function assetUrl(path: string): string {
  return `${BASE_URL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function createDetector(delegate: 'GPU' | 'CPU'): Promise<PoseLandmarker> {
  return (async () => {
    const fileset = await FilesetResolver.forVisionTasks(assetUrl('wasm'))
    const shared = {
      runningMode: 'VIDEO' as const,
      // 多目标: 球场上除运动员外常有墙上海报/大屏画面等"人形干扰目标",
      // 只返回 1 具姿态时 MediaPipe 会优先给置信度更高的干扰目标, 导致骨骼画错人。
      numPoses: MAX_POSES,
      // 远距离运动员占画面比例小, 阈值过严会漏检
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    }
    return PoseLandmarker.createFromOptions(fileset, {
      ...shared,
      baseOptions: {
        modelAssetPath: assetUrl('models/pose_landmarker_lite.task'),
        delegate,
      },
    })
  })()
}

/** 单例创建 PoseLandmarker(VIDEO 模式), 复用避免重复加载模型; GPU 不可用或运行失败时自动回退 CPU */
function getDetector(): Promise<PoseLandmarker> {
  if (!detectorPromise) {
    const delegate = gpuFailed || !gpuAvailable() ? 'CPU' : 'GPU'
    detectorPromise = createDetector(delegate)
  }
  return detectorPromise
}

/**
 * 全局单调递增时间戳: 分析管线(视频帧时间)与实时识别(performance.now)共用同一检测器,
 * MediaPipe VIDEO 模式要求时间戳严格递增, 两套体系混用会触发 "Packet timestamp mismatch"。
 * 所有 detectForVideo 调用统一经 nextVideoTs() 归一化为全局单调递增序列。
 */
let lastVideoTs = 0
function nextVideoTs(preferred: number): number {
  lastVideoTs = Math.max(preferred, lastVideoTs + 1)
  return lastVideoTs
}

type DetectResult = ReturnType<PoseLandmarker['detectForVideo']>

/** detectForVideo 包装: GPU 运行时失败自动降级 CPU 并重建单例; 时间戳错误不属于 GPU 故障, 不降级 */
async function detectSafe(
  detector: PoseLandmarker,
  video: HTMLVideoElement,
  tsMs: number,
): Promise<DetectResult> {
  const ts = nextVideoTs(tsMs)
  try {
    return detector.detectForVideo(video, ts)
  } catch (e) {
    // 时间戳类错误与 GPU 无关(且已被 nextVideoTs 规避), 直接抛出避免误降级 CPU
    const msg = e instanceof Error ? e.message : String(e)
    if (gpuFailed || /timestamp/i.test(msg)) throw e
    // GPU 图在运行时报错(如无 WebGL 环境), 永久降级 CPU
    gpuFailed = true
    detectorPromise = createDetector('CPU')
    const cpu = await detectorPromise
    return cpu.detectForVideo(video, nextVideoTs(ts))
  }
}

/** 检测当前帧的全部候选姿态(最多 MAX_POSES 具), 保持 33 点索引与 POSE_KEYPOINTS 对齐 */
async function detectAllPoses(
  detector: PoseLandmarker,
  video: HTMLVideoElement,
  tsMs: number,
): Promise<Landmark[][]> {
  const result = await detectSafe(detector, video, tsMs)
  if (!result.landmarks || !result.landmarks.length) return []
  return result.landmarks.map((pose) =>
    pose.map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z ?? 0,
      visibility: lm.visibility ?? 1,
    })),
  )
}

/** 将 MediaPipe 的 33 点数组转换为按名称索引的关键点字典 */
function toNamedKeypoints(lms: Landmark[]): Record<string, KP> {
  const kps: Record<string, KP> = {}
  for (const [idxStr, name] of Object.entries(POSE_KEYPOINTS)) {
    const lm = lms[Number(idxStr)]
    if (!lm) continue
    kps[name] = {
      name,
      x: lm.x,
      y: lm.y,
      z: lm.z ?? 0,
      visibility: lm.visibility ?? 1,
    }
  }
  return kps
}

/** 导出给报告页: 把实时识别的 landmarks 转成与分析阶段同格式的 named keypoints */
export function landmarksToKeypoints(lms: Landmark[] | null): Record<string, KP> {
  if (!lms) return {}
  return toNamedKeypoints(lms)
}

/**
 * 两个关键点集合的指数平滑融合(EMA), 用于报告页把实时识别结果平滑过渡到
 * 当前显示姿态, 避免存储帧插值与实时帧之间硬切造成的跳变/飘忽。
 * alpha 越接近 1 响应越快, 越接近 0 越平滑。
 */
export function blendKeypoints(
  prev: Record<string, KP> | undefined,
  next: Record<string, KP> | undefined,
  alpha: number,
): Record<string, KP> | undefined {
  if (!prev) return next
  if (!next) return prev
  const out: Record<string, KP> = {}
  for (const name of Object.keys(next)) {
    const a = prev[name]
    const b = next[name]
    if (!b) continue
    if (!a) {
      out[name] = b
      continue
    }
    out[name] = {
      ...b,
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      z: a.z + (b.z - a.z) * alpha,
      visibility: Math.min(a.visibility, b.visibility),
    }
  }
  return out
}

/** 分析目标诊断信息(报告页据此提示"目标是否可靠") —— 定义见 types.ts */
export type { PoseTargetInfo } from './types'

/**
 * 逐帧提取人体关键点(只保留判定出的"运动员"目标)。
 * 性能策略:
 *  - 帧数超过 MAX_ANALYSIS_FRAMES 时按步长采样(等价降低有效帧率), 缩短总分析时长
 *  - 每帧处理完让出主线程(setTimeout 0), 保证分析期间 UI 持续响应不冻结
 *  - seek 带超时保护, 单帧解码卡住不会拖死整个任务
 * 目标判别策略:
 *  - 逐帧做多目标时序跟踪(不锁死), 整段视频跑完后按"运动能量最高且持续存在"回溯选定
 *    运动员 track, 再把每帧关键点替换为该 track 的检测结果(避免中途跟错目标)
 */
export async function extractPoseFromVideo(
  video: HTMLVideoElement,
  opts: PoseExtractOptions,
): Promise<PoseData> {
  const fps = opts.fps || 30
  const duration = video.duration || 0
  const width = video.videoWidth || 0
  const height = video.videoHeight || 0

  const totalFull = Math.max(1, Math.round(duration * fps))
  // 采样步长: 帧数超过上限时跳帧, 有效帧率相应降低(下游按 fps×frame_index 换算时间保持一致)
  const step = Math.max(1, Math.ceil(totalFull / MAX_ANALYSIS_FRAMES))
  const effFps = fps / step
  const total = Math.floor((totalFull - 1) / step) + 1

  let detector = await getDetector()

  // 新一次分析: 清空上一次的时序轨迹与锁定状态
  poseTargetTracker.resetTracks(false)

  const frames: PoseFrame[] = []
  // 逐帧保留全部候选姿态 + 各候选归属的 track, 供整段回溯时重建目标序列
  const candidatesByFrame: PoseCandidate[][] = []
  const trackIdsByFrame: number[][] = []

  for (let i = 0; i < total; i++) {
    const videoFrame = i * step
    await seekToSafe(video, videoFrame / fps)

    const tsMs = Math.round((videoFrame / fps) * 1000)
    const allPoses = await detectAllPoses(detector, video, tsMs)
    // detectSafe 内部可能重建 CPU 单例, 同步本地引用
    detector = await getDetector()

    const cands = toCandidates(allPoses)
    // 只做关联跟踪, 不在此刻锁死目标(自动锁定由整段回溯决定)
    const res = poseTargetTracker.update(cands, i, { autoLock: false })
    candidatesByFrame.push(cands)
    trackIdsByFrame.push(res.trackIds)

    frames.push({
      frame_index: i,
      timestamp_ms: Math.round((i / effFps) * 1000 * 100) / 100,
      keypoints: res.landmarks ? toNamedKeypoints(res.landmarks) : {},
      image_width: width,
      image_height: height,
    })

    if (opts.onFrame) {
      opts.onFrame(i, res.landmarks, width, height)
    }
    if (opts.onProgress && (i % 5 === 0 || i === total - 1)) {
      opts.onProgress(i + 1, total)
    }

    // 每帧让出主线程: 分析循环不长时间独占 UI 线程, 页面保持可交互
    await new Promise((r) => setTimeout(r, 0))
  }

  // ---------- 整段回溯: 选出运动员 track, 重建逐帧关键点 ----------
  const best = poseTargetTracker.bestMotionTrackId()
  let targetInfo: PoseTargetInfo | undefined
  if (best) {
    const bestTrack = best.id
    for (let i = 0; i < frames.length; i++) {
      const cands = candidatesByFrame[i]
      const ids = trackIdsByFrame[i]
      let ci = ids.indexOf(bestTrack)
      if (ci < 0) {
        // 该帧未直接检测到目标: 用目标在相邻帧的位置插值, 取最近候选(超出门限则视为漏检)
        const ctr = poseTargetTracker.trackCenterAt(bestTrack, i)
        if (ctr) {
          let bestD = Infinity
          let bestCi = -1
          for (let k = 0; k < cands.length; k++) {
            const d = Math.hypot(cands[k].cx - ctr.cx, cands[k].cy - ctr.cy) / Math.max(cands[k].h, 0.05)
            if (d < bestD) {
              bestD = d
              bestCi = k
            }
          }
          ci = bestD <= SERIES_GATE ? bestCi : -1
        }
      }
      frames[i].keypoints = ci >= 0 && cands[ci] ? toNamedKeypoints(cands[ci].landmarks) : {}
    }
    // 把运动判别结论 + 锁定位置交接给报告页回放(同一会话内直接沿用)
    poseTargetTracker.lockToTrack(bestTrack)
    const track = poseTargetTracker.getLock()
    targetInfo = {
      track_id: bestTrack,
      motion: best.moved,
      candidates: Math.max(...candidatesByFrame.map((c) => c.length), 0),
    }
    if (track) poseTargetTracker.lockAt(track.cx, track.cy, track.h)
  }

  try {
    video.currentTime = 0
  } catch {
    // ignore
  }

  return {
    frames,
    fps: effFps,
    total_frames: total,
    skeleton_connections: SKELETON_CONNECTIONS,
    target: targetInfo,
  }
}

/**
 * 按 CSS 显示尺寸换算描边宽度, 避免高 DPR 屏上线条被过度放大。
 * canvas 内部像素 = CSS 尺寸 × DPR, 若直接用 canvas 像素算比例,
 * 在 Retina 屏上线宽会翻倍, 导致骨骼又粗又糊。
 */
function strokeScale(cssWidth: number, cssHeight: number): number {
  const ref = Math.max(cssWidth, cssHeight)
  return Math.min(3.4, Math.max(1.4, (ref / 360) * 2))
}

/** 绘制目标包围框: 让用户一眼看出骨骼"锁在谁身上" */
function drawTargetBox(
  ctx: CanvasRenderingContext2D,
  box: { cx: number; cy: number; h: number },
  width: number,
  height: number,
  scale: number,
): void {
  const w = box.h * 0.72 * width
  const h = box.h * height
  const x = box.cx * width - w / 2
  const y = box.cy * height - h / 2
  ctx.save()
  ctx.setLineDash([4, 3])
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.9)'
  ctx.lineWidth = Math.max(1.2, scale * 0.45)
  ctx.strokeRect(x, y, w, h)
  ctx.restore()
}

/** 在 canvas 上绘制骨骼叠加(landmarks 为 null 时不画) */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: MediaPipeLandmark[] | null,
  width: number,
  height: number,
  box?: { cx: number; cy: number; h: number } | null,
  dpr = 1,
): void {
  if (!landmarks) return
  const scale = strokeScale(width / dpr, height / dpr)
  const vis = (i: number): number => (landmarks[i] ? landmarks[i].visibility : 0)

  // 画骨骼: 细线、无阴影, 保证 rAF 回放时 60fps 不卡
  // (shadowBlur 在 Retina 高分辨率 canvas 上每帧绘制非常耗 GPU)
  ctx.save()
  ctx.strokeStyle = '#39ff8f'
  ctx.lineWidth = scale * 0.65
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const [aName, bName] of SKELETON_CONNECTIONS) {
    const a = NAME_TO_IDX[aName]
    const b = NAME_TO_IDX[bName]
    if (vis(a) < 0.3 || vis(b) < 0.3) continue
    const pa = landmarks[a]
    const pb = landmarks[b]
    ctx.beginPath()
    ctx.moveTo(pa.x * width, pa.y * height)
    ctx.lineTo(pb.x * width, pb.y * height)
    ctx.stroke()
  }
  ctx.restore()

  // 画关节点: 小圆点 + 青色高光
  for (const idxStr of Object.keys(POSE_KEYPOINTS)) {
    const idx = Number(idxStr)
    if (vis(idx) < 0.3) continue
    const lm = landmarks[idx]
    ctx.fillStyle = vis(idx) < 0.5 ? '#ff4d6d' : '#00e5ff'
    ctx.beginPath()
    ctx.arc(lm.x * width, lm.y * height, scale * 1.1, 0, Math.PI * 2)
    ctx.fill()
  }

  if (box) drawTargetBox(ctx, box, width, height, scale)
}

/** 按命名关键点绘制骨骼叠加(用于报告页回放存储的 pose_frames) */
export function drawSkeletonFromKeypoints(
  ctx: CanvasRenderingContext2D,
  kps: Record<string, KP>,
  width: number,
  height: number,
  box?: { cx: number; cy: number; h: number } | null,
  dpr = 1,
): void {
  const scale = strokeScale(width / dpr, height / dpr)
  const get = (name: string): KP | null => {
    const p = kps[name]
    if (!p || p.visibility < 0.3) return null
    return p
  }

  ctx.save()
  ctx.strokeStyle = '#39ff8f'
  ctx.lineWidth = scale * 0.65
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const [aName, bName] of SKELETON_CONNECTIONS) {
    const pa = get(aName)
    const pb = get(bName)
    if (!pa || !pb) continue
    ctx.beginPath()
    ctx.moveTo(pa.x * width, pa.y * height)
    ctx.lineTo(pb.x * width, pb.y * height)
    ctx.stroke()
  }
  ctx.restore()

  for (const name of Object.keys(kps)) {
    const p = kps[name]
    if (!p || p.visibility < 0.3) continue
    ctx.fillStyle = p.visibility < 0.5 ? '#ff4d6d' : '#00e5ff'
    ctx.beginPath()
    ctx.arc(p.x * width, p.y * height, scale * 1.1, 0, Math.PI * 2)
    ctx.fill()
  }

  if (box) drawTargetBox(ctx, box, width, height, scale)
}

/** 报告页实时识别的结果 */
export interface LiveTargetResult {
  landmarks: MediaPipeLandmark[] | null
  box: { cx: number; cy: number; h: number } | null
  /** 是否已锁定目标(运动能量判别 / 手动点选 / 沿用分析结论) */
  locked: boolean
  /** 本帧检测到的候选姿态数量 */
  candidateCount: number
}

/**
 * 对视频当前显示帧做实时姿态识别 + 目标判定（报告页骨骼叠加回放用）。
 * 复用单例 PoseLandmarker(VIDEO 模式) 与全局跟踪器:
 *  - 已锁定目标时只跟随锁定目标, 骨骼不会跳到海报/其他球员身上
 *  - 未锁定时先按运动能量自动判别, 判别不出则交给调用方(可手动点选)
 */
export async function detectLiveTarget(video: HTMLVideoElement): Promise<LiveTargetResult> {
  try {
    const detector = await getDetector()
    const allPoses = await detectAllPoses(detector, video, performance.now())
    await getDetector()
    const res = poseTargetTracker.update(toCandidates(allPoses))
    return {
      landmarks: res.landmarks,
      box: res.box,
      locked: res.locked,
      candidateCount: res.candidateCount,
    }
  } catch {
    return { landmarks: null, box: null, locked: false, candidateCount: 0 }
  }
}

/** 兼容旧调用: 只关心关键点时可使用 */
export async function detectLivePose(video: HTMLVideoElement): Promise<MediaPipeLandmark[] | null> {
  return (await detectLiveTarget(video)).landmarks
}

/** 进入报告页/切换视频时清空时序轨迹(保留已锁定的运动员位置) */
export function resetPoseTargetTracks(keepLock = true): void {
  poseTargetTracker.resetTracks(keepLock)
}

/** 手动锁定: 用户在报告页点选画面中的运动员(坐标为归一化值) */
export function lockPoseTargetAt(cx: number, cy: number): void {
  poseTargetTracker.lockAt(cx, cy)
}

/** 用存储帧的关键点播种锁定位置(报告页刷新后无锁定状态时的回退) */
export function seedPoseTargetFromKeypoints(
  kps: Record<string, { x: number; y: number; visibility: number }> | undefined,
): boolean {
  const c = candidateFromKeypoints(kps)
  if (!c) return false
  poseTargetTracker.lockAt(c.cx, c.cy, c.h)
  return true
}

/** 读取当前锁定状态(报告页提示/调试用) */
export function getPoseTargetLock(): { cx: number; cy: number; h: number } | null {
  return poseTargetTracker.getLock()
}

/** 预加载姿态模型（报告页进入时调用，让首帧实时识别尽快就绪） */
export function preloadPoseDetector(): Promise<void> {
  return getDetector().then(() => undefined)
}
