param(
    [string]$TargetDrive = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BundleDir = Join-Path $ProjectRoot "deploy\t4pro-lubuntu\usb-bundle\t4pro-dashboard"
$AppDir = Join-Path $BundleDir "app"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Menyiapkan Pre-Compiled Standalone Bundle untuk Beelink T4 Pro" -ForegroundColor Cyan
Write-Host " Target OS: Lubuntu 26.04 LTS (x86_64 + Touchscreen Kiosk)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Pastikan hasil build standalone Next.js tersedia
$StandaloneDir = Join-Path $ProjectRoot ".next\standalone"
if (-not (Test-Path (Join-Path $StandaloneDir "server.js"))) {
    Write-Host "[1/4] Menjalankan pnpm build (standalone) di PC pengembang..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    pnpm build
    Pop-Location
} else {
    Write-Host "[1/4] Menggunakan hasil build standalone terbaru di .next\standalone..." -ForegroundColor Green
}

# 2. Susun struktur bundle offline
Write-Host "[2/4] Menyusun paket standalone di $BundleDir..." -ForegroundColor Yellow
if (Test-Path $BundleDir) {
    Remove-Item -Path $BundleDir -Recurse -Force
}
New-Item -ItemType Directory -Path $AppDir -Force | Out-Null

# Salin isi .next/standalone (termasuk server.js & minimal node_modules)
Copy-Item -Path (Join-Path $StandaloneDir "*") -Destination $AppDir -Recurse -Force

# Wajib: salin .next/static dan public ke dalam struktur standalone
$StaticDst = Join-Path $AppDir ".next\static"
New-Item -ItemType Directory -Path $StaticDst -Force | Out-Null
Copy-Item -Path (Join-Path $ProjectRoot ".next\static\*") -Destination $StaticDst -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot "public") -Destination (Join-Path $AppDir "public") -Recurse -Force

# Salin migrasi SQL & skrip seed/bootstrap
Copy-Item -Path (Join-Path $ProjectRoot "drizzle") -Destination (Join-Path $AppDir "drizzle") -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot "scripts") -Destination (Join-Path $AppDir "scripts") -Recurse -Force

# 3. Salin setup-lubuntu.sh dengan normalisasi line ending LF (Linux)
Write-Host "[3/4] Menyiapkan skrip setup-lubuntu.sh (format LF)..." -ForegroundColor Yellow
$SetupSrc = Join-Path $ProjectRoot "deploy\t4pro-lubuntu\setup-lubuntu.sh"
$SetupDst = Join-Path $BundleDir "setup-lubuntu.sh"
$RawSh = [System.IO.File]::ReadAllText($SetupSrc) -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($SetupDst, $RawSh, (New-Object System.Text.UTF8Encoding($false)))

# 4. Salin ke Flashdisk USB jika parameter TargetDrive diberikan (mis. -TargetDrive "E:")
if ($TargetDrive -ne "" -and (Test-Path "$TargetDrive\")) {
    $UsbDest = "$TargetDrive\t4pro-dashboard"
    Write-Host "[4/4] Menyalin paket ke USB Drive ($UsbDest)..." -ForegroundColor Green
    if (Test-Path $UsbDest) {
        Remove-Item -Path $UsbDest -Recurse -Force
    }
    Copy-Item -Path $BundleDir -Destination $UsbDest -Recurse -Force
} else {
    Write-Host "[4/4] Paket tersimpan lokal di: $BundleDir" -ForegroundColor Green
    Write-Host "      Salin folder 't4pro-dashboard' ke flashdisk USB lalu jalankan:" -ForegroundColor Gray
    Write-Host "      sudo bash setup-lubuntu.sh" -ForegroundColor White
}

Write-Host "==================================================================" -ForegroundColor Green
Write-Host " SELESAI! Bundle standalone siap dipasang di Beelink T4 Pro." -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
