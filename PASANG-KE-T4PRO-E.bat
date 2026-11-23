@echo off
title Pemasang Paket Dashboard Beelink T4 Pro ke Flashdisk (Drive E:)
echo ============================================================================
echo  MEMPERSIAPKAN PAKET DASHBOARD BEELINK T4 PRO LUBUNTU KE FLASHDISK (DRIVE E:)
echo ============================================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\prepare-t4pro-bundle.ps1" -TargetDrive "E:"
echo.
echo ============================================================================
echo  SELESAI! Silakan cabut flashdisk (Eject) dan tancapkan ke Beelink T4 Pro.
echo ============================================================================
pause
