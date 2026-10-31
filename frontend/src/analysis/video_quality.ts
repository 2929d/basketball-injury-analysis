/**
 * 视频质量检测模块（从后端 core/video_quality.py 迁移，浏览器版）
 *
 * 在正式分析前判断视频是否满足要求:
 * 人体完整 / 亮度 / 相机抖动 / 距离 / 置信度 / 帧率 / 时长。
 * 不合格时提示重新拍摄, 不输出风险结论。
 *
 * 浏览器环境无法直接读视频文件，因此：
 *  - 基础指标(fps/时长/尺寸/亮度)通过 <video> 元素 + canvas 采样获取
 *  - 人体相关指标(检测/置信度/抖动/距离)在姿态提取完成后由最终汇总函数计算
 */
import type { PoseData, VideoQualityIssue, VideoQualityResult } from './types'

const MIN_VIDEO_DURATION_SEC = 3
const MAX_VIDEO_DURATION_SEC = 20

export interface BasicQuality {
  fps: number
  width: number
  height: number
  duration_sec: number
  brightness: number
  issues: VideoQualityIssue[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitSeeked(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.seeking === false && video.readyState >= 2) {
      resolve()
      return
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
  })
}

/** 在 video 上设置播放位置并等待就绪 */
export async function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  if (Math.abs(video.currentTime - t) < 1e-4) return
  video.currentTime = Math.max(0, Math.min(t, (video.duration || 0) - 0.001))
  await waitSeeked(video)
}

/** 估算视频帧率(fps) */
async function estimateFps(video: HTMLVideoElement): Promise<number> {
  // 方法1: 静音播放 ~1.5s, 用 getVideoPlaybackQuality().totalVideoFrames 数帧
  try {
    const vq = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null
    const f0 = vq ? vq.totalVideoFrames : 0
    video.muted = true
    video.defaultPlaybackRate = 1
    video.playbackRate = 1
    await video.play()
    await sleep(1500)
    const t = video.currentTime
    const f1 = vq ? vq.totalVideoFrames : 0
    video.pause()
    const frames = f1 - f0
    if (frames > 5 && t > 0.5) {
      await seekTo(video, 0)
      return Math.round((frames / t) * 10) / 10
    }
  } catch {
    // fallthrough
  }

  // 方法2: requestVideoFrameCallback 采样
  try {
    const times: number[] = []
    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      times.push(meta.mediaTime)
    }
    video.requestVideoFrameCallback(onFrame)
    video.muted = true
    await video.play()
    await sleep(1500)
    video.pause()
    if (times.length >= 6) {
      const fps = (times.length - 1) / (times[times.length - 1] - times[0])
      await seekTo(video, 0)
      return Math.round(fps * 10) / 10
    }
  } catch {
    // fallthrough
  }

  try {
    await seekTo(video, 0)
  } catch {
    // ignore
  }
  return 30 // 兜底
}

/** 采样若干帧计算平均亮度(0-255) */
async function sampleBrightness(video: HTMLVideoElement, n = 10): Promise<number> {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 90
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0
  const dur = video.duration || 0
  if (dur <= 0) return 0
  const vals: number[] = []
  for (let i = 0; i < n; i++) {
    try {
      await seekTo(video, (dur * (i + 0.5)) / n)
      ctx.drawImage(video, 0, 0, 160, 90)
      const data = ctx.getImageData(0, 0, 160, 90).data
      let s = 0
      for (let j = 0; j < data.length; j += 4) {
        s += 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]
      }
      vals.push(s / (data.length / 4))
    } catch {
      // 跳过采样失败的帧
    }
  }
  try {
    await seekTo(video, 0)
  } catch {
    // ignore
  }
  if (!vals.length) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

/**
 * 加载视频并检查基础质量(fps/时长/尺寸/亮度)。
 * 返回可复用的 video 元素(供姿态提取继续使用)与基础质量结果。
 */
export async function checkBasicQuality(
  file: File,
): Promise<{ video: HTMLVideoElement; basic: BasicQuality }> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'

  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
      reject(new Error('无法读取视频文件'))
    }
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('error', onError)
  })

  const issues: VideoQualityIssue[] = []
  const fps = await estimateFps(video)
  const duration = video.duration || 0
  const width = video.videoWidth || 0
  const height = video.videoHeight || 0
  const brightness = await sampleBrightness(video)

  // 帧率
  if (fps < 15) {
    issues.push({ code: 'low_fps', message: `帧率过低(${fps.toFixed(1)}fps), 建议≥25fps`, severity: 'warning' })
  }

  // 时长
  if (duration < MIN_VIDEO_DURATION_SEC) {
    issues.push({ code: 'too_short', message: `视频过短(${duration.toFixed(1)}s), 建议5-15秒`, severity: 'error' })
  } else if (duration > MAX_VIDEO_DURATION_SEC) {
    issues.push({ code: 'too_long', message: `视频过长(${duration.toFixed(1)}s), 建议≤${MAX_VIDEO_DURATION_SEC}s`, severity: 'warning' })
  }

  return {
    video,
    basic: {
      fps,
      width,
      height,
      duration_sec: Math.round(duration * 100) / 100,
      brightness: Math.round(brightness * 10) / 10,
      issues,
    },
  }
}

/**
 * 姿态提取完成后，合并姿态相关质量检查(人体检测/置信度/距离/相机抖动)，
 * 生成最终 VideoQualityResult。
 */
export function finalizeQuality(basic: BasicQuality, pose: PoseData): VideoQualityResult {
  const issues = [...basic.issues]
  const n = pose.frames.length

  // 抽样(与后端一致: 最多约30个样本)
  const sampleStep = Math.max(1, Math.floor(n / 30))

  let personFrames = 0
  const confVals: number[] = []
  const frameCenters: Array<[number, number]> = []

  for (let i = 0; i < n; i += sampleStep) {
    const f = pose.frames[i]
    const kps = Object.values(f.keypoints)
    if (kps.length) {
      personFrames++
      const vis = kps.map((k) => k.visibility)
      confVals.push(vis.reduce((a, b) => a + b, 0) / vis.length)
      // 相机中心点: 用肩/肘/腕 6 点均值(与后端 lms[11:17] 一致)
      const six = ['left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist']
        .map((name) => f.keypoints[name])
        .filter((k) => k)
      if (six.length) {
        frameCenters.push([
          six.reduce((a, k) => a + k.x, 0) / six.length,
          six.reduce((a, k) => a + k.y, 0) / six.length,
        ])
      }
      // 人体占比: 可见关键点包围盒面积
      const visible = kps.filter((k) => k.visibility > 0.3)
      if (visible.length) {
        const xs = visible.map((k) => k.x)
        const ys = visible.map((k) => k.y)
        const ratio = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
        if (ratio < 0.15) {
          issues.push({ code: 'too_far', message: '运动员离画面过远, 人体占比过小', severity: 'warning' })
        }
      }
    }
  }

  const avgConf = confVals.length ? confVals.reduce((a, b) => a + b, 0) / confVals.length : 0
  const personDetected = personFrames > 0
  const brightness = basic.brightness

  // 亮度
  if (brightness < 50) {
    issues.push({ code: 'too_dark', message: '画面过暗, 建议保证充足光线', severity: 'error' })
  } else if (brightness < 90) {
    issues.push({ code: 'dim', message: '画面偏暗, 可能影响识别精度', severity: 'warning' })
  }

  // 人体检测
  if (!personDetected) {
    issues.push({ code: 'no_person', message: '未检测到人体, 请确保全身进入画面', severity: 'error' })
  }

  // 置信度
  if (avgConf < 0.4) {
    issues.push({ code: 'low_confidence', message: '关键点识别置信度偏低, 可能存在遮挡或距离过远', severity: 'error' })
  }

  // 相机抖动(中心点帧间位移)
  if (frameCenters.length >= 3) {
    let maxShift = 0
    for (let i = 1; i < frameCenters.length; i++) {
      const dx = frameCenters[i][0] - frameCenters[i - 1][0]
      const dy = frameCenters[i][1] - frameCenters[i - 1][1]
      maxShift = Math.max(maxShift, Math.sqrt(dx * dx + dy * dy))
    }
    if (maxShift > 0.15) {
      issues.push({ code: 'camera_shake', message: '摄像机移动剧烈, 建议固定拍摄', severity: 'warning' })
    }
  }

  const errors = issues.filter((i) => i.severity === 'error')
  const passed = errors.length === 0 && personDetected

  return {
    passed,
    issues,
    person_detected: personDetected,
    avg_confidence: Math.round(avgConf * 1000) / 1000,
    brightness,
    fps: basic.fps,
    width: basic.width,
    height: basic.height,
    duration_sec: basic.duration_sec,
  }
}
