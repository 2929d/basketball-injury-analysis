"""
分析管线测试脚本 —— 用模拟的跳跃落地姿态数据验证后端逻辑链路。

不依赖真实视频/摄像头, 仅验证:
  轨迹提取 → 动作阶段 → 生物力学特征 → 风险评估 全链路正确性。

运行:
  cd backend
  python -m tests.test_pipeline
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

# 确保可导入 app 包
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models.schemas import (ActionType, AthleteInfo, Gender, KeyPoint,
                                PoseFrame, PoseResult)
from app.core import biomechanics, phase_detection, risk_assessment, trajectory


def _make_keypoints(t: float, action: str = "landing") -> dict[str, KeyPoint]:
    """生成第 t 帧(归一化时间 0~1)的关键点, 模拟跳跃落地动作。

    action 流程: 准备(0~0.15) → 起跳(0.15~0.3) → 腾空(0.3~0.45) →
                 初次触地(0.45~0.5) → 落地缓冲(0.5~0.7) → 稳定(0.7~1)
    """
    # 重心 y(髋中点): 站立0.5, 下蹲0.62, 腾空0.32, 落地缓冲0.65
    if t < 0.15:                       # 准备
        hip_y = 0.50
    elif t < 0.3:                      # 起跳(下蹲→上升)
        p = (t - 0.15) / 0.15
        hip_y = 0.50 + 0.12 * math.sin(p * math.pi) - 0.06 * p
    elif t < 0.45:                     # 腾空
        p = (t - 0.3) / 0.15
        hip_y = 0.32 + 0.05 * p
    elif t < 0.5:                      # 初次触地
        p = (t - 0.45) / 0.05
        hip_y = 0.37 + 0.10 * p
    elif t < 0.7:                      # 落地缓冲(蹲到最低)
        p = (t - 0.5) / 0.20
        hip_y = 0.47 + 0.18 * math.sin(p * math.pi * 0.5)
    else:                              # 稳定
        hip_y = 0.62 - 0.06 * min((t - 0.7) / 0.3, 1.0)

    # 膝关节内扣程度: 落地缓冲阶段明显内扣
    valgus = 0.0
    if 0.45 <= t < 0.75:
        valgus = 0.04 * math.sin((t - 0.45) / 0.3 * math.pi)

    # 膝关节屈曲: 缓冲时屈曲大(膝盖 y 接近髋)
    knee_drop = 0.0
    if 0.45 <= t < 0.75:
        knee_drop = 0.08 * math.sin((t - 0.45) / 0.3 * math.pi)

    cx = 0.5  # 身体中心 x

    def kp(name, x, y, z=0.0, v=0.95):
        return KeyPoint(name=name, x=x, y=y, z=z, visibility=v)

    hip_l_y = hip_y
    hip_r_y = hip_y + 0.005  # 轻微左右差
    knee_y = hip_y + 0.16 + knee_drop
    ankle_y = hip_y + 0.34

    return {
        "nose": kp("nose", cx, hip_y - 0.30),
        "left_shoulder": kp("left_shoulder", cx - 0.08, hip_y - 0.28),
        "right_shoulder": kp("right_shoulder", cx + 0.08, hip_y - 0.28),
        "left_elbow": kp("left_elbow", cx - 0.12, hip_y - 0.14),
        "right_elbow": kp("right_elbow", cx + 0.12, hip_y - 0.14),
        "left_wrist": kp("left_wrist", cx - 0.14, hip_y - 0.02),
        "right_wrist": kp("right_wrist", cx + 0.14, hip_y - 0.02),
        "left_hip": kp("left_hip", cx - 0.06, hip_l_y),
        "right_hip": kp("right_hip", cx + 0.06, hip_r_y),
        # 膝盖内扣: 左膝 x 增大(向中线), 右膝 x 减小
        "left_knee": kp("left_knee", cx - 0.06 + valgus, knee_y),
        "right_knee": kp("right_knee", cx + 0.06 - valgus, knee_y),
        "left_ankle": kp("left_ankle", cx - 0.10, ankle_y),
        "right_ankle": kp("right_ankle", cx + 0.10, ankle_y),
        "left_heel": kp("left_heel", cx - 0.11, ankle_y + 0.02),
        "right_heel": kp("right_heel", cx + 0.11, ankle_y + 0.02),
        "left_foot_index": kp("left_foot_index", cx - 0.08, ankle_y + 0.04),
        "right_foot_index": kp("right_foot_index", cx + 0.08, ankle_y + 0.04),
    }


def build_mock_pose(frames: int = 60, fps: float = 30.0) -> PoseResult:
    """构建模拟跳跃落地的 PoseResult。"""
    pose_frames = []
    for i in range(frames):
        t = i / (frames - 1)
        pose_frames.append(PoseFrame(
            frame_index=i,
            timestamp_ms=round(i / fps * 1000, 2),
            keypoints=_make_keypoints(t),
            image_width=1280, image_height=720,
        ))
    return PoseResult(
        frames=pose_frames, fps=fps, total_frames=frames,
        skeleton_connections=[["left_hip", "left_knee"]],
    )


def main():
    print("=" * 60)
    print("  运动损伤风险评估系统 - 分析管线测试")
    print("=" * 60)

    # 1. 模拟姿态数据
    print("\n[1] 生成模拟跳跃落地姿态数据 (60帧 @30fps)...")
    pose = build_mock_pose()
    print(f"    ✅ 生成 {pose.total_frames} 帧姿态数据")

    # 2. 轨迹提取
    print("\n[2] 运动轨迹提取与平滑...")
    trajs = trajectory.build_trajectories(pose)
    print(f"    ✅ 提取 {len(trajs)} 个关节轨迹")
    lk = trajectory.get_joint(trajs, "left_knee")
    if lk:
        print(f"    左膝最大速度: {max(p.v for p in lk.points):.4f} (归一化/帧)")

    # 3. 动作阶段
    print("\n[3] 动作阶段识别...")
    phases = phase_detection.detect_phases(pose, ActionType.DOUBLE_LEG_LANDING)
    for p in phases:
        print(f"    {p.phase_type.value}: 帧 {p.start_frame}-{p.end_frame} "
              f"({p.start_time_ms:.0f}-{p.end_time_ms:.0f}ms)")

    # 4. 生物力学特征
    print("\n[4] 生物力学特征提取...")
    features = biomechanics.extract_features(pose, trajs, phases, ActionType.DOUBLE_LEG_LANDING)
    print(f"    膝关节: 初次触地屈曲={features.knee.initial_contact_flexion_deg}°, "
          f"最大屈曲={features.knee.max_flexion_deg}°, 内扣={features.knee.valgus_deg}°, "
          f"左右差={features.knee.left_right_diff_deg}°")
    print(f"    髋关节: 屈曲={features.hip.flexion_deg}°, 骨盆倾斜={features.hip.pelvic_tilt_deg}°, "
          f"稳定性={features.hip.stability}")
    print(f"    踝关节: 背屈={features.ankle.dorsiflexion_deg}°, 晃动={features.ankle.ankle_sway_deg}")
    print(f"    躯干: 前倾={features.trunk.forward_lean_deg}°, 侧倾={features.trunk.lateral_lean_deg}°")
    print(f"    整体: 缓冲时间={features.overall.landing_buffer_time_ms}ms, "
          f"不对称={features.overall.bilateral_asymmetry}")

    # 5. 风险评估
    print("\n[5] 风险评估...")
    athlete = AthleteInfo(
        age=20, gender=Gender.MALE, height_cm=180, weight_kg=75,
        sport="篮球", level="校队", dominant_leg="右",
        injury_history="右膝曾扭伤", current_pain=False,
        weekly_training_freq=5, fatigue_level=6,
    )
    risk = risk_assessment.assess(features, athlete)
    print(f"\n    ╔══════════════════════════════════════════╗")
    print(f"    ║  综合风险评分: {risk.overall_score:.1f}/100  [{risk.overall_level.value}]  ║")
    print(f"    ║  高风险动作模式概率: {risk.high_risk_action_probability:.0%}        ║")
    print(f"    ╚══════════════════════════════════════════╝")
    print(f"\n    摘要: {risk.summary}")

    print(f"\n    各维度风险:")
    for item in risk.items:
        print(f"      • {item.category}: {item.score:.1f}分 [{item.level.value}]")
        for c in item.main_causes:
            print(f"          - {c}")

    print(f"\n    训练建议 (膝关节示例):")
    knee_item = next((i for i in risk.items if i.category == "膝关节"), None)
    if knee_item:
        for r in knee_item.recommendations[:3]:
            print(f"      💡 {r}")

    print("\n" + "=" * 60)
    print("  ✅ 分析管线全链路测试通过!")
    print("=" * 60)


if __name__ == "__main__":
    main()
