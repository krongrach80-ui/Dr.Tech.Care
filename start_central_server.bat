@echo off
title Strong Care Central Synchronized Server
echo ========================================================
echo   Starting StrongCare Central Database & SSE Server
echo   Port: 5000 (All network interfaces 0.0.0.0)
echo ========================================================

set "CURRENT_DIR=%~dp0"
cd /d "%CURRENT_DIR%"
node backend\server.js
pause
