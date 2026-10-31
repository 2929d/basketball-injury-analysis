/**
 * 生物力学特征提取模块（从后端 core/biomechanics.py 迁移）
 *
 * 基于人体关键点计算关节角度与运动特征,覆盖膝/髋/踝/躯干/整体五大类。
 * 所有角度计算采用三点向量夹角法,阈值参考运动医学文献的启发式取值。
 */
import type {
  ActionPhase,
  AnkleFeatures,
  BiomechanicsFeatures,
  FrameTimelinePoint,
  HipFeatures,
  KneeFeatures,
  OverallFeatures,
  PoseData,
  PoseFrame,
  TrunkFeatures,
} from './types'
import { angle3, argmax, clip, mean, norm3, savgolFilter, std } from './math'
import { framesInPhase } from './phase_detection'
import { getJoint } from './trajectory'
import type { JointTrajectory } from './types'

/** 取关键点坐标 (x, y, z), 不存在或置信度低返回 null */
function kp(frame: PoseFrame, name: string): number[] | null {
  const p = frame.keypoints[name]
  if (!p || p.visibility < 0.2) return null
  return [p.x, p.y, p.z]
}

/** 膝关节屈曲角 = 髋-膝-踝夹角(伸展≈180°, 屈曲越小) */
function kneeFlexion(frame: PoseFrame, side: string): number | null {
  return angle3(kp(frame, `${side}_hip`), kp(frame, `${side}_knee`), kp(frame, `${side}_ankle`))
}

/** 髋屈曲角 = 肩-髋-膝夹角 */
function hipFlexion(frame: PoseFrame, side: string): number | null {
  return angle3(kp(frame, `${side}_shoulder`), kp(frame, `${side}_hip`), kp(frame, `${side}_knee`))
}

/** 踝背屈角 = 膝-踝-脚尖夹角 */
function ankleDorsiflexion(frame: PoseFrame, side: string): number | null {
  return angle3(kp(frame, `${side}_knee`), kp(frame, `${side}_ankle`), kp(frame, `${side}_foot_index`))
}

/**
 * 膝关节内扣(外翻)程度: 膝关节相对髋-踝连线的横向偏移(度)。
 * 正值=膝盖向内扣(膝外翻), 负值=外展。用 frontal 平面 (x-y) 投影。
 */
function kneeValgus(frame: PoseFrame, side: string): number | null {
  const h = kp(frame, `${side}_hip`)
  const k = kp(frame, `${side}_knee`)
  const a = kp(frame, `${side}_ankle`)
  if (!h || !k || !a) return null
  // 髋到踝的向量
  const haX = a[0] - h[0]
  const haY = a[1] - h[1]
  const hkX = k[0] - h[0]
  const hkY = k[1] - h[1]
  const haLen2 = haX * haX + haY * haY
  if (haLen2 < 1e-6) return null
  // 膝到髋踝连线的投影
  const proj = (hkX * haX + hkY * haY) / haLen2
  const footX = h[0] + proj * haX
  const footY = h[1] + proj * haY
  const perp = Math.sqrt((k[0] - footX) ** 2 + (k[1] - footY) ** 2)
  // 内扣方向: 左侧膝盖向右(x增大)为内扣
  const sign =
    (side === 'left' && k[0] > footX) || (side === 'right' && k[0] < footX) ? 1 : -1
  return (Math.atan2(perp, Math.sqrt(haLen2)) * 180) / Math.PI * sign
}

/** 躯干前倾角: 肩-髋中点连线与垂直方向(−y)的夹角 */
function trunkForwardLean(frame: PoseFrame): number | null {
  const ls = kp(frame, 'left_shoulder')
  const rs = kp(frame, 'right_shoulder')
  const lh = kp(frame, 'left_hip')
  const rh = kp(frame, 'right_hip')
  if (!ls || !rs || !lh || !rh) return null
  const shX = (ls[0] + rs[0]) / 2
  const shY = (ls[1] + rs[1]) / 2
  const hipX = (lh[0] + rh[0]) / 2
  const hipY = (lh[1] + rh[1]) / 2
  const vec = [shX - hipX, shY - hipY, 0]
  const vertical = [0, -1, 0]
  const n = norm3(vec) + 1e-9
  const cos = clip((vec[0] * vertical[0] + vec[1] * vertical[1]) / n, -1, 1)
  return (Math.acos(cos) * 180) / Math.PI
}

/** 躯干侧倾角: 肩连线与水平线的夹角(度) */
function trunkLateralLean(frame: PoseFrame): number | null {
  const ls = kp(frame, 'left_shoulder')
  const rs = kp(frame, 'right_shoulder')
  if (!ls || !rs) return null
  const dx = rs[0] - ls[0]
  const dy = rs[1] - ls[1]
  return (Math.atan2(Math.abs(dy), Math.abs(dx) + 1e-9) * 180) / Math.PI
}

/** 骨盆倾斜角: 左右髋连线与水平线夹角(度) */
function pelvicTilt(frame: PoseFrame): number | null {
  const lh = kp(frame, 'left_hip')
  const rh = kp(frame, 'right_hip')
  if (!lh || !rh) return null
  return (Math.atan2(Math.abs(lh[1] - rh[1]), Math.abs(lh[0] - rh[0]) + 1e-9) * 180) / Math.PI
}

/** 重心 y(左右髋中点) */
function comY(frame: PoseFrame): number | null {
  const lh = kp(frame, 'left_hip')
  const rh = kp(frame, 'right_hip')
  if (!lh || !rh) return null
  return (lh[1] + rh[1]) / 2
}

/** 对关键点坐标做 Savitzky-Golay 时序滤波, 减少抖动, 提升特征稳定性 */
function smoothFrames(frames: PoseFrame[]): PoseFrame[] {
  const n = frames.length
  if (n < 7) return frames
  const allKps = new Set<string>()
  for (const f of frames) {
    for (const k of Object.keys(f.keypoints)) allKps.add(k)
  }
  // 深拷贝
  const smoothed: PoseFrame[] = frames.map((f) => ({
    ...f,
    keypoints: { ...f.keypoints },
  }))
  const win = Math.min(7, n % 2 ? n : n - 1)
  for (const kpName of allKps) {
    const xs: number[] = []
    const ys: number[] = []
    for (const f of frames) {
      const p = f.keypoints[kpName]
      if (p) {
        xs.push(p.x)
        ys.push(p.y)
      } else {
        xs.push(0)
        ys.push(0)
      }
    }
    if (xs.length >= win) {
      const xsS = savgolFilter(xs, win, 2)
      const ysS = savgolFilter(ys, win, 2)
      for (let i = 0; i < n; i++) {
        const p = smoothed[i].keypoints[kpName]
        if (p) {
          p.x = xsS[i]
          p.y = ysS[i]
        }
      }
    }
  }
  return smoothed
}

/** 返回每帧关键特征的时间序列(用于逐帧分析时间轴) */
export function getFrameTimeline(pose: PoseData): FrameTimelinePoint[] {
  const frames = smoothFrames(pose.frames)
  const fps = pose.fps || 30
  const out: FrameTimelinePoint[] = []
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]
    out.push({
      frame: i,
      time: Math.round((i / fps) * 100) / 100,
      knee_flexion: Math.round((kneeFlexion(f, 'right') || 0) * 10) / 10,
      knee_valgus: Math.round((kneeValgus(f, 'right') || 0) * 10) / 10,
      trunk_lean: Math.round((trunkForwardLean(f) || 0) * 10) / 10,
      trunk_lateral: Math.round((trunkLateralLean(f) || 0) * 10) / 10,
      com_y: Math.round((comY(f) || 0) * 1000) / 1000,
    })
  }
  return out
}

/** 提取全部生物力学特征 */
export function extractFeatures(
  pose: PoseData,
  trajectories: JointTrajectory[],
  phases: ActionPhase[],
  _actionType: string,
): BiomechanicsFeatures {
  const frames = smoothFrames(pose.frames)
  const fps = pose.fps || 30
  const n = frames.length

  const icRng = framesInPhase(phases, '初次触地')
  const landRng = framesInPhase(phases, '落地缓冲')
  const flightRng = framesInPhase(phases, '腾空阶段')

  // ---------- 膝关节 ----------
  const leftKnee: number[] = []
  const rightKnee: number[] = []
  for (const f of frames) {
    const a = kneeFlexion(f, 'left')
    leftKnee.push(a !== null ? a : 180)
    const b = kneeFlexion(f, 'right')
    rightKnee.push(b !== null ? b : 180)
  }

  const icIdx = Math.min(icRng ? icRng[0] : landRng ? landRng[0] : 0, n - 1)
  const icFlexL = 180 - leftKnee[icIdx]
  const icFlexR = 180 - rightKnee[icIdx]
  const icFlex = Math.min((icFlexL + icFlexR) / 2, 90)

  const maxFlexL = 180 - Math.min(...leftKnee)
  const maxFlexR = 180 - Math.min(...rightKnee)
  const maxFlex = Math.min((maxFlexL + maxFlexR) / 2, 90)

  // 膝内扣(取落地阶段最大内扣)
  const valgusSeries: number[] = []
  for (const f of frames) {
    const vl = kneeValgus(f, 'left')
    const vr = kneeValgus(f, 'right')
    const vals = [vl, vr].filter((v): v is number => v !== null)
    valgusSeries.push(vals.length ? Math.max(...vals) : 0)
  }
  const valgusMax = Math.min(valgusSeries.length ? Math.max(...valgusSeries) : 0, 25)

  // 膝角速度(落地阶段, 先平滑避免关键点抖动产生虚假高值)
  const kneeSmooth =
    leftKnee.length >= 5
      ? (() => {
          const w = 5
          const half = Math.floor(w / 2)
          const out: number[] = []
          for (let i = 0; i < leftKnee.length; i++) {
            let s = 0
            let c = 0
            for (let j = i - half; j <= i + half; j++) {
              if (j >= 0 && j < leftKnee.length) {
                s += leftKnee[j]
                c++
              }
            }
            out.push(s / c)
          }
          return out
        })()
      : leftKnee.slice()
  let kvel = 0
  if (kneeSmooth.length > 1) {
    let m = 0
    for (let i = 1; i < kneeSmooth.length; i++) {
      m = Math.max(m, Math.abs(kneeSmooth[i] - kneeSmooth[i - 1]))
    }
    kvel = Math.min(m * fps, 400)
  }

  // 左右膝屈曲差
  let lrDiff = 0
  if (leftKnee.length === rightKnee.length && leftKnee.length) {
    let s = 0
    for (let i = 0; i < leftKnee.length; i++) s += Math.abs(leftKnee[i] - rightKnee[i])
    lrDiff = Math.min(s / leftKnee.length, 30)
  }

  // 膝-脚尖对齐(膝盖与脚尖 x 偏移)
  const k2t: number[] = []
  for (const f of frames) {
    for (const side of ['left', 'right']) {
      const k = kp(f, `${side}_knee`)
      const t = kp(f, `${side}_foot_index`)
      if (k && t) k2t.push(Math.abs(k[0] - t[0]))
    }
  }
  const k2tMean = k2t.length ? mean(k2t) : 0
  const k2tDeg = k2t.length ? (Math.atan2(k2tMean, 0.1) * 180) / Math.PI : 0

  const knee: KneeFeatures = {
    initial_contact_flexion_deg: Math.round(icFlex * 10) / 10,
    max_flexion_deg: Math.round(maxFlex * 10) / 10,
    valgus_deg: Math.round(valgusMax * 10) / 10,
    lateral_displacement: k2t.length ? Math.round(k2tMean * 10000) / 10000 : 0,
    angular_velocity: Math.round(kvel * 10) / 10,
    left_right_diff_deg: Math.round(lrDiff * 10) / 10,
    knee_toe_alignment_deg: Math.round(k2tDeg * 10) / 10,
  }

  // ---------- 髋关节 ----------
  const hipFlex: number[] = []
  for (const f of frames) {
    const a = hipFlexion(f, 'left')
    if (a !== null) hipFlex.push(180 - a)
  }
  let hipFlexDeg = 0
  if (hipFlex.length) {
    if (landRng) {
      const seg = hipFlex.slice(landRng[0], Math.min(landRng[1] + 1, hipFlex.length))
      hipFlexDeg = Math.min(seg.length ? Math.max(...seg) : Math.max(...hipFlex), 90)
    } else {
      hipFlexDeg = Math.min(Math.max(...hipFlex), 90)
    }
  }

  // 髋内收/外展(左右髋 x 差)
  const adduct: number[] = []
  for (const f of frames) {
    const lh = kp(f, 'left_hip')
    const rh = kp(f, 'right_hip')
    if (lh && rh) adduct.push(lh[0] - rh[0])
  }
  const adductDeg = adduct.length ? (Math.atan2(std(adduct), 0.2) * 180) / Math.PI : 0

  // 左右髋高度差
  const lrHipDiff: number[] = []
  for (const f of frames) {
    const lh = kp(f, 'left_hip')
    const rh = kp(f, 'right_hip')
    if (lh && rh) lrHipDiff.push(Math.abs(lh[1] - rh[1]))
  }
  const lrHipDiffVal = lrHipDiff.length ? mean(lrHipDiff) : 0

  const pelvic = frames.map((f) => pelvicTilt(f)).filter((v): v is number => v !== null)
  const pelvicTiltDeg = pelvic.length ? mean(pelvic) : 0

  // 髋部稳定性(重心横向波动倒数)
  const comXs: number[] = []
  for (const f of frames) {
    const lh = kp(f, 'left_hip')
    const rh = kp(f, 'right_hip')
    if (lh && rh) comXs.push((lh[0] + rh[0]) / 2)
  }
  const hipStab = comXs.length ? clip(1 - std(comXs) * 8, 0.3, 1) : 0.5

  const hip: HipFeatures = {
    flexion_deg: Math.round(hipFlexDeg * 10) / 10,
    adduction_deg: Math.round(adductDeg * 10) / 10,
    left_right_height_diff: Math.round(lrHipDiffVal * 10000) / 10000,
    pelvic_tilt_deg: Math.round(pelvicTiltDeg * 10) / 10,
    stability: Math.round(hipStab * 100) / 100,
  }

  // ---------- 踝关节 ----------
  const ankleDf: number[] = []
  for (const f of frames) {
    const a = ankleDorsiflexion(f, 'left')
    if (a !== null) ankleDf.push(180 - a)
  }
  const ankleDfDeg = ankleDf.length ? mean(ankleDf) : 0

  // 足部落地方向(脚尖与踝 x 偏移角度)
  const footDir: number[] = []
  for (const f of frames) {
    for (const side of ['left', 'right']) {
      const a = kp(f, `${side}_ankle`)
      const t = kp(f, `${side}_foot_index`)
      if (a && t) {
        footDir.push((Math.atan2(Math.abs(t[1] - a[1]), Math.abs(t[0] - a[0]) + 1e-6) * 180) / Math.PI)
      }
    }
  }
  const footDirDeg = footDir.length ? mean(footDir) : 0

  // 踝晃动(落地阶段踝速度的变异系数)
  const laTraj = getJoint(trajectories, 'left_ankle')
  const raTraj = getJoint(trajectories, 'right_ankle')
  let ankleSway = 0
  if (laTraj && raTraj) {
    let lv = laTraj.points.map((p) => p.v)
    let rv = raTraj.points.map((p) => p.v)
    if (landRng) {
      lv = lv.slice(landRng[0], Math.min(landRng[1] + 1, lv.length))
      rv = rv.slice(landRng[0], Math.min(landRng[1] + 1, rv.length))
    }
    const swayL = lv.length ? std(lv) / (mean(lv) + 1e-6) : 0
    const swayR = rv.length ? std(rv) / (mean(rv) + 1e-6) : 0
    ankleSway = (swayL + swayR) / 2
  }

  // 左右脚触地时间差(腾空→触地时左右踝速度差异最大的帧间隔)
  let lrContactDiff = 0
  if (laTraj && raTraj && flightRng) {
    const lv = laTraj.points.slice(flightRng[0], flightRng[1] + 1).map((p) => p.v)
    const rv = raTraj.points.slice(flightRng[0], flightRng[1] + 1).map((p) => p.v)
    if (lv.length && rv.length) {
      lrContactDiff = Math.abs((argmax(lv) - argmax(rv)) / fps * 1000)
    }
  }

  // 足部稳定时间(触地后踝速度降到阈值以下的时间)
  let stabTime = 0
  if (laTraj && landRng) {
    const f0 = landRng[0]
    const lv = laTraj.points.slice(f0).map((p) => p.v * fps)
    for (let i = 0; i < lv.length; i++) {
      if (lv[i] < 0.05) {
        stabTime = Math.min((i / fps) * 1000, 1500)
        break
      }
    }
  }

  const ankle: AnkleFeatures = {
    dorsiflexion_deg: Math.round(ankleDfDeg * 10) / 10,
    foot_landing_direction_deg: Math.round(footDirDeg * 10) / 10,
    left_right_contact_time_diff_ms: Math.round(lrContactDiff * 10) / 10,
    ankle_sway_deg: Math.round(ankleSway * 100) / 100,
    stabilization_time_ms: Math.round(stabTime * 10) / 10,
  }

  // ---------- 躯干 ----------
  // 前倾只评估落地缓冲阶段(准备阶段找球前倾是正常技术动作, 不算风险)
  const leanAll = frames.map((f) => trunkForwardLean(f))
  let lean: Array<number | null> = leanAll
  if (landRng) {
    lean = leanAll.slice(landRng[0], Math.min(landRng[1] + 1, leanAll.length))
  }
  const leanVals = lean.filter((v): v is number => v !== null)
  const fwdLean = Math.min(leanVals.length ? mean(leanVals) : 0, 45)

  const latVals = frames.map((f) => trunkLateralLean(f)).filter((v): v is number => v !== null)
  const latLean = Math.min(latVals.length ? Math.max(...latVals) : 0, 30)

  // 肩髋轴线偏差
  const shDevVals: number[] = []
  for (const f of frames) {
    const ls = kp(f, 'left_shoulder')
    const rs = kp(f, 'right_shoulder')
    const lh = kp(f, 'left_hip')
    const rh = kp(f, 'right_hip')
    if (ls && rs && lh && rh) {
      const shAng = (Math.atan2(Math.abs(rs[1] - ls[1]), Math.abs(rs[0] - ls[0]) + 1e-6) * 180) / Math.PI
      const hipAng = (Math.atan2(Math.abs(rh[1] - lh[1]), Math.abs(rh[0] - lh[0]) + 1e-6) * 180) / Math.PI
      shDevVals.push(Math.abs(shAng - hipAng))
    }
  }
  const shDev = shDevVals.length ? mean(shDevVals) : 0

  // 重心横向偏移
  const comLat = comXs.length ? std(comXs) : 0

  const trunk: TrunkFeatures = {
    forward_lean_deg: Math.round(fwdLean * 10) / 10,
    lateral_lean_deg: Math.round(latLean * 10) / 10,
    shoulder_hip_axis_deviation_deg: Math.round(shDev * 10) / 10,
    com_lateral_displacement: Math.round(comLat * 10000) / 10000,
    upper_rotation_deg: 0, // 2D 估计近似为 0
  }

  // ---------- 整体 ----------
  const comYs = frames.map((f) => comY(f)).filter((v): v is number => v !== null)
  let bufferMs = 0
  let comDrop = 0
  if (comYs.length && landRng) {
    bufferMs = Math.min(((landRng[1] - landRng[0]) / fps) * 1000, 1500)
    comDrop = Math.abs(Math.max(...comYs) - Math.min(...comYs))
  }

  const actionDur = n ? (n / fps) * 1000 : 0

  // 左右不对称(膝屈曲差归一化)
  const asym = clip(lrDiff / 30, 0, 1)

  const overall: OverallFeatures = {
    landing_buffer_time_ms: Math.round(bufferMs * 10) / 10,
    com_drop_distance: Math.round(comDrop * 10000) / 10000,
    action_duration_ms: Math.round(actionDur * 10) / 10,
    bilateral_asymmetry: Math.round(asym * 100) / 100,
    stabilization_time_ms: Math.round(stabTime * 10) / 10,
    consistency: 0.85, // 单次视频无法多次比较, 默认较高
    fatigue_change: 0, // 单次视频无法计算
  }

  return { knee, hip, ankle, trunk, overall }
}

/**
 * 识别视频中问题最严重的时刻, 返回 [{frame, timestamp, issue, value, desc}]
 */
export function identifyProblemMoments(
  pose: PoseData,
  fps = 30,
  _landRng?: [number, number] | null,
): Array<{ frame: number; timestamp: number; issue: string; value: number; desc: string }> {
  const moments: Array<{ frame: number; timestamp: number; issue: string; value: number; desc: string }> = []
  const frames = pose.frames
  const n = frames.length
  if (n === 0) return moments

  // 1. 膝内扣最大的帧
  const valgusSeries: number[] = []
  for (const f of frames) {
    const vl = kneeValgus(f, 'left')
    const vr = kneeValgus(f, 'right')
    const vals = [vl, vr].filter((v): v is number => v !== null)
    valgusSeries.push(vals.length ? Math.max(...vals) : 0)
  }
  if (valgusSeries.length) {
    const idx = argmax(valgusSeries)
    const v = Math.min(valgusSeries[idx], 25)
    if (v > 8) {
      moments.push({
        frame: idx,
        timestamp: Math.round((idx / fps) * 100) / 100,
        issue: '膝内扣',
        value: Math.round(v * 10) / 10,
        desc: `膝关节内扣 ${v.toFixed(1)}°，落地时膝盖向内塌陷`,
      })
    }
  }

  // 2. 躯干侧倾最大的帧
  const lat = frames.map((f) => trunkLateralLean(f) || 0)
  if (lat.length) {
    const idx = argmax(lat)
    const v = Math.min(lat[idx], 30)
    if (v > 12) {
      moments.push({
        frame: idx,
        timestamp: Math.round((idx / fps) * 100) / 100,
        issue: '躯干侧倾',
        value: Math.round(v * 10) / 10,
        desc: `躯干侧倾 ${v.toFixed(1)}°，身体明显歪斜`,
      })
    }
  }

  // 3. 落地冲击(踝速度突变最大的帧)
  const speeds: Array<[number, number]> = []
  for (let i = 1; i < n; i++) {
    const a = kp(frames[i - 1], 'left_ankle')
    const b = kp(frames[i], 'left_ankle')
    if (a && b) {
      speeds.push([i, Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)])
    }
  }
  if (speeds.length) {
    let best: [number, number] = speeds[0]
    for (const s of speeds) {
      if (s[1] > best[1]) best = s
    }
    const [idx, v] = best
    if (v > 0.04) {
      moments.push({
        frame: idx,
        timestamp: Math.round((idx / fps) * 100) / 100,
        issue: '落地冲击',
        value: Math.round(v * 100 * 10) / 10,
        desc: '落地瞬间踝部速度突变，冲击较大',
      })
    }
  }

  // 4. 重心最低点(落地缓冲关键时刻)
  const comVals: Array<[number, number]> = []
  for (let i = 0; i < frames.length; i++) {
    const y = comY(frames[i])
    if (y !== null) comVals.push([y, i])
  }
  if (comVals.length) {
    let best = comVals[0]
    for (const c of comVals) {
      if (c[0] > best[0]) best = c
    }
    const idx = best[1]
    moments.push({
      frame: idx,
      timestamp: Math.round((idx / fps) * 100) / 100,
      issue: '落地时刻',
      value: Math.round((idx / fps) * 10) / 10,
      desc: '身体重心最低点，落地缓冲最关键瞬间',
    })
  }

  // 去重: 相近帧(间隔<10帧)合并
  moments.sort((a, b) => a.frame - b.frame)
  const uniq: typeof moments = []
  for (const m of moments) {
    if (uniq.length && m.frame - uniq[uniq.length - 1].frame < 10) continue
    uniq.push(m)
  }
  return uniq.slice(0, 5)
}
