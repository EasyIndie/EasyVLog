#!/usr/bin/env bash
# 用 glow 浏览本仓库文档
#   ./scripts/look.sh            → TUI 浏览整个仓库
#   ./scripts/look.sh 文件.md    → 渲染单个文件（可搜索）
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v glow >/dev/null 2>&1; then
  echo "未安装 glow，请先运行: brew install glow" >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  exec glow -s dark .
fi

exec glow -p -s dark "$@"
