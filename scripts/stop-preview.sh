#!/usr/bin/env bash
# 停止 preview.sh 起的本地预览（watch + 静态服务）
# 用法: ./scripts/stop-preview.sh
set -uo pipefail

cd "$(dirname "$0")/.."
PIDFILE="$(pwd)/.preview.pid"

stopped=0
if [ -f "$PIDFILE" ]; then
  while read -r pid; do
    [ -n "$pid" ] || continue
    cmd=$(ps -p "$pid" -o command= 2>/dev/null) || continue
    # 校验确实是本仓库的预览进程，避免 PID 被复用后误杀
    case "$cmd" in
      *preview.sh* | *watch.mjs* | *http.server*)
        if kill "$pid" 2>/dev/null; then
          echo "已停止 PID $pid"
          stopped=1
        fi
        ;;
    esac
  done < "$PIDFILE"
  rm -f "$PIDFILE"
fi

if [ "$stopped" -eq 0 ]; then
  echo "没有正在运行的本地预览。"
fi
