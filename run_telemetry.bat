@echo off
title X-26 iSpotter - iRacing Telemetry
cd /d "%~dp0"

echo ============================================================
echo X-26 iSpotter - iRacing Telemetry Dashboard
echo ============================================================

echo Starting telemetry server...
echo The dashboard will be available at: http://localhost:5000

echo Press Ctrl+C to stop the server

echo ============================================================

python app.py

if errorlevel 1 (
    echo.
    echo ERROR: Failed to start the server!
    echo Please check that Python and all dependencies are installed.
    echo.
    pause
)
