"""应用配置"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# 数据目录
DATA_DIR = BASE_DIR / "backend" / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
RESULT_DIR = DATA_DIR / "results"
SAMPLE_DIR = DATA_DIR / "samples"

for d in (UPLOAD_DIR, RESULT_DIR, SAMPLE_DIR):
    d.mkdir(parents=True, exist_ok=True)

# MediaPipe Pose 配置
POSE_MODEL_COMPLEXITY = 1          # 0=轻量 1=中等 2=重
POSE_MIN_DETECTION_CONFIDENCE = 0.5
POSE_MIN_TRACKING_CONFIDENCE = 0.5

# 视频限制
MAX_VIDEO_DURATION_SEC = 20
MIN_VIDEO_DURATION_SEC = 3
MAX_VIDEO_SIZE_MB = 100
SUPPORTED_VIDEO_FORMATS = {".mp4", ".mov", ".avi", ".webm", ".m4v"}

# 分析参数
SMOOTH_WINDOW_LENGTH = 7           # Savitzky-Golay 窗口（奇数）
SMOOTH_POLYORDER = 2

# 风险阈值（来自运动医学文献的启发式阈值，详见 risk_assessment.py）
RISK_LOW_THRESHOLD = 35            # <35 低风险
RISK_HIGH_THRESHOLD = 65           # >65 高风险

# CORS
CORS_ORIGINS = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]
