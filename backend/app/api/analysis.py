"""
分析 API 路由。

端点:
  POST   /api/analysis/upload              上传视频+运动员信息, 启动分析
  GET    /api/analysis/{task_id}/progress  轮询分析进度
  GET    /api/analysis/{task_id}/result    获取完整分析结果
  GET    /api/analysis/{task_id}/annotated-video  获取带骨骼叠加的视频
  GET    /api/meta/actions                 支持的动作列表
  GET    /api/meta/guide                   拍摄指导
"""
from __future__ import annotations

import io
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response

from ..config import RESULT_DIR, SUPPORTED_VIDEO_FORMATS, UPLOAD_DIR
from ..core import pipeline
from ..models.schemas import ActionType, AthleteInfo, Gender

router = APIRouter(prefix="/api")


# ---------- 元数据 ----------
ACTIONS = [
    {"value": "双脚垂直跳跃落地", "label": "双脚垂直跳跃落地", "desc": "原地垂直起跳后双脚落地"},
    {"value": "单脚跳跃落地", "label": "单脚跳跃落地", "desc": "起跳后单脚落地缓冲"},
    {"value": "侧向移动后急停", "label": "侧向移动后急停", "desc": "横向移动后急停制动"},
    {"value": "快速变向动作", "label": "快速变向动作", "desc": "行进间快速变向切入"},
    {"value": "深蹲起跳与落地", "label": "深蹲起跳与落地", "desc": "深蹲后起跳并落地"},
]

GUIDE = [
    {"title": "拍摄角度", "content": "建议侧面或斜前方 45° 拍摄，能同时看到身体正面与侧面"},
    {"title": "拍摄距离", "content": "拍摄距离 3-5 米，确保运动员全身始终在画面内"},
    {"title": "光线条件", "content": "保证光线充足，避免逆光与强烈阴影"},
    {"title": "着装要求", "content": "减少衣物对关节的遮挡，尤其是膝盖与脚踝"},
    {"title": "摄像头稳定", "content": "保持摄像头固定与稳定，使用三脚架最佳"},
    {"title": "帧率与分辨率", "content": "建议帧率 ≥ 25fps，分辨率 ≥ 720p"},
    {"title": "画面纯净", "content": "画面中尽量只保留一名运动员，避免多人干扰"},
    {"title": "时长要求", "content": "拍摄 5-15 秒，包含完整的准备-起跳-落地-稳定过程"},
]


@router.get("/meta/actions")
def get_actions():
    return ACTIONS


@router.get("/meta/guide")
def get_guide():
    return GUIDE


# ---------- 上传与分析 ----------
@router.post("/analysis/upload")
async def upload(
    video: UploadFile = File(...),
    athlete_info: str = Form(...),
    action_type: str = Form(...),
):
    # 校验动作类型
    valid = {a["value"] for a in ACTIONS}
    if action_type not in valid:
        raise HTTPException(400, f"不支持的动作类型: {action_type}")

    # 解析运动员信息
    try:
        info = json.loads(athlete_info)
        athlete = AthleteInfo(**info)
    except Exception as e:
        raise HTTPException(422, f"运动员信息解析失败: {e}")

    # 校验文件格式
    suffix = Path(video.filename or "").suffix.lower()
    if suffix not in SUPPORTED_VIDEO_FORMATS:
        raise HTTPException(400, f"不支持的视频格式: {suffix}, 支持: {SUPPORTED_VIDEO_FORMATS}")

    task_id = uuid.uuid4().hex[:12]
    save_path = UPLOAD_DIR / f"{task_id}{suffix}"
    with open(save_path, "wb") as f:
        f.write(await video.read())

    pipeline.start_background(
        task_id, str(save_path), athlete, ActionType(action_type),
    )
    return {"task_id": task_id}


@router.get("/analysis/{task_id}/progress")
def progress(task_id: str):
    p = pipeline.get_progress(task_id)
    if p is None:
        raise HTTPException(404, "任务不存在")
    return p


@router.get("/analysis/{task_id}/result")
def result(task_id: str):
    r = pipeline.get_result(task_id)
    if r is None:
        raise HTTPException(404, "结果尚未就绪或任务不存在")
    return r


@router.get("/analysis/{task_id}/annotated-video")
def annotated_video(task_id: str):
    # 优先从内存结果取路径, 后备从文件系统找(应对后端重启后内存丢失)
    p = None
    r = pipeline.get_result(task_id)
    if r and r.pose and r.pose.annotated_video_path:
        p = Path(r.pose.annotated_video_path)
    if not p or not p.exists():
        p = RESULT_DIR / f"{task_id}_annotated.mp4"
    if not p.exists():
        raise HTTPException(404, "标注视频尚未生成")
    return FileResponse(str(p), media_type="video/mp4")


@router.get("/analysis/{task_id}/problem-moment/{clip_index}/video")
def problem_moment_video(task_id: str, clip_index: int):
    """返回问题动作片段视频。"""
    p = RESULT_DIR / f"{task_id}_problem_{clip_index}.mp4"
    if not p.exists():
        raise HTTPException(404, "问题片段不存在")
    return FileResponse(str(p), media_type="video/mp4")


@router.get("/analysis/history")
def history():
    """列出所有历史分析记录(从持久化文件扫描)。"""
    records = []
    for f in sorted(RESULT_DIR.glob("*_result.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            r = data.get("risk")
            ai = data.get("athlete_info", {})
            records.append({
                "task_id": data.get("task_id", f.stem.replace("_result", "")),
                "created_at": data.get("created_at", ""),
                "action_type": data.get("action_type", ""),
                "athlete_name": f"{'男' if ai.get('gender')=='male' else '女'}{ai.get('age','')}岁",
                "overall_score": r.get("overall_score", 0) if r else 0,
                "overall_level": r.get("overall_level", "") if r else "",
            })
        except Exception:
            continue
    return records


@router.get("/analysis/{task_id}/pdf")
def export_pdf(task_id: str):
    """生成文字版 PDF 报告(可选中/复制/搜索)。"""
    from ..core.pdf_generator import generate_report_pdf
    result = pipeline.get_result(task_id)
    if not result:
        # 从持久化文件加载
        p = RESULT_DIR / f"{task_id}_result.json"
        if p.exists():
            from ..models.schemas import AnalysisResult
            result = AnalysisResult(**json.loads(p.read_text(encoding="utf-8")))
    if not result:
        raise HTTPException(404, "分析结果不存在")
    pdf_bytes = generate_report_pdf(result)
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="basketball_report_{task_id}.pdf"'},
    )


@router.get("/analysis/{task_id}/timeline")
def frame_timeline(task_id: str):
    """返回每帧关键特征时间序列(用于逐帧分析)。"""
    from ..core import biomechanics as bm
    result = pipeline.get_result(task_id)
    if not result or not result.pose:
        p = RESULT_DIR / f"{task_id}_result.json"
        if p.exists():
            from ..models.schemas import AnalysisResult
            result = AnalysisResult(**json.loads(p.read_text(encoding="utf-8")))
    if not result or not result.pose:
        raise HTTPException(404, "分析结果不存在")
    return bm.get_frame_timeline(result.pose)
