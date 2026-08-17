#!/usr/bin/env bash
# AI Resume 本地启动脚本（macOS / Linux）
# 用法：./start.sh [dev|build|test]
set -e
cd "$(dirname "$0")"

CMD="${1:-dev}"

if ! command -v node >/dev/null 2>&1; then
  echo "✗ 未检测到 Node.js（需 ≥ 18）。请先安装：https://nodejs.org"
  exit 1
fi

echo "→ Node $(node -v) · npm $(npm -v)"

if [ ! -d node_modules ]; then
  echo "→ 首次运行，安装依赖..."
  npm install
fi

case "$CMD" in
  dev)
    echo "→ 启动开发服务器：http://localhost:3000"
    npm run dev
    ;;
  build)
    echo "→ 生产构建（产物在 dist/）"
    npm run build
    ;;
  test)
    echo "→ 运行单元测试"
    npx vitest run
    ;;
  *)
    echo "用法：./start.sh [dev|build|test]"
    exit 1
    ;;
esac
