@echo off
title X-26 iSpotter - iRacing Telemetry
cd /d "C:\Users\nishi\Documents\X-26-iSpotter\"

echo ============================================================
echo  X-26 iSpotter - iRacing Telemetry Dashboard
echo ============================================================

echo  Starting Flask telemetry server...
start /b python app.py

echo  Waiting for Flask to be ready...
timeout /t 3 /nobreak >nul

echo  Launching Electron dashboard...
echo ============================================================
npx electron .

echo ============================================================
echo  Electron closed, stopping Flask server...
echo  Shutdown complete.
echo ============================================================
