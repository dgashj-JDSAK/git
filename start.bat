@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing_node
where npm >nul 2>nul
if errorlevel 1 goto missing_node
if exist node_modules goto build
call npm ci --no-audit --no-fund
if errorlevel 1 goto failed
:build
call npm run build
if errorlevel 1 goto failed
echo Starting Wanxiang Studio. Keep this window open.
echo Browser address: http://127.0.0.1:3000
call npm start
if errorlevel 1 goto failed
exit /b 0
:missing_node
echo Please install Node.js 22 or 24 LTS from https://nodejs.org/
echo Then close this window and run start.bat again.
pause
exit /b 1
:failed
echo Startup failed. Please keep this window open and share the error above.
pause
exit /b 1
