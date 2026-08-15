#!/bin/bash
# 保活脚本: 每30秒检测前后端, 停了自动重启
# 用法: nohup bash keepalive.sh > /dev/null 2>&1 &  (后台运行)
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/logs"

UVICORN=/Users/zzm/.workbuddy/binaries/python/envs/default/bin/uvicorn
NPM=/Users/zzm/.workbuddy/binaries/node/versions/22.22.2/bin/npm

restart_backend() {
  cd "$ROOT/backend"
  nohup "$UVICORN" app.main:app --host 127.0.0.1 --port 8000 >> "$ROOT/logs/backend.log" 2>&1 &
  disown $! 2>/dev/null
  echo "[$(date '+%H:%M:%S')] 后端已自动重启" >> "$ROOT/logs/keepalive.log"
}

restart_frontend() {
  cd "$ROOT/frontend"
  nohup "$NPM" run dev >> "$ROOT/logs/frontend.log" 2>&1 &
  disown $! 2>/dev/null
  echo "[$(date '+%H:%M:%S')] 前端已自动重启" >> "$ROOT/logs/keepalive.log"
}

echo "[$(date '+%H:%M:%S')] 保活脚本启动 (每15秒检测)" >> "$ROOT/logs/keepalive.log"

# 启动时立即拉起服务
restart_backend
restart_frontend
sleep 5

while true; do
  # 检测后端
  if ! curl -s -o /dev/null -m 3 http://127.0.0.1:8000/health 2>/dev/null; then
    restart_backend
  fi
  # 检测前端
  if ! curl -s -o /dev/null -m 3 http://localhost:5173/ 2>/dev/null; then
    restart_frontend
  fi
  sleep 15
done
