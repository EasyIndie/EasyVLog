#!/usr/bin/env bash
# 本地预览站点（构建 + 静态服务器）
#   ./scripts/preview.sh              → 构建并起服务 http://127.0.0.1:8000
#   ./scripts/preview.sh 8080         → 指定端口
#   ./scripts/preview.sh --watch      → 监听源文件，改动自动重建
#   ./scripts/preview.sh 8080 --watch → 端口 + 监听
set -euo pipefail

cd "$(dirname "$0")/.."

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
echo "→ http://127.0.0.1:${PORT}   (Ctrl+C 结束)"

if [ "$WATCH" -eq 1 ]; then
  # 服务常驻，watcher 每次改动只重建 _site/，浏览器刷新即可
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory _site &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM
  node scripts/watch.mjs
else
  cd _site
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
fi
