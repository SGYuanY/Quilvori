@echo off
setlocal DisableDelayedExpansion
where node >nul 2>nul
if errorlevel 1 (
  echo Quilvori requires Node.js 22 or newer.
  echo Install Node.js, reopen this launcher, then run "npm ci" in the project folder.
  echo.
  pause
  exit /b 1
)
node "%~dp0scripts\start.mjs" --detached %*
set "quilvoriExit=%errorlevel%"
if not "%quilvoriExit%"=="0" (
  echo.
  pause
)
exit /b %quilvoriExit%
