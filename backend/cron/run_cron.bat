@echo off
title Moh Tech Care - Daily Auto Reschedule Cron
set "PHP_BIN=php"
where php >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\xampp\php\php.exe" set "PHP_BIN=C:\xampp\php\php.exe"
    if exist "D:\xampp\php\php.exe" set "PHP_BIN=D:\xampp\php\php.exe"
)
cd /d "%~dp0"
"%PHP_BIN%" auto_reschedule.php >> cron.log 2>&1
echo Cron job finished at %date% %time%
