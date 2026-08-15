"""
生物力学特征提取模块。

基于人体关键点计算关节角度与运动特征,覆盖膝/髋/踝/躯干/整体五大类。
所有角度计算采用三点向量夹角法,阈值参考运动医学文献的启发式取值。
"""
from __future__ import annotations

from typing import Optional

import numpy as np

from ..models.schemas import (
    ActionType, AnkleFeatures, BiomechanicsFeatures, HipFeatures, KneeFeatures,
    OverallFeatures, PhaseType, PoseFrame, PoseResult, TrunkFeatures,
)
from . import phase_detection as phd
from . import trajectory as traj

# MediaPipe 归一化坐标下, 重力沿 +y 方向(画面下方)


def _kp(frame: PoseFrame, name: str) -> Optional[np.ndarray]:
    """取关键点坐标 (x, y, z), 不存在返回 None。"""
    p = frame.keypoints.get(name)
    if p is None or p.visibility < 0.2:
        return None
    return np.array([p.x, p.y, p.z])


def _angle3(a: Optional[np.ndarray], b: Optional[np.ndarray], c: Optional[np.ndarray]) -> Optional[float]:
    """三点夹角(度), b 为顶点。任一点缺失返回 None。"""
    if a is None or b is None or c is None:
        return None
    v1 = a - b
    v2 = c - b
    n1 = np.linalg.norm(v1)
    n2 = np.linalg.norm(v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return None
    cos = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
    return float(np.degrees(np.arccos(cos)))


def _knee_flexion(frame: PoseFrame, side: str = "left") -> Optional[float]:
    """膝关节屈曲角 = 髋-膝-踝夹角(伸展≈180°, 屈曲越小)。"""
    return _angle3(
        _kp(frame, f"{side}_hip"),
        _kp(frame, f"{side}_knee"),
        _kp(frame, f"{side}_ankle"),
    )


def _hip_flexion(frame: PoseFrame, side: str = "left") -> Optional[float]:
    """髋屈曲角 = 肩-髋-膝夹角。"""
    return _angle3(
        _kp(frame, f"{side}_shoulder"),
        _kp(frame, f"{side}_hip"),
        _kp(frame, f"{side}_knee"),
    )


def _ankle_dorsiflexion(frame: PoseFrame, side: str = "left") -> Optional[float]:
    """踝背屈角 = 膝-踝-脚尖夹角。"""
    return _angle3(
        _kp(frame, f"{side}_knee"),
        _kp(frame, f"{side}_ankle"),
        _kp(frame, f"{side}_foot_index"),
    )


def _knee_valgus(frame: PoseFrame, side: str = "left") -> Optional[float]:
    """
    膝关节内扣(外翻)程度: 膝关节相对髋-踝连线的横向偏移(度)。
    正值=膝盖向内扣(膝外翻), 负值=外展。用 frontal 平面 (x-y) 投影。
    """
    h = _kp(frame, f"{side}_hip")
    k = _kp(frame, f"{side}_knee")
    a = _kp(frame, f"{side}_ankle")
    if h is None or k is None or a is None:
        return None
    # 髋到踝的向量
    ha = a - h
    # 膝到髋踝连线的垂直距离(投影到 x-y 平面)
    ha_xy = np.array([ha[0], ha[1]])
    hk = k[:2] - h[:2]
    if np.linalg.norm(ha_xy) < 1e-6:
        return None
    # 投影长度
    proj = np.dot(hk, ha_xy) / np.dot(ha_xy, ha_xy)
    foot = h[:2] + proj * ha_xy
    perp = np.linalg.norm(k[:2] - foot)
    # 内扣方向: 膝盖 x 偏向身体中线为正
    # 左侧膝盖向右(x增大)为内扣
    sign = 1.0 if (side == "left" and k[0] > foot[0]) or (side == "right" and k[0] < foot[0]) else -1.0
    return float(np.degrees(np.arctan2(perp, np.linalg.norm(ha_xy)))) * sign


def _trunk_forward_lean(frame: PoseFrame) -> Optional[float]:
    """躯干前倾角: 肩-髋中点连线与垂直方向(−y)的夹角。"""
    ls = _kp(frame, "left_shoulder")
    rs = _kp(frame, "right_shoulder")
    lh = _kp(frame, "left_hip")
    rh = _kp(frame, "right_hip")
    if any(x is None for x in (ls, rs, lh, rh)):
        return None
    shoulder = (ls + rs) / 2
    hip = (lh + rh) / 2
    vec = shoulder - hip            # 躯干向量(向上为负 y)
    vertical = np.array([0.0, -1.0, 0.0])
    cos = np.clip(np.dot(vec, vertical) / (np.linalg.norm(vec) + 1e-9), -1.0, 1.0)
    return float(np.degrees(np.arccos(cos)))


def _trunk_lateral_lean(frame: PoseFrame) -> Optional[float]:
    """躯干侧倾角: 肩连线与水平线的夹角(度)。"""
    ls = _kp(frame, "left_shoulder")
    rs = _kp(frame, "right_shoulder")
    if ls is None or rs is None:
        return None
    dx = rs[0] - ls[0]
    dy = rs[1] - ls[1]
    return float(np.degrees(np.arctan2(abs(dy), abs(dx) + 1e-9)))


def _pelvic_tilt(frame: PoseFrame) -> Optional[float]:
    """骨盆倾斜角: 左右髋连线与水平线夹角(度)。"""
    lh = _kp(frame, "left_hip")
    rh = _kp(frame, "right_hip")
    if lh is None or rh is None:
        return None
    return float(np.degrees(np.arctan2(abs(lh[1] - rh[1]), abs(lh[0] - rh[0]) + 1e-9)))


def _com_y(frame: PoseFrame) -> Optional[float]:
    """重心 y(左右髋中点)。"""
    lh = _kp(frame, "left_hip")
    rh = _kp(frame, "right_hip")
    if lh is None or rh is None:
        return None
    return float((lh[1] + rh[1]) / 2)


def _smooth_frames(frames: list[PoseFrame]) -> list[PoseFrame]:
    """对关键点坐标做 Savitzky-Golay 时序滤波, 减少抖动, 提升特征稳定性。"""
    import copy
    from scipy.signal import savgol_filter
    n = len(frames)
    if n < 7:
        return frames
    all_kps: set[str] = set()
    for f in frames:
        all_kps.update(f.keypoints.keys())
    smoothed = [copy.deepcopy(f) for f in frames]
    win = min(7, n if n % 2 else n - 1)
    for kp_name in all_kps:
        xs, ys = [], []
        for f in frames:
            kp = f.keypoints.get(kp_name)
            if kp:
                xs.append(kp.x); ys.append(kp.y)
            else:
                xs.append(0.0); ys.append(0.0)
        if len(xs) >= win:
            xs_s = savgol_filter(xs, win, 2)
            ys_s = savgol_filter(ys, win, 2)
            for i, f in enumerate(smoothed):
                kp = f.keypoints.get(kp_name)
                if kp:
                    kp.x = float(xs_s[i])
                    kp.y = float(ys_s[i])
    return smoothed


def get_frame_timeline(pose: PoseResult) -> list[dict]:
    """返回每帧关键特征的时间序列(用于逐帧分析时间轴)。"""
    frames = _smooth_frames(pose.frames)
    fps = pose.fps or 30.0
    out = []
    for i, f in enumerate(frames):
        out.append({
            "frame": i,
            "time": round(i / fps, 2),
            "knee_flexion": round(_knee_flexion(f, "right") or 0, 1),
            "knee_valgus": round(_knee_valgus(f, "right") or 0, 1),
            "trunk_lean": round(_trunk_forward_lean(f) or 0, 1),
            "trunk_lateral": round(_trunk_lateral_lean(f) or 0, 1),
            "com_y": round(_com_y(f) or 0, 3),
        })
    return out


def extract_features(
    pose: PoseResult,
    trajectories: list[traj.JointTrajectory],
    phases: list[phd.ActionPhase],
    action_type: ActionType,
) -> BiomechanicsFeatures:
    """提取全部生物力学特征。"""
    frames = _smooth_frames(pose.frames)
    fps = pose.fps or 30.0
    n = len(frames)

    ic_rng = phd.frames_in_phase(phases, PhaseType.INITIAL_CONTACT)
    land_rng = phd.frames_in_phase(phases, PhaseType.LANDING)
    flight_rng = phd.frames_in_phase(phases, PhaseType.FLIGHT)

    # ---- 膝关节 ----
    def _series_knee(side: str) -> list[float]:
        out = []
        for f in frames:
            a = _knee_flexion(f, side)
            out.append(a if a is not None else 180.0)
        return out

    left_knee = _series_knee("left")
    right_knee = _series_knee("right")

    ic_idx = (ic_rng[0] if ic_rng else (land_rng[0] if land_rng else 0))
    ic_idx = min(ic_idx, n - 1)

    ic_flex_l = 180.0 - left_knee[ic_idx]      # 屈曲量(180-角度)
    ic_flex_r = 180.0 - right_knee[ic_idx]
    ic_flex = min((ic_flex_l + ic_flex_r) / 2, 90.0)   # clip 生理范围

    max_flex_l = 180.0 - min(left_knee)
    max_flex_r = 180.0 - min(right_knee)
    max_flex = min((max_flex_l + max_flex_r) / 2, 90.0)  # clip

    # 膝内扣(取落地阶段最大内扣)
    valgus_series = []
    for f in frames:
        vl = _knee_valgus(f, "left")
        vr = _knee_valgus(f, "right")
        vals = [v for v in (vl, vr) if v is not None]
        valgus_series.append(max(vals) if vals else 0.0)
    valgus_max = min(max(valgus_series) if valgus_series else 0.0, 25.0)   # clip

    # 膝角速度(落地阶段, 先平滑避免关键点抖动产生虚假高值)
    knee_arr = np.asarray(left_knee)
    knee_smooth = np.convolve(knee_arr, np.ones(5) / 5, mode="same") if len(knee_arr) >= 5 else knee_arr
    kvel = min(float(np.max(np.abs(np.diff(knee_smooth))) * fps) if len(knee_smooth) > 1 else 0.0, 400.0)

    # 左右膝屈曲差
    lr_diff = min(float(np.mean(np.abs(np.asarray(left_knee) - np.asarray(right_knee)))), 30.0)

    # 膝-脚尖对齐(落地阶段膝盖与脚尖 x 偏移)
    k2t = []
    for f in frames:
        for side in ("left", "right"):
            k = _kp(f, f"{side}_knee")
            t = _kp(f, f"{side}_foot_index")
            if k is not None and t is not None:
                k2t.append(abs(k[0] - t[0]))
    k2t_deg = float(np.degrees(np.arctan2(np.mean(k2t) if k2t else 0.0, 0.1))) if k2t else 0.0

    knee = KneeFeatures(
        initial_contact_flexion_deg=round(ic_flex, 1),
        max_flexion_deg=round(max_flex, 1),
        valgus_deg=round(valgus_max, 1),
        lateral_displacement=round(float(np.mean(k2t)) if k2t else 0.0, 4),
        angular_velocity=round(kvel, 1),
        left_right_diff_deg=round(lr_diff, 1),
        knee_toe_alignment_deg=round(k2t_deg, 1),
    )

    # ---- 髋关节 ----
    hip_flex = []
    for f in frames:
        a = _hip_flexion(f, "left")
        if a is not None:
            hip_flex.append(180.0 - a)
    # 髋屈曲取落地缓冲阶段最大值(代表落地时髋屈曲程度, 避免站立帧拉低均值)
    if hip_flex:
        if land_rng:
            f0, f1 = land_rng
            seg = hip_flex[f0:min(f1 + 1, len(hip_flex))]
            hip_flex_deg = min(float(max(seg)) if seg else float(max(hip_flex)), 90.0)
        else:
            hip_flex_deg = min(float(max(hip_flex)), 90.0)
    else:
        hip_flex_deg = 0.0

    # 髋内收/外展(左右髋 x 差)
    adduct = []
    for f in frames:
        lh = _kp(f, "left_hip")
        rh = _kp(f, "right_hip")
        if lh is not None and rh is not None:
            adduct.append(lh[0] - rh[0])
    adduct_deg = float(np.degrees(np.arctan2(np.std(adduct) if adduct else 0.0, 0.2))) if adduct else 0.0

    # 左右髋高度差(落地阶段)
    lr_hip_diff = []
    for f in frames:
        lh = _kp(f, "left_hip")
        rh = _kp(f, "right_hip")
        if lh is not None and rh is not None:
            lr_hip_diff.append(abs(lh[1] - rh[1]))
    lr_hip_diff_val = float(np.mean(lr_hip_diff)) if lr_hip_diff else 0.0

    pelvic = [_pelvic_tilt(f) for f in frames]
    pelvic = [p for p in pelvic if p is not None]
    pelvic_tilt = float(np.mean(pelvic)) if pelvic else 0.0

    # 髋部稳定性(重心横向波动倒数, 侧视图x波动大需宽容)
    com_xs = []
    for f in frames:
        lh = _kp(f, "left_hip")
        rh = _kp(f, "right_hip")
        if lh is not None and rh is not None:
            com_xs.append((lh[0] + rh[0]) / 2)
    hip_stab = float(np.clip(1.0 - np.std(com_xs) * 8, 0.3, 1.0)) if com_xs else 0.5

    hip = HipFeatures(
        flexion_deg=round(hip_flex_deg, 1),
        adduction_deg=round(adduct_deg, 1),
        left_right_height_diff=round(lr_hip_diff_val, 4),
        pelvic_tilt_deg=round(pelvic_tilt, 1),
        stability=round(hip_stab, 2),
    )

    # ---- 踝关节 ----
    ankle_df = []
    for f in frames:
        a = _ankle_dorsiflexion(f, "left")
        if a is not None:
            ankle_df.append(180.0 - a)
    ankle_df_deg = float(np.mean(ankle_df)) if ankle_df else 0.0

    # 足部落地方向(脚尖与踝 x 偏移角度)
    foot_dir = []
    for f in frames:
        for side in ("left", "right"):
            a = _kp(f, f"{side}_ankle")
            t = _kp(f, f"{side}_foot_index")
            if a is not None and t is not None:
                foot_dir.append(np.degrees(np.arctan2(abs(t[1] - a[1]), abs(t[0] - a[0]) + 1e-6)))
    foot_dir_deg = float(np.mean(foot_dir)) if foot_dir else 0.0

    # 踝晃动(落地阶段踝速度的变异系数, 归一化避免绝对值过大)
    la_traj = traj.get_joint(trajectories, "left_ankle")
    ra_traj = traj.get_joint(trajectories, "right_ankle")
    ankle_sway = 0.0
    if la_traj and ra_traj:
        lv = np.asarray([p.v for p in la_traj.points])
        rv = np.asarray([p.v for p in ra_traj.points])
        if land_rng:
            f0, f1 = land_rng
            lv = lv[f0:min(f1 + 1, len(lv))]
            rv = rv[f0:min(f1 + 1, len(rv))]
        # 变异系数 = 标准差 / 均值, 归一化
        sway_l = float(np.std(lv) / (np.mean(lv) + 1e-6)) if len(lv) else 0.0
        sway_r = float(np.std(rv) / (np.mean(rv) + 1e-6)) if len(rv) else 0.0
        ankle_sway = (sway_l + sway_r) / 2

    # 左右脚触地时间差(腾空→触地时左右踝速度差异最大的帧间隔)
    lr_contact_diff = 0.0
    if la_traj and ra_traj and flight_rng:
        f0, f1 = flight_rng
        lv = np.asarray([p.v for p in la_traj.points[f0:f1 + 1]])
        rv = np.asarray([p.v for p in ra_traj.points[f0:f1 + 1]])
        if len(lv) and len(rv):
            lr_contact_diff = float(abs(np.argmax(lv) - np.argmax(rv)) / fps * 1000)

    # 足部稳定时间(触地后踝速度降到阈值以下的时间)
    stab_time = 0.0
    if la_traj and land_rng:
        f0 = land_rng[0]
        lv = np.asarray([p.v for p in la_traj.points[f0:]]) * fps
        for i, v in enumerate(lv):
            if v < 0.05:
                stab_time = min(i / fps * 1000, 1500.0)
                break

    ankle = AnkleFeatures(
        dorsiflexion_deg=round(ankle_df_deg, 1),
        foot_landing_direction_deg=round(foot_dir_deg, 1),
        left_right_contact_time_diff_ms=round(lr_contact_diff, 1),
        ankle_sway_deg=round(ankle_sway, 2),
        stabilization_time_ms=round(stab_time, 1),
    )

    # ---- 躯干 ----
    # 前倾只评估落地缓冲阶段(准备阶段找球前倾是正常技术动作, 不算风险)
    lean_all = [_trunk_forward_lean(f) for f in frames]
    if land_rng:
        f0, f1 = land_rng
        lean = lean_all[f0:min(f1 + 1, len(lean_all))]
    else:
        lean = lean_all
    lean = [x for x in lean if x is not None]
    fwd_lean = min(float(np.mean(lean)) if lean else 0.0, 45.0)

    lat = [_trunk_lateral_lean(f) for f in frames]
    lat = [x for x in lat if x is not None]
    lat_lean = min(float(np.max(lat)) if lat else 0.0, 30.0)

    # 肩髋轴线偏差
    sh = []
    for f in frames:
        ls = _kp(f, "left_shoulder")
        rs = _kp(f, "right_shoulder")
        lh = _kp(f, "left_hip")
        rh = _kp(f, "right_hip")
        if all(x is not None for x in (ls, rs, lh, rh)):
            sh_ang = np.degrees(np.arctan2(abs((rs[1] - ls[1])), abs(rs[0] - ls[0]) + 1e-6))
            hip_ang = np.degrees(np.arctan2(abs((rh[1] - lh[1])), abs(rh[0] - lh[0]) + 1e-6))
            sh.append(abs(sh_ang - hip_ang))
    sh_dev = float(np.mean(sh)) if sh else 0.0

    # 重心横向偏移
    com_x = []
    for f in frames:
        lh = _kp(f, "left_hip")
        rh = _kp(f, "right_hip")
        if lh is not None and rh is not None:
            com_x.append((lh[0] + rh[0]) / 2)
    com_lat = float(np.std(com_x)) if com_x else 0.0

    trunk = TrunkFeatures(
        forward_lean_deg=round(fwd_lean, 1),
        lateral_lean_deg=round(lat_lean, 1),
        shoulder_hip_axis_deviation_deg=round(sh_dev, 1),
        com_lateral_displacement=round(com_lat, 4),
        upper_rotation_deg=0.0,   # 2D 估计近似为 0
    )

    # ---- 整体 ----
    com_ys = [_com_y(f) for f in frames]
    com_ys = [y for y in com_ys if y is not None]
    if com_ys and land_rng:
        buffer_ms = min((land_rng[1] - land_rng[0]) / fps * 1000, 1500.0)
        com_drop = abs(max(com_ys) - min(com_ys))
    else:
        buffer_ms = 0.0
        com_drop = 0.0

    action_dur = n / fps * 1000 if n else 0.0

    # 左右不对称(膝屈曲差归一化)
    asym = float(np.clip(lr_diff / 30.0, 0.0, 1.0))

    # 一致性(多次动作时序方差倒数, 单次默认较高)
    consistency = 0.85

    # 疲劳变化(单次视频无法计算, 默认 0)
    fatigue_change = 0.0

    overall = OverallFeatures(
        landing_buffer_time_ms=round(buffer_ms, 1),
        com_drop_distance=round(com_drop, 4),
        action_duration_ms=round(action_dur, 1),
        bilateral_asymmetry=round(asym, 2),
        stabilization_time_ms=round(stab_time, 1),
        consistency=round(consistency, 2),
        fatigue_change=round(fatigue_change, 2),
    )

    return BiomechanicsFeatures(knee=knee, hip=hip, ankle=ankle, trunk=trunk, overall=overall)


def identify_problem_moments(pose, fps: float = 30.0, land_rng=None) -> list[dict]:
    """识别视频中问题最严重的时刻, 返回 [{frame, timestamp, issue, value, desc}]。
    用于截取问题片段供运动员回放。
    """
    moments = []
    frames = pose.frames
    n = len(frames)
    if n == 0:
        return moments

    # 1. 膝内扣最大的帧
    valgus_series = []
    for f in frames:
        vl = _knee_valgus(f, "left")
        vr = _knee_valgus(f, "right")
        vals = [v for v in (vl, vr) if v is not None]
        valgus_series.append(max(vals) if vals else 0.0)
    if valgus_series:
        idx = int(np.argmax(valgus_series))
        v = min(valgus_series[idx], 25.0)
        if v > 8:
            moments.append({"frame": idx, "timestamp": round(idx / fps, 2),
                            "issue": "膝内扣", "value": round(v, 1),
                            "desc": f"膝关节内扣 {v:.1f}°，落地时膝盖向内塌陷"})

    # 2. 躯干侧倾最大的帧
    lat = [(_trunk_lateral_lean(f) or 0.0) for f in frames]
    if lat:
        idx = int(np.argmax(lat))
        v = min(lat[idx], 30.0)
        if v > 12:
            moments.append({"frame": idx, "timestamp": round(idx / fps, 2),
                            "issue": "躯干侧倾", "value": round(v, 1),
                            "desc": f"躯干侧倾 {v:.1f}°，身体明显歪斜"})

    # 3. 躯干前倾 — 篮球中前倾常见(捡球/找球/防守), 阶段划分难区分, 不单独截取问题时刻
    #    (前倾风险评分仍保留, 见 risk_assessment.assess_trunk, 阈值 38°)

    # 4. 落地冲击(踝速度突变最大的帧)
    speeds = []
    for i in range(1, n):
        a = _kp(frames[i - 1], "left_ankle")
        b = _kp(frames[i], "left_ankle")
        if a is not None and b is not None:
            speeds.append((i, ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5))
    if speeds:
        idx, v = max(speeds, key=lambda t: t[1])
        if v > 0.04:
            moments.append({"frame": idx, "timestamp": round(idx / fps, 2),
                            "issue": "落地冲击", "value": round(v * 100, 1),
                            "desc": "落地瞬间踝部速度突变，冲击较大"})

    # 5. 重心最低点(落地缓冲关键时刻)
    com_ys = [(_com_y(f), i) for i, f in enumerate(frames)]
    com_ys = [(y, i) for y, i in com_ys if y is not None]
    if com_ys:
        _, idx = max(com_ys, key=lambda t: t[0])
        moments.append({"frame": idx, "timestamp": round(idx / fps, 2),
                        "issue": "落地时刻", "value": round(idx / fps, 1),
                        "desc": "身体重心最低点，落地缓冲最关键瞬间"})

    # 去重: 相近帧(间隔<10帧)合并
    moments.sort(key=lambda m: m["frame"])
    uniq: list[dict] = []
    for m in moments:
        if uniq and m["frame"] - uniq[-1]["frame"] < 10:
            continue
        uniq.append(m)
    return uniq[:5]
