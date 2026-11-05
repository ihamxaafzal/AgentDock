@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install Node.js LTS first.
  pause
  exit /b 1
)
if not exist node_modules\three (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node server\index.mjs --open
pause
