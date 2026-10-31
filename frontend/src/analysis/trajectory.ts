/**
 * 运动轨迹提取与平滑模块（从后端 core/trajectory.py 迁移）
 *
 * 从姿态识别结果构建各关节的时序轨迹，使用 Savitzky-Golay 滤波去抖，
 * 并计算位移 / 速度 / 加速度 / 左右差异。
 */
import type { JointTrajectory, PoseData, TrajectoryPoint } from './types'
import { savgolFilter } from './math'

// 需要构建轨迹的关节(左右成对)
export const TRACKED_JOINTS: Array<[string, string]> = [
  ['left_shoulder', 'left'], ['right_shoulder', 'right'],
  ['left_hip', 'left'], ['right_hip', 'right'],
  ['left_knee', 'left'], ['right_knee', 'right'],
  ['left_ankle', 'left'], ['right_ankle', 'right'],
  ['left_heel', 'left'], ['right_heel', 'right'],
  ['left_foot_index', 'left'], ['right_foot_index', 'right'],
  ['nose', 'center'],
]

export function buildTrajectories(pose: PoseData): JointTrajectory[] {
  if (!pose.frames.length) return []

  const fps = pose.fps || 30
  const dt = 1.0 / fps
  const n = pose.frames.length
  let win = Math.min(7, n % 2 === 1 ? n : n - 1)
  if (win < 3) win = 3
  if (win % 2 === 0) win += 1

  const trajectories: JointTrajectory[] = []
  for (const [jointName, side] of TRACKED_JOINTS) {
    const xs: number[] = []
    const ys: number[] = []
    const zs: number[] = []
    const ts: number[] = []
    const idxs: number[] = []
    for (const f of pose.frames) {
      const kp = f.keypoints[jointName]
      if (kp && kp.visibility >= 0.3) {
        xs.push(kp.x)
        ys.push(kp.y)
        zs.push(kp.z)
      } else {
        // 缺失点用前后插值填充, 末尾用上一个有效值
        xs.push(xs.length ? xs[xs.length - 1] : 0.0)
        ys.push(ys.length ? ys[ys.length - 1] : 0.0)
        zs.push(zs.length ? zs[zs.length - 1] : 0.0)
      }
      ts.push(f.timestamp_ms)
      idxs.push(f.frame_index)
    }

    // Savitzky-Golay 平滑(去抖)
    const xsS = safeSavgol(xs, win)
    const ysS = safeSavgol(ys, win)
    const zsS = safeSavgol(zs, win)

    // 一阶导 = 速度, 二阶导 = 加速度 (单位: 归一化坐标/帧)
    const vx = safeSavgol(xs, win, 1, dt)
    const vy = safeSavgol(ys, win, 1, dt)
    const ax = safeSavgol(xs, win, 2, dt)
    const ay = safeSavgol(ys, win, 2, dt)

    const points: TrajectoryPoint[] = []
    for (let i = 0; i < n; i++) {
      const v = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i])
      points.push({
        frame_index: idxs[i],
        timestamp_ms: ts[i],
        x: xsS[i], y: ysS[i], z: zsS[i],
        vx: vx[i], vy: vy[i], v,
        ax: ax[i], ay: ay[i],
      })
    }
    trajectories.push({ joint_name: jointName, side, points })
  }

  return trajectories
}

/** 安全的 Savitzky-Golay 滤波, 处理短序列 */
function safeSavgol(arr: number[], win: number, deriv = 0, delta = 1): number[] {
  if (arr.length < win) return arr.slice()
  try {
    return savgolFilter(arr, win, 2, deriv, delta)
  } catch {
    return arr.slice()
  }
}

export function getJoint(trajs: JointTrajectory[], name: string): JointTrajectory | null {
  for (const t of trajs) {
    if (t.joint_name === name) return t
  }
  return null
}

/** 提取轨迹某属性的数组 */
export function series(traj: JointTrajectory, attr: keyof TrajectoryPoint = 'y'): number[] {
  return traj.points.map((p) => p[attr] as number)
}

/** 计算左右侧同一关节在某属性上的不对称指数(0=完全对称, 1=极大差异) */
export function bilateralAsymmetry(
  left: JointTrajectory,
  right: JointTrajectory,
  attr: keyof TrajectoryPoint = 'y',
): number {
  const a = series(left, attr)
  const b = series(right, attr)
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let diffSum = 0
  let scaleSum = 0
  for (let i = 0; i < n; i++) {
    diffSum += Math.abs(a[i] - b[i])
    scaleSum += Math.abs(a[i]) + Math.abs(b[i])
  }
  const scale = scaleSum / n + 1e-6
  return Math.max(0, Math.min(1, (diffSum / n) / scale))
}
