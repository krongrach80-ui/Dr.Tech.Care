@echo off
title Moh Tech Care - Full Stack System Launcher
echo ===================================================================
echo   MOH TECH CARE - Intelligent Physical Therapy Kiosk System
echo   Starting Services: Backend API + Modern Frontend
echo ===================================================================

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

:: 1. Search for PHP executable
set "PHP_BIN=php"
where php >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\xampp\php\php.exe" (
        set "PHP_BIN=C:\xampp\php\php.exe"
    ) else if exist "D:\xampp\php\php.exe" (
        set "PHP_BIN=D:\xampp\php\php.exe"
    ) else (
        set "PHP_BIN="
    )
)

:: 2. Launch Backend API
if not "%PHP_BIN%"=="" (
    echo [1/2] Starting PHP REST API Server on http://127.0.0.1:8000 ...
    start "MohTechCare-PHP-Backend" cmd /k "title MohTechCare PHP Backend & cd /d "%ROOT_DIR%backend" & "%PHP_BIN%" -S 0.0.0.0:8000 -t public"
) else (
    echo [1/2] Note: PHP CLI not found in PATH or XAMPP default paths.
    echo       If using XAMPP Apache, ensure Apache is started in XAMPP Control Panel.
    echo       Starting Node.js server fallback on port 5000...
    start "MohTechCare-Node-Backend" cmd /k "title MohTechCare Node Backend & cd /d "%ROOT_DIR%backend" & node server.js"
)

:: 3. Launch Frontend (Vite)
echo [2/2] Starting Frontend Vite Dev Server on http://localhost:3000 ...
start "MohTechCare-Frontend" cmd /k "title MohTechCare Frontend & cd /d "%ROOT_DIR%frontend" & npm run dev"

echo.
echo ===================================================================
echo   Moh Tech Care is now active!
echo.
echo   Surfaces:
echo   - [Patient Kiosk Terminal]:       http://localhost:3000/#/kiosk
echo   - [Super Admin Dashboard]:        http://localhost:3000/#/admin
echo   - [Physiotherapist Workspace]:   http://localhost:3000/#/pt
echo.
echo   To launch Chrome in dedicated vertical 1080x1920 kiosk mode:
echo   Run: launch_kiosk.bat
echo ===================================================================
pause
