@echo off
title Update Otomatis Dashboard ke Beelink T4 Pro (Lubuntu 26.04) via WiFi
echo ============================================================================
echo  UPDATE DASHBOARD BEELINK T4 PRO (LUBUNTU 26.04) VIA WIFI / LAN
echo ============================================================================
echo.
echo Pastikan Beelink T4 Pro menyala dan terhubung ke jaringan WiFi/LAN yang sama.
echo.
set /p TARGET_IP="Masukkan IP / Hostname T4 Pro (Enter untuk default 'lab-informatika.local'): "
if "%TARGET_IP%"=="" set TARGET_IP=lab-informatika.local

set /p TARGET_USER="Masukkan username Linux di Lubuntu (Enter untuk default 'lab'): "
if "%TARGET_USER%"=="" set TARGET_USER=lab

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-t4pro-wifi.ps1" -HostName "%TARGET_IP%" -User "%TARGET_USER%"

echo.
pause
