param(
    [string]$TargetDrive = "E:"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PackageDir = Join-Path $ProjectRoot "deploy\raspberry-pi\sdcard-bundle\raspi-dashboard"
$AppDir = Join-Path $PackageDir "app"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Menyiapkan Paket Final Raspberry Pi 3B (Dashboard + Auto-Kiosk)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Bersihkan dan buat direktori paket lokal
if (Test-Path $PackageDir) {
    Remove-Item -Path $PackageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $AppDir -Force | Out-Null

Write-Host "[1/4] Menyalin hasil build aplikasi (.next, public, drizzle, scripts, src)..."
# Salin folder utama
Copy-Item -Path (Join-Path $ProjectRoot "public") -Destination (Join-Path $AppDir "public") -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot "drizzle") -Destination (Join-Path $AppDir "drizzle") -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot "scripts") -Destination (Join-Path $AppDir "scripts") -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot "src") -Destination (Join-Path $AppDir "src") -Recurse -Force

# Salin file konfigurasi penting
$ConfigFiles = @("package.json", "pnpm-lock.yaml", "next.config.js", "tsconfig.json", "drizzle.config.ts", "superadmin-mfa.json")
foreach ($file in $ConfigFiles) {
    $srcFile = Join-Path $ProjectRoot $file
    if (Test-Path $srcFile) {
        Copy-Item -Path $srcFile -Destination (Join-Path $AppDir $file) -Force
    }
}

# Salin hasil build .next (tanpa folder cache & standalone node_modules Windows agar hemat ruang & cepat)
$NextSrc = Join-Path $ProjectRoot ".next"
$NextDst = Join-Path $AppDir ".next"
New-Item -ItemType Directory -Path $NextDst -Force | Out-Null
Get-ChildItem -Path $NextSrc | Where-Object { $_.Name -notin @("cache", "standalone") } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $NextDst $_.Name) -Recurse -Force
}

# 2. Pastikan setup-raspi.sh menggunakan format baris Linux (LF, bukan CRLF)
Write-Host "[2/4] Menyiapkan skrip auto-installer Linux (format LF)..."
$SetupScriptSrc = Join-Path $ProjectRoot "deploy\raspberry-pi\setup-raspi.sh"
$SetupScriptDst = Join-Path $PackageDir "setup-raspi.sh"
$RawSh = [System.IO.File]::ReadAllText($SetupScriptSrc) -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($SetupScriptDst, $RawSh, (New-Object System.Text.UTF8Encoding($false)))

# 3. Salin ke SD Card (Drive E:) jika terpasang
if (Test-Path "$TargetDrive\") {
    Write-Host "[3/4] Menyalin paket ke SD Card ($TargetDrive\raspi-dashboard)..."
    $SdDest = "$TargetDrive\raspi-dashboard"
    if (Test-Path $SdDest) {
        Remove-Item -Path $SdDest -Recurse -Force
    }
    Copy-Item -Path $PackageDir -Destination $SdDest -Recurse -Force

    # Salin juga superadmin-mfa.json ke root SD Card agar mudah dibuka
    if (Test-Path (Join-Path $ProjectRoot "superadmin-mfa.json")) {
        Copy-Item -Path (Join-Path $ProjectRoot "superadmin-mfa.json") -Destination "$TargetDrive\superadmin-mfa.json" -Force
    }

    # 4. Cek apakah Raspberry Pi OS sudah di-flash (ada firstrun.sh atau cmdline.txt)
    $FirstrunPath = "$TargetDrive\firstrun.sh"
    if (Test-Path $FirstrunPath) {
        Write-Host "[4/4] Mendeteksi firstrun.sh Raspberry Pi OS! Menyuntikkan Auto-Install saat First Boot..." -ForegroundColor Green
        $FirstrunContent = [System.IO.File]::ReadAllText($FirstrunPath) -replace "`r`n", "`n"
        if ($FirstrunContent -notmatch "raspi-dashboard/setup-raspi.sh") {
            $HookBlock = @"

# --- AUTO-INSTALL DASHBOARD LAB INFORMATIKA UNISSULA ---
cat > /etc/systemd/system/dashboard-firstboot.service <<'EOF_SVC'
[Unit]
Description=First Boot Auto-Installer Dashboard Lab Informatika
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'if [ -f /boot/firmware/raspi-dashboard/setup-raspi.sh ]; then bash /boot/firmware/raspi-dashboard/setup-raspi.sh; elif [ -f /boot/raspi-dashboard/setup-raspi.sh ]; then bash /boot/raspi-dashboard/setup-raspi.sh; fi; systemctl disable dashboard-firstboot.service'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF_SVC
systemctl enable dashboard-firstboot.service || true
# -------------------------------------------------------
"@ -replace "`r`n", "`n"
            $FirstrunContent = $FirstrunContent -replace "exit 0", "$HookBlock`nexit 0"
            [System.IO.File]::WriteAllText($FirstrunPath, $FirstrunContent, (New-Object System.Text.UTF8Encoding($false)))
        }
    } else {
        Write-Host "[4/4] Catatan: Sistem Operasi Raspberry Pi OS belum terdeteksi di $TargetDrive." -ForegroundColor Yellow
        Write-Host "      Setelah Anda menulis OS dengan Raspberry Pi Imager ke $TargetDrive," -ForegroundColor Yellow
        Write-Host "      klik 2x file 'PASANG-KE-SDCARD-E.bat' untuk menyuntikkan Auto-Installer!" -ForegroundColor Yellow
    }
} else {
    Write-Host "[3/4] Drive $TargetDrive tidak ditemukan saat ini. Paket tersimpan di deploy\raspberry-pi\sdcard-bundle." -ForegroundColor Yellow
}

Write-Host "==================================================================" -ForegroundColor Green
Write-Host " SELESAI! Paket siap digunakan di SD Card ($TargetDrive)" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
