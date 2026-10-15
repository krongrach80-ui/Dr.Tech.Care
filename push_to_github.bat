@echo off
title Push Strong Care to GitHub
cd /d "%~dp0"
set "PATH=C:\Program Files\Git\cmd;C:\Program Files\Git\mingw64\bin;%PATH%"

echo ========================================================
echo   Pushing Dr. Tech Care to GitHub (krongrach80-ui)
echo   Repository: https://github.com/krongrach80-ui/Dr.Tech.Care.git
echo   Email: krongrach80@gmail.com
echo [1/3] Adding changes...
git add -A

echo [2/3] Committing changes...
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set timestamp=%dt:~0,4%-%dt:~4,2%-%dt:~6,2% %dt:~8,2%:%dt:~10,2%:%dt:~12,2%
git commit -m "Update Dr. Tech Care: %timestamp%" 2>nul

echo [3/3] Pushing to GitHub (overwrite)...
git push -f origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo   SUCCESS! Dr. Tech Care has been pushed to GitHub!
    echo   View repo: https://github.com/krongrach80-ui/Dr.Tech.Care
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo   If authentication is needed, please sign in via the browser window.
    echo ========================================================
)
pause
