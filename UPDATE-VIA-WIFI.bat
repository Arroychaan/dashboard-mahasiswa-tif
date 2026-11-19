@echo off
title Update Otomatis Dashboard ke Raspberry Pi 3B via WiFi
echo ============================================================================
echo  UPDATE DASHBOARD RASPBERRY PI 3B VIA WIFI / JARINGAN LOKAL
echo ============================================================================
echo.
echo Pastikan Raspberry Pi 3B menyala dan terhubung ke WiFi yang sama.
echo.
set /p TARGET_IP="Masukkan IP / Hostname Raspberry Pi (Tekan Enter jika default 'lab-informatika.local'): "
if "%TARGET_IP%"=="" set TARGET_IP=lab-informatika.local

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-raspi-wifi.ps1" -HostName "%TARGET_IP%" -User "pi"

echo.
pause
