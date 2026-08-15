"""
动作阶段识别模块。

基于身体重心(左右髋中点)高度变化与足部速度，将完整动作自动划分为：
准备 → 起跳 → 腾空 → 初次触地 → 落地缓冲 → 身体稳定

重点阶段为"初次触地"和"落地缓冲"，风险动作多集中于此。
"""
from __future__ import annotations

import numpy as np

from ..models.schemas import ActionPhase, ActionType, PhaseType, PoseResult
from . import trajectory as traj


def _com_height(pose: PoseResult) -> np.ndarray:
    """身体重心高度(用左右髋中点的 y 坐标, y越小越高)。返回每帧数组。"""
    ys = []
    for f in pose.frames:
        lh = f.keypoints.get("left_hip")
        rh = f.keypoints.get("right_hip")
        if lh and rh and lh.visibility >= 0.3 and rh.visibility >= 0.3:
            ys.append((lh.y + rh.y) / 2.0)
        elif lh and lh.visibility >= 0.3:
            ys.append(lh.y)
        elif rh and rh.visibility >= 0.3:
            ys.append(rh.y)
        else:
            ys.append(ys[-1] if ys else 0.5)
    return np.asarray(ys, dtype=float)


def _ankle_velocity(pose: PoseResult, fps: float) -> np.ndarray:
    """踝关节合速度(归一化坐标/秒), 用于判断触地时刻。"""
    la = traj.get_joint(traj.build_trajectories(pose), "left_ankle")
    ra = traj.get_joint(traj.build_trajectories(pose), "right_ankle")
    if la is None or ra is None:
        return np.zeros(len(pose.frames))
    v = np.maximum(
        np.asarray([p.v for p in la.points]),
        np.asarray([p.v for p in ra.points]),
    ) * fps
    return v


def detect_phases(pose: PoseResult, action_type: ActionType) -> list[ActionPhase]:
    """划分动作阶段。针对跳跃类动作; 其他动作做退化处理。

    改进: 用重心垂直速度过零点精确定位腾空顶点, 检测不到腾空则退化用踝速度定位冲击。
    落地缓冲限制在 1 秒内, 避免覆盖全视频。
    """
    n = len(pose.frames)
    fps = pose.fps or 30.0
    if n < 6:
        return [ActionPhase(
            phase_type=PhaseType.LANDING, start_frame=0, end_frame=max(n - 1, 0),
            start_time_ms=0.0, end_time_ms=round(n / fps * 1000, 2),
        )]

    com = _com_height(pose)
    com_smooth = _moving_avg(com, 5)
    com_vel = np.gradient(com_smooth) * fps       # 重心垂直速度, 正=下降 负=上升
    v = _ankle_velocity(pose, fps)

    com_min, com_max = float(com_smooth.min()), float(com_smooth.max())
    height_range = com_max - com_min

    def mk(pt: PhaseType, s: int, e: int) -> ActionPhase:
        s = max(0, min(s, n - 1))
        e = max(s, min(e, n - 1))
        return ActionPhase(
            phase_type=pt, start_frame=s, end_frame=e,
            start_time_ms=round(s / fps * 1000, 2),
            end_time_ms=round(e / fps * 1000, 2),
        )

    # 检测腾空: 重心高度变化 > 6cm（走路时重心波动 < 5cm，跳跃时 > 8cm），避免走路误识别
    height_range_threshold = 0.06
    has_flight = height_range > height_range_threshold and _detect_flight(com_vel)
    # 额外检测: 双脚是否同时离地（走路时一只脚永远着地）
    both_off = _detect_both_feet_off(pose) if has_flight else False
    # 严格判定: 必须有腾空 + 双脚同时离地（下蹲跳也会触发判别）
    has_flight = has_flight and both_off

    if has_flight:
        # 标准跳跃阶段划分
        apex_idx = _find_apex(com_smooth, com_vel)
        ic_idx = _find_initial_contact(com_smooth, com_vel, v, apex_idx, fps)
        landing_end = _find_landing_end(com_smooth, com_vel, ic_idx, fps, n)
        # 起跳/准备
        takeoff_idx = _find_takeoff(com_vel, apex_idx)
        prep_end = max(0, takeoff_idx - max(1, n // 20))
        stable_start = min(landing_end + 1, n - 1)
        phases = [
            mk(PhaseType.PREPARATION, 0, prep_end),
            mk(PhaseType.TAKEOFF, prep_end + 1, takeoff_idx),
            mk(PhaseType.FLIGHT, takeoff_idx + 1, apex_idx),
            mk(PhaseType.INITIAL_CONTACT, apex_idx + 1, ic_idx),
            mk(PhaseType.LANDING, ic_idx + 1, landing_end),
            mk(PhaseType.STABILIZATION, stable_start, n - 1),
        ]
    else:
        # 退化处理: 无明显腾空(如捡球/原地动作), 用踝速度尖峰定位冲击
        impact_idx = int(np.argmax(v)) if v.max() > 0.05 else n // 2
        ic_idx = max(0, impact_idx - max(1, int(0.1 * fps)))
        buffer_end = min(impact_idx + int(0.8 * fps), n - 1)
        # 缓冲结束: 踝速度降到峰值的10%以下
        for i in range(impact_idx, buffer_end + 1):
            if v[i] < 0.1 * v[impact_idx]:
                buffer_end = i
                break
        prep_end = max(0, ic_idx - max(1, int(0.3 * fps)))
        phases = [
            mk(PhaseType.PREPARATION, 0, prep_end),
            mk(PhaseType.INITIAL_CONTACT, ic_idx, impact_idx),
            mk(PhaseType.LANDING, impact_idx + 1, buffer_end),
            mk(PhaseType.STABILIZATION, buffer_end + 1, n - 1),
        ]

    phases = [p for p in phases if p.start_frame <= p.end_frame]
    return phases


def _detect_flight(com_vel: np.ndarray) -> bool:
    """检测腾空: 重心速度有明显上升(负)转下降(正)的过零点。"""
    for i in range(1, len(com_vel)):
        if com_vel[i - 1] < -0.05 and com_vel[i] > 0.05:
            return True
    return False


def _detect_both_feet_off(pose: PoseResult) -> bool:
    """检测双脚是否同时离地(防止走路误识别为跳跃落地)。

    方法: 计算左右脚踝 y 坐标的最大最小值, 如果"最低点"(脚踝最接近观众/最高)
    持续超过 5帧, 且两脚同步达到接近最高点, 则判断为双脚同时离地。
    """
    n = len(pose.frames)
    if n < 10:
        return False
    left_y = np.zeros(n)
    right_y = np.zeros(n)
    for i, f in enumerate(pose.frames):
        import mediapipe as mp
        la = f.keypoints.get('left_ankle')
        ra = f.keypoints.get('right_ankle')
        if la is None or ra is None:
            return False  # 检测不到踝关节, 默认走退化分支
        left_y[i] = la.y
        right_y[i] = ra.y
    # 脚踝最低点(高度最高, y最小)区间
    left_min = left_y.min()
    right_min = right_y.min()
    left_baseline = np.median(left_y)
    right_baseline = np.median(right_y)
    # 离地判定: 脚踝高度(降低=近地面=大y)超出基线 5cm(归一化后约0.05)
    left_lift = left_baseline - left_min
    right_lift = right_baseline - right_min
    return left_lift > 0.04 and right_lift > 0.04


def _find_apex(com: np.ndarray, com_vel: np.ndarray) -> int:
    """腾空顶点: com_vel 从负(上升)变正(下降)的过零点, 取 com 最低(最高位置)。"""
    crossings = [i for i in range(1, len(com_vel))
                 if com_vel[i - 1] < 0 and com_vel[i] >= 0]
    if crossings:
        return min(crossings, key=lambda i: com[i])
    return int(np.argmin(com))


def _find_initial_contact(com: np.ndarray, com_vel: np.ndarray, v: np.ndarray,
                          apex_idx: int, fps: float) -> int:
    """初次触地: apex 后重心下降速度开始减小的帧(触地缓冲开始)。"""
    search_end = min(apex_idx + int(2.0 * fps), len(com))
    for i in range(apex_idx + 1, search_end):
        if com_vel[i] < com_vel[i - 1] and com_vel[i - 1] > 0.01:
            return i
    # 兜底: 踝速度尖峰
    return min(apex_idx + int(np.argmax(v[apex_idx:search_end])), len(com) - 1)


def _find_landing_end(com: np.ndarray, com_vel: np.ndarray, ic_idx: int,
                       fps: float, n: int) -> int:
    """落地缓冲结束: 重心下降速度归零, 限 1 秒内。"""
    max_buffer = int(1.0 * fps)
    for i in range(ic_idx, min(ic_idx + max_buffer, n)):
        if abs(com_vel[i]) < 0.02:
            return i
    # 兜底: 缓冲窗口内重心最低点
    return min(ic_idx + max_buffer, n - 1)


def _find_takeoff(com_vel: np.ndarray, apex_idx: int) -> int:
    """起跳点: apex 之前重心从下降转上升的帧。"""
    for i in range(apex_idx - 1, 0, -1):
        if com_vel[i] > 0.01:   # 之前在下降
            return i
    return max(0, apex_idx - 1)


def _moving_avg(arr: np.ndarray, w: int) -> np.ndarray:
    if len(arr) < w:
        return arr.copy()
    kernel = np.ones(w) / w
    return np.convolve(arr, kernel, mode="same")


def _find_stable_start(com: np.ndarray, after: int, n: int) -> int:
    """从 after 之后找重心波动趋于平稳的起点。"""
    if after >= n - 1:
        return n - 1
    window = max(3, n // 20)
    for i in range(after, n - window):
        seg = com[i:i + window]
        if np.std(seg) < 0.005:        # 重心高度波动很小
            return i
    return min(after + window, n - 1)


def phase_of_frame(phases: list[ActionPhase], frame: int) -> PhaseType | None:
    """返回某帧所属阶段。"""
    for p in phases:
        if p.start_frame <= frame <= p.end_frame:
            return p.phase_type
    return None


def frames_in_phase(phases: list[ActionPhase], pt: PhaseType) -> tuple[int, int] | None:
    """返回某阶段的 (start_frame, end_frame)。"""
    for p in phases:
        if p.phase_type == pt:
            return p.start_frame, p.end_frame
    return None


def analyze_action_validity(pose: PoseResult, phases: list[ActionPhase]) -> dict:
    """动作有效性评估: 检测视频是否包含真正的跳跃落地动作。

    返回:
        is_valid: bool - 动作是否有效(真正跳跃落地)
        score: float 0-1 - 有效性评分
        messages: list - 给用户的提示信息
    """
    n = len(pose.frames)
    if n < 6:
        return {"is_valid": False, "score": 0.0, "messages": ["视频太短,无法识别动作"]}

    com = _com_height(pose)
    com_smooth = _moving_avg(com, 5)
    height_range = float(com_smooth.max() - com_smooth.min())

    # 检测实际跳跃落地
    has_flight = height_range > 0.06 and _detect_flight(np.gradient(com_smooth) * (pose.fps or 30.0))
    both_off = _detect_both_feet_off(pose) if has_flight else False

    score = 0.0
    messages = []

    if not has_flight:
        # 检查是否接近阈值(可能是下蹲/小跳)
        if height_range > 0.04:
            messages.append("检测到重心有起伏但未达到真正跳跃水平, 可能是下蹲或小跳")
            score = 0.4
        else:
            messages.append("❌ 视频中没有检测到跳跃落地动作(重心高度变化仅{:.1f}cm, 走路/站立时 < 5cm)".format(height_range * 100))
            messages.append("💡 建议: 上传一段包含完整跳跃-落地动作的视频")
            score = 0.1
    elif not both_off:
        messages.append("⚠️ 重心升高但双脚未同时离地, 可能是走路或单脚跳")
        messages.append("💡 建议: 拍摄双脚同时起跳同时落地的完整动作")
        score = 0.5
    else:
        score = 1.0
        messages.append("✅ 识别到正确的跳跃落地动作")

    return {
        "is_valid": score >= 0.7,
        "score": round(score, 2),
        "com_height_range": round(height_range, 4),
        "messages": messages,
    }
