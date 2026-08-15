#!/bin/bash
# 停止前后端服务
ROOT="$(cd "$(dirname "$0")" && pwd)"

# 按 PID 停
for f in backend frontend; do
  if [ -f "$ROOT/logs/$f.pid" ]; then
    PID=$(cat "$ROOT/logs/$f.pid")
    kill -9 "$PID" 2>/dev/null
    rm -f "$ROOT/logs/$f.pid"
  fi
done

# 按端口停(兜底)
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

# 停保活脚本
if [ -f "$ROOT/logs/keepalive.pid" ]; then
  kill -9 "$(cat "$ROOT/logs/keepalive.pid")" 2>/dev/null
  rm -f "$ROOT/logs/keepalive.pid"
fi

echo "所有服务已停止"
