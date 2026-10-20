@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或 24 LTS：https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto failed
)
call npm run build
if errorlevel 1 goto failed
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo 启动失败，请查看上方错误信息。
pause
exit /b 1
