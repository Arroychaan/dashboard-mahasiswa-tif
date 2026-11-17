@echo off
title Pemasang Otomatis Dashboard Lab Informatika ke SD Card (E:)
echo ============================================================================
echo  MENYUNTIKKAN DASHBOARD + AUTO-KIOSK KE SD CARD RASPBERRY PI 3B (DRIVE E:)
echo ============================================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\prepare-raspi-sdcard.ps1" -TargetDrive "E:"
echo.
echo Silakan cabut SD Card (E:) dengan aman (Eject) lalu pasang ke Raspberry Pi 3B!
pause

