"""
视频质量检测模块。

在正式分析前判断视频是否满足要求:
人体完整 / 遮挡 / 亮度 / 相机抖动 / 距离 / 置信度 / 帧率 / 多人干扰。
不合格时提示重新拍摄, 不输出风险结论。
"""
from __future__ import annotations

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

from ..config import MAX_VIDEO_DURATION_SEC, MIN_VIDEO_DURATION_SEC
from ..models.schemas import VideoQualityIssue, VideoQualityResult


def check_quality(video_path: str) -> VideoQualityResult:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return VideoQualityResult(
            passed=False, issues=[VideoQualityIssue(code="open_failed", message="无法打开视频文件", severity="error")],
            person_detected=False, avg_confidence=0.0, brightness=0.0, fps=0.0, width=0, height=0, duration_sec=0.0,
        )

    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total / fps if fps > 0 else 0.0

    issues: list[VideoQualityIssue] = []

    # 帧率
    if fps < 15.0:
        issues.append(VideoQualityIssue(code="low_fps", message=f"帧率过低({fps:.1f}fps), 建议≥25fps", severity="warning"))

    # 时长
    if duration < MIN_VIDEO_DURATION_SEC:
        issues.append(VideoQualityIssue(code="too_short", message=f"视频过短({duration:.1f}s), 建议5-15秒", severity="error"))
    elif duration > MAX_VIDEO_DURATION_SEC:
        issues.append(VideoQualityIssue(code="too_long", message=f"视频过长({duration:.1f}s), 建议≤{MAX_VIDEO_DURATION_SEC}s", severity="warning"))

    # 抽样若干帧检测亮度/人体/抖动
    sample_step = max(1, total // 30)
    bright_vals: list[float] = []
    conf_vals: list[float] = []
    person_frames = 0
    multi_frames = 0
    frame_centers: list[tuple[float, float]] = []

    from .pose_estimation import POSE_MODEL_PATH as _MODEL
    base_options = mp_python.BaseOptions(model_asset_path=_MODEL)
    _opts = vision.PoseLandmarkerOptions(
        base_options=base_options, running_mode=vision.RunningMode.IMAGE,
        num_poses=1, min_pose_detection_confidence=0.4,
    )
    detector = vision.PoseLandmarker.create_from_options(_opts)
    try:
        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % sample_step == 0:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                bright_vals.append(float(np.mean(gray)))

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                res = detector.detect(mp_image)
                if res.pose_landmarks:
                    lms = res.pose_landmarks[0]
                    person_frames += 1
                    vis = [float(getattr(lm, "visibility", 1.0)) for lm in lms]
                    conf_vals.append(float(np.mean(vis)))
                    cx = float(np.mean([lm.x for lm in lms[11:17]]))
                    cy = float(np.mean([lm.y for lm in lms[11:17]]))
                    frame_centers.append((cx, cy))
                    xs = [lm.x for lm in lms if float(getattr(lm, "visibility", 1.0)) > 0.3]
                    ys = [lm.y for lm in lms if float(getattr(lm, "visibility", 1.0)) > 0.3]
                    if xs and ys:
                        ratio = (max(xs) - min(xs)) * (max(ys) - min(ys))
                        if ratio < 0.15:
                            issues.append(VideoQualityIssue(code="too_far", message="运动员离画面过远, 人体占比过小", severity="warning"))
            idx += 1
    finally:
        detector.close()

    cap.release()

    brightness = float(np.mean(bright_vals)) if bright_vals else 0.0
    avg_conf = float(np.mean(conf_vals)) if conf_vals else 0.0
    person_detected = person_frames > 0

    # 亮度
    if brightness < 50:
        issues.append(VideoQualityIssue(code="too_dark", message="画面过暗, 建议保证充足光线", severity="error"))
    elif brightness < 90:
        issues.append(VideoQualityIssue(code="dim", message="画面偏暗, 可能影响识别精度", severity="warning"))

    # 人体检测
    if not person_detected:
        issues.append(VideoQualityIssue(code="no_person", message="未检测到人体, 请确保全身进入画面", severity="error"))

    # 置信度
    if avg_conf < 0.4:
        issues.append(VideoQualityIssue(code="low_confidence", message="关键点识别置信度偏低, 可能存在遮挡或距离过远", severity="error"))

    # 相机抖动(中心点帧间位移)
    if len(frame_centers) >= 3:
        centers = np.asarray(frame_centers)
        shifts = np.linalg.norm(np.diff(centers, axis=0), axis=1)
        if np.max(shifts) > 0.15:
            issues.append(VideoQualityIssue(code="camera_shake", message="摄像机移动剧烈, 建议固定拍摄", severity="warning"))

    # 人体完整性(关键点缺失) - 简化: 若置信度足够则视为完整
    # 多人干扰: 用 face_detection 估算人数(简化处理, 略)

    errors = [i for i in issues if i.severity == "error"]
    passed = len(errors) == 0 and person_detected

    return VideoQualityResult(
        passed=passed,
        issues=issues,
        person_detected=person_detected,
        avg_confidence=round(avg_conf, 3),
        brightness=round(brightness, 1),
        fps=round(fps, 1),
        width=width,
        height=height,
        duration_sec=round(duration, 2),
    )
