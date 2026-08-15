#!/bin/bash
# 一键启动前后端服务 (nohup 脱离会话, 持久运行)
# 用法: bash start_servers.sh
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/logs"

PY=/Users/zzm/.workbuddy/binaries/python/envs/default/bin/python
UVICORN=/Users/zzm/.workbuddy/binaries/python/envs/default/bin/uvicorn
NPM=/Users/zzm/.workbuddy/binaries/node/versions/22.22.2/bin/npm

# 停旧进程
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 1

# 启动后端 (nohup 脱离会话)
cd "$ROOT/backend"
nohup "$UVICORN" app.main:app --host 127.0.0.1 --port 8000 > "$ROOT/logs/backend.log" 2>&1 &
echo $! > "$ROOT/logs/backend.pid"
disown $! 2>/dev/null

# 启动前端
cd "$ROOT/frontend"
nohup "$NPM" run dev > "$ROOT/logs/frontend.log" 2>&1 &
echo $! > "$ROOT/logs/frontend.pid"
disown $! 2>/dev/null

sleep 4
BE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/health 2>/dev/null)
FE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null)

echo "========================================"
echo "  运动损伤风险评估系统 - 服务已启动"
echo "========================================"
echo "后端 :8000  → HTTP $BE  (http://localhost:8000/docs)"
echo "前端 :5173  → HTTP $FE  (http://localhost:5173)"
echo ""
echo "日志: logs/backend.log, logs/frontend.log"
echo "停止: bash stop_servers.sh"
echo "========================================"
