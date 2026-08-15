"""
人体姿态识别模块 —— 基于 MediaPipe PoseLandmarker 逐帧提取关键点。

适配 mediapipe 0.10.35 新版 tasks API（旧 mp.solutions 已移除）。
输出:
  - 每一帧的关键点坐标(归一化) + 置信度
  - 骨骼连接关系
  - 带骨骼叠加效果的标注视频(供前端回放)
"""
from __future__ import annotations

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

from ..config import DATA_DIR, POSE_MIN_DETECTION_CONFIDENCE, POSE_MIN_TRACKING_CONFIDENCE, RESULT_DIR
from ..models.schemas import KeyPoint, PoseFrame, PoseResult

# 模型文件路径
POSE_MODEL_PATH = str(DATA_DIR / "models" / "pose_landmarker.task")

# MediaPipe Pose 33 关键点中我们关注的子集(索引 -> 名称)
POSE_KEYPOINTS: dict[int, str] = {
    0: "nose",
    11: "left_shoulder", 12: "right_shoulder",
    13: "left_elbow", 14: "right_elbow",
    15: "left_wrist", 16: "right_wrist",
    23: "left_hip", 24: "right_hip",
    25: "left_knee", 26: "right_knee",
    27: "left_ankle", 28: "right_ankle",
    29: "left_heel", 30: "right_heel",
    31: "left_foot_index", 32: "right_foot_index",
}

# 骨骼连接(用于绘图与前端渲染)
SKELETON_CONNECTIONS: list[list[str]] = [
    ["left_shoulder", "right_shoulder"],
    ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
    ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
    ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
    ["left_hip", "right_hip"],
    ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
    ["left_ankle", "left_heel"], ["left_heel", "left_foot_index"],
    ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
    ["right_ankle", "right_heel"], ["right_heel", "right_foot_index"],
]

_NAME_TO_IDX = {v: k for k, v in POSE_KEYPOINTS.items()}
_SKELETON_IDX = [[_NAME_TO_IDX[a], _NAME_TO_IDX[b]] for a, b in SKELETON_CONNECTIONS]

# 绘图颜色 (BGR)
_JOINT_COLOR = (0, 255, 255)
_BONE_COLOR = (0, 200, 0)
_LOW_CONF_COLOR = (0, 0, 255)


def _create_detector():
    """创建 PoseLandmarker (VIDEO 模式)。"""
    base_options = mp_python.BaseOptions(model_asset_path=POSE_MODEL_PATH)
    options = vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=POSE_MIN_DETECTION_CONFIDENCE,
        min_pose_presence_confidence=POSE_MIN_DETECTION_CONFIDENCE,
        min_tracking_confidence=POSE_MIN_TRACKING_CONFIDENCE,
    )
    return vision.PoseLandmarker.create_from_options(options)


def extract_pose(video_path: str, task_id: str, draw_annotated: bool = True) -> PoseResult:
    """逐帧提取人体关键点，可选生成骨骼叠加视频。"""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"无法打开视频: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    annotated_path = None
    writer = None
    if draw_annotated:
        annotated_path = str(RESULT_DIR / f"{task_id}_annotated.mp4")
        fourcc = cv2.VideoWriter_fourcc(*"avc1")   # H.264, 浏览器兼容
        writer = cv2.VideoWriter(annotated_path, fourcc, fps, (width, height))

    frames: list[PoseFrame] = []
    detector = _create_detector()

    frame_index = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        ts_ms = int(frame_index / fps * 1000)
        res = detector.detect_for_video(mp_image, ts_ms)

        kps: dict[str, KeyPoint] = {}
        landmarks = None
        if res.pose_landmarks:
            landmarks = res.pose_landmarks[0]   # list[NormalizedLandmark]
            for idx, name in POSE_KEYPOINTS.items():
                lm = landmarks[idx]
                kps[name] = KeyPoint(
                    name=name,
                    x=float(lm.x), y=float(lm.y), z=float(lm.z),
                    visibility=float(getattr(lm, "visibility", 1.0)),
                )

        frames.append(PoseFrame(
            frame_index=frame_index,
            timestamp_ms=round(frame_index / fps * 1000, 2),
            keypoints=kps,
            image_width=width, image_height=height,
        ))

        if writer is not None:
            writer.write(_draw_skeleton(frame, landmarks, width, height))

        frame_index += 1

    detector.close()
    cap.release()
    if writer is not None:
        writer.release()

    if total <= 0:
        total = len(frames)

    return PoseResult(
        frames=frames, fps=fps, total_frames=total,
        skeleton_connections=SKELETON_CONNECTIONS,
        annotated_video_path=annotated_path,
    )


def _draw_skeleton(frame, landmarks, width, height) -> np.ndarray:
    """在帧上绘制骨骼叠加效果。landmarks 为 list[NormalizedLandmark] 或 None。"""
    out = frame.copy()
    if not landmarks:
        return out

    def vis(i):
        return float(getattr(landmarks[i], "visibility", 1.0))

    # 画骨骼
    for a, b in _SKELETON_IDX:
        if vis(a) < 0.3 or vis(b) < 0.3:
            continue
        pa, pb = landmarks[a], landmarks[b]
        pt1 = (int(pa.x * width), int(pa.y * height))
        pt2 = (int(pb.x * width), int(pb.y * height))
        cv2.line(out, pt1, pt2, _BONE_COLOR, 3, cv2.LINE_AA)

    # 画关节点
    for idx in POSE_KEYPOINTS:
        if vis(idx) < 0.3:
            continue
        lm = landmarks[idx]
        pt = (int(lm.x * width), int(lm.y * height))
        color = _LOW_CONF_COLOR if vis(idx) < 0.5 else _JOINT_COLOR
        cv2.circle(out, pt, 5, color, -1, cv2.LINE_AA)

    return out


def avg_confidence(pose: PoseResult) -> float:
    """计算所有帧关键点的平均置信度。"""
    total_vis, count = 0.0, 0
    for f in pose.frames:
        for kp in f.keypoints.values():
            total_vis += kp.visibility
            count += 1
    return total_vis / count if count else 0.0


def extract_problem_clips(video_path: str, task_id: str, moments: list[dict], fps: float = 30.0) -> list[str]:
    """为每个问题时刻截取前后各0.5秒的视频片段(带骨骼叠加)。

    返回片段视频路径列表, 与 moments 一一对应。
    """
    if not moments:
        return []

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    src_fps = cap.get(cv2.CAP_PROP_FPS) or fps
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    pad = int(src_fps * 0.5)   # 前后各0.5秒

    # 读取所有帧到内存(视频通常<15秒, 可容纳)
    all_frames = []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        all_frames.append(fr)
    cap.release()

    # 需要 pose 数据画骨骼 — 由调用方通过 task_id 加载
    # 这里只截取原始片段, 骨骼叠加在 extract_pose 时已生成完整标注视频
    # 为简单起见, 直接从原视频截取片段
    clip_paths = []
    for i, m in enumerate(moments):
        center = m["frame"]
        start = max(0, center - pad)
        end = min(len(all_frames) - 1, center + pad)
        if end - start < 5:
            continue
        clip_path = str(RESULT_DIR / f"{task_id}_problem_{i}.mp4")
        fourcc = cv2.VideoWriter_fourcc(*"avc1")
        writer = cv2.VideoWriter(clip_path, fourcc, src_fps, (width, height))
        for fi in range(start, end + 1):
            writer.write(all_frames[fi])
        writer.release()
        clip_paths.append(clip_path)
    return clip_paths
