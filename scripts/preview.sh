#!/usr/bin/env bash
# 本地预览站点（构建 + 静态服务器）
#   ./scripts/preview.sh              → 构建并起服务 http://127.0.0.1:8000
#   ./scripts/preview.sh 8080         → 指定端口
#   ./scripts/preview.sh --watch      → 监听源文件，改动自动重建
#   ./scripts/preview.sh 8080 --watch → 端口 + 监听
# 停止：./scripts/stop-preview.sh（或 Ctrl+C）
set -euo pipefail

cd "$(dirname "$0")/.."
PIDFILE="$(pwd)/.preview.pid"

PORT=8000
WATCH=0
for arg in "$@"; do
  case "$arg" in
    --watch | -w) WATCH=1 ;;
    "" | *[!0-9]*) echo "未知参数：$arg" >&2; exit 1 ;;
    *) PORT="$arg" ;;
  esac
done

node scripts/build-recipes.mjs
node scripts/build-index.mjs
node scripts/build-site.mjs
node scripts/build-static.mjs --base / --out _site

echo
echo "→ http://127.0.0.1:${PORT}   (Ctrl+C 或 ./scripts/stop-preview.sh 结束)"

# watch 模式先起监听，改动只重建 _site/，服务常驻
WATCH_PID=""
if [ "$WATCH" -eq 1 ]; then
  node scripts/watch.mjs &
  WATCH_PID=$!
fi

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory _site &
SERVER_PID=$!

# 记下进程号，stop-preview.sh 据此精确停止（macOS 上进程名是 Python，按名字杀不可靠）
{ echo "$$"; echo "$SERVER_PID"; [ -n "$WATCH_PID" ] && echo "$WATCH_PID"; } > "$PIDFILE"

cleanup() {
  kill "$SERVER_PID" ${WATCH_PID:+"$WATCH_PID"} 2>/dev/null || true
  rm -f "$PIDFILE"
}
trap cleanup EXIT INT TERM
wait
