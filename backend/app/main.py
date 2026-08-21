"""
FastAPI 应用入口。

运行:
  cd backend
  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api.analysis import router as analysis_router
from .api.verify import router as verify_router
from .config import CORS_ORIGINS

app = FastAPI(
    title="运动损伤风险评估系统 API",
    description="基于计算机视觉与运动轨迹分析的运动损伤风险评估与干预建议系统",
    version="1.0.0",
)

# CORS — 允许所有来源（公网部署需要）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 路由（路由器自带 /api 前缀）
app.include_router(analysis_router)
app.include_router(verify_router)


@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---- 静态前端文件托管 ----
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

if STATIC_DIR.exists():
    # 服务静态资源（JS/CSS/图片等）
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    # SPA fallback：所有非 API 请求返回 index.html
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str, request: Request):
        # 如果是 API 请求，返回 404 JSON
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        # 尝试返回静态文件
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)

        # 其他路径返回 index.html（SPA 路由）
        index_path = STATIC_DIR / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        return JSONResponse({"detail": "Frontend not built"}, status_code=404)
else:
    @app.get("/")
    def root():
        return {
            "name": "运动损伤风险评估系统",
            "version": "1.0.0",
            "docs": "/docs",
            "note": "前端静态文件未构建，请运行 npm run build 并复制到 backend/static/",
        }
