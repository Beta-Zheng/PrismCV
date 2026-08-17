@echo off
REM AI Resume 本地启动脚本（Windows）
REM 用法：start.bat [dev^|build^|test]
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [X] 未检测到 Node.js（需 18 以上）。请先安装：https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo → 首次运行，安装依赖...
  call npm install
)

set CMD=%1
if "%CMD%"=="" set CMD=dev

if "%CMD%"=="dev" (
  echo → 启动开发服务器：http://localhost:3000
  call npm run dev
) else if "%CMD%"=="build" (
  echo → 生产构建（产物在 dist\）
  call npm run build
) else if "%CMD%"=="test" (
  echo → 运行单元测试
  call npx vitest run
) else (
  echo 用法：start.bat [dev^|build^|test]
)
