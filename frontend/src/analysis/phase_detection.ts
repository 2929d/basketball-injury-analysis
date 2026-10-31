/**
 * 动作阶段识别模块（从后端 core/phase_detection.py 迁移）
 *
 * 基于身体重心(左右髋中点)高度变化与足部速度，将完整动作自动划分为：
 * 准备 → 起跳 → 腾空 → 初次触地 → 落地缓冲 → 身体稳定
 *
 * 重点阶段为"初次触地"和"落地缓冲"，风险动作多集中于此。
 */
import type { ActionPhase, PhaseTypeStr, PoseData } from './types'
import { argmax, argmin, gradient, median, movingAvg } from './math'
import { buildTrajectories, getJoint } from './trajectory'

/** 身体重心高度(用左右髋中点的 y 坐标, y越小越高)。返回每帧数组。 */
function comHeight(pose: PoseData): number[] {
  const ys: number[] = []
  for (const f of pose.frames) {
    const lh = f.keypoints['left_hip']
    const rh = f.keypoints['right_hip']
    if (lh && rh && lh.visibility >= 0.3 && rh.visibility >= 0.3) {
      ys.push((lh.y + rh.y) / 2)
    } else if (lh && lh.visibility >= 0.3) {
      ys.push(lh.y)
    } else if (rh && rh.visibility >= 0.3) {
      ys.push(rh.y)
    } else {
      ys.push(ys.length ? ys[ys.length - 1] : 0.5)
    }
  }
  return ys
}

/** 踝关节合速度(归一化坐标/秒), 用于判断触地时刻 */
function ankleVelocity(pose: PoseData, fps: number): number[] {
  const trajs = buildTrajectories(pose)
  const la = getJoint(trajs, 'left_ankle')
  const ra = getJoint(trajs, 'right_ankle')
  if (!la || !ra) return new Array(pose.frames.length).fill(0)
  const n = Math.min(la.points.length, ra.points.length)
  const v: number[] = []
  for (let i = 0; i < n; i++) {
    v.push(Math.max(la.points[i].v, ra.points[i].v) * fps)
  }
  return v
}

/** 检测腾空: 重心速度有明显上升(负)转下降(正)的过零点 */
function detectFlight(comVel: number[]): boolean {
  for (let i = 1; i < comVel.length; i++) {
    if (comVel[i - 1] < -0.05 && comVel[i] > 0.05) return true
  }
  return false
}

/** 检测双脚是否同时离地(防止走路误识别为跳跃落地) */
function detectBothFeetOff(pose: PoseData): boolean {
  const n = pose.frames.length
  if (n < 10) return false
  const leftY: number[] = []
  const rightY: number[] = []
  for (const f of pose.frames) {
    const la = f.keypoints['left_ankle']
    const ra = f.keypoints['right_ankle']
    if (!la || !ra) return false // 检测不到踝关节, 默认走退化分支
    leftY.push(la.y)
    rightY.push(ra.y)
  }
  // 脚踝最低点(高度最高, y最小)区间
  const leftMin = Math.min(...leftY)
  const rightMin = Math.min(...rightY)
  const leftBaseline = median(leftY)
  const rightBaseline = median(rightY)
  // 离地判定: 脚踝高度(降低=近地面=大y)超出基线(归一化后约0.04)
  const leftLift = leftBaseline - leftMin
  const rightLift = rightBaseline - rightMin
  return leftLift > 0.04 && rightLift > 0.04
}

/** 腾空顶点: com_vel 从负(上升)变正(下降)的过零点, 取 com 最低(最高位置) */
function findApex(com: number[], comVel: number[]): number {
  const crossings: number[] = []
  for (let i = 1; i < comVel.length; i++) {
    if (comVel[i - 1] < 0 && comVel[i] >= 0) crossings.push(i)
  }
  if (crossings.length) {
    let best = crossings[0]
    for (const c of crossings) {
      if (com[c] < com[best]) best = c
    }
    return best
  }
  return argmin(com)
}

/** 初次触地: apex 后重心下降速度开始减小的帧(触地缓冲开始) */
function findInitialContact(
  com: number[],
  comVel: number[],
  v: number[],
  apexIdx: number,
  fps: number,
): number {
  const searchEnd = Math.min(apexIdx + Math.floor(2.0 * fps), com.length)
  for (let i = apexIdx + 1; i < searchEnd; i++) {
    if (comVel[i] < comVel[i - 1] && comVel[i - 1] > 0.01) return i
  }
  // 兜底: 踝速度尖峰
  const seg = v.slice(apexIdx, searchEnd)
  return Math.min(apexIdx + argmax(seg), com.length - 1)
}

/** 落地缓冲结束: 重心下降速度归零, 限 1 秒内 */
function findLandingEnd(comVel: number[], icIdx: number, fps: number, n: number): number {
  const maxBuffer = Math.floor(1.0 * fps)
  const end = Math.min(icIdx + maxBuffer, n)
  for (let i = icIdx; i < end; i++) {
    if (Math.abs(comVel[i]) < 0.02) return i
  }
  return Math.min(icIdx + maxBuffer, n - 1)
}

/** 起跳点: apex 之前重心从下降转上升的帧 */
function findTakeoff(comVel: number[], apexIdx: number): number {
  for (let i = apexIdx - 1; i > 0; i--) {
    if (comVel[i] > 0.01) return i // 之前在下降
  }
  return Math.max(0, apexIdx - 1)
}

/**
 * 划分动作阶段。针对跳跃类动作; 其他动作做退化处理。
 */
export function detectPhases(pose: PoseData, _actionType: string): ActionPhase[] {
  const n = pose.frames.length
  const fps = pose.fps || 30
  if (n < 6) {
    return [{
      phase_type: '落地缓冲' as PhaseTypeStr,
      start_frame: 0,
      end_frame: Math.max(n - 1, 0),
      start_time_ms: 0,
      end_time_ms: Math.round((n / fps) * 1000 * 100) / 100,
    }]
  }

  const com = comHeight(pose)
  const comSmooth = movingAvg(com, 5)
  const comVel = gradient(comSmooth).map((g) => g * fps) // 重心垂直速度, 正=下降 负=上升
  const v = ankleVelocity(pose, fps)

  const comMin = Math.min(...comSmooth)
  const comMax = Math.max(...comSmooth)
  const heightRange = comMax - comMin

  const mk = (pt: PhaseTypeStr, s: number, e: number): ActionPhase => {
    s = Math.max(0, Math.min(s, n - 1))
    e = Math.max(s, Math.min(e, n - 1))
    return {
      phase_type: pt,
      start_frame: s,
      end_frame: e,
      start_time_ms: Math.round((s / fps) * 1000 * 100) / 100,
      end_time_ms: Math.round((e / fps) * 1000 * 100) / 100,
    }
  }

  // 检测腾空: 重心高度变化 > 6cm，避免走路误识别
  const heightRangeThreshold = 0.06
  let hasFlight = heightRange > heightRangeThreshold && detectFlight(comVel)
  // 额外检测: 双脚是否同时离地（走路时一只脚永远着地）
  const bothOff = hasFlight ? detectBothFeetOff(pose) : false
  hasFlight = hasFlight && bothOff

  let phases: ActionPhase[]
  if (hasFlight) {
    // 标准跳跃阶段划分
    const apexIdx = findApex(comSmooth, comVel)
    const icIdx = findInitialContact(comSmooth, comVel, v, apexIdx, fps)
    const landingEnd = findLandingEnd(comVel, icIdx, fps, n)
    const takeoffIdx = findTakeoff(comVel, apexIdx)
    const prepEnd = Math.max(0, takeoffIdx - Math.max(1, Math.floor(n / 20)))
    const stableStart = Math.min(landingEnd + 1, n - 1)
    phases = [
      mk('准备阶段', 0, prepEnd),
      mk('起跳阶段', prepEnd + 1, takeoffIdx),
      mk('腾空阶段', takeoffIdx + 1, apexIdx),
      mk('初次触地', apexIdx + 1, icIdx),
      mk('落地缓冲', icIdx + 1, landingEnd),
      mk('身体稳定', stableStart, n - 1),
    ]
  } else {
    // 退化处理: 无明显腾空, 用踝速度尖峰定位冲击
    const vMax = Math.max(...v)
    const impactIdx = vMax > 0.05 ? argmax(v) : Math.floor(n / 2)
    const icIdx = Math.max(0, impactIdx - Math.max(1, Math.floor(0.1 * fps)))
    let bufferEnd = Math.min(impactIdx + Math.floor(0.8 * fps), n - 1)
    // 缓冲结束: 踝速度降到峰值的10%以下
    for (let i = impactIdx; i <= bufferEnd; i++) {
      if (v[i] < 0.1 * v[impactIdx]) {
        bufferEnd = i
        break
      }
    }
    const prepEnd = Math.max(0, icIdx - Math.max(1, Math.floor(0.3 * fps)))
    phases = [
      mk('准备阶段', 0, prepEnd),
      mk('初次触地', icIdx, impactIdx),
      mk('落地缓冲', impactIdx + 1, bufferEnd),
      mk('身体稳定', bufferEnd + 1, n - 1),
    ]
  }

  return phases.filter((p) => p.start_frame <= p.end_frame)
}

/** 返回某帧所属阶段 */
export function phaseOfFrame(phases: ActionPhase[], frame: number): PhaseTypeStr | null {
  for (const p of phases) {
    if (p.start_frame <= frame && frame <= p.end_frame) return p.phase_type
  }
  return null
}

/** 返回某阶段的 (start_frame, end_frame) */
export function framesInPhase(phases: ActionPhase[], pt: PhaseTypeStr): [number, number] | null {
  for (const p of phases) {
    if (p.phase_type === pt) return [p.start_frame, p.end_frame]
  }
  return null
}

/**
 * 动作有效性评估: 检测视频是否包含真正的跳跃落地动作
 */
export function analyzeActionValidity(pose: PoseData, _phases: ActionPhase[]): {
  is_valid: boolean
  score: number
  com_height_range: number
  messages: string[]
} {
  const n = pose.frames.length
  if (n < 6) {
    return { is_valid: false, score: 0, com_height_range: 0, messages: ['视频太短,无法识别动作'] }
  }

  const com = comHeight(pose)
  const comSmooth = movingAvg(com, 5)
  const heightRange = Math.max(...comSmooth) - Math.min(...comSmooth)
  const fps = pose.fps || 30

  // 检测实际跳跃落地
  const hasFlight = heightRange > 0.06 && detectFlight(gradient(comSmooth).map((g) => g * fps))
  const bothOff = hasFlight ? detectBothFeetOff(pose) : false

  let score = 0
  const messages: string[] = []

  if (!hasFlight) {
    if (heightRange > 0.04) {
      messages.push('检测到重心有起伏但未达到真正跳跃水平, 可能是下蹲或小跳')
      score = 0.4
    } else {
      messages.push(`❌ 视频中没有检测到跳跃落地动作(重心高度变化仅${(heightRange * 100).toFixed(1)}cm, 走路/站立时 < 5cm)`)
      messages.push('💡 建议: 上传一段包含完整跳跃-落地动作的视频')
      score = 0.1
    }
  } else if (!bothOff) {
    messages.push('⚠️ 重心升高但双脚未同时离地, 可能是走路或单脚跳')
    messages.push('💡 建议: 拍摄双脚同时起跳同时落地的完整动作')
    score = 0.5
  } else {
    score = 1.0
    messages.push('✅ 识别到正确的跳跃落地动作')
  }

  return {
    is_valid: score >= 0.7,
    score: Math.round(score * 100) / 100,
    com_height_range: Math.round(heightRange * 10000) / 10000,
    messages,
  }
}
