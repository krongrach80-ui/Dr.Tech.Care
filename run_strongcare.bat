@echo off
title Strong Care Web Runner (Central Synchronized Server + Frontend)
echo ========================================================
echo   Starting Strong Care Multi-Device Synchronized System
echo   AI-assisted Rehabilitation Monitoring Platform v1.0
echo ========================================================

set "CURRENT_DIR=%~dp0"
set "NODE_PATH=%CURRENT_DIR%..\node-v20.18.0-win-x64"
if exist "%NODE_PATH%" (
    set "PATH=%NODE_PATH%;%PATH%"
)

echo [1/2] Starting Central Synchronized Backend Server on 0.0.0.0:5000 ...
start "StrongCare-Central-Backend" cmd /k "title StrongCare Central Server & cd /d "%CURRENT_DIR%" & node backend\server.js"

echo [2/2] Starting Frontend (Vite) on 0.0.0.0:3000 (accessible on LAN) ...
cd /d "%CURRENT_DIR%frontend"
start "StrongCare-Frontend" cmd /k "title StrongCare Frontend & npm run dev"

echo.
echo ========================================================
echo   StrongCare Multi-Device Network Servers are starting!
echo   - Central Backend API: http://0.0.0.0:5000/api
echo   - Frontend Interface:  http://0.0.0.0:3000
echo.
echo   Connect any Kiosk, Doctor Workstation, or Tablet on
echo   your local network (Wi-Fi) to the server IP.
echo ========================================================
pause
