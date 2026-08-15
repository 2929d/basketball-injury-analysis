"""
FastAPI 应用入口。

运行:
  cd backend
  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.analysis import router as analysis_router
from .api.verify import router as verify_router
from .config import CORS_ORIGINS

app = FastAPI(
    title="运动损伤风险评估系统 API",
    description="基于计算机视觉与运动轨迹分析的运动损伤风险评估与干预建议系统",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router)
app.include_router(verify_router)


@app.get("/")
def root():
    return {
        "name": "运动损伤风险评估系统",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "upload": "POST /api/analysis/upload",
            "progress": "GET /api/analysis/{task_id}/progress",
            "result": "GET /api/analysis/{task_id}/result",
            "annotated_video": "GET /api/analysis/{task_id}/annotated-video",
            "actions": "GET /api/meta/actions",
            "guide": "GET /api/meta/guide",
        },
    }


@app.get("/health")
def health():
    return {"status": "ok"}
