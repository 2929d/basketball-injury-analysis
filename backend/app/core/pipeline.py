"""
分析编排管线。

串联: 视频质量检测 → 姿态识别 → 轨迹提取 → 动作阶段 → 生物力学特征 → 风险评估
带任务状态管理与进度回调, 供 API 层轮询。
分析结果持久化到文件, 后端重启后可恢复历史结果。
"""
from __future__ import annotations

import threading
import traceback
from datetime import datetime
from typing import Callable

from ..config import RESULT_DIR
from ..models.schemas import (
    ActionType, AnalysisProgress, AnalysisResult, AthleteInfo,
)
from . import biomechanics, phase_detection, pose_estimation, risk_assessment, trajectory, video_quality

# 全局任务存储(内存, 重启会清空, 但结果已持久化到文件)
TASKS: dict[str, AnalysisProgress] = {}
_LOCK = threading.Lock()


# ---------- 结果持久化 ----------
def _result_path(task_id: str):
    return RESULT_DIR / f"{task_id}_result.json"


def _save_result(task_id: str, result: AnalysisResult):
    """把分析结果存到 JSON 文件, 供重启后恢复。"""
    try:
        _result_path(task_id).write_text(result.model_dump_json(), encoding="utf-8")
    except Exception:
        pass


def _load_result(task_id: str) -> AnalysisResult | None:
    """从 JSON 文件加载分析结果(后端重启后用)。"""
    p = _result_path(task_id)
    if not p.exists():
        return None
    try:
        return AnalysisResult.model_validate_json(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def _update(task_id: str, status: str, progress: int, message: str):
    with _LOCK:
        cur = TASKS.get(task_id)
        if cur:
            cur.status = status
            cur.progress = progress
            cur.message = message


def get_progress(task_id: str) -> AnalysisProgress | None:
    """获取进度: 优先内存, 内存无则从持久化文件恢复。"""
    with _LOCK:
        p = TASKS.get(task_id)
        if p:
            return p
    # 内存无, 尝试从文件加载(后端重启场景)
    r = _load_result(task_id)
    if r:
        prog = AnalysisProgress(
            task_id=task_id, status="done", progress=100,
            message="分析完成(历史记录)", result=r,
        )
        with _LOCK:
            TASKS[task_id] = prog
        return prog
    return None


def get_result(task_id: str) -> AnalysisResult | None:
    """获取结果: 优先内存, 内存无则从持久化文件恢复。"""
    with _LOCK:
        p = TASKS.get(task_id)
        if p and p.result:
            return p.result
    r = _load_result(task_id)
    if r:
        with _LOCK:
            if task_id in TASKS:
                TASKS[task_id].result = r
        return r
    return None


def create_task(task_id: str):
    with _LOCK:
        TASKS[task_id] = AnalysisProgress(
            task_id=task_id, status="queued", progress=0, message="任务已排队", result=None,
        )


def run_analysis(
    task_id: str,
    video_path: str,
    athlete: AthleteInfo,
    action_type: ActionType,
):
    """在后台线程执行完整分析管线。"""
    try:
        _update(task_id, "quality_checking", 10, "正在检测视频质量...")
        vq = video_quality.check_quality(video_path)

        if not vq.passed:
            msgs = "; ".join(i.message for i in vq.issues)
            result = AnalysisResult(
                task_id=task_id, athlete_info=athlete, action_type=action_type,
                video_quality=vq, created_at=datetime.now().isoformat(),
            )
            with _LOCK:
                TASKS[task_id].result = result
            _save_result(task_id, result)
            _update(task_id, "error", 100, f"视频质量不合格: {msgs}")
            return

        _update(task_id, "posing", 25, "正在识别人体骨骼关键点...")
        pose = pose_estimation.extract_pose(video_path, task_id)

        _update(task_id, "extracting", 50, "正在提取运动轨迹与生物力学特征...")
        trajs = trajectory.build_trajectories(pose)
        phases = phase_detection.detect_phases(pose, action_type)
        validity = phase_detection.analyze_action_validity(pose, phases)
        features = biomechanics.extract_features(pose, trajs, phases, action_type)

        _update(task_id, "scoring", 75, "正在计算运动损伤风险评分...")
        risk = risk_assessment.assess(features, athlete)

        _update(task_id, "scoring", 90, "正在截取问题动作片段...")
        # 计算落地缓冲阶段范围(前倾只在落地阶段评估, 准备阶段找球前倾是正常的)
        land_rng = None
        for p in phases:
            if "落地" in str(p.phase_type):
                land_rng = (p.start_frame, p.end_frame)
                break
        problem_moments_raw = biomechanics.identify_problem_moments(pose, pose.fps, land_rng)
        clip_paths = pose_estimation.extract_problem_clips(video_path, task_id, problem_moments_raw, pose.fps)
        problem_moments = []
        from ..models.schemas import ProblemMoment
        for i, m in enumerate(problem_moments_raw):
            if i < len(clip_paths):
                problem_moments.append(ProblemMoment(
                    frame=m["frame"], timestamp=m["timestamp"], issue=m["issue"],
                    value=m["value"], description=m["desc"], clip_index=i,
                ))

        result = AnalysisResult(
            task_id=task_id, athlete_info=athlete, action_type=action_type,
            video_quality=vq, pose=pose, trajectories=trajs, phases=phases,
            features=features, risk=risk, problem_moments=problem_moments,
            action_validity=validity,
            created_at=datetime.now().isoformat(),
        )
        with _LOCK:
            TASKS[task_id].result = result
        _save_result(task_id, result)

        _update(task_id, "done", 100, "分析完成")

    except Exception as e:
        traceback.print_exc()
        _update(task_id, "error", 100, f"分析失败: {e}")


def start_background(task_id: str, video_path: str, athlete: AthleteInfo, action_type: ActionType):
    """启动后台线程执行分析。"""
    create_task(task_id)
    t = threading.Thread(target=run_analysis, args=(task_id, video_path, athlete, action_type), daemon=True)
    t.start()
