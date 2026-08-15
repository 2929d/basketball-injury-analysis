"""
运动轨迹提取与平滑模块。

从姿态识别结果构建各关节的时序轨迹，使用 Savitzky-Golay 滤波去抖，
并计算位移 / 速度 / 加速度 / 左右差异 / 动作稳定性。
"""
from __future__ import annotations

import numpy as np
from scipy.signal import savgol_filter

from ..config import SMOOTH_POLYORDER, SMOOTH_WINDOW_LENGTH
from ..models.schemas import JointTrajectory, PoseResult, TrajectoryPoint

# 需要构建轨迹的关节(左右成对)
TRACKED_JOINTS = [
    ("left_shoulder", "left"), ("right_shoulder", "right"),
    ("left_hip", "left"), ("right_hip", "right"),
    ("left_knee", "left"), ("right_knee", "right"),
    ("left_ankle", "left"), ("right_ankle", "right"),
    ("left_heel", "left"), ("right_heel", "right"),
    ("left_foot_index", "left"), ("right_foot_index", "right"),
    ("nose", "center"),
]


def build_trajectories(pose: PoseResult) -> list[JointTrajectory]:
    """从 PoseResult 构建各关节平滑轨迹(含速度/加速度)。"""
    if not pose.frames:
        return []

    fps = pose.fps or 30.0
    dt = 1.0 / fps
    n = len(pose.frames)
    win = min(SMOOTH_WINDOW_LENGTH, n if n % 2 == 1 else n - 1)
    if win < 3:
        win = 3
    if win % 2 == 0:
        win += 1

    trajectories: list[JointTrajectory] = []
    for joint_name, side in TRACKED_JOINTS:
        xs, ys, zs, ts, idxs = [], [], [], [], []
        for f in pose.frames:
            kp = f.keypoints.get(joint_name)
            if kp is not None and kp.visibility >= 0.3:
                xs.append(kp.x)
                ys.append(kp.y)
                zs.append(kp.z)
            else:
                # 缺失点用前后插值填充, 末尾用上一个有效值
                xs.append(xs[-1] if xs else 0.0)
                ys.append(ys[-1] if ys else 0.0)
                zs.append(zs[-1] if zs else 0.0)
            ts.append(f.timestamp_ms)
            idxs.append(f.frame_index)

        xs = np.asarray(xs, dtype=float)
        ys = np.asarray(ys, dtype=float)
        zs = np.asarray(zs, dtype=float)

        # Savitzky-Golay 平滑(去抖)
        xs_s = _safe_savgol(xs, win)
        ys_s = _safe_savgol(ys, win)
        zs_s = _safe_savgol(zs, win)

        # 一阶导 = 速度, 二阶导 = 加速度 (单位: 归一化坐标/帧)
        vx = _safe_savgol(xs, win, deriv=1, delta=dt)
        vy = _safe_savgol(ys, win, deriv=1, delta=dt)
        ax = _safe_savgol(xs, win, deriv=2, delta=dt)
        ay = _safe_savgol(ys, win, deriv=2, delta=dt)
        v = np.sqrt(vx ** 2 + vy ** 2)

        points = [
            TrajectoryPoint(
                frame_index=int(idxs[i]),
                timestamp_ms=float(ts[i]),
                x=float(xs_s[i]), y=float(ys_s[i]), z=float(zs_s[i]),
                vx=float(vx[i]), vy=float(vy[i]), v=float(v[i]),
                ax=float(ax[i]), ay=float(ay[i]),
            )
            for i in range(n)
        ]
        trajectories.append(JointTrajectory(joint_name=joint_name, side=side, points=points))

    return trajectories


def _safe_savgol(arr: np.ndarray, win: int, deriv: int = 0, delta: float = 1.0) -> np.ndarray:
    """安全的 Savitzky-Golay 滤波, 处理短序列。"""
    if len(arr) < win:
        return arr.copy()
    try:
        return savgol_filter(arr, win, SMOOTH_POLYORDER, deriv=deriv, delta=delta, mode="interp")
    except Exception:
        return arr.copy()


def get_joint(trajs: list[JointTrajectory], name: str) -> JointTrajectory | None:
    for t in trajs:
        if t.joint_name == name:
            return t
    return None


def series(traj: JointTrajectory, attr: str = "y") -> np.ndarray:
    """提取轨迹某属性的 numpy 数组。"""
    return np.asarray([getattr(p, attr) for p in traj.points], dtype=float)


def bilateral_asymmetry(left: JointTrajectory, right: JointTrajectory, attr: str = "y") -> float:
    """计算左右侧同一关节在某属性上的不对称指数(0=完全对称, 1=极大差异)。"""
    a = series(left, attr)
    b = series(right, attr)
    n = min(len(a), len(b))
    if n == 0:
        return 0.0
    a, b = a[:n], b[:n]
    diff = np.abs(a - b)
    scale = np.mean(np.abs(a) + np.abs(b)) + 1e-6
    return float(np.clip(np.mean(diff) / scale, 0.0, 1.0))
