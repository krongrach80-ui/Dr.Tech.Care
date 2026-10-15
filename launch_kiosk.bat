@echo off
title Moh Tech Care - Patient Kiosk Launcher (1080x1920 Portrait)
echo ========================================================
echo   Moh Tech Care - Intelligent Physical Therapy System
echo   Launching Vertical Portrait Kiosk Terminal (1080x1920)
echo ========================================================

set "KIOSK_URL=http://localhost:3000/#/kiosk"
if not "%~1"=="" set "KIOSK_URL=%~1"

set "CHROME_BIN="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_BIN=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_BIN=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_BIN=%LocalAppData%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "CHROME_BIN=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
)

if "%CHROME_BIN%"=="" (
    echo [ERROR] Google Chrome or Microsoft Edge not found in standard paths.
    echo Opening default browser instead...
    start "" "%KIOSK_URL%"
    goto :end
)

echo Found browser: "%CHROME_BIN%"
echo Target URL: %KIOSK_URL%
echo Starting in full kiosk portrait mode...

start "" "%CHROME_BIN%" ^
  --kiosk "%KIOSK_URL%" ^
  --app="%KIOSK_URL%" ^
  --window-size=1080,1920 ^
  --window-position=0,0 ^
  --disable-pinch ^
  --overscroll-history-navigation=0 ^
  --noerrdialogs ^
  --disable-infobars ^
  --disable-session-crashed-bubble ^
  --autoplay-policy=no-user-gesture-required ^
  --check-for-update-interval=31536000

:end
echo Kiosk launched successfully.
