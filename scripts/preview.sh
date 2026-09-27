#!/usr/bin/env bash
# 本地预览站点（会先构建再起一个静态服务器）
#   ./scripts/preview.sh          → http://127.0.0.1:8000
#   ./scripts/preview.sh 8080     → 指定端口
set -euo pipefail

cd "$(dirname "$0")/.."
PORT="${1:-8000}"

node scripts/build-recipes.mjs
node scripts/build-index.mjs
node scripts/build-site.mjs
node scripts/build-static.mjs --base / --out _site

echo
echo "→ http://127.0.0.1:${PORT}   (Ctrl+C 结束)"
cd _site
exec python3 -m http.server "$PORT" --bind 127.0.0.1
