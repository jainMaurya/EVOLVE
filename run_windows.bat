@echo off
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python launcher not found. Install Python 3 from https://www.python.org/downloads/
  pause
  exit /b 1
)
echo Starting EVOLVE browser game with Python RL sidecar...
py server.py
pause
