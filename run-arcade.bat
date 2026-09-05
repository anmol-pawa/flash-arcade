@echo off
setlocal
title Flash Arcade
cd /d "%~dp0"

echo ================================
echo   Flash Arcade
echo ================================
echo.

rem Podman machine start is a no-op if already running; ignore its exit code.
echo Starting Podman machine (if needed)...
podman machine start >nul 2>nul

rem Locate podman-compose: prefer PATH (works once the user's environment
rem has picked up the pip --user install), fall back to the known install
rem location so this still works immediately, before that PATH change has
rem propagated to Explorer / this shell. Each branch invokes the command
rem with quoting appropriate to its own case -- a bare PATH-resolved name
rem like podman-compose must NOT be quoted, or cmd's PATH/PATHEXT lookup
rem breaks ("The system cannot find the path specified.").
where podman-compose >nul 2>nul
echo Starting Postgres (Podman)...
if errorlevel 1 (
  "%APPDATA%\Python\Python313\Scripts\podman-compose.exe" up -d
) else (
  podman-compose up -d
)
if errorlevel 1 (
  echo.
  echo Could not start Postgres via podman-compose.
  echo Make sure Podman is installed: https://podman.io
  pause
  exit /b 1
)

echo Waiting for Postgres to be healthy...
:waitdb
podman inspect --format "{{.State.Health.Status}}" flash-arcade-db 2>nul | findstr /C:"healthy" >nul
if errorlevel 1 (
  timeout /t 2 >nul
  goto waitdb
)
echo Postgres is ready.
echo.

rem If the app is already running elsewhere, just open the browser rather
rem than trying to start a second server on the same port.
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://localhost:3003/' -UseBasicParsing -TimeoutSec 2).StatusCode } catch { 0 }" | findstr "200" >nul
if not errorlevel 1 (
  echo Flash Arcade is already running.
  start "" http://localhost:3003
  goto :eof
)

if not exist ".next\BUILD_ID" (
  echo No production build found -- building now, this can take a minute...
  call npm run build
  if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
  )
)

rem Open the browser a few seconds after the server starts, from a small
rem detached helper, while this window runs the server itself in the
rem foreground. Closing this window stops the server -- that is deliberate,
rem so there is one obvious way to shut the arcade down.
start "" cmd /c "timeout /t 3 >nul && start "" http://localhost:3003"

echo Starting the server on http://localhost:3003
echo Close this window to stop Flash Arcade.
echo.
call npx next start -p 3003

echo.
echo Flash Arcade has stopped.
pause
